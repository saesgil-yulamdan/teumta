import { externalConfig } from './external.config';
import {
  ExternalApiAuthError,
  ExternalApiError,
  ExternalApiRateLimitError,
  ExternalApiResponseError,
  ExternalApiTimeoutError,
} from './external-api.error';
import {
  classifyPublicDataResultCode,
  looksLikeXml,
  parsePublicDataXmlError,
} from './public-data';
import { logExternalApiIssue } from '../../utils/structured-log';

/**
 * 외부 API 클라이언트 공용 fetch 래퍼.
 *
 * 책임: timeout(AbortController) · HTTP 상태 → ExternalApiError 분류 · JSON 파싱 실패 처리
 *
 * 주의:
 * - 에러 message에 URL·헤더·응답 본문 포함 금지(API key 등 민감정보 유출 방지)
 * - Node 22 global fetch 사용, 별도 HTTP 라이브러리 없음
 */

export interface RequestJsonOptions {
  /** 로깅·에러 분류용 서비스 식별자. */
  service: string;
  /** 완성된 요청 URL(쿼리 포함). key가 섞여 있어 에러 message에 넣지 않는다. */
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  /** 있으면 JSON 직렬화 후 전송. */
  body?: unknown;
  /** 미지정 시 externalConfig.timeoutMs. */
  timeoutMs?: number;
  /**
   * 2xx가 아니어도 본문을 파싱해 반환할 상태 코드.
   *
   * 외부 API가 "리소스 없음" 같은 정상 결과를 4xx로 표현할 때만 사용
   * (SK 퍼즐은 커버리지 밖 POI에 400 + `{"error":{"message":"NOT_FOUND_POI"}}`).
   * 판단과 오류 계층 변환은 호출부 책임.
   */
  acceptStatuses?: number[];
}

export async function requestJson<T = unknown>(options: RequestJsonOptions): Promise<T> {
  const { service, url, method = 'GET', headers, body } = options;
  const timeoutMs = options.timeoutMs ?? externalConfig.timeoutMs;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw logAndReturn(
        new ExternalApiTimeoutError(service, { cause: error }),
        service,
        'request_timeout',
        { url, method },
      );
    }
    // 네트워크 오류 등 — 원본 메시지에 민감정보 가능성, 그대로 노출 금지
    throw logAndReturn(
      new ExternalApiError(service, `Request to "${service}" failed`, {
        code: 'NETWORK_ERROR',
        cause: error,
      }),
      service,
      'network_error',
      { url, method },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok && !(options.acceptStatuses ?? []).includes(response.status)) {
    throw logAndReturn(classifyHttpError(service, response.status), service, 'http_status', {
      url,
      method,
      status: response.status,
    });
  }

  // 본문은 정확히 한 번만 읽기 — 공공데이터포털은 _type=json 요청에도
  // 인증키 오류 시 HTTP 200 + XML 오류 봉투 반환 가능
  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch (error) {
    throw logAndReturn(
      new ExternalApiResponseError(service, 'Failed to read response body', {
        status: response.status,
        cause: error,
      }),
      service,
      'read_body',
      { url, method, status: response.status },
    );
  }

  if (looksLikeXml(response.headers.get('content-type'), bodyText)) {
    const envelope = parsePublicDataXmlError(bodyText);
    if (envelope) {
      throw logAndReturn(
        classifyPublicDataResultCode(service, envelope.resultCode, envelope.resultMsg),
        service,
        'public_data_xml_error',
        { url, method, status: response.status, detailCode: envelope.resultCode },
      );
    }
    // 오류 봉투도 아닌 XML — 원문은 message에 넣지 않음(민감정보 방지)
    throw logAndReturn(
      new ExternalApiResponseError(service, 'Received unexpected XML response', {
        status: response.status,
      }),
      service,
      'xml_response',
      { url, method, status: response.status },
    );
  }

  try {
    return JSON.parse(bodyText) as T;
  } catch (error) {
    throw logAndReturn(
      new ExternalApiResponseError(service, 'Failed to parse response body as JSON', {
        status: response.status,
        cause: error,
      }),
      service,
      'parse_json',
      { url, method, status: response.status },
    );
  }
}

function logAndReturn(
  error: ExternalApiError,
  service: string,
  phase: string,
  context: { url: string; method?: string; status?: number; detailCode?: string },
): ExternalApiError {
  logExternalApiIssue({
    service,
    phase,
    error,
    status: context.status,
    url: context.url,
    method: context.method,
    detailCode: context.detailCode,
  });
  return error;
}

/** HTTP 상태 코드 → 상황별 ExternalApiError. */
function classifyHttpError(service: string, status: number): ExternalApiError {
  if (status === 401 || status === 403) {
    return new ExternalApiAuthError(service, { status });
  }
  if (status === 429) {
    return new ExternalApiRateLimitError(service, { status });
  }
  return new ExternalApiResponseError(service, `Unexpected response status ${status}`, { status });
}

import {
  ExternalApiError,
  ExternalApiNotFoundError,
  ExternalApiResponseError,
  externalConfig,
  requestJson,
} from '../common';
import { logExternalApiIssue } from '../../utils/structured-log';
import type { SkCongestionResponse, SkPoiListResponse } from './congestion.dto';

/**
 * SK 지오비전 퍼즐 "실시간 장소 혼잡도" 클라이언트. 통신 책임만 — 변환은 congestion.mapper.ts.
 * 인증은 TMAP과 같은 SK Open API appKey 헤더(CONGESTION_API_KEY).
 */

const SERVICE = 'congestion';
const RLTM_PATH = '/place/congestion/rltm/pois';
const META_POIS_PATH = '/place/meta/pois';

function requireCongestionConfig(): { baseUrl: string; apiKey: string } {
  const { baseUrl, apiKey } = externalConfig.congestion;
  if (!baseUrl) {
    throw new ExternalApiError(SERVICE, 'CONGESTION_API_BASE_URL is not configured', {
      code: 'CONFIG_MISSING',
    });
  }
  if (!apiKey) {
    throw new ExternalApiError(SERVICE, 'CONGESTION_API_KEY is not configured', {
      code: 'CONFIG_MISSING',
    });
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey };
}

/** POI 실시간 혼잡도 조회. poiId는 TMAP 장소 통합 검색의 id. */
export async function fetchRealtimeCongestion(
  poiId: string | number,
): Promise<SkCongestionResponse> {
  const { baseUrl, apiKey } = requireCongestionConfig();

  const trimmed = String(poiId).trim();
  if (trimmed.length === 0) {
    throw new ExternalApiError(SERVICE, 'poiId is required', { code: 'INVALID_PARAM' });
  }

  const url = `${baseUrl}${RLTM_PATH}/${encodeURIComponent(trimmed)}`;
  const response = await requestJson<SkCongestionResponse>({
    service: SERVICE,
    url,
    headers: { appKey: apiKey },
    // 커버리지 밖 POI를 400으로 통지 → 본문을 읽어 "없음"과 실제 장애 구분
    acceptStatuses: [400, 404],
  });
  assertPuzzleOk(response);
  return response;
}

/**
 * "데이터 제공 가능 장소" 목록 1페이지 조회.
 *
 * 전체 약 3.4만 곳(2026-08-16 기준 33,745). limit 최대 1000이 실측으로 통했고,
 * offset 30,000 이상은 400을 준다 — 페이지네이션 종료 판단은 호출부(sk-poi-index) 몫.
 * 이름 검색 파라미터는 없다(name/searchKeyword 전부 무시 확인).
 */
export async function fetchCongestionPoiPage(
  offset: number,
  limit: number,
): Promise<SkPoiListResponse> {
  const { baseUrl, apiKey } = requireCongestionConfig();

  const url = `${baseUrl}${META_POIS_PATH}?offset=${offset}&limit=${limit}`;
  const response = await requestJson<SkPoiListResponse>({
    service: SERVICE,
    url,
    headers: { appKey: apiKey },
  });

  const code = response.status?.code;
  if (code !== '00') {
    const error = new ExternalApiResponseError(
      SERVICE,
      `Puzzle API returned status ${code ?? 'UNKNOWN'} for poi list`,
    );
    logExternalApiIssue({
      service: SERVICE,
      phase: 'puzzle_meta_status',
      error,
      detailCode: code,
    });
    throw error;
  }
  return response;
}

/** SK가 "이 POI 미지원"을 알릴 때의 오류 메시지. */
const NOT_FOUND_POI_MESSAGE = 'NOT_FOUND_POI';

/**
 * 퍼즐 API는 HTTP 200이어도 status.code로 논리 오류 통지(정상 '00'),
 * 커버리지 밖 POI는 400 + error 봉투.
 * 후자는 연동 장애가 아닌 "데이터 없음" → 502가 아니라 404.
 */
function assertPuzzleOk(response: SkCongestionResponse): void {
  const error = response.error;
  if (error) {
    if (error.message === NOT_FOUND_POI_MESSAGE || error.code === '404') {
      const notFound = new ExternalApiNotFoundError(SERVICE, 'Puzzle API has no data for this POI', {
        code: 'CONGESTION_DATA_NOT_FOUND',
      });
      logExternalApiIssue({
        service: SERVICE,
        phase: 'puzzle_not_found',
        error: notFound,
        detailCode: error.code ?? error.message,
      });
      throw notFound;
    }
    const responseError = new ExternalApiResponseError(
      SERVICE,
      `Puzzle API returned error ${error.code ?? 'UNKNOWN'}`,
    );
    logExternalApiIssue({
      service: SERVICE,
      phase: 'puzzle_error',
      error: responseError,
      detailCode: error.code,
    });
    throw responseError;
  }

  const code = response.status?.code;
  if (code === '00') {
    return;
  }
  const statusError = new ExternalApiResponseError(
    SERVICE,
    `Puzzle API returned status ${code ?? 'UNKNOWN'}: ${response.status?.message ?? 'Unknown error'}`,
  );
  logExternalApiIssue({
    service: SERVICE,
    phase: 'puzzle_status',
    error: statusError,
    detailCode: code,
  });
  throw statusError;
}

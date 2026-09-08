import type { ErrorRequestHandler } from 'express';

import {
  ExternalApiAuthError,
  ExternalApiError,
  ExternalApiNotFoundError,
  ExternalApiRateLimitError,
  ExternalApiTimeoutError,
} from '../external/common/external-api.error';

export interface ResolvedError {
  status: number;
  code: string;
  message: string;
}

/**
 * 에러를 HTTP 응답 형태(status/code/message)로 변환한다.
 * 외부 API 오류가 서버 전체 500으로 이어지지 않도록 상황별 상태 코드로 매핑한다.
 * (ExternalApiError의 message는 이미 민감정보가 제거된 상태다.)
 */
export function resolveErrorResponse(error: unknown): ResolvedError {
  if (error instanceof ExternalApiError) {
    return { status: statusForExternalError(error), code: error.code, message: error.message };
  }

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: '서버 내부 오류가 발생했습니다.',
  };
}

function statusForExternalError(error: ExternalApiError): number {
  // 서버 설정/미구현 문제는 우리 측 오류이므로 500.
  if (error.code === 'CONFIG_MISSING' || error.code === 'NOT_IMPLEMENTED') {
    return 500;
  }
  // 외부 API가 "해당 데이터 없음"을 알린 경우는 연동 장애가 아니다.
  // 재시도해도 소용없으므로 클라이언트가 구분할 수 있게 404로 내린다.
  if (error instanceof ExternalApiNotFoundError) {
    return 404;
  }
  if (error instanceof ExternalApiTimeoutError) {
    return 504; // Gateway Timeout
  }
  if (error instanceof ExternalApiRateLimitError) {
    return 503; // Service Unavailable (upstream rate limited)
  }
  if (error instanceof ExternalApiAuthError) {
    return 502; // Bad Gateway (upstream 인증 문제)
  }
  // NETWORK_ERROR, INVALID_RESPONSE 등 나머지 외부 오류
  return 502;
}

export const errorMiddleware: ErrorRequestHandler = (error, _req, res, _next) => {
  const { status, code, message } = resolveErrorResponse(error);

  // 클라이언트에는 고정 문구만 보내되 서버 로그에는 원인 추적 정보를 남긴다.
  const logMessage = error instanceof Error ? error.message : String(error);
  console.error(`Request failed [${code}]:`, logMessage);

  res.status(status).json({
    success: false,
    data: null,
    error: { code, message },
  });
};

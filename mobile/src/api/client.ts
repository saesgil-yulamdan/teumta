import { create, isAxiosError } from 'axios';

import { API_BASE_URL } from '@/constants/config';

export const DEFAULT_API_TIMEOUT_MS = 10_000;
export const COURSE_API_TIMEOUT_MS = 30_000;

export const apiClient = create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: DEFAULT_API_TIMEOUT_MS,
});

export type ApiErrorResponse = {
  success: false;
  data: null;
  error: { code: string; message: string };
};

export function getApiErrorCode(error: unknown): string | null {
  if (!isAxiosError<ApiErrorResponse>(error)) return null;
  return error.response?.data?.error?.code ?? null;
}

export function isApiTimeout(error: unknown): boolean {
  return isAxiosError(error) && error.code === 'ECONNABORTED';
}

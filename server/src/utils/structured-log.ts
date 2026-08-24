import { ExternalApiError } from '../external/common/external-api.error';

type LogLevel = 'info' | 'warn' | 'error';

export interface ExternalApiLogContext {
  service: string;
  phase: string;
  error: ExternalApiError;
  status?: number;
  url?: string;
  method?: string;
  detailCode?: string;
}

export interface ExternalApiLogEntry {
  level: LogLevel;
  event: 'external_api_issue';
  service: string;
  code: string;
  phase: string;
  errorName: string;
  message: string;
  status?: number;
  method?: string;
  host?: string;
  path?: string;
  detailCode?: string;
  timestamp: string;
}

export function buildExternalApiLogEntry(
  context: ExternalApiLogContext,
  now: Date = new Date(),
): ExternalApiLogEntry {
  const endpoint = context.url ? safeEndpoint(context.url) : {};
  return {
    level: context.error.code === 'CONGESTION_DATA_NOT_FOUND' ? 'info' : 'warn',
    event: 'external_api_issue',
    service: context.service,
    code: context.error.code,
    phase: context.phase,
    errorName: context.error.name,
    message: context.error.message,
    status: context.status ?? context.error.status,
    method: context.method,
    ...endpoint,
    detailCode: context.detailCode,
    timestamp: now.toISOString(),
  };
}

export function logExternalApiIssue(context: ExternalApiLogContext): void {
  if (process.env.NODE_ENV === 'test' && process.env.ENABLE_TEST_LOGS !== '1') {
    return;
  }

  const entry = buildExternalApiLogEntry(context);
  const line = JSON.stringify(entry);
  if (entry.level === 'error') {
    console.error(line);
    return;
  }
  if (entry.level === 'warn') {
    console.warn(line);
    return;
  }
  console.info(line);
}

function safeEndpoint(rawUrl: string): Pick<ExternalApiLogEntry, 'host' | 'path'> {
  try {
    const url = new URL(rawUrl);
    return { host: url.host, path: url.pathname };
  } catch {
    return {};
  }
}

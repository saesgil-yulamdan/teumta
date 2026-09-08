import type { Request, RequestHandler } from 'express';

/**
 * 외부 API 쿼터를 소비하는 공개 API 보호.
 * 단일 서버 인스턴스에 맞춘 in-memory fixed window이며 IP 원문은 로그에 남기지 않는다.
 */
export const PUBLIC_API_RATE_WINDOW_MS = 60 * 1000;
export const PUBLIC_API_RATE_MAX_COST = 60;
const SWEEP_THRESHOLD = 5000;

type RateEntry = { cost: number; windowStartedAt: number };
const rateEntries = new Map<string, RateEntry>();
const PUBLIC_STATIC_PATHS = new Set([
  '/tags',
  '/search/places',
  '/local-places',
  '/local-places/detail',
  '/congestion',
  '/festivals/nearby',
  '/concentration-forecast',
  '/courses',
  '/course-alternatives',
  '/places',
  '/routes',
  '/trips',
]);
const PUBLIC_DYNAMIC_PATHS: [RegExp, string][] = [
  [/^\/places\/[^/]+\/routes$/, '/places/:id/routes'],
  [/^\/places\/[^/]+\/local-places$/, '/places/:id/local-places'],
  [/^\/places\/[^/]+\/concentration-forecast$/, '/places/:id/concentration-forecast'],
  [/^\/places\/[^/]+$/, '/places/:id'],
  [/^\/routes\/[^/]+$/, '/routes/:id'],
  [/^\/trips\/[^/]+\/events$/, '/trips/:id/events'],
  [/^\/trips\/[^/]+$/, '/trips/:id'],
];

export type PublicApiUsageSnapshot = {
  requests: number;
  rejected: number;
  weightedCost: number;
  byEndpoint: Record<string, number>;
};

let usage: PublicApiUsageSnapshot = {
  requests: 0,
  rejected: 0,
  weightedCost: 0,
  byEndpoint: {},
};

function requestCost(req: Request): number {
  const path = req.path;
  if (path === '/courses' || path === '/course-alternatives') return 15;
  if (
    path === '/local-places' ||
    path === '/festivals/nearby' ||
    /^\/places\/[^/]+\/local-places$/.test(path)
  ) return 5;
  if (
    path === '/search/places' ||
    path === '/local-places/detail' ||
    path === '/concentration-forecast' ||
    /^\/places\/[^/]+\/concentration-forecast$/.test(path)
  ) return 2;
  return 1;
}

function shouldBypass(req: Request): boolean {
  return req.path === '/admin' || req.path.startsWith('/admin/');
}

function clientKey(req: Request): string {
  return req.ip ?? 'unknown';
}

function endpointKey(req: Request): string {
  let path = PUBLIC_STATIC_PATHS.has(req.path) ? req.path : '/other';
  for (const [pattern, normalized] of PUBLIC_DYNAMIC_PATHS) {
    if (pattern.test(req.path)) {
      path = normalized;
      break;
    }
  }
  return `${req.method.toUpperCase()} ${path}`;
}

function sweepExpired(now: number): void {
  for (const [key, entry] of rateEntries) {
    if (now - entry.windowStartedAt >= PUBLIC_API_RATE_WINDOW_MS) {
      rateEntries.delete(key);
    }
  }
}

export const publicApiGuardMiddleware: RequestHandler = (req, res, next) => {
  if (shouldBypass(req)) {
    next();
    return;
  }

  const now = Date.now();
  const startedAt = now;
  const key = clientKey(req);
  const cost = requestCost(req);
  const endpoint = endpointKey(req);
  let entry = rateEntries.get(key);

  if (!entry || now - entry.windowStartedAt >= PUBLIC_API_RATE_WINDOW_MS) {
    entry = { cost: 0, windowStartedAt: now };
    rateEntries.set(key, entry);
  }

  const remaining = Math.max(0, PUBLIC_API_RATE_MAX_COST - entry.cost);
  if (cost > remaining) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((entry.windowStartedAt + PUBLIC_API_RATE_WINDOW_MS - now) / 1000),
    );
    usage.rejected += 1;
    res.set('Retry-After', String(retryAfterSeconds));
    res.set('X-RateLimit-Limit', String(PUBLIC_API_RATE_MAX_COST));
    res.set('X-RateLimit-Remaining', String(remaining));
    res.status(429).json({
      success: false,
      data: null,
      error: {
        code: 'PUBLIC_API_RATE_LIMITED',
        message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
      },
    });
    logPublicApiUsage({ endpoint, cost, status: 429, durationMs: Date.now() - startedAt, rejected: true });
    return;
  }

  entry.cost += cost;
  usage.requests += 1;
  usage.weightedCost += cost;
  usage.byEndpoint[endpoint] = (usage.byEndpoint[endpoint] ?? 0) + 1;

  res.set('X-RateLimit-Limit', String(PUBLIC_API_RATE_MAX_COST));
  res.set('X-RateLimit-Remaining', String(PUBLIC_API_RATE_MAX_COST - entry.cost));

  res.once('finish', () => {
    logPublicApiUsage({
      endpoint,
      cost,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      rejected: false,
    });
  });

  if (rateEntries.size >= SWEEP_THRESHOLD) sweepExpired(now);
  next();
};

function logPublicApiUsage(fields: {
  endpoint: string;
  cost: number;
  status: number;
  durationMs: number;
  rejected: boolean;
}): void {
  if (process.env.NODE_ENV === 'test' && process.env.ENABLE_TEST_LOGS !== '1') return;
  console.info(JSON.stringify({ event: 'public_api_usage', ...fields, timestamp: new Date().toISOString() }));
}

export function getPublicApiUsageSnapshot(): PublicApiUsageSnapshot {
  return {
    ...usage,
    byEndpoint: { ...usage.byEndpoint },
  };
}

export function resetPublicApiGuard(): void {
  rateEntries.clear();
  usage = { requests: 0, rejected: 0, weightedCost: 0, byEndpoint: {} };
}

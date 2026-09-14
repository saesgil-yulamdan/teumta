import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  // 현재 모바일 공개 API는 DB를 사용하지 않는다. 보존 스크립트를 실행할 때만 설정한다.
  DATABASE_URL: z.string().optional().default(''),

  // 외부 API 인증키. 실제 값은 .env에만 두고 코드/Git에는 넣지 않는다.
  // 미설정 시 빈 문자열로 두어 서버는 기동되되, 실제 호출 시점에 검증한다.
  TOUR_API_KEY: z.string().optional().default(''),
  CONGESTION_API_KEY: z.string().optional().default(''),
  TMAP_API_KEY: z.string().optional().default(''),
  PREDICTION_API_KEY: z.string().optional().default(''),

  // 외부 API base URL. TODO: 공식 스펙 확인 후 기본값/경로 규칙 확정.
  TOUR_API_BASE_URL: z.string().optional().default(''),
  CONGESTION_API_BASE_URL: z.string().optional().default(''),
  TMAP_API_BASE_URL: z.string().optional().default(''),
  PREDICTION_API_BASE_URL: z.string().optional().default(''),

  // 외부 API 공통 요청 timeout(ms).
  EXTERNAL_API_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  // 아래 관리자·Trip·스케줄러 설정은 보존 코드용이며 현재 app.ts/server.ts는 사용하지 않는다.
  ADMIN_PASSWORD: z.string().optional().default(''),

  // 브라우저 Origin 허용 목록(쉼표 구분). native 앱처럼 Origin이 없는 요청은 허용한다.
  CORS_ALLOWED_ORIGINS: z.string().optional().default(''),

  ENABLE_LEGACY_TRIP_API: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((value) => value === 'true'),

  PREDICTION_INGEST_TARGETS: z.string().optional().default(''),
  PREDICTION_INGEST_HOUR_KST: z.coerce.number().int().min(0).max(23).default(5),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid server environment variables');
  console.error(z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;

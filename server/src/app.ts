import cors from 'cors';
import express from 'express';

import { healthRouter } from './routes/health.routes';
import { errorMiddleware } from './middlewares/error.middleware';
import { publicApiGuardMiddleware } from './middlewares/public-api-guard.middleware';
import { publicRouter } from './routes/public.routes';
import { env } from './config/env';
import { sendError } from './utils/api-response';

export const app = express();

// Cloudtype LB 뒤에서도 공개 API rate limit이 실제 클라이언트 IP를 사용하도록 한다.
app.set('trust proxy', 1);

const allowedOrigins = new Set(
  env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
);
app.use(cors({
  origin(origin, callback) {
    const developmentLocalhost =
      env.NODE_ENV !== 'production' && Boolean(origin?.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/));
    callback(null, !origin || developmentLocalhost || allowedOrigins.has(origin));
  },
}));
app.use(express.json());

app.use(healthRouter);
app.use('/api', publicApiGuardMiddleware);
app.use('/api', publicRouter);
app.use('/api', (_req, res) => {
  sendError(res, 404, 'API_NOT_FOUND', '요청한 API를 찾을 수 없습니다.');
});

app.use(errorMiddleware);

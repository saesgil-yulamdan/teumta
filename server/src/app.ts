import cors from 'cors';
import express from 'express';
import tripRouter from './routes/trip.routes';

import { healthRouter } from './routes/health.routes';
import {
  adminLoginRouter,
  adminRouteRouter,
  concentrationMatchingRouter,
  tagRouter,
} from './routes/admin.routes';
import { placeRouter } from './routes/place.routes';
import { adminAuthMiddleware } from './middlewares/admin-auth.middleware';
import { errorMiddleware } from './middlewares/error.middleware';
import { publicApiGuardMiddleware } from './middlewares/public-api-guard.middleware';
import routeRouter from './routes/route.routes';
import { env } from './config/env';

export const app = express();

// Cloudtype LB 뒤에서 req.ip가 실제 클라이언트를 가리키도록(로그인 rate limit 키).
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

// 로그인은 인증 제외(미들웨어보다 먼저 마운트). 그 외 /api/admin/* 전부 토큰 필요.
app.use('/api/admin/login', adminLoginRouter);
app.use('/api/admin', adminAuthMiddleware);
app.use('/api', publicApiGuardMiddleware);

app.use('/api', tagRouter);
app.use('/api', concentrationMatchingRouter);
app.use('/api', adminRouteRouter);
app.use('/api', placeRouter);
app.use('/api', routeRouter);
if (env.ENABLE_LEGACY_TRIP_API) {
  app.use('/api', tripRouter);
}

app.use(errorMiddleware);

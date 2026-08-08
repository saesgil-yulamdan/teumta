import cors from 'cors';
import express from 'express';
import tripRouter from './routes/trip.routes';

import { healthRouter } from './routes/health.routes';
import {
  adminLoginRouter,
  concentrationMatchingRouter,
  tagRouter,
} from './routes/admin.routes';
import { placeRouter } from './routes/place.routes';
import { adminAuthMiddleware } from './middlewares/admin-auth.middleware';
import { errorMiddleware } from './middlewares/error.middleware';
import routeRouter from './routes/route.routes';

export const app = express();

// Cloudtype LB 뒤에서 req.ip가 실제 클라이언트를 가리키도록(로그인 rate limit 키).
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

app.use(healthRouter);

// 로그인은 인증 제외(미들웨어보다 먼저 마운트). 그 외 /api/admin/* 전부 토큰 필요.
app.use('/api/admin/login', adminLoginRouter);
app.use('/api/admin', adminAuthMiddleware);

app.use('/api', tagRouter);
app.use('/api', concentrationMatchingRouter);
app.use('/api', placeRouter);
app.use('/api', routeRouter);
app.use('/api', tripRouter);

app.use(errorMiddleware);

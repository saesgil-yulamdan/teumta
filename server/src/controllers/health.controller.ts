import type { Request, Response, NextFunction } from 'express';

import { getHealthStatus } from '../services/health.service';
import { sendSuccess } from '../utils/api-response';

export async function healthController(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getHealthStatus();

    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

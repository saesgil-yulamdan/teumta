import type { NextFunction, Request, Response } from 'express';

import {
  getRouteById,
  getRoutesByPlaceId,
} from '../services/route.service';

function parsePositiveInt(value: string | string[]) {
  if (Array.isArray(value)) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export async function getRoutesByPlaceIdController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const placeId = parsePositiveInt(req.params.placeId);

    if (placeId === null) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: 'INVALID_PLACE_ID',
          message: '장소 ID는 양의 정수여야 합니다.',
        },
      });
    }

    const routes = await getRoutesByPlaceId(placeId);

    return res.status(200).json({
      success: true,
      data: routes,
      error: null,
    });
  } catch (error) {
    next(error);
  }
}

export async function getRouteByIdController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const routeId = parsePositiveInt(req.params.routeId);

    if (routeId === null) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: 'INVALID_ROUTE_ID',
          message: '코스 ID는 양의 정수여야 합니다.',
        },
      });
    }

    const route = await getRouteById(routeId);

    if (!route) {
      return res.status(404).json({
        success: false,
        data: null,
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: '코스를 찾을 수 없습니다.',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: route,
      error: null,
    });
  } catch (error) {
    next(error);
  }
}
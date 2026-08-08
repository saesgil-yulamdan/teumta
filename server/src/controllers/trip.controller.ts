import { TripEventType } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';

import {
  createTrip,
  createTripEvent,
  getTripById,
} from '../services/trip.service';

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

function isTripEventType(value: unknown): value is TripEventType {
  return (
    typeof value === 'string' &&
    Object.values(TripEventType).includes(value as TripEventType)
  );
}

export async function createTripController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const routeId = parsePositiveInt(req.body?.routeId);

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

    const trip = await createTrip(routeId);

    if (!trip) {
      return res.status(404).json({
        success: false,
        data: null,
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: '코스를 찾을 수 없습니다.',
        },
      });
    }

    return res.status(201).json({
      success: true,
      data: trip,
      error: null,
    });
  } catch (error) {
    next(error);
  }
}

export async function createTripEventController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const tripId = parsePositiveInt(req.params.tripId);

    if (tripId === null) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: 'INVALID_TRIP_ID',
          message: '방문 ID는 양의 정수여야 합니다.',
        },
      });
    }

    const { eventType, placeId, metadata } = req.body ?? {};

    if (!isTripEventType(eventType)) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: 'INVALID_EVENT_TYPE',
          message: '유효하지 않은 방문 이벤트 타입입니다.',
        },
      });
    }

    if (
      placeId !== undefined &&
      parsePositiveInt(placeId) === null
    ) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: 'INVALID_PLACE_ID',
          message: '장소 ID는 양의 정수여야 합니다.',
        },
      });
    }

    const event = await createTripEvent(tripId, {
      eventType,
      ...(placeId !== undefined
        ? { placeId: Number(placeId) }
        : {}),
      ...(metadata !== undefined
        ? { metadata }
        : {}),
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        data: null,
        error: {
          code: 'TRIP_NOT_FOUND',
          message: '방문을 찾을 수 없습니다.',
        },
      });
    }

    return res.status(201).json({
      success: true,
      data: event,
      error: null,
    });
  } catch (error) {
    next(error);
  }
}

export async function getTripByIdController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const tripId = parsePositiveInt(req.params.tripId);

    if (tripId === null) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: 'INVALID_TRIP_ID',
          message: '방문 ID는 양의 정수여야 합니다.',
        },
      });
    }

    const trip = await getTripById(tripId);

    if (!trip) {
      return res.status(404).json({
        success: false,
        data: null,
        error: {
          code: 'TRIP_NOT_FOUND',
          message: '방문을 찾을 수 없습니다.',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: trip,
      error: null,
    });
  } catch (error) {
    next(error);
  }
}
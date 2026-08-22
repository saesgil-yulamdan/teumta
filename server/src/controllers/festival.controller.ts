import type { RequestHandler } from 'express';

import {
  DEFAULT_FESTIVAL_RADIUS_METERS,
  MAX_FESTIVAL_RADIUS_METERS,
  getNearbyFestivalsByContentId,
  getNearbyFestivalsByPoiId,
} from '../services/nearby-festival.service';

/** 목적지 주변 진행 중/예정 행사·축제 조회. DB 저장 없이 TourAPI 실시간 조회. */
export const getNearbyFestivalsController: RequestHandler = async (req, res, next) => {
  try {
    const contentId = req.query.contentId;
    const poiId = req.query.poiId;
    const hasContentId = typeof contentId === 'string' && contentId.trim().length > 0;
    const hasPoiId = typeof poiId === 'string' && poiId.trim().length > 0;

    if (hasContentId === hasPoiId) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: 'INVALID_IDENTIFIER',
          message: 'contentId 또는 poiId 중 정확히 하나를 전달해야 합니다.',
        },
      });
      return;
    }

    const radius =
      req.query.radius === undefined ? DEFAULT_FESTIVAL_RADIUS_METERS : Number(req.query.radius);
    if (
      !Number.isFinite(radius) ||
      !Number.isInteger(radius) ||
      radius <= 0 ||
      radius > MAX_FESTIVAL_RADIUS_METERS
    ) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: 'INVALID_RADIUS',
          message: `radius는 1 이상 ${MAX_FESTIVAL_RADIUS_METERS} 이하의 정수여야 합니다.`,
        },
      });
      return;
    }

    const result = hasContentId
      ? await getNearbyFestivalsByContentId((contentId as string).trim(), radius)
      : await getNearbyFestivalsByPoiId((poiId as string).trim(), radius);

    if (result.status !== 'SUCCESS') {
      res.status(404).json({
        success: false,
        data: null,
        error: {
          code: 'DESTINATION_NOT_FOUND',
          message: '목적지를 찾을 수 없습니다.',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: result.festivals,
      error: null,
    });
  } catch (error) {
    next(error);
  }
};

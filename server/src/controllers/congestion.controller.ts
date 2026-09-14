import type { RequestHandler } from 'express';

import { getConcentrationForecastByContentId } from '../services/concentration-forecast.service';
import {
  getConcentrationForecasts,
  getRealtimeCongestion,
  getRealtimeCongestionByContentId,
} from '../services/congestion.service';
import { sendError, sendSuccess } from '../utils/api-response';

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * 실시간 혼잡도 조회(SK 퍼즐, 5분 캐시).
 * 검색 결과의 `tmapPoiId`(TMAP) 또는 `tourApiContentId`(TOUR) 중 정확히 하나로 조회한다 —
 * TOUR 목적지는 서버가 TMAP POI로 매칭한 뒤 조회한다(3.3b와 같은 식별자 규칙).
 */
export const getRealtimeCongestionController: RequestHandler = async (req, res, next) => {
  try {
    const poiId = nonEmptyString(req.query.poiId);
    const contentId = nonEmptyString(req.query.contentId);

    if ((poiId === null) === (contentId === null)) {
      sendError(res, 400, 'INVALID_IDENTIFIER', 'poiId 또는 contentId 중 정확히 하나를 전달해야 합니다.');
      return;
    }

    const view =
      poiId !== null
        ? await getRealtimeCongestion(poiId)
        : await getRealtimeCongestionByContentId(contentId as string);

    sendSuccess(res, view);
  } catch (error) {
    next(error);
  }
};

/**
 * 집중률 예측 실시간 조회(향후 30일 날짜별, DB 미사용, 전국).
 * 적재된 내부 Place가 아니어도 목적지 contentId만으로 조회된다.
 */
export const getConcentrationForecastByContentIdController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const contentId = nonEmptyString(req.query.contentId);

    if (contentId === null) {
      sendError(res, 400, 'INVALID_IDENTIFIER', 'contentId는 비어 있지 않은 문자열이어야 합니다.');
      return;
    }

    const result = await getConcentrationForecastByContentId(contentId);

    if (result.status !== 'SUCCESS') {
      sendError(
        res,
        404,
        'FORECAST_NOT_FOUND',
        result.status === 'DESTINATION_NOT_RESOLVED'
          ? '목적지의 지역 정보를 확인할 수 없습니다.'
          : '이 장소의 집중률 예측 데이터가 없습니다.',
      );
      return;
    }

    sendSuccess(res, { ...result.data, isRealtime: false });
  } catch (error) {
    next(error);
  }
};

/** 집중률 예측 조회(향후 30일 날짜별, 실시간 아님). */
export const getConcentrationForecastController: RequestHandler = async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          message: '장소 ID는 양의 정수여야 합니다.',
        },
      });
      return;
    }

    const result = await getConcentrationForecasts(id);

    if (result.status === 'NOT_FOUND') {
      res.status(404).json({
        success: false,
        data: null,
        error: {
          message: '장소를 찾을 수 없습니다.',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        placeId: id,
        isRealtime: false,
        forecasts: result.forecasts,
      },
      error: null,
    });
  } catch (error) {
    next(error);
  }
};

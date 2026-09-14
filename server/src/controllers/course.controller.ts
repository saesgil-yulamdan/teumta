import type { RequestHandler } from 'express';

import {
  MAX_AVAILABLE_MINUTES,
  MIN_AVAILABLE_MINUTES,
  generateCourseAlternatives,
  generateCourses,
} from '../services/course-generation.service';
import { sendError, sendSuccess } from '../utils/api-response';

/**
 * 우회 코스 실시간 생성(3.10). 목적지 식별자 + 가용 시간만 받는다.
 * 좌표를 입력으로 받지 않는다(privacy — 서버가 식별자를 좌표로 해석).
 */

const MAX_COURSE_VARIANT = 1000;

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function badRequest(res: Parameters<RequestHandler>[1], code: string, message: string) {
  return sendError(res, 400, code, message);
}

export const generateCoursesController: RequestHandler = async (req, res, next) => {
  try {
    const contentId = nonEmptyString(req.query.contentId);
    const poiId = nonEmptyString(req.query.poiId);

    if ((contentId === null) === (poiId === null)) {
      badRequest(
        res,
        'INVALID_IDENTIFIER',
        'contentId 또는 poiId 중 정확히 하나를 전달해야 합니다.',
      );
      return;
    }

    const rawMinutes = req.query.availableMinutes;
    if (typeof rawMinutes !== 'string') {
      badRequest(res, 'INVALID_AVAILABLE_MINUTES', 'availableMinutes는 필수입니다.');
      return;
    }

    const availableMinutes = Number(rawMinutes);
    if (
      !Number.isInteger(availableMinutes) ||
      availableMinutes < MIN_AVAILABLE_MINUTES ||
      availableMinutes > MAX_AVAILABLE_MINUTES
    ) {
      badRequest(
        res,
        'INVALID_AVAILABLE_MINUTES',
        `availableMinutes는 ${MIN_AVAILABLE_MINUTES}~${MAX_AVAILABLE_MINUTES} 사이의 정수여야 합니다.`,
      );
      return;
    }

    const rawVariant = req.query.variant;
    const variant = rawVariant === undefined ? 0 : Number(rawVariant);
    if (
      !Number.isInteger(variant) ||
      variant < 0 ||
      variant > MAX_COURSE_VARIANT
    ) {
      badRequest(
        res,
        'INVALID_VARIANT',
        `variant는 0~${MAX_COURSE_VARIANT} 사이의 정수여야 합니다.`,
      );
      return;
    }

    const result = await generateCourses({
      ...(contentId !== null ? { contentId } : {}),
      ...(poiId !== null ? { poiId } : {}),
      availableMinutes,
      variant,
    });

    if (result.status === 'DESTINATION_NOT_FOUND') {
      sendError(res, 404, 'DESTINATION_NOT_FOUND', '목적지를 찾을 수 없거나 좌표가 없습니다.');
      return;
    }

    sendSuccess(res, result.result);
  } catch (error) {
    next(error);
  }
};

/** 도착한 정류지 기준 대체 장소 → 원 목적지 복귀 코스. 사용자 좌표는 받지 않는다. */
export const generateCourseAlternativesController: RequestHandler = async (req, res, next) => {
  try {
    const originContentId = nonEmptyString(req.query.originContentId);
    const contentId = nonEmptyString(req.query.contentId);
    const poiId = nonEmptyString(req.query.poiId);
    if (originContentId === null) {
      badRequest(res, 'INVALID_ORIGIN', 'originContentId는 필수입니다.');
      return;
    }
    if ((contentId === null) === (poiId === null)) {
      badRequest(
        res,
        'INVALID_IDENTIFIER',
        'contentId 또는 poiId 중 정확히 하나를 전달해야 합니다.',
      );
      return;
    }

    const availableMinutes = Number(req.query.availableMinutes);
    if (
      typeof req.query.availableMinutes !== 'string' ||
      !Number.isInteger(availableMinutes) ||
      availableMinutes < MIN_AVAILABLE_MINUTES ||
      availableMinutes > MAX_AVAILABLE_MINUTES
    ) {
      badRequest(
        res,
        'INVALID_AVAILABLE_MINUTES',
        `availableMinutes는 ${MIN_AVAILABLE_MINUTES}~${MAX_AVAILABLE_MINUTES} 사이의 정수여야 합니다.`,
      );
      return;
    }

    const excludeContentIds = nonEmptyString(req.query.excludeContentIds)
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 20) ?? [];
    const result = await generateCourseAlternatives({
      originContentId,
      ...(contentId !== null ? { contentId } : {}),
      ...(poiId !== null ? { poiId } : {}),
      availableMinutes,
      excludeContentIds,
    });

    if (result.status !== 'SUCCESS') {
      sendError(
        res,
        404,
        result.status,
        result.status === 'ORIGIN_NOT_FOUND'
          ? '현재 정류지를 찾을 수 없거나 좌표가 없습니다.'
          : '복귀할 목적지를 찾을 수 없거나 좌표가 없습니다.',
      );
      return;
    }

    sendSuccess(res, result.result);
  } catch (error) {
    next(error);
  }
};

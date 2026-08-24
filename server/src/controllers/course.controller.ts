import type { RequestHandler } from 'express';

import {
  MAX_AVAILABLE_MINUTES,
  MIN_AVAILABLE_MINUTES,
  generateCourses,
} from '../services/course-generation.service';

/**
 * 우회 코스 실시간 생성(3.10). 목적지 식별자 + 가용 시간만 받는다.
 * 좌표를 입력으로 받지 않는다(privacy — 서버가 식별자를 좌표로 해석).
 */

const MAX_COURSE_VARIANT = 1000;

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function badRequest(res: Parameters<RequestHandler>[1], code: string, message: string) {
  res.status(400).json({ success: false, data: null, error: { code, message } });
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
      res.status(404).json({
        success: false,
        data: null,
        error: {
          code: 'DESTINATION_NOT_FOUND',
          message: '목적지를 찾을 수 없거나 좌표가 없습니다.',
        },
      });
      return;
    }

    res.status(200).json({ success: true, data: result.result, error: null });
  } catch (error) {
    next(error);
  }
};

import { isAxiosError } from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getApiErrorCode, isApiTimeout } from '@/api/client';
import { fetchCourses } from '@/api/courses';
import type {
  CourseDestination,
  DestinationIdentifier,
  GeneratedCourse,
} from '@/types/course';
import { createRequestGuard } from '@/utils/request-guard';

export type GeneratedCoursesStatus =
  | 'loading'
  | 'idle'
  | 'error'
  | 'timeout'
  | 'rate-limited';

/** 코스 생성 요청의 중복·지연 응답·표준 오류 코드를 화면 밖에서 관리한다. */
export function useGeneratedCourses(options: {
  identifier: DestinationIdentifier | null;
  availableMinutes: number;
  variant: number;
}) {
  const { identifier, availableMinutes, variant } = options;
  const [destination, setDestination] = useState<CourseDestination | null>(null);
  const [courses, setCourses] = useState<GeneratedCourse[]>([]);
  const [status, setStatus] = useState<GeneratedCoursesStatus>('loading');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(null);
  const requestGuard = useMemo(() => createRequestGuard(), []);

  const load = useCallback(async () => {
    const requestId = requestGuard.start();
    if (!identifier) {
      setStatus('error');
      return;
    }

    setStatus('loading');
    setRetryAfterSeconds(null);
    try {
      const result = await fetchCourses(identifier, availableMinutes, variant);
      if (!requestGuard.isCurrent(requestId)) return;
      setDestination(result.destination);
      setCourses(result.courses);
      setStatus('idle');
    } catch (error) {
      if (!requestGuard.isCurrent(requestId)) return;
      setCourses([]);
      if (getApiErrorCode(error) === 'PUBLIC_API_RATE_LIMITED') {
        const retryAfter = isAxiosError(error)
          ? Number(error.response?.headers['retry-after'])
          : Number.NaN;
        setRetryAfterSeconds(Number.isFinite(retryAfter) ? retryAfter : null);
        setStatus('rate-limited');
      } else if (isApiTimeout(error)) {
        setStatus('timeout');
      } else {
        setStatus('error');
      }
    }
  }, [identifier, availableMinutes, variant, requestGuard]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(timer);
      requestGuard.invalidate();
    };
  }, [load, requestGuard]);

  return { destination, courses, status, retryAfterSeconds, reload: load };
}

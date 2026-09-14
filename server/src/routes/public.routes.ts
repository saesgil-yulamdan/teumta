import { Router } from 'express';

import {
  getConcentrationForecastByContentIdController,
  getRealtimeCongestionController,
} from '../controllers/congestion.controller';
import {
  generateCourseAlternativesController,
  generateCoursesController,
} from '../controllers/course.controller';
import { getNearbyFestivalsController } from '../controllers/festival.controller';
import {
  getLocalPlaceDetailController,
  getNearbyLocalPlacesByContentIdController,
  searchPlacesController,
} from '../controllers/place.controller';

/** 현재 모바일 앱이 사용하는 DB 비의존 공개 API만 마운트한다. */
export const publicRouter = Router();

publicRouter.get('/search/places', searchPlacesController);
publicRouter.get('/local-places', getNearbyLocalPlacesByContentIdController);
publicRouter.get('/local-places/detail', getLocalPlaceDetailController);
publicRouter.get('/congestion', getRealtimeCongestionController);
publicRouter.get('/festivals/nearby', getNearbyFestivalsController);
publicRouter.get('/concentration-forecast', getConcentrationForecastByContentIdController);
publicRouter.get('/courses', generateCoursesController);
publicRouter.get('/course-alternatives', generateCourseAlternativesController);

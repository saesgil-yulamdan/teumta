import { Router } from 'express';

import {
  getConcentrationForecastController,
  getRealtimeCongestionController,
  getConcentrationForecastByContentIdController,
} from '../controllers/congestion.controller';
import { generateCoursesController } from '../controllers/course.controller';
import { getNearbyFestivalsController } from '../controllers/festival.controller';
import {
  createPlaceController,
  deletePlaceController,
  getLocalPlaceDetailController,
  getNearbyLocalPlacesByContentIdController,
  getNearbyLocalPlacesController,
  getPlaceByIdController,
  getPlacesController,
  searchPlacesController,
  updatePlaceController,
} from '../controllers/place.controller';
import { getRoutesByPlaceIdController } from '../controllers/route.controller';

export const placeRouter = Router();

// 검색 기반 흐름: 목적지 검색 → contentId|poiId 기준 주변 로컬 장소 추천
placeRouter.get('/search/places', searchPlacesController);
placeRouter.get('/local-places', getNearbyLocalPlacesByContentIdController);
// 정적 경로가 먼저 걸리도록 목록 라우트 뒤, 파라미터 라우트 앞에 둔다.
placeRouter.get('/local-places/detail', getLocalPlaceDetailController);
placeRouter.get('/congestion', getRealtimeCongestionController);
placeRouter.get('/festivals/nearby', getNearbyFestivalsController);
// 집중률 예측 실시간 조회(전국, DB 미사용). 적재된 Place 기준 조회는 아래 /places/:id/... 유지.
placeRouter.get('/concentration-forecast', getConcentrationForecastByContentIdController);
placeRouter.get('/courses', generateCoursesController);

placeRouter.get('/places', getPlacesController);

placeRouter.get(
  '/places/:placeId/routes',
  getRoutesByPlaceIdController,
);

placeRouter.get(
  '/places/:id/local-places',
  getNearbyLocalPlacesController,
);

placeRouter.get(
  '/places/:id/concentration-forecast',
  getConcentrationForecastController,
);

placeRouter.get('/places/:id', getPlaceByIdController);

placeRouter.post('/admin/places', createPlaceController);
placeRouter.patch('/admin/places/:id', updatePlaceController);
placeRouter.delete('/admin/places/:id', deletePlaceController);

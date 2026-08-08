import { Router } from 'express';

import {
  createTripController,
  createTripEventController,
  getTripByIdController,
} from '../controllers/trip.controller';

const tripRouter = Router();

tripRouter.post('/trips', createTripController);

tripRouter.post(
  '/trips/:tripId/events',
  createTripEventController,
);

tripRouter.get(
  '/trips/:tripId',
  getTripByIdController,
);

export default tripRouter;
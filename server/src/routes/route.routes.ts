import { Router } from 'express';

import { getRouteByIdController } from '../controllers/route.controller';

const router = Router();

router.get('/routes/:routeId', getRouteByIdController);

export default router;
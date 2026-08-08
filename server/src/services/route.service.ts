import { prisma } from '../utils/prisma';

export async function getRoutesByPlaceId(placeId: number) {
  return prisma.route.findMany({
    where: {
      mainPlaceId: placeId,
    },
    orderBy: {
      id: 'asc',
    },
  });
}

export async function getRouteById(routeId: number) {
  return prisma.route.findUnique({
    where: {
      id: routeId,
    },
    include: {
      stops: {
        orderBy: {
          stopOrder: 'asc',
        },
      },
    },
  });
}
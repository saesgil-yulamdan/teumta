import { TripEventType } from '@prisma/client';

import { prisma } from '../utils/prisma';

export async function createTrip(routeId: number) {
  const route = await prisma.route.findUnique({
    where: {
      id: routeId,
    },
    select: {
      id: true,
    },
  });

  if (!route) {
    return null;
  }

  return prisma.trip.create({
    data: {
      routeId,
    },
  });
}

export async function createTripEvent(
  tripId: number,
  input: {
    eventType: TripEventType;
    placeId?: number;
    metadata?: unknown;
  },
) {
  const trip = await prisma.trip.findUnique({
    where: {
      id: tripId,
    },
    select: {
      id: true,
    },
  });

  if (!trip) {
    return null;
  }

  return prisma.tripEvent.create({
    data: {
      tripId,
      eventType: input.eventType,
      ...(input.placeId !== undefined
        ? {
            placeId: input.placeId,
          }
        : {}),
      ...(input.metadata !== undefined
        ? {
            metadata: input.metadata as never,
          }
        : {}),
    },
  });
}

export async function getTripById(tripId: number) {
  return prisma.trip.findUnique({
    where: {
      id: tripId,
    },
    include: {
      events: {
        orderBy: {
          occurredAt: 'asc',
        },
      },
    },
  });
}
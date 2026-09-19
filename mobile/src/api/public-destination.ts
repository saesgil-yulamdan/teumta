import type { DestinationIdentifier } from '@/types/course';

/** Explicit allowlist: persisted snapshots must not add private fields to requests. */
export function publicDestination(identifier: DestinationIdentifier): DestinationIdentifier {
  return 'contentId' in identifier ? { contentId: identifier.contentId } : { poiId: identifier.poiId };
}

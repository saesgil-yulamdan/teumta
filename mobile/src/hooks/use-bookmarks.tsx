import type { ReactNode } from 'react';
import { travel, useTravel, storageError } from '@/stores/travel';
import type { Bookmark } from '@/stores/travel-repository';
export type PlaceBookmark = Bookmark;
export function BookmarksProvider({ children }: { children: ReactNode }) { return children; }
export function useBookmarks() {
  const { bookmarks: places, ready } = useTravel();
  return { places, ready,
    isPlaceBookmarked: (source: string, id: string) => places.some(v => v.source === source && v.id === id),
    togglePlaceBookmark: (place: Bookmark) => { void travel.toggleBookmark(place).catch(storageError); },
  };
}

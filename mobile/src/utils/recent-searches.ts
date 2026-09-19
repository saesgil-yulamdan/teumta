import { travel } from '@/stores/travel';
export const MAX_RECENT_SEARCHES = 8;
export async function loadRecentSearches(): Promise<string[]> { await travel.load(); return travel.state.searches; }
export function saveRecentSearches(next: string[]): void { if (next[0]) void travel.search(next[0]).catch(() => {}); }
export function clearRecentSearchesStorage(): Promise<void> { return travel.clearSearches(); }

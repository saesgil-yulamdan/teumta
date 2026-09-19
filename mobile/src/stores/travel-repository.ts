import { isSelectedCourse, selectedCourseKey, type SelectedCourse } from './selected-course';
import { courseProgressReducer, INITIAL_COURSE_PROGRESS, type ProgressAction, type ProgressState } from '../utils/course-progress-state';
import { courseProgressStops, parseTripProgress, validRestoredProgress } from '../utils/trip-summary';

export const TRAVEL_KEY = 'teumta:travel:v3';
export const LEGACY_KEYS = ['teumta:active-course:v1', 'teumta:active-trip-progress:v1', 'teumta:course-log:v1', 'teumta:bookmarks:v2', 'teumta:recent-searches:v1'];
export type Bookmark = { id: string; source: 'TOUR' | 'TMAP'; name: string; address: string | null; imageUrl: string | null; local?: { latitude: string; longitude: string; category?: string; eventStartDate?: string; eventEndDate?: string } };
export type RecentCourse = { key: string; viewedAt: string; selected: SelectedCourse };
export type Journey = {
  id: string; selected: SelectedCourse; original: SelectedCourse;
  startedAt: number; progress: ProgressState; reminderEnabled?: boolean;
};
export type JourneyRecord = {
  id: string; selected: SelectedCourse; startedAt: number | null; endedAt: number | null;
  status: 'completed' | 'interrupted' | 'legacy'; outcomes: ProgressState['outcomes'];
  completedAll: boolean | null;
};
export type TravelState = {
  version: 3; bookmarks: Bookmark[]; searches: string[]; recent: RecentCourse[];
  active: Journey | null; records: JourneyRecord[]; remember: boolean;
  cleanupPending: boolean; deletionPending: boolean;
};
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };
const empty = (): TravelState => ({ version: 3, bookmarks: [], searches: [], recent: [], active: null, records: [], remember: true, cleanupPending: false, deletionPending: false });
const parse = (raw: string | null): any => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };
const time = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const bookmark = (v: any): v is Bookmark => v && typeof v.id === 'string' && v.id.length > 0 && ['TOUR', 'TMAP'].includes(v.source) && typeof v.name === 'string';
const array = (v: any): any[] => Array.isArray(v) ? v : [];
const safeBookmarks = (v: unknown): Bookmark[] => array(v).filter(bookmark).map(place => ({
  id: place.id, source: place.source, name: place.name,
  address: typeof place.address === 'string' ? place.address : null,
  imageUrl: typeof place.imageUrl === 'string' ? place.imageUrl : null,
  ...(typeof place.local?.latitude === 'string' && typeof place.local?.longitude === 'string' && Number.isFinite(Number(place.local.latitude)) && Number.isFinite(Number(place.local.longitude)) ? {
    local: { latitude: place.local.latitude, longitude: place.local.longitude,
      ...(typeof place.local.category === 'string' ? { category: place.local.category } : {}),
      ...(typeof place.local.eventStartDate === 'string' ? { eventStartDate: place.local.eventStartDate } : {}),
      ...(typeof place.local.eventEndDate === 'string' ? { eventEndDate: place.local.eventEndDate } : {}) },
  } : {}),
}));

/** All writes are serialized and published only after durable storage succeeds.
 * Session IDs, progress and GPS are never API inputs. No networking lives here.
 */
export class TravelRepository {
  state = empty();
  ready = false;
  deletionRevision = 0;
  error: string | null = null;
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private loading: Promise<void> | null = null;
  private epoch = 0;
  constructor(private storage: Storage, private cancelNotifications: () => Promise<void>, private now = Date.now, private id = () => 'journey-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)) {}
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private emit() { this.listeners.forEach(fn => fn()); }
  private async persist(next: TravelState) {
    await this.storage.setItem(TRAVEL_KEY, JSON.stringify(next));
    this.state = next; this.error = null; this.emit();
  }
  private async cleanup() {
    if (!this.state.cleanupPending && !this.state.deletionPending) return;
    await this.cancelNotifications();
    if (this.state.deletionPending) await Promise.all(LEGACY_KEYS.map(key => this.storage.removeItem(key)));
    await this.persist({ ...this.state, cleanupPending: false, deletionPending: false });
  }
  private async finishCommittedJourney() {
    try { await this.cleanup(); }
    catch { this.error = '여행 결과는 기기에 저장됐지만 예약 알림을 정리하지 못했어요. 다시 시도해 주세요.'; this.emit(); }
  }
  load = (): Promise<void> => {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const raw = await this.storage.getItem(TRAVEL_KEY);
        const value = parse(raw);
        if (raw !== null) {
          // A corrupt new-format document must never trigger legacy resurrection.
          this.state = this.sanitize(value);
        } else {
          const legacy = await Promise.all(LEGACY_KEYS.map(key => this.storage.getItem(key)));
          const oldSelected = parse(legacy[0]);
          const logs = array(parse(legacy[2])?.entries);
          this.state = { ...empty(), bookmarks: safeBookmarks(parse(legacy[3])?.places), searches: array(parse(legacy[4])).filter(v => typeof v === 'string').slice(0, 8) };
          this.state.recent = logs.filter(v => isSelectedCourse(v?.selected)).slice(0, 20).map(v => ({ key: selectedCourseKey(v.selected), viewedAt: typeof v.viewedAt === 'string' ? v.viewedAt : '', selected: v.selected }));
          // Legacy course-level completion cannot establish sessions or individual visits.
          this.state.records = logs.filter(v => isSelectedCourse(v?.selected) && typeof v.completedAt === 'string').map((v, i) => ({ id: 'legacy-' + i, selected: v.selected, startedAt: null, endedAt: Number.isFinite(Date.parse(v.completedAt)) ? Date.parse(v.completedAt) : null, status: 'legacy', outcomes: {}, completedAll: null }));
          if (isSelectedCourse(oldSelected)) {
            const progress = parseTripProgress(legacy[1], selectedCourseKey(oldSelected), courseProgressStops(oldSelected));
            if (progress?.phase === 'in_progress' && time(progress.startedAt)) this.state.active = { id: this.id(), selected: oldSelected, original: oldSelected, startedAt: progress.startedAt, progress };
          }
          await this.persist(this.state);
        }
        await this.cleanup();
      } catch {
        this.error = '기기 저장소를 읽거나 정리하지 못했어요. 다시 시도해 주세요.';
        this.loading = null;
        throw new Error(this.error);
      } finally { this.ready = true; this.emit(); }
    })();
    return this.loading;
  };
  private sanitize(v: any): TravelState {
    const next = empty();
    if (v?.version !== 3) return next;
    next.remember = v.remember !== false;
    next.cleanupPending = v.cleanupPending === true;
    next.deletionPending = v.deletionPending === true;
    if (next.deletionPending) return next;
    next.bookmarks = safeBookmarks(v.bookmarks);
    next.searches = array(v.searches).filter(x => typeof x === 'string').slice(0, 8);
    next.recent = array(v.recent).filter(x => typeof x?.key === 'string' && typeof x.viewedAt === 'string' && isSelectedCourse(x.selected)).slice(0, 20);
    next.records = array(v.records).filter(x => typeof x?.id === 'string' && isSelectedCourse(x.selected) && ['completed', 'interrupted', 'legacy'].includes(x.status)).map(x => ({
      ...x, startedAt: time(x.startedAt) ? x.startedAt : null, endedAt: time(x.endedAt) ? x.endedAt : null,
      outcomes: Object.fromEntries(Object.entries(x.outcomes ?? {}).filter(([, outcome]) => ['visited', 'skipped', 'unavailable'].includes(String(outcome)))),
      completedAll: x.status === 'legacy' ? null : courseProgressStops(x.selected).slice(0, -1).every(stop => x.outcomes?.[stop.id] === 'visited') && x.status === 'completed',
    }));
    const a = v.active;
    if (typeof a?.id === 'string' && isSelectedCourse(a.selected) && isSelectedCourse(a.original) && time(a.startedAt) && validRestoredProgress(a.progress, courseProgressStops(a.selected), courseProgressStops(a.original)) && a.progress.phase === 'in_progress') next.active = a;
    return next;
  }
  private mutate<T>(fn: () => Promise<T>): Promise<T> {
    const epoch = this.epoch;
    const task = this.queue.then(async () => {
      await this.load();
      if (epoch !== this.epoch) throw new Error('삭제 전 작업은 취소됐어요.');
      if (this.state.deletionPending || this.state.cleanupPending) await this.cleanup();
      return fn();
    });
    this.queue = task.catch(() => {});
    return task.catch(error => { this.error = error instanceof Error ? error.message : '저장하지 못했어요.'; this.emit(); throw error; });
  }
  private record(active: Journey, status: 'completed' | 'interrupted'): JourneyRecord {
    return { id: active.id, selected: active.original, startedAt: active.startedAt, endedAt: this.now(), status, outcomes: active.progress.outcomes,
      completedAll: status === 'completed' && courseProgressStops(active.original).slice(0, -1).every(stop => active.progress.outcomes[stop.id] === 'visited') };
  }
  view = (selected: SelectedCourse) => this.mutate(async () => {
    if (!this.state.remember) return;
    const key = selectedCourseKey(selected);
    await this.persist({ ...this.state, recent: [{ key, viewedAt: new Date(this.now()).toISOString(), selected }, ...this.state.recent.filter(v => v.key !== key)].slice(0, 20) });
  });
  start = (selected: SelectedCourse, expectedActiveId: string | null) => this.mutate(async () => {
    if (!isSelectedCourse(selected)) throw new Error('코스를 다시 조회해 주세요.');
    if ((this.state.active?.id ?? null) !== expectedActiveId) throw new Error('현재 여행이 변경됐어요. 다시 확인해 주세요.');
    const previous = this.state.active;
    selected = JSON.parse(JSON.stringify(selected));
    const startedAt = this.now();
    const active: Journey = { id: this.id(), selected, original: selected, startedAt, progress: { ...INITIAL_COURSE_PROGRESS, phase: 'in_progress', startedAt } };
    await this.persist({ ...this.state, active, records: previous ? [this.record(previous, 'interrupted'), ...this.state.records] : this.state.records, cleanupPending: true });
    await this.finishCommittedJourney();
    return active.id;
  });
  progress = (id: string, action: ProgressAction) => this.mutate(async () => {
    const active = this.state.active;
    if (active?.id !== id) throw new Error('진행 중인 여행이 달라졌어요.');
    const stop = courseProgressStops(active.selected)[active.progress.currentIndex];
    if (action.type === 'arrive' && (!stop || action.stop.id !== stop.id || action.isReturn !== (stop.id === 'return'))) throw new Error('현재 목적지를 다시 확인해 주세요.');
    if (action.type === 'skip' && (!stop || stop.id === 'return' || action.stop.id !== stop.id)) throw new Error('현재 장소만 건너뛸 수 있어요.');
    if (['reset', 'restore', 'start'].includes(action.type)) throw new Error('진행 상태를 초기화할 수 없어요.');
    const progress = courseProgressReducer(active.progress, action);
    const next = { ...active, progress };
    if (progress.phase === 'completed') {
      await this.persist({ ...this.state, active: null, records: [this.record(next, 'completed'), ...this.state.records], cleanupPending: true });
      await this.finishCommittedJourney();
    } else await this.persist({ ...this.state, active: next });
  });
  replan = (id: string, selected: SelectedCourse, advance: ProgressAction) => this.mutate(async () => {
    const active = this.state.active;
    if (active?.id !== id) throw new Error('진행 중인 여행이 달라졌어요.');
    if (!isSelectedCourse(selected) || !['finish_stay', 'skip'].includes(advance.type)) throw new Error('변경할 코스를 확인해 주세요.');
    const currentStop = courseProgressStops(active.selected)[active.progress.currentIndex];
    if ((advance.type === 'skip' && advance.stop.id !== currentStop?.id) || (advance.type === 'finish_stay' && !active.progress.stayingAt)) throw new Error('여행 진행이 변경됐어요. 다시 확인해 주세요.');
    // Retain all actually proposed stops, including removed/unvisited ones.
    const known = new Set(active.original.course.stops.map(v => v.tourApiContentId ?? v.name));
    const added = selected.course.stops.filter(v => !known.has(v.tourApiContentId ?? v.name));
    await this.persist({ ...this.state, active: { ...active, selected, progress: courseProgressReducer(active.progress, advance), original: { ...active.original, course: { ...active.original.course, stops: [...active.original.course.stops, ...added] } } } });
  });
  end = (id: string) => this.mutate(async () => {
    const active = this.state.active;
    if (active?.id !== id) throw new Error('진행 중인 여행이 달라졌어요.');
    await this.persist({ ...this.state, active: null, records: [this.record(active, 'interrupted'), ...this.state.records], cleanupPending: true });
    await this.finishCommittedJourney();
    return id;
  });
  toggleBookmark = (place: Bookmark) => this.mutate(async () => {
    const exists = this.state.bookmarks.some(v => v.id === place.id && v.source === place.source);
    await this.persist({ ...this.state, bookmarks: exists ? this.state.bookmarks.filter(v => !(v.id === place.id && v.source === place.source)) : [place, ...this.state.bookmarks] });
  });
  search = (keyword: string) => this.mutate(async () => {
    if (this.state.remember) await this.persist({ ...this.state, searches: [keyword, ...this.state.searches.filter(v => v !== keyword)].slice(0, 8) });
  });
  clearSearches = () => this.mutate(() => this.persist({ ...this.state, searches: [] }));
  remember = (enabled: boolean) => this.mutate(() => this.persist({ ...this.state, remember: enabled }));
  deleteRecord = (id: string) => this.mutate(() => this.persist({ ...this.state, records: this.state.records.filter(v => v.id !== id) }));
  reminder = (id: string, schedule: () => Promise<void | boolean>, enabled = true) => this.mutate(async () => {
    if (this.state.active?.id !== id) return;
    const scheduled = await schedule();
    await this.persist({ ...this.state, active: { ...this.state.active, reminderEnabled: enabled && scheduled !== false } });
  });
  retry = () => this.mutate(async () => { this.error = null; this.emit(); });
  deleteAll = () => this.mutate(async () => {
    // Publish a monotonic reset signal even when React batches cleanup renders.
    const next = { ...empty(), remember: this.state.remember, deletionPending: true, cleanupPending: true };
    await this.storage.setItem(TRAVEL_KEY, JSON.stringify(next));
    this.epoch++;
    this.deletionRevision++;
    this.state = next;
    this.emit();
    await this.cleanup();
  });
}

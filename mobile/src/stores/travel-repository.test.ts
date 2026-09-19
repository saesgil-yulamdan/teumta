import { describe, expect, it, vi } from 'vitest';
import { TravelRepository, TRAVEL_KEY, LEGACY_KEYS } from './travel-repository';
import { getSelectedCourse, isSelectedCourse, selectedCourseKey, setSelectedCourse, type SelectedCourse } from './selected-course';
import { courseProgressStops } from '../utils/trip-summary';

const course = (name = 'A'): SelectedCourse => ({
  destination: { name, latitude: 37.5, longitude: 127 }, destinationParams: { contentId: name }, availableMinutes: 60,
  course: { totalMinutes: 40, returnTravelMinutes: 10, returnDistanceMeters: 600, verified: true,
    stops: ['공원', '시장'].map((name, i) => ({ name, tourApiContentId: String(i), address: null, imageUrl: null,
      latitude: 37.51 + i / 100, longitude: 127, travelMinutesFromPrevious: 5, distanceMetersFromPrevious: 300, stayMinutes: 10 })) },
});
function setup(values: Record<string, string> = {}) {
  const data = new Map(Object.entries(values));
  const storage = { getItem: vi.fn(async (key: string) => data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { data.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { data.delete(key); }) };
  const cancel = vi.fn(async () => {});
  let clock = 1_000_000, id = 0;
  const create = () => new TravelRepository(storage, cancel, () => clock += 60_000, () => `session-${++id}`);
  return { data, storage, cancel, create, repo: create() };
}
async function finish(repo: TravelRepository) {
  const active = repo.state.active!;
  const stops = courseProgressStops(active.selected);
  for (const stop of stops.slice(active.progress.currentIndex)) {
    await repo.progress(active.id, { type: 'arrive', stop, at: 2_000_000, isReturn: stop.id === 'return' });
    if (stop.id !== 'return') await repo.progress(active.id, { type: 'finish_stay' });
  }
}

describe('device travel repository', () => {
  it('preview B and reading history leave A progress and notifications unchanged; canceled transition makes no mutation', async () => {
    const { repo, cancel } = setup();
    const id = await repo.start(course(), null);
    await repo.progress(id, { type: 'arrive', stop: courseProgressStops(course())[0], at: 2_000_000, isReturn: false });
    const before = structuredClone(repo.state.active);
    cancel.mockClear();
    setSelectedCourse(course('B'));
    await repo.view(getSelectedCourse()!);
    const history = repo.state.records;
    expect(history).toEqual([]);
    expect(repo.state.active).toEqual(before);
    expect(cancel).not.toHaveBeenCalled();
    await expect(repo.start(course('B'), 'stale-session')).rejects.toThrow();
    expect(repo.state.active).toEqual(before);
    expect(cancel).not.toHaveBeenCalled();
  });
  it('confirmed replacement records only observed visits and cancels A alarms once', async () => {
    const { repo, cancel } = setup();
    const a = await repo.start(course(), null);
    await repo.progress(a, { type: 'skip', stop: courseProgressStops(course())[0], outcome: 'unavailable' });
    cancel.mockClear();
    const b = await repo.start(course('B'), a);
    expect(b).not.toBe(a);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(repo.state.records[0]).toMatchObject({ id: a, status: 'interrupted', completedAll: false, outcomes: { 'stop-0': 'unavailable' } });
  });
  it('restores the same session and supports all manual steps without GPS', async () => {
    const { repo, create } = setup();
    const id = await repo.start(course(), null);
    await repo.progress(id, { type: 'arrive', stop: courseProgressStops(course())[0], at: 2_000_000, isReturn: false });
    const restored = create(); await restored.load();
    expect(restored.state.active).toEqual(repo.state.active);
    await restored.progress(id, { type: 'finish_stay' });
    await finish(restored);
    expect(restored.state.active).toBeNull();
    expect(restored.state.records[0]).toMatchObject({ id, status: 'completed', completedAll: true, outcomes: { 'stop-0': 'visited', 'stop-1': 'visited' } });
  });
  it('two trips on the same course remain separate even after 45 previews', async () => {
    const { repo } = setup();
    await repo.start(course(), null); await finish(repo);
    await repo.start(course(), null); await finish(repo);
    for (let i = 0; i < 45; i++) await repo.view(course(String(i)));
    expect(repo.state.records).toHaveLength(2);
    expect(new Set(repo.state.records.map(r => r.id)).size).toBe(2);
    expect(repo.state.recent).toHaveLength(20);
  });
  it('skip/unavailable/undo do not invent visits or a full completion', async () => {
    const { repo } = setup(); const id = await repo.start(course(), null); const stops = courseProgressStops(course());
    await repo.progress(id, { type: 'arrive', stop: stops[0], at: 2_000_000, isReturn: false });
    await repo.progress(id, { type: 'undo_arrival' });
    await repo.progress(id, { type: 'skip', stop: stops[0], outcome: 'skipped' });
    await repo.progress(id, { type: 'skip', stop: stops[1], outcome: 'unavailable' });
    await repo.progress(id, { type: 'arrive', stop: stops[2], at: 2_200_000, isReturn: true });
    expect(repo.state.records[0]).toMatchObject({ status: 'completed', completedAll: false, outcomes: { 'stop-0': 'skipped', 'stop-1': 'unavailable' } });
  });
  it('rejects return before reaching the return step', async () => {
    const { repo } = setup(); const id = await repo.start(course(), null);
    await expect(repo.progress(id, { type: 'arrive', stop: courseProgressStops(course())[2], at: 3_000_000, isReturn: true })).rejects.toThrow();
    expect(repo.state.records).toHaveLength(0);
  });
  it('replans and advances atomically; restart retains removed stops as unvisited', async () => {
    const { repo, create } = setup(); const id = await repo.start(course(), null);
    const next = course(); next.course.stops = next.course.stops.slice(0, 1);
    await repo.replan(id, next, { type: 'skip', stop: courseProgressStops(course())[0], outcome: 'skipped' });
    const restored = create(); await restored.load();
    expect(restored.state.active?.progress.currentIndex).toBe(1);
    await finish(restored);
    expect(restored.state.records[0].selected.course.stops).toHaveLength(2);
    expect(restored.state.records[0]).toMatchObject({ completedAll: false, outcomes: { 'stop-0': 'skipped' } });
  });
  it('keeps published state when a write fails and allows retry', async () => {
    const { repo, storage } = setup(); const id = await repo.start(course(), null);
    const before = structuredClone(repo.state);
    storage.setItem.mockRejectedValueOnce(new Error('disk full'));
    await expect(repo.end(id)).rejects.toThrow('disk full');
    expect(repo.state).toEqual(before);
    await repo.end(id); expect(repo.state.records).toHaveLength(1);
  });
  it('does not overwrite legacy data when a read fails', async () => {
    const { repo, storage } = setup(); storage.getItem.mockRejectedValueOnce(new Error('locked'));
    await expect(repo.search('공원')).rejects.toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
    await repo.search('공원'); expect(repo.state.searches).toEqual(['공원']);
  });
  it('deletes everything durably, preserves display preferences and rejects queued stale writes', async () => {
    const { repo, data, create, cancel } = setup(Object.fromEntries(LEGACY_KEYS.map(k => [k, '{}'])));
    data.set('teumta:onboarding:v1', 'seen');
    await repo.start(course(), null); await repo.search('공원'); await repo.view(course());
    await repo.toggleBookmark({ id: '1', source: 'TOUR', name: '공원', imageUrl: null, address: null });
    await repo.remember(false);
    const deleting = repo.deleteAll();
    const stale = repo.view(course('stale'));
    await deleting; await expect(stale).rejects.toThrow();
    const restored = create(); await restored.load();
    expect(restored.state).toMatchObject({ bookmarks: [], searches: [], recent: [], active: null, records: [], remember: false, deletionPending: false, cleanupPending: false });
    expect(LEGACY_KEYS.every(k => !data.has(k))).toBe(true);
    expect(data.get('teumta:onboarding:v1')).toBe('seen');
    expect(cancel).toHaveBeenCalled();
  });
  it('failed notification cancellation leaves a deletion tombstone, retries on restart', async () => {
    const { repo, create, cancel } = setup(); await repo.start(course(), null);
    cancel.mockRejectedValueOnce(new Error('OS busy'));
    await expect(repo.deleteAll()).rejects.toThrow('OS busy');
    expect(repo.state.active).toBeNull(); expect(repo.state.deletionPending).toBe(true);
    const restored = create(); await restored.load();
    expect(restored.state.active).toBeNull(); expect(restored.state.deletionPending).toBe(false);
  });
  it('does not report deletion success if storage failed', async () => {
    const { repo, storage, cancel } = setup(); await repo.start(course(), null); cancel.mockClear();
    storage.setItem.mockRejectedValueOnce(new Error('disk full'));
    await expect(repo.deleteAll()).rejects.toThrow();
    expect(repo.state.active).not.toBeNull(); expect(repo.deletionRevision).toBe(0);
    expect(cancel).not.toHaveBeenCalled();
  });
  it('migrates explicit legacy results without inventing sessions, elapsed time or visits', async () => {
    const { repo } = setup({ [LEGACY_KEYS[2]]: JSON.stringify({ entries: [{ selected: course(), viewedAt: '2026-09-01', completedAt: '2026-09-02', completedAll: true }, { selected: course('B'), viewedAt: '2026-09-03', completedAt: null }] }) });
    await repo.load();
    expect(repo.state.records).toHaveLength(1);
    expect(repo.state.records[0]).toMatchObject({ status: 'legacy', startedAt: null, completedAll: null, outcomes: {} });
    expect(repo.state.recent).toHaveLength(2); expect(repo.state.active).toBeNull();
  });
  it('migrates only a matching actually started legacy trip', async () => {
    const selected = course();
    const progress = { phase: 'in_progress', currentIndex: 0, stayingAt: null, stayingSince: null, startedAt: 1000, outcomes: {} };
    const { repo } = setup({ [LEGACY_KEYS[0]]: JSON.stringify(selected), [LEGACY_KEYS[1]]: JSON.stringify({ key: selectedCourseKey(selected), state: progress }) });
    await repo.load(); expect(repo.state.active?.startedAt).toBe(1000);
  });
  it('corrupt data does not crash or resurrect legacy state', async () => {
    for (const value of ['{', 'null', '[]', JSON.stringify({ version: 3, records: [null, { id: 'bad', selected: { course: { stops: {} } } }], recent: [null], bookmarks: [null] })]) {
      const { repo } = setup({ [TRAVEL_KEY]: value, [LEGACY_KEYS[0]]: JSON.stringify(course()) });
      await repo.load(); expect(repo.state.active).toBeNull(); expect(repo.state.records).toEqual([]);
    }
    expect(isSelectedCourse({ course: { stops: {} } })).toBe(false);
    expect(isSelectedCourse({ ...course(), course: { ...course().course, stops: [null] } })).toBe(false);
  });
  it('turning automatic history off leaves explicit saves and trip results functional', async () => {
    const { repo } = setup(); await repo.remember(false); await repo.search('검색'); await repo.view(course());
    await repo.start(course(), null); await finish(repo);
    expect(repo.state.searches).toEqual([]); expect(repo.state.recent).toEqual([]); expect(repo.state.records).toHaveLength(1);
  });
});

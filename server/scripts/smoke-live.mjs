/**
 * 배포/로컬 서버를 실제 외부 API 경로까지 점검하는 순차 스모크 테스트.
 * 기본 1곳, 출시 전에는 SMOKE_DESTINATION_LIMIT=5로 실행한다.
 */

const baseUrl = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');
const limit = Math.max(1, Math.min(5, Number(process.env.SMOKE_DESTINATION_LIMIT ?? 1)));
// 서버의 60초 IP별 비용 창을 존중한다. 보호 미적용 환경은 0으로 덮어써도 된다.
const intervalMs = Math.max(0, Number(process.env.SMOKE_INTERVAL_MS ?? 61_000));
const destinations = [
  { name: '경복궁', contentId: '126508' },
  { name: '해운대해수욕장', contentId: '126081' },
  { name: '수원화성', contentId: '2480899' },
  { name: '전주 한옥마을', contentId: '264284' },
  { name: '성산일출봉', contentId: '126435' },
].slice(0, limit);

async function request(path, options = {}) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}${path}`, {
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  const durationMs = Date.now() - startedAt;
  const allowed = options.allowStatuses ?? [];
  if (!response.ok && !allowed.includes(response.status)) {
    throw new Error(`${path} failed: HTTP ${response.status} ${body?.error?.code ?? ''}`.trim());
  }
  console.log(JSON.stringify({ path, status: response.status, durationMs }));
  return { response, body };
}

function assertCoursePayload(body, label) {
  const courses = body?.data?.courses;
  if (!Array.isArray(courses) || courses.length === 0) {
    throw new Error(`${label}: 추천 코스가 없습니다.`);
  }
  for (const course of courses) {
    if (course.verified !== true) throw new Error(`${label}: 미검증 코스가 반환됐습니다.`);
    if (!Array.isArray(course.returnPath) || course.returnPath.length === 0) {
      throw new Error(`${label}: returnPath가 없습니다.`);
    }
    for (const stop of course.stops ?? []) {
      if (!Array.isArray(stop.pathFromPrevious) || stop.pathFromPrevious.length === 0) {
        throw new Error(`${label}: stop.pathFromPrevious가 없습니다.`);
      }
    }
  }
  return courses.map((course) =>
    (course.stops ?? []).map((stop) => stop.tourApiContentId ?? stop.name).join('|'),
  );
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

await request('/health');

for (const [index, destination] of destinations.entries()) {
  if (index > 0 && intervalMs > 0) {
    console.log(JSON.stringify({ waitingMs: intervalMs, reason: 'public rate-limit window' }));
    await wait(intervalMs);
  }
  const id = encodeURIComponent(destination.contentId);
  await request(`/api/congestion?contentId=${id}`, { allowStatuses: [404] });
  await request(`/api/concentration-forecast?contentId=${id}`, { allowStatuses: [404] });
  await request(`/api/local-places?contentId=${id}&radius=2000`);
  await request(`/api/festivals/nearby?contentId=${id}&radius=2000`);

  const first = await request(`/api/courses?contentId=${id}&availableMinutes=60&variant=0`);
  const second = await request(`/api/courses?contentId=${id}&availableMinutes=60&variant=1`);
  const firstKeys = assertCoursePayload(first.body, `${destination.name}/variant=0`);
  const secondKeys = assertCoursePayload(second.body, `${destination.name}/variant=1`);
  console.log(JSON.stringify({
    destination: destination.name,
    courseCount: firstKeys.length,
    variantChanged: JSON.stringify(firstKeys) !== JSON.stringify(secondKeys),
  }));
}

console.log(`live smoke passed: ${destinations.length} destination(s)`);

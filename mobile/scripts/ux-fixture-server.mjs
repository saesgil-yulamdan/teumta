// Local-only, deterministic UX test data. Never used by the shipped app.
// Run: node scripts/ux-fixture-server.mjs
// App: EXPO_PUBLIC_API_BASE_URL=http://localhost:3102 npm run web -- --port 8083
import http from 'node:http';
const destination = { name: '검증 출발지', latitude: 37.5, longitude: 127 };
const stops = ['검증 공원', '검증 시장'].map((name, i) => ({ name, tourApiContentId: String(100 + i),
  latitude: 37.501 + i / 1000, longitude: 127.001, address: '검증용 주소', imageUrl: null,
  travelMinutesFromPrevious: 5, distanceMetersFromPrevious: 300, stayMinutes: 10 }));
const course = { stops, totalMinutes: 40, returnTravelMinutes: 10, returnDistanceMeters: 600, verified: false };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:3102');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  let data;
  if (/latitude|longitude|journey|session|outcomes|startedAt/i.test(url.search)) {
    res.writeHead(400); res.end(JSON.stringify({ success: false, data: null, error: { code: 'PRIVATE_INPUT_FORBIDDEN' } })); return;
  }
  switch (url.pathname) {
    case '/api/courses': data = { destination, availableMinutes: Number(url.searchParams.get('availableMinutes')), courses: url.searchParams.get('contentId') === 'empty' ? [] : [course, { ...course, stops: [...stops].reverse() }] }; break;
    case '/api/local-places/detail': data = { tourApiContentId: '100', name: '검증 공원', overview: '공개 API 대신 쓰는 로컬 검증 자료', openHours: '00:00~23:59', restDays: null }; break;
    case '/api/congestion': data = { poiId: 'test', poiName: destination.name, level: 'NORMAL', isRealtime: true, measuredAt: new Date().toISOString(), fetchedAt: new Date().toISOString(), source: 'LOCAL_TEST' }; break;
    case '/api/search/places': data = Array.from({ length: 20 }, (_, i) => ({ source: 'TOUR', tourApiContentId: String(i), contentTypeId: '12', name: '검증 장소 ' + i, address: '검증 지역', latitude: 37.5, longitude: 127, imageUrl: null })); break;
    default: data = [];
  }
  res.end(JSON.stringify({ success: true, data, error: null }));
}).listen(3102, '127.0.0.1', () => console.log('UX fixtures: http://localhost:3102 (synthetic data only)'));

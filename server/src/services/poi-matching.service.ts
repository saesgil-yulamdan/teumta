import { ExternalApiError, ExternalApiNotFoundError } from '../external/common';
import { fetchRealtimeCongestion } from '../external/congestion';
import { extractPoiBase, fetchPoiDetail, fetchPoiSearch, mapPoiSearchToDestinations } from '../external/tmap';
import { extractDetailCoordinate, extractDetailItem, fetchTourPlaceDetail } from '../external/tour';
import { distanceMeters, type GeoPoint } from '../utils/geo';
import { placeNameRank } from '../utils/place-name';
import { TtlCache } from '../utils/ttl-cache';
import { getSkPoiIndex, type SkPoiIndex } from './sk-poi-index.service';

/**
 * TourAPI 관광지(contentId) → TMAP POI(poiId) 매칭.
 *
 * 필요한 이유: SK 퍼즐 혼잡도는 TMAP poiId로만 조회 가능. 검색은 TourAPI 우선이라
 * 유명 관광지일수록 `source=TOUR`로 잡혀 `tmapPoiId`가 없음 →
 * **혼잡이 가장 심한 곳에서 실시간 혼잡도 표시 불가**. 서버가 이어준다.
 *
 * 검색 응답에 미리 안 붙이는 이유: 결과 20건마다 POI 검색이면 호출량·응답시간 20배.
 * 실제로 여는 목적지는 하나 → 조회 시점 해석 + 캐시.
 */

/**
 * 동명이소 방지용 좌표 검증 반경(전국에 "경복궁" 상호가 여럿).
 * 같은 시설이어도 TourAPI·TMAP 대표 좌표가 수백 m 차이나서 300m.
 */
export const POI_MATCH_RADIUS_METERS = 300;

/** 매칭 캐시 TTL. 관광지↔POI 대응은 사실상 고정이라 길게. */
export const POI_MATCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** POI 검색 후보 확인 수. 상위 몇 개면 충분. */
const POI_SEARCH_COUNT = 5;

/** 이름 역매칭 폴백에서 좌표를 검증할 동명 후보 상한(TMAP 상세 호출 수 제한). */
const NAME_FALLBACK_DETAIL_LIMIT = 3;

/**
 * 이름 역매칭 폴백 전용 검증 반경.
 *
 * 300m는 대형 시설에 너무 엄격하다 — 에버랜드·수원화성처럼 부지가 넓으면
 * TourAPI와 TMAP의 대표 좌표가 수백 m 이상 벌어져 실시간이 되는 곳을 놓친다
 * (2026-08-16 실측: 둘 다 rltm 정상인데 반경 검증에서 탈락).
 * 이름 "정확 일치"가 전제이고 최종 문지기는 실시간 조회 검증이라 3km로 완화 —
 * 동명이소(전국의 같은 상호)는 보통 도시 단위로 떨어져 있어 이 반경에 안 걸린다.
 */
const NAME_FALLBACK_RADIUS_METERS = 3000;

/** 실시간 조회로 확정 검증할 후보 상한(SK 쿼터 보호 — 매칭 캐시 24h라 장소당 최초 1회). */
const RLTM_VERIFY_LIMIT = 3;

/**
 * 수동 확정 매핑 — 자동 규칙(정확 일치·"목록명⊂target" 포함)으로 이을 수 없는 표기 차이.
 *
 * 반대 방향 포함("태화강"⊂"태화강국가정원")을 자동화하면 "청계천"→"청계천박물관" 같은
 * 다른 장소 오매칭이 열리므로 규칙은 그대로 두고, 실조회로 확인된 것만 여기 등재한다.
 * 등재 기준: rltm 200 실측(2026-08-16). 값이 낡아도 아래 실조회 검증이 걸러낸다.
 */
const MANUAL_POI_ID_BY_CONTENT_ID: Record<string, string> = {
  /** 태화강 → 태화강국가정원 */
  '128201': '1129510',
  /** 경포해수욕장 → 경포해변 */
  '128758': '3928',
};

/**
 * 상한 — 상세를 연 목적지마다 키가 쌓이는 캐시라 무한 성장 방지가 특히 중요.
 * 값으로 null(매칭 실패)도 저장한다 — 같은 장소 반복 호출로 쿼터를 태우지 않기 위함.
 * 외부 오류로 lookup 자체가 던지면 캐시하지 않는다(일시 장애를 24시간 박제하면 안 됨).
 */
const POI_MATCH_CACHE_MAX_ENTRIES = 2000;

const cache = new TtlCache<string | null>(POI_MATCH_CACHE_TTL_MS, POI_MATCH_CACHE_MAX_ENTRIES);

/** 테스트용 캐시 초기화. */
export function clearPoiMatchCache(): void {
  cache.clear();
}

/**
 * contentId에 대응하는 TMAP poiId. 없으면 null.
 * 외부 호출은 최초 1회(TourAPI 상세 1 + POI 검색 1), 이후 캐시.
 * 같은 contentId 동시 미스도 호출 1회를 공유한다.
 */
export async function resolveTmapPoiId(contentId: string): Promise<string | null> {
  const key = contentId.trim();
  return cache.getOrCreate(key, () => lookupTmapPoiId(key));
}

async function lookupTmapPoiId(contentId: string): Promise<string | null> {
  // 수동 매핑은 Tour 상세 없이 SK 실조회로 확정 가능 — Tour 장애 시에도 혼잡도를 살린다.
  const manual = MANUAL_POI_ID_BY_CONTENT_ID[contentId];
  if (manual) {
    const verifiedManual = await firstWithRealtime([manual]);
    if (verifiedManual !== null) {
      return verifiedManual;
    }
  }

  let detail;
  try {
    detail = await fetchTourPlaceDetail(contentId);
  } catch (error) {
    // Tour 타임아웃을 혼잡 전체 504로 올리지 않는다 — 매칭 불가로 두고 상위가 404 처리.
    if (error instanceof ExternalApiError) {
      return null;
    }
    throw error;
  }
  const item = extractDetailItem(detail);
  const coordinate = extractDetailCoordinate(detail);
  const name = item?.title?.trim();

  // 이름·좌표 없으면 검증 불가 — 이름만으로 잇는 건 오매칭 위험
  if (!name || !coordinate) {
    return null;
  }

  const candidates = mapPoiSearchToDestinations(
    await fetchPoiSearch(name, { count: POI_SEARCH_COUNT }),
  );
  const directBest = pickBestPoiMatch(candidates, { name, coordinate });

  // 일반적인 직접 매칭을 먼저 확정한다. SK 전체 장소 인덱스는 최대 30페이지라
  // 이를 먼저 기다리면 첫 혼잡도 요청이 수십 초 느려진다. 직접 후보가 실시간 검증에
  // 실패한 예외 장소에서만 인덱스 역매칭을 사용한다.
  const directCandidates: string[] = [];
  if (manual) directCandidates.push(manual);
  if (directBest !== null && !directCandidates.includes(directBest)) {
    directCandidates.push(directBest);
  }
  const directVerified = await firstWithRealtime(directCandidates);
  if (directVerified !== null) {
    return directVerified;
  }

  // SK 제공 장소 인덱스는 예외 매칭 힌트. 로드 실패(null)면 TMAP 결과로 폴백.
  const skIndex = await getSkPoiIndex();
  const indexedBest = pickBestPoiMatch(candidates, { name, coordinate }, skIndex ?? undefined);

  // 후보 확정 순서: SK 인덱스가 선택한 TMAP 후보 → SK 목록 이름 역매칭.
  // 목록에 있어도 "실시간"은 부분집합이라(통계 전용 장소 존재 — 2026-08-16 실측:
  // 불국사·남이섬은 목록엔 있지만 rltm 404) 최종 판정은 실시간 조회 성공 여부로 한다.
  const verifyCandidates: string[] = [];
  if (indexedBest !== null && !directCandidates.includes(indexedBest)) {
    verifyCandidates.push(indexedBest);
  }
  if (skIndex !== null) {
    for (const poiId of await matchBySkPoiName(skIndex, name, coordinate)) {
      if (!verifyCandidates.includes(poiId)) {
        verifyCandidates.push(poiId);
      }
    }
  }

  const verified = await firstWithRealtime(verifyCandidates.slice(0, RLTM_VERIFY_LIMIT));
  // 전부 실시간 미제공이면 기존 최적 후보 유지 — 사용자에게는 최종 조회가 404로 알린다.
  return verified ?? indexedBest ?? directBest;
}

/**
 * SK 목록에서 이름으로 후보를 뽑아 TMAP 상세 좌표로 반경 검증해 반환.
 * 정확 일치 우선, 그다음 "목록명이 target에 포함"(TourAPI가 '수원화성 관광특구'처럼
 * 부가 표기를 붙인 경우 목록의 '수원화성'을 찾는 방향)만 허용.
 */
async function matchBySkPoiName(
  skIndex: SkPoiIndex,
  name: string,
  coordinate: GeoPoint,
): Promise<string[]> {
  const matched: string[] = [];
  const poiIds = [
    ...skIndex.findPoiIdsByName(name),
    ...skIndex.findPoiIdsContainedInName(name),
  ].slice(0, NAME_FALLBACK_DETAIL_LIMIT);
  for (const poiId of poiIds) {
    try {
      const base = extractPoiBase(await fetchPoiDetail(poiId));
      if (base && distanceMeters(coordinate, base) <= NAME_FALLBACK_RADIUS_METERS) {
        matched.push(poiId);
      }
    } catch {
      // 후보 하나의 상세 조회 실패는 다음 후보로
    }
  }
  return matched;
}

/**
 * 후보들을 실시간 혼잡도로 확정 검증 — 첫 성공 poiId를 반환.
 * 404(미커버)는 다음 후보로, 그 외 오류(일시 장애)는 검증을 멈춘다 —
 * 장애를 "미커버"로 오판해 24시간 캐시에 박제하지 않기 위함.
 */
async function firstWithRealtime(poiIds: string[]): Promise<string | null> {
  for (const poiId of poiIds) {
    try {
      await fetchRealtimeCongestion(poiId);
      return poiId;
    } catch (error) {
      if (error instanceof ExternalApiNotFoundError) {
        continue;
      }
      return null;
    }
  }
  return null;
}

export interface PoiCandidate {
  tmapPoiId: string | null;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

/**
 * 반경 안 최적 후보의 poiId. 반경 밖만 있으면 null(억지 매칭 금지).
 *
 * **거리만으로 고르면 안 됨.** TMAP은 본 시설과 부속 시설을 각각 POI로 제공
 * ("전주한옥마을" / "전주한옥마을 관광안내소" — id 다름). 부속이 몇 m 더 가까운 경우가 실제로 있고
 * SK 혼잡도는 본 시설만 커버 → 엉뚱한 id면 "데이터 없음".
 * 그래서 이름 일치도 우선, 거리로 동점 처리.
 *
 * 이름 비교는 공백·대괄호를 걷어낸 뒤 포함 관계까지 — TourAPI가
 * "전북 전주 한옥마을 [슬로시티]"처럼 지역 접두사·부가 표기를 붙이기 때문.
 */
export function pickBestPoiMatch(
  candidates: PoiCandidate[],
  target: { name: string; coordinate: GeoPoint },
  skIndex?: Pick<SkPoiIndex, 'hasPoi'>,
): string | null {
  let best: { poiId: string; covered: boolean; rank: number; distance: number } | null = null;

  for (const candidate of candidates) {
    if (candidate.tmapPoiId === null || candidate.latitude === null || candidate.longitude === null) {
      continue;
    }

    const distance = distanceMeters(target.coordinate, {
      latitude: candidate.latitude,
      longitude: candidate.longitude,
    });
    if (distance > POI_MATCH_RADIUS_METERS) {
      continue;
    }

    // SK가 데이터를 주는 후보 우선 — 본시설·부속시설이 둘 다 반경 안일 때
    // 이름·거리가 비슷해도 혼잡도가 나오는 쪽을 골라야 한다. 인덱스가 없으면 기존 기준 그대로.
    const covered = skIndex?.hasPoi(candidate.tmapPoiId) ?? false;
    const rank = placeNameRank(candidate.name, target.name);
    const better =
      best === null ||
      (covered !== best.covered
        ? covered
        : rank !== best.rank
          ? rank < best.rank
          : distance < best.distance);

    if (better) {
      best = { poiId: candidate.tmapPoiId, covered, rank, distance };
    }
  }

  return best?.poiId ?? null;
}

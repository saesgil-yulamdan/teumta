import { PlaceType } from '@prisma/client';

import type {
  DestinationSearchResult,
  LocalPlaceDetailData,
  NearbyLocalPlaceCandidate,
  PlaceData,
} from '../../dtos';
import { ExternalApiResponseError } from '../common';
import type {
  TourApiDetailItem,
  TourApiDetailResponse,
  TourApiListResponse,
  TourApiPlaceItem,
} from './tour.dto';

/**
 * TourAPI 원본 → 틈타 내부 PlaceData 변환.
 *
 * 미매핑(detailCommon2 / detailIntro2 추가 호출 필요):
 *  - description → detailCommon2의 overview
 *  - openingTime·closingTime → detailIntro2 운영시간(contentTypeId별 필드 상이, 자유텍스트 파싱)
 *  - recommendedDuration → TourAPI 미제공, 내부 규칙으로 산정
 */

/**
 * LOCAL_PLACE로 볼 contentTypeId. 39=음식점, 38=쇼핑.
 * 그 외(12 관광지, 14 문화시설, 15 축제, 25 여행코스, 28 레포츠, 32 숙박)는 TOURIST_SPOT.
 * 정책 변경 시 tour.mapper.test.ts로 의도 고정.
 */
const LOCAL_PLACE_CONTENT_TYPE_IDS = new Set(['38', '39']);

export function mapContentTypeIdToPlaceType(contentTypeId: string): PlaceType {
  return LOCAL_PLACE_CONTENT_TYPE_IDS.has(contentTypeId)
    ? PlaceType.LOCAL_PLACE
    : PlaceType.TOURIST_SPOT;
}

/** 목록 변환 결과. 좌표 불량 등은 전체 실패 대신 skip 집계. */
export interface TourPlaceListMapResult {
  places: PlaceData[];
  skipped: { contentId: string; reason: string }[];
}

/**
 * 목록 응답 → PlaceData[] + skip 집계.
 * 좌표 없는 항목 하나로 페이지 전체가 실패하지 않도록 항목 단위 오류 격리.
 */
export function mapTourPlaceListDetailed(response: TourApiListResponse): TourPlaceListMapResult {
  const places: PlaceData[] = [];
  const skipped: { contentId: string; reason: string }[] = [];

  for (const item of extractItems(response)) {
    try {
      places.push(mapTourPlaceToPlaceData(item));
    } catch (error) {
      skipped.push({
        contentId: String(item.contentid ?? 'unknown'),
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
  return { places, skipped };
}

/** 목록 응답 → PlaceData[]. 불량 항목은 조용히 제외(집계가 필요하면 Detailed). */
export function mapTourPlaceList(response: TourApiListResponse): PlaceData[] {
  return mapTourPlaceListDetailed(response).places;
}

/** 항목 배열 안전 추출 — items="" 또는 단일 객체 케이스 방어. */
export function extractItems(response: TourApiListResponse): TourApiPlaceItem[] {
  // items는 결과 없으면 빈 문자열("") → falsy 체크로 함께 처리
  const items = response.response?.body?.items;
  if (!items) {
    return [];
  }
  const item = items.item;
  if (Array.isArray(item)) {
    return item;
  }
  return item ? [item] : [];
}

export function mapTourPlaceToPlaceData(item: TourApiPlaceItem): PlaceData {
  return {
    tourApiContentId: String(item.contentid),
    name: item.title,
    type: mapContentTypeIdToPlaceType(String(item.contenttypeid)),
    address: buildAddress(item.addr1, item.addr2),
    latitude: parseCoordinate(item.mapy, 'mapy', item.contentid),
    longitude: parseCoordinate(item.mapx, 'mapx', item.contentid),
    imageUrl: toSecureImageUrl(item.firstimage || item.firstimage2),
    description: null,
    openingTime: null,
    closingTime: null,
    recommendedDuration: null,
    lDongRegnCd: emptyToNull(item.lDongRegnCd),
    lDongSignguCd: emptyToNull(item.lDongSignguCd),
    lclsSystm1: emptyToNull(item.lclsSystm1),
    lclsSystm2: emptyToNull(item.lclsSystm2),
    lclsSystm3: emptyToNull(item.lclsSystm3),
  };
}

// 실시간 주변 로컬 장소 매핑(요청 스코프 전용, DB 미저장)

/** locationBasedList2 → 후보[]. 좌표 없는 항목은 제외. */
export function mapNearbyCandidateList(response: TourApiListResponse): NearbyLocalPlaceCandidate[] {
  const candidates: NearbyLocalPlaceCandidate[] = [];
  for (const item of extractItems(response)) {
    const candidate = mapNearbyCandidate(item);
    if (candidate) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

/** searchFestival2 → 행사 후보[]. 좌표·날짜가 없는 항목은 제외. */
export function mapFestivalCandidateList(response: TourApiListResponse): NearbyLocalPlaceCandidate[] {
  const candidates: NearbyLocalPlaceCandidate[] = [];
  for (const item of extractItems(response)) {
    const candidate = mapFestivalCandidate(item);
    if (candidate) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

/** 단일 목록 항목 → 후보. 좌표가 유효하지 않으면 null. */
export function mapNearbyCandidate(item: TourApiPlaceItem): NearbyLocalPlaceCandidate | null {
  const latitude = safeCoordinate(item.mapy);
  const longitude = safeCoordinate(item.mapx);
  if (latitude === null || longitude === null) {
    return null;
  }
  const tourDistance = Number(item.dist);
  return {
    kind: 'LOCAL_PLACE',
    tourApiContentId: String(item.contentid),
    contentTypeId: item.contenttypeid === undefined ? null : String(item.contenttypeid),
    categoryCode: item.cat3 ? String(item.cat3) : null,
    name: item.title,
    address: buildAddress(item.addr1, item.addr2),
    latitude,
    longitude,
    imageUrl: toSecureImageUrl(item.firstimage || item.firstimage2),
    tourDistanceMeters: Number.isFinite(tourDistance) ? tourDistance : null,
    eventStartDate: null,
    eventEndDate: null,
  };
}

/** 단일 행사 목록 항목 → 후보. 좌표와 유효 날짜가 없으면 null. */
export function mapFestivalCandidate(item: TourApiPlaceItem): NearbyLocalPlaceCandidate | null {
  const latitude = safeCoordinate(item.mapy);
  const longitude = safeCoordinate(item.mapx);
  const eventStartDate = normalizeYmd(item.eventstartdate);
  const eventEndDate = normalizeYmd(item.eventenddate);
  if (latitude === null || longitude === null || eventStartDate === null || eventEndDate === null) {
    return null;
  }

  return {
    kind: 'FESTIVAL',
    tourApiContentId: String(item.contentid),
    contentTypeId: item.contenttypeid === undefined ? '15' : String(item.contenttypeid),
    categoryCode: item.cat3 ? String(item.cat3) : null,
    name: item.title,
    address: buildAddress(item.addr1, item.addr2),
    latitude,
    longitude,
    imageUrl: toSecureImageUrl(item.firstimage || item.firstimage2),
    tourDistanceMeters: null,
    eventStartDate,
    eventEndDate,
  };
}

/** searchKeyword2 목록 → 검색 결과[]. 좌표 없는 항목도 포함(좌표 null). */
export function mapSearchResultList(response: TourApiListResponse): DestinationSearchResult[] {
  return extractItems(response).map((item) => ({
    source: 'TOUR' as const,
    tourApiContentId: String(item.contentid),
    tmapPoiId: null,
    contentTypeId: String(item.contenttypeid),
    name: item.title,
    address: buildAddress(item.addr1, item.addr2),
    latitude: safeCoordinate(item.mapy),
    longitude: safeCoordinate(item.mapx),
    imageUrl: toSecureImageUrl(item.firstimage || item.firstimage2),
    // 매퍼는 DB를 모름 — 내부 Place 매칭은 place-search.service 담당
    placeId: null,
  }));
}

/** detailCommon2 상세 항목 추출(items="" · 단일 객체 방어). */
export function extractDetailItem(response: TourApiDetailResponse): TourApiDetailItem | null {
  const items = response.response?.body?.items;
  if (!items) {
    return null;
  }
  const item = items.item;
  if (Array.isArray(item)) {
    return item[0] ?? null;
  }
  return item ?? null;
}

/** detailCommon2 → 기준 좌표. 없으면 null(호출부에서 fallback). */
export function extractDetailCoordinate(
  response: TourApiDetailResponse,
): { latitude: number; longitude: number } | null {
  const item = extractDetailItem(response);
  if (!item) {
    return null;
  }
  const latitude = safeCoordinate(item.mapy);
  const longitude = safeCoordinate(item.mapx);
  if (latitude === null || longitude === null) {
    return null;
  }
  return { latitude, longitude };
}

/**
 * detailCommon2 → 로컬 장소 소개 정보.
 *
 * 목록(locationBasedList2)에는 소개문이 없어 "뭐 하는 곳인지"를 알 수 없다.
 * 상세를 한 번 더 부르는 비용을 감수할 값어치가 있는 필드만 뽑는다.
 * 좌표·이미지는 목록에서 이미 받았으므로 여기서 다시 내리지 않는다.
 */
export function mapLocalPlaceDetail(response: TourApiDetailResponse): LocalPlaceDetailData | null {
  const item = extractDetailItem(response);
  if (!item) {
    return null;
  }
  return {
    tourApiContentId: String(item.contentid),
    name: item.title ?? null,
    overview: cleanRichText(item.overview),
    tel: cleanRichText(item.tel),
    homepage: extractFirstUrl(item.homepage),
    // 운영시간·휴무일은 detailIntro2에서 별도 병합(서비스 담당)
    openHours: null,
    restDays: null,
  };
}

/**
 * detailIntro2 → 운영시간·휴무일.
 *
 * 필드명이 contentTypeId마다 다르다 — 관광지(12) usetime/restdate,
 * 문화시설(14) usetimeculture/restdateculture, 쇼핑(38) opentime/restdateshopping,
 * 음식점(39) opentimefood/restdatefood. 타입 분기 대신 "있는 첫 값"을 쓴다 —
 * 대상 타입이 늘어도 후보 목록만 늘리면 된다.
 */
const OPEN_HOURS_FIELDS = ['usetime', 'usetimeculture', 'opentime', 'opentimefood'] as const;
const REST_DAYS_FIELDS = ['restdate', 'restdateculture', 'restdateshopping', 'restdatefood'] as const;

export function mapLocalPlaceIntro(response: TourApiDetailResponse): {
  openHours: string | null;
  restDays: string | null;
} {
  const item = extractDetailItem(response);
  return {
    openHours: firstCleanText(item, OPEN_HOURS_FIELDS),
    restDays: firstCleanText(item, REST_DAYS_FIELDS),
  };
}

function firstCleanText(
  item: TourApiDetailItem | null,
  fields: readonly string[],
): string | null {
  if (!item) {
    return null;
  }
  for (const field of fields) {
    const value = item[field];
    if (typeof value === 'string') {
      const cleaned = cleanRichText(value);
      if (cleaned) {
        return cleaned;
      }
    }
  }
  return null;
}

/** HTML 태그·엔티티 제거. 소개문에 `<br>`, `&amp;` 등이 섞여 온다. */
function cleanRichText(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const text = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > 0 ? text : null;
}

/** homepage는 `<a href="...">...</a>` 형태로 오는 경우가 많아 URL만 꺼낸다. */
function extractFirstUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const href = /href=["']([^"']+)["']/i.exec(value);
  if (href) {
    return href[1];
  }
  const bare = /https?:\/\/[^\s"'<>]+/i.exec(value);
  return bare ? bare[0] : null;
}

/**
 * 이미지 URL을 https로 정규화.
 *
 * TourAPI는 대표 이미지를 `http://`로 준다. iOS는 ATS가 평문 HTTP를 막아 이미지가
 * 조용히 로드 실패하고, 클라이언트는 `imageUrl`이 있으니 "사진 있음"으로 판단해
 * 대체 표시(분류 라벨)도 띄우지 않는다 — 사용자 눈에는 빈 상자만 남는다.
 * 같은 CDN이 https로도 응답하므로 스킴만 올려서 내려준다.
 */
function toSecureImageUrl(value: string | undefined): string | null {
  const url = (value ?? '').trim();
  if (url.length === 0) {
    return null;
  }
  return url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url;
}

/** 좌표 문자열 → number | null. 빈 값·0·NaN은 null, throw 없음. */
function safeCoordinate(value: string | undefined): number | null {
  if (value === undefined || String(value).trim() === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed === 0) {
    return null;
  }
  return parsed;
}

function buildAddress(addr1?: string, addr2?: string): string | null {
  const full = [addr1, addr2]
    .map((part) => (part ?? '').trim())
    .filter((part) => part.length > 0)
    .join(' ');
  return full.length > 0 ? full : null;
}

function normalizeYmd(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return /^\d{8}$/.test(trimmed) ? trimmed : null;
}

/** 좌표 문자열 → number. TourAPI가 빈 값을 ""로 주므로 0·NaN은 무효 좌표. */
function parseCoordinate(value: string | undefined, field: string, contentId: string): number {
  if (value === undefined || String(value).trim() === '') {
    throw new ExternalApiResponseError('tour', `Missing ${field} for content ${contentId}`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed === 0) {
    throw new ExternalApiResponseError('tour', `Invalid ${field} for content ${contentId}`);
  }
  return parsed;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 대표 목적지(mobile destinations.ts)의 실시간 혼잡도 제공 여부 전수 측정.
 *
 * 실행:
 *   npm run measure:congestion
 *   npm run measure:congestion -- --json
 *
 * 서버의 실제 매칭 경로(resolveTmapPoiId — SK 제공 장소 인덱스 포함)를 그대로 태워
 * 앱과 같은 결과를 얻는다. 출력의 true/false를
 * mobile/src/constants/destinations.ts의 `hasRealtimeCongestion` 갱신 근거로 쓴다
 * (플래그는 정렬 힌트 전용 — 화면 표시는 항상 실제 응답값).
 *
 * 외부 호출: SK 목록 ≈30콜(24시간 캐시) + 목적지당 TourAPI 1 · TMAP 1~4 · SK 1.
 * 사전 조건: server/.env의 TOUR/TMAP/CONGESTION 키.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ExternalApiNotFoundError } from '../src/external/common';
import { getRealtimeCongestion } from '../src/services/congestion.service';
import { resolveTmapPoiId } from '../src/services/poi-matching.service';

type MeasureReason =
  | 'REALTIME_AVAILABLE'
  | 'MATCH_FAILED'
  | 'SK_UNSUPPORTED'
  | 'LOOKUP_ERROR'
  | 'MATCH_ERROR';

interface DestinationEntry {
  contentId: string;
  name: string;
  expectedHasRealtimeCongestion: boolean;
}

interface Measured {
  contentId: string;
  name: string;
  expectedHasRealtimeCongestion: boolean;
  has: boolean;
  matchesExpected: boolean;
  reason: MeasureReason;
  note: string;
  poiId?: string;
  level?: string;
  measuredAt?: string | null;
  errorMessage?: string;
}

interface MeasureReport {
  generatedAt: string;
  destinationFile: string;
  total: number;
  supported: number;
  unsupported: number;
  expectedSupported: number;
  mismatchCount: number;
  mismatches: Measured[];
  results: Measured[];
}

function withMatchStatus(
  entry: DestinationEntry,
  measured: Omit<Measured, keyof DestinationEntry | 'matchesExpected'>,
): Measured {
  const result = {
    ...entry,
    ...measured,
    matchesExpected: entry.expectedHasRealtimeCongestion === measured.has,
  };
  return result;
}

async function measure(entry: DestinationEntry): Promise<Measured> {
  try {
    const poiId = await resolveTmapPoiId(entry.contentId);
    if (poiId === null) {
      return withMatchStatus(entry, {
        has: false,
        reason: 'MATCH_FAILED',
        note: '매칭 실패',
      });
    }
    try {
      const view = await getRealtimeCongestion(poiId);
      return withMatchStatus(entry, {
        has: true,
        reason: 'REALTIME_AVAILABLE',
        note: `poiId ${poiId} · ${view.level}`,
        poiId,
        level: view.level,
        measuredAt: view.measuredAt?.toISOString() ?? null,
      });
    } catch (error) {
      if (error instanceof ExternalApiNotFoundError) {
        return withMatchStatus(entry, {
          has: false,
          reason: 'SK_UNSUPPORTED',
          note: `poiId ${poiId} · SK 미커버`,
          poiId,
        });
      }
      const message = (error as Error).message;
      return withMatchStatus(entry, {
        has: false,
        reason: 'LOOKUP_ERROR',
        note: `조회 오류: ${message}`,
        poiId,
        errorMessage: message,
      });
    }
  } catch (error) {
    const message = (error as Error).message;
    return withMatchStatus(entry, {
      has: false,
      reason: 'MATCH_ERROR',
      note: `매칭 오류: ${message}`,
      errorMessage: message,
    });
  }
}

function parseEntries(source: string): DestinationEntry[] {
  return [
    ...source.matchAll(
      /tourApiContentId: '(\d+)',\s*\n\s*name: '([^']+)',[\s\S]*?hasRealtimeCongestion: (true|false),/g,
    ),
  ].map((match) => ({
    contentId: match[1],
    name: match[2],
    expectedHasRealtimeCongestion: match[3] === 'true',
  }));
}

function buildReport(destinationFile: string, results: Measured[]): MeasureReport {
  const supported = results.filter((result) => result.has).length;
  const mismatches = results.filter((result) => !result.matchesExpected);
  return {
    generatedAt: new Date().toISOString(),
    destinationFile,
    total: results.length,
    supported,
    unsupported: results.length - supported,
    expectedSupported: results.filter((result) => result.expectedHasRealtimeCongestion).length,
    mismatchCount: mismatches.length,
    mismatches,
    results,
  };
}

function printTextReport(report: MeasureReport): void {
  for (const result of report.results) {
    const drift = result.matchesExpected ? '' : ' · FLAG_MISMATCH';
    console.log(
      `${result.has ? 'true ' : 'false'}  ${result.contentId.padEnd(8)}  ${result.name}  (${result.note}${drift})`,
    );
  }
  console.log(`\nhasRealtimeCongestion true: ${report.supported}/${report.total}`);
  console.log(`expected true: ${report.expectedSupported}/${report.total}`);
  console.log(`flag mismatch: ${report.mismatchCount}`);
}

async function main(): Promise<void> {
  const outputJson = process.argv.includes('--json') || process.argv.includes('--format=json');
  const destinationsPath = path.resolve(
    process.cwd(),
    '../mobile/src/constants/destinations.ts',
  );
  const source = readFileSync(destinationsPath, 'utf8');
  const entries = parseEntries(source);
  if (entries.length === 0) {
    throw new Error(`측정 대상 목적지를 찾지 못했습니다: ${destinationsPath}`);
  }

  if (!outputJson) {
    console.log(`측정 대상 ${entries.length}곳\n`);
  }

  const results: Measured[] = [];
  for (const entry of entries) {
    results.push(await measure(entry));
    // 외부 API 예의상 간격
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const report = buildReport(path.relative(process.cwd(), destinationsPath), results);
  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printTextReport(report);
}

void main();

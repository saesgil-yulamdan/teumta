import { describe, expect, it } from 'vitest';

import { buildReportMailUrl, REPORT_EMAIL } from './report-mail';

function readMailUrl(url: string) {
  const [, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  return {
    subject: params.get('subject'),
    body: params.get('body'),
  };
}

describe('buildReportMailUrl', () => {
  it('장소 식별 정보와 앱 환경을 메일에 넣는다', () => {
    const url = buildReportMailUrl({
      category: '영업시간·휴무가 달라요',
      appVersion: '1.2.3',
      platform: 'ios',
      place: {
        name: '테스트 장소',
        source: '한국관광공사',
        id: '1234',
        address: '서울시 테스트로 1',
      },
    });

    expect(url.startsWith(`mailto:${REPORT_EMAIL}?`)).toBe(true);
    expect(readMailUrl(url)).toEqual({
      subject: '[틈타 제보] 영업시간·휴무가 달라요 - 테스트 장소',
      body: expect.stringContaining(
        '장소명: 테스트 장소\n장소 구분: 한국관광공사\n공개 장소 ID: 1234',
      ),
    });
    expect(readMailUrl(url).body).toContain('앱 버전: 1.2.3\n플랫폼: ios');
  });

  it('버그 제보에는 장소나 사용자 위치를 넣지 않는다', () => {
    const url = buildReportMailUrl({
      category: '앱이 정상 작동하지 않아요',
      appVersion: '1.0.0',
      platform: 'android',
    });
    const { body } = readMailUrl(url);

    expect(body).not.toContain('장소명:');
    expect(body).not.toContain('현재 위치:');
    expect(body).not.toContain('기기 ID:');
    expect(body).toContain('오류가 발생한 상황을 적어주세요');
  });
});

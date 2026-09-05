export const REPORT_EMAIL = 'ivychoen@gmail.com';

export type ReportMailContext = {
  category: string;
  appVersion: string;
  platform: string;
  place?: {
    name: string;
    source: string;
    id?: string;
    address?: string;
  };
};

/**
 * 제보는 틈타 서버를 거치지 않고 사용자의 메일 앱으로만 넘긴다.
 * 현재 위치나 기기 식별자는 본문에 포함하지 않는다.
 */
export function buildReportMailUrl(context: ReportMailContext): string {
  const subjectTarget = context.place ? ` - ${context.place.name}` : '';
  const subject = `[틈타 제보] ${context.category}${subjectTarget}`;
  const lines = [
    '안녕하세요. 틈타 제보입니다.',
    '',
    `제보 유형: ${context.category}`,
    ...(context.place
      ? [
          `장소명: ${context.place.name}`,
          `장소 구분: ${context.place.source}`,
          ...(context.place.id ? [`공개 장소 ID: ${context.place.id}`] : []),
          ...(context.place.address ? [`표시된 주소: ${context.place.address}`] : []),
        ]
      : []),
    `앱 버전: ${context.appVersion}`,
    `플랫폼: ${context.platform}`,
    '',
    '[아래에 확인이 필요한 내용이나 오류가 발생한 상황을 적어주세요]',
    '',
    '',
    '※ 개인정보 보호를 위해 현재 위치, 연락처 등 민감한 정보는 적지 말아주세요.',
  ];

  return `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    lines.join('\n'),
  )}`;
}

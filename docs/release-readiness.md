# 출시·심사 준비 현황

> 기준일: 2026-09-08 (KST). 외부 상태는 변경될 수 있으므로 제출 직전 다시 확인한다.

## 현재 판정

| 항목 | 상태 | 근거 / 다음 조치 |
|---|---|---|
| EAS 인증 | 확인 | `teumta` 계정 Owner 권한 확인 |
| iOS production build | 확인 | 2026-09-05 build 12, SDK 57, app 1.0.0 `FINISHED` |
| 현재 소스 버전 build | 필요 | `mobile/app.json` 1.0.1이므로 현재 변경 머지 후 새 production build 필요 |
| App Store 출시 | 확인 | 한국 App Store 공개 카탈로그에 `틈타` 1.0, 2026-08-31 출시로 조회됨 |
| 기능설명서 지정 양식 | 미확인 | 저장소에 지정 양식 원본이 없음. 반드시 주최측 원본 확보 후 작성 |
| 스토어 문구·심사 메모 | 준비됨 | [app-store-listing.md](./app-store-listing.md) |
| 배포 API 5곳 스모크 | 확인 | 경복궁·해운대·수원화성·전주 한옥마을·성산일출봉, 2026-09-08 기능 통과. 첫 경복궁 혼잡도 26.9초 지연을 발견해 인덱스 로드 순서를 최적화했으며 배포 후 재측정 필요 |
| DB 백업 설정 | 코드 확인 | `.github/workflows/db-backup.yml`, 매일 05:30 KST, artifact 30일 |
| DB 백업 최근 성공 | 확인 | GitHub Actions #33~#35 연속 성공. #35 artifact 103,604B, 2026-10-07 만료 |
| DB 백업 복원 테스트 | 미확인 | artifact 생성과 복원 가능성은 다르므로 임시 DB 복원 테스트가 필요 |
| 관리자 웹 | 운영 폐기 | 소스는 `admin/`에 보존, 배포·CI·신규 개발 제외 |

## 제출 직전 필수 체크

- [ ] 현재 `main`으로 iOS production build 생성, 버전·build number 기록
- [ ] TestFlight 실기기에서 대표 5곳 스모크 완료
- [x] App Store 1.0 공개 출시 확인
- [ ] 1.0.1 업데이트를 낼 경우 App Store Connect에서 제출·승인 여부 스크린샷 보관
- [ ] 주최측 **지정 양식**으로 기능설명서 작성, 필수 해시태그·기능 흐름 대조
- [ ] 배포 서버 `TOUR_API_KEY`가 제출용 인증키와 동일한지 키 값을 노출하지 않고 확인
- [x] DB 백업 최근 3회 성공·artifact 1KB 이상 확인
- [ ] 최신 artifact를 임시 DB에 복원해 테이블·주요 행 수 확인
- [x] 배포 서버에서 `npm run smoke:live`의 5곳 결과 확인

## 운영 지표

관리자 analytics 화면은 만들지 않는다. 서버의 `public_api_usage`에서 라우트·응답 상태·소요시간·
비용을 집계하고, 각 외부 API 콘솔의 쿼터와 대조한다. IP·query·GPS는 지표에 남기지 않는다.

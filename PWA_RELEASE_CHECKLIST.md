# PWA 출시 체크리스트 (iOS 웹앱 우선)

목적: iPhone 웹앱 형태로 바로 출시 가능한 상태에서 **필수 QA + 배포 직전 점검**을 한 번에 처리.

## A. iOS 홈 스크린 설치 기준
- [ ] `public/manifest.webmanifest` 로드 확인 (`/manifest.webmanifest` 200)
- [ ] 앱 메타 + 아이콘 확인
  - [ ] `manifest.webmanifest`의 `name`, `short_name`, `start_url`, `display`, `orientation`, `theme_color` 설정
  - [ ] iOS 홈스크린 등록 시 `apple-touch-icon` fallback 경로 존재 (`/public/icon.svg` 우선 적용, 추후 PNG 권장)
- [ ] iPhone에서 방문 후 “공유 → 홈 화면에 추가” 노출
- [ ] 설치 후 실행 시 주소창/탭 없이 앱처럼 보이는지 확인
- [ ] 앱 상단/하단 안전영역(`safe-area`) 패딩 확인

## B. 오프라인 동작
- [ ] `public/sw.js` 등록되었는지 확인 (`chrome://serviceworker-internals` 또는 브라우저 개발도구)
- [ ] 첫 방문 후 캐시 생성 확인
- [ ] 네트워크 끊김 상태에서 페이지 진입 시 `offline.html` 표출
- [ ] 오프라인 배너가 노출되는지 확인
- [ ] 네트워크 복구 후 동기화 동작/재시도 동작 확인

## C. 업데이트 정책
- [ ] 배포 후 새 버전 푸시 시 업데이트 배너 표시 확인
- [ ] `Update` 클릭 시 최신 번들로 리로드되는지 확인
- [ ] 서비스워커 스킵대기(`SKIP_WAITING`)가 동작하는지 확인
- [ ] 새 버전 배포 전 후 캐시 정리 정책 적용(버전 명 변경)

## D. 핵심 기능 동작 점검 (요청된 필수 항목)
- [ ] 비로그인 진입: 대시보드/캘린더 기본 뷰 노출
- [ ] 로그인/회원가입 탭 동작
- [ ] To-do 추가/체크/삭제 동작
- [ ] Activity Log 입력(이모지 + 시간 + 메모) 저장
- [ ] Notes(회고/메모) 저장
- [ ] 날짜 이동(캘린더/주간/월간 네비게이션) 동작
- [ ] dashboard 표시 및 월간 흐름 하단 탭 유지
- [ ] 설정 탭에서 로그아웃/계정 관리 이동
- [ ] `/admin` 라우트 접근 제어:
  - [ ] `shleecode@gmail.com` 계정만 진입 가능
  - [ ] 비관리자 계정은 `No access` 노출

## E. 앱 실행/빌드 체크
- [ ] `npm run build` 통과
- [ ] `vercel` 배포 후 `daily-flow-diary` 스크린샷 3개 캡처
  - [ ] iPhone 홈스크린 모드
  - [ ] iPhone 브라우저 기본 모드
  - [ ] iPhone 내비게이션/오프라인
- [ ] 배포 URL에서 HTTPS 적용 확인
- [ ] Vercel 환경변수:
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [ ] `NEXT_PUBLIC_ADMIN_EMAILS=shleecode@gmail.com`

## F. 빠른 실행 순서 (이번 릴리즈 기준)
1. `npm install`
2. `npm run build`
3. `npm run start` (또는 `next start`)로 로컬 검증
4. 실제 iPhone에서 URL 접속 후 홈 화면 추가
5. 오프라인/다시 시작 시나리오 1차 QA
6. Vercel 배포 및 공개 URL 공유

## G. 점검 리스크 (완화 필요 항목)
- [ ] iOS는 `beforeinstallprompt` 미지원이므로 설치 가이드는 항상 수동 가이드 표기
- [ ] 아이콘은 현재 SVG 기반이므로 앱스토어급 브랜딩 수준을 위해 PNG 버전(`192/512`) 준비 권장
- [ ] 향후 앱스토어 패키징( Capacitor ) 시 현재 Manifest 기반 설정 유지 + Web앱 엔트리포인트 점검

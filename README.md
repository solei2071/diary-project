# Daily Flow Diary (Next.js + Supabase + Vercel)

이 레포는 날짜별 **To-do**와 **내가 한 일(일기)**을 관리하는 다이어리 MVP입니다.  
선택한 날짜 기준으로 할 일과 회고를 저장하고, Supabase 인증으로 사용자별로 분리해 관리합니다.

## 핵심 기능

- 최초 진입 시 이메일 로그인 없이 바로 노트 작성 가능
- 저장(메모 저장) 시점에 이메일 로그인 유도
- 날짜별 To-do 생성/완료/삭제
- 날짜별 회고(`내가 한일`) 저장(Upsert)
- 날짜별 활동 기록(이모지 + 시간) 태깅 및 클릭으로 누적 기록
- 완료/미완료 개수 집계
- 반응형 UI (모바일 대응)

## 기술 스택

- **Framework:** Next.js 14 (App Router), React, TypeScript
- **UI:** Tailwind CSS
- **Backend/DB:** Supabase (PostgreSQL, Auth, RLS)
- **Deploy:** Vercel
- **Design Reference:** Figma (스크린샷/컴포넌트 기준으로 CSS 변수/컴포넌트를 쉽게 맞출 수 있게 구성)

## 빠른 시작

1. 의존성 설치
   ```bash
   npm install
   ```
2. 환경 변수 설정
   ```bash
   cp .env.example .env.local
   # NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 입력
   # NEXT_PUBLIC_REVENUECAT_API_KEY: iOS 구독 결제(RevenueCat Public SDK Key)
   # NEXT_PUBLIC_WEB_CHECKOUT_URL: 웹 체크아웃을 쓸 때만 선택적으로 설정
# (권장) NEXT_PUBLIC_ACCOUNT_DELETE_ENDPOINT: 계정 탈퇴 API 엔드포인트
# (권장) NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL: 탈퇴/개인정보 문의 메일 주소
   ```
3. Supabase DB 생성
4. 아래 스키마 실행 (SQL Editor)
   - `supabase/schema.sql`
5. 실행
   ```bash
   npm run dev
   ```
   브라우저에서 `http://localhost:5000` 열기
6. iPhone 웹앱 사용
   - Safari에서 페이지 열기 → 공유 버튼 → "홈 화면에 추가"
   - `manifest.webmanifest`와 iOS 용 메타 태그가 적용되어 앱 화면처럼 표시됩니다.
   - 홈 화면 추가 후에는 앱 바와 브라우저 탭이 사라진 형태로 실행됩니다.

### iPhone 배포 품질 체크
- `npm run build` 통과 후 Vercel 배포
- `manifest.webmanifest`에 PNG/Apple 아이콘 경로가 정상 등록됐는지 확인
  - `/icon-192.png`
  - `/icon-512.png`
  - `/apple-touch-icon.png`
- iPhone 홈 화면 추가 설치 동작 및 상태바/세이프에어리어 확인
- 오프라인 진입 시 `offline.html` 노출 확인
- 푸시 배너형 업데이트 알림(새 버전) 동작 확인
- `/admin` 진입 제어, 핵심 플로우 QA 재확인

### App Store 빌드 확장(선택)
현재 코드는 PWA 기준입니다. 앱스토어 런칭이 필요하면 `Capacitor` 기반 iOS 래퍼를 붙여 앱 번들로 확장합니다.

### iOS 앱 빌드 실전 플로우
1. App Store 제출 빌드는 `NEXT_PUBLIC_APP_URL` 없이 진행해 `out/` 번들을 앱에 포함합니다.
   원격 URL 로딩이 꼭 필요하면 내부 QA 용도로만 `CAPACITOR_USE_REMOTE_SERVER=true`를 함께 설정합니다.
2. `npm install`
3. `npm run mobile:bootstrap` 실행
4. `npm run mobile:add-ios` 실행
5. `npm run build` (앱 스토어용은 기본적으로 번들을 앱 안에서 로딩)
6. `npm run mobile:sync-ios`
7. `npm run mobile:open-ios`
8. Xcode에서 bundle id `com.dailyflow.diary`로 Signing 재확인
9. 앱 아이콘/런치 스크린, 권한 항목 점검
10. RevenueCat public SDK key, offering, entitlement(`pro`), 월간 상품(`com.dailyflow.diary.pro.monthly`) 연결 확인
11. 계정 삭제 API(`NEXT_PUBLIC_ACCOUNT_DELETE_ENDPOINT`)가 실제 배포되어 앱 내 삭제 요청이 동작하는지 확인
12. Archive -> Export -> App Store Connect 업로드

### 계정 삭제 API 배포 가이드 (Supabase Functions)

- Supabase CLI로 `delete-account` 함수를 배포합니다.
  ```bash
  supabase functions deploy delete-account --project-ref <project-ref>
  ```
- 함수에서 필요한 서버 시크릿은 `SUPABASE_SERVICE_ROLE_KEY`입니다.
  - `SUPABASE_URL`은 함수 런타임에서 주입되므로 별도 설정이 필요 없습니다.
  ```bash
  supabase functions secrets set SUPABASE_SERVICE_ROLE_KEY=...
  ```
- 앱에서 사용할 엔드포인트는 프로젝트 고유 URL입니다.
  - `https://<project-ref>.functions.supabase.co/delete-account`
- 앱 `.env.local`의 `NEXT_PUBLIC_ACCOUNT_DELETE_ENDPOINT`를 위 URL로 맞추면 계정 탈퇴 버튼이 백엔드 삭제 API로 동작합니다.

### iOS 제출 전에 확인할 체크
- Apple Team/Provisioning 설정
- App Store Connect 메타데이터와 스크린샷
- 오프라인 안내 문구 한글 노출 확인
- 푸시/알림 권한 동의 흐름
- RevenueCat 상품 가격/문구와 앱 내 구독 시트 표기 일치 여부
- `NEXT_PUBLIC_REVENUECAT_API_KEY` 설정 여부
- `NEXT_PUBLIC_ACCOUNT_DELETE_ENDPOINT` 연결 여부

## PWA 출시 체크리스트

앱 출시 전 핵심 점검은 [PWA_RELEASE_CHECKLIST.md](./PWA_RELEASE_CHECKLIST.md)에서 실행 체크 형태로 관리합니다.  
기준은 iPhone 웹앱(홈 화면 추가) 런칭을 우선으로 하며, 다음이 핵심입니다.

- 홈 화면 설치 동작
- 오프라인 fallback (`offline.html`)
- 서비스 워커 업데이트 정책
- 핵심 기능 점검(인증/To-do/Activity/Notes/캘린더/설정)
- `/admin` 접근 제한

### 개인정보/데이터 처리 점검 (앱스토어 제출 전)

- 저장 범위 노출: 로그인 데이터(클라우드, `user_id` 기준)와 비로그인 임시 데이터(localStorage) 분리 안내
- 탈퇴 수단 점검: 앱 내에서 "계정 삭제"가 동작하는지, 실패 시 수동 요청 채널(메일)이 노출되는지 확인
- 민감 데이터 관리: 로컬 데이터는 클라이언트 `localStorage` 평문 보관이므로 공용 기기 사용 후 반드시 삭제
- 계정 삭제 API: `delete-account` 함수에서 인증 토큰 검증 후 사용자 본인 계정 삭제 동작 여부 점검
- 민감 액션 경고: 클라우드 삭제/계정 삭제는 복구 불가임을 UI에서 명확히 표시

## Supabase SQL

`supabase/schema.sql`에 다음이 포함됩니다.

- `todos` 테이블
- `journal_entries` 테이블
- RLS 정책(본인 데이터만 조회/수정)
- updated_at 트리거

## Vercel 배포

1. Vercel에서 새 프로젝트 Import
2. `npm run build`가 실행될 수 있게 Node 환경 확인
3. 환경 변수 등록
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

## Figma와의 연계

- Figma에서 와이어프레임을 만들고, 컴포넌트 구조(`헤더`, `날짜 카드`, `To-do 카드`, `내가 한 일`)를 그대로 유지하면 CSS 클래스/레イ아웃만 맞춰 빠르게 적용 가능
- 색상, 반경, 간격을 `tailwind.config.ts`의 theme 확장값으로 먼저 반영해두었고, 추후 변경 지점이 명확합니다.

## 향후 확장

- 월간 캘린더 뷰
- 반복 일정(매일/매주)
- 태그/우선순위
- 검색/필터
- 푸시 알림 (웹 푸시 or 모바일 알림)

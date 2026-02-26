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

## PWA 출시 체크리스트

앱 출시 전 핵심 점검은 [PWA_RELEASE_CHECKLIST.md](./PWA_RELEASE_CHECKLIST.md)에서 실행 체크 형태로 관리합니다.  
기준은 iPhone 웹앱(홈 화면 추가) 런칭을 우선으로 하며, 다음이 핵심입니다.

- 홈 화면 설치 동작
- 오프라인 fallback (`offline.html`)
- 서비스 워커 업데이트 정책
- 핵심 기능 점검(인증/To-do/Activity/Notes/캘린더/설정)
- `/admin` 접근 제한

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

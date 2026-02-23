# Daily Flow Diary — 학습 가이드

이 프로젝트를 공부할 때 참고할 설명 문서입니다.

---

## 1. 프로젝트 구조

```
src/
├── app/              # Next.js App Router (페이지/레이아웃)
│   ├── layout.tsx    # 루트 레이아웃 (메타데이터, html/body)
│   ├── page.tsx      # 홈 페이지 (인증 + DailyDiary)
│   └── globals.css   # 전역 스타일 (Tailwind, CSS 변수)
├── components/       # 재사용 가능한 컴포넌트
│   ├── AuthPanel.tsx # 로그인/회원가입 (매직링크)
│   └── DailyDiary.tsx # 메인 다이어리 (할 일, 활동, 일기)
└── lib/              # 유틸리티/설정
    ├── supabase.ts   # Supabase 클라이언트
    └── types.ts      # TypeScript 타입 정의

supabase/
└── schema.sql        # DB 테이블, RLS 정책, 트리거
```

---

## 2. package.json 주요 항목

| 항목 | 설명 |
|------|------|
| `name` | 프로젝트 이름 |
| `scripts.dev` | `npm run dev` — 개발 서버 실행 |
| `scripts.build` | `npm run build` — 프로덕션 빌드 |
| `dependencies` | 런타임에 필요한 패키지 (next, react, supabase 등) |
| `devDependencies` | 개발용 패키지 (타입, 린터, 빌드 도구) |

---

## 3. .eslintrc.json

- `extends: next/core-web-vitals` — Next.js 권장 ESLint 설정 상속
- `react-hooks/rules-of-hooks: error` — 훅 규칙 위반 시 에러
- `react-hooks/exhaustive-deps: warn` — useEffect 의존성 누락 시 경고

---

## 4. 핵심 흐름

1. **인증**: `supabase.auth.signInWithOtp` → 이메일로 매직링크 발송 → 클릭 시 `session` 설정
2. **데이터 로드**: `supabase.from("todos").select().eq("user_id", user.id)` — RLS로 본인 데이터만 반환
3. **저장**: `upsert` (있으면 수정, 없으면 삽입) — `onConflict`로 유니크 제약 처리

---

## 5. 학습 순서 추천

1. `src/lib/types.ts` — 타입 구조 파악
2. `src/lib/supabase.ts` — Supabase 연결 방식
3. `src/app/layout.tsx` — 레이아웃/메타데이터
4. `src/app/page.tsx` — 인증 상태 관리
5. `src/components/AuthPanel.tsx` — 매직링크 로그인
6. `src/components/DailyDiary.tsx` — 메인 기능 (길어서 섹션별로 읽기)
7. `supabase/schema.sql` — DB 스키마, RLS 정책

각 파일에는 주석으로 상세 설명이 달려 있으니, 코드와 함께 읽어보세요.

# Daily Flow Diary — 함수별 상세 가이드

각 함수가 **무슨 역할**을 하고, **왜 이렇게 구현했는지**를 정리했습니다.

---

## 1. supabase.ts

### `getSupabase()`

| 항목 | 설명 |
|------|------|
| **역할** | Supabase 클라이언트 인스턴스를 반환 |
| **왜 이렇게 했는가** | **싱글톤 패턴** — 클라이언트를 한 번만 만들고 재사용. 여러 번 `createClient` 하면 연결이 중복되고 메모리 낭비가 생김 |
| **호출 시점** | 앱 시작 시 한 번 호출 → `export const supabase`에 저장 → 전역에서 `import { supabase }` |

---

## 2. AuthPanel.tsx

### `sendMagicLink(e: FormEvent)`

| 항목 | 설명 |
|------|------|
| **역할** | 이메일 입력 → Supabase에 매직링크 요청 → 사용자 메일함으로 로그인 링크 발송 |
| **왜 이렇게 했는가** | 비밀번호 없이 로그인(`signInWithOtp`). 비밀번호 저장·관리 부담을 줄이고, 이메일 인증만으로 가입·로그인 통합 |
| **흐름** | 1) `e.preventDefault()`로 폼 기본 제출(새로고침) 방지 → 2) `email` 검증 → 3) `signInWithOtp` 호출 → 4) 성공 시 `onEmailSent` 콜백으로 부모가 모달 닫기 |

---

## 3. DailyDiary.tsx — 날짜/포맷 유틸

### `prettyDateLabel(value: string)`

| 항목 | 설명 |
|------|------|
| **역할** | `"2026-02-17"` → `"2/17 (Mon)"` 같은 읽기 쉬운 문자열로 변환 |
| **왜 필요** | DB/상태에는 `YYYY-MM-DD`를 쓰고, 화면에는 짧고 이해하기 쉬운 형태로 보여주기 위해 |

### `getMonthRangeDates(value: string)`

| 항목 | 설명 |
|------|------|
| **역할** | 선택한 날짜가 속한 **그 달의 모든 날짜**를 배열로 반환. 예: `["2026-02-01", "2026-02-02", ...]` |
| **왜 필요** | 대시보드에서 한 달 전체를 일별로 나열해서 보여줄 때 사용. `Array.from` + `setDate`로 1일~말일까지 생성 |

### `normalizeMonthLabel(value: string)`

| 항목 | 설명 |
|------|------|
| **역할** | `"2026-02-17"` → `"2/17"` (월/일만 표시) |
| **왜 필요** | 짧은 월/일 라벨이 필요한 곳에서 사용 (사이드바 등) |

### `getMonthDaysForCalendar(baseMonth: string)`

| 항목 | 설명 |
|------|------|
| **역할** | 캘린더 그리드용 배열 생성. **앞쪽 null** + 해당 월 날짜들. 예: `[null, null, null, "02-01", "02-02", ...]` |
| **왜 필요** | 달력이 7열(일~토) 구조라서, 1일 전 빈 칸 수만큼 `null`을 넣어 정렬. `firstDate.getDay()`로 그 수를 계산 |

### `shiftMonth(baseMonth: string, diff: number)`

| 항목 | 설명 |
|------|------|
| **역할** | `baseMonth` 기준으로 `diff`개월 이동한 날짜 문자열 반환. `diff = -1` → 이전 달, `diff = 1` → 다음 달 |
| **왜 필요** | 캘린더에서 "이전 달 / 다음 달" 버튼 클릭 시 `selectedDate`를 해당 달 1일로 바꾸기 위해 |

### `getMonthLabel(baseMonth: string)`

| 항목 | 설명 |
|------|------|
| **역할** | `"2026-02"` → `"February 2026"` |
| **왜 필요** | 캘린더 헤더에 "2026년 2월" 같은 월 제목을 보여주기 위해 |

### `normalizeHourInput(value: number)`

| 항목 | 설명 |
|------|------|
| **역할** | 시간을 **0.5h 단위**로 반올림. 1.3 → 1.5, 1.7 → 2 |
| **왜 필요** | 활동 시간을 0.5h 단위로만 관리하기 위해. `Math.round(value * 2) / 2`로 구현 |

---

## 4. DailyDiary.tsx — 데이터 변환

### `normalizeActivities(rows: DailyActivityRow[])`

| 항목 | 설명 |
|------|------|
| **역할** | DB에서 온 여러 행을 **이모지별로 합산**해서 `UiActivity[]`로 변환 |
| **왜 필요** | 같은 이모지(예: 💻)가 여러 행(예: 아침 2h, 저녁 3h)일 수 있음. 화면에는 "💻 5h"처럼 하나로 합쳐서 표시하기 위해 |
| **구현** | `reduce`로 `emoji`를 키로 묶고, `hours`를 합산 |

### `normalizeActivitiesByMonth(rows: DailyActivityRow[])`

| 항목 | 설명 |
|------|------|
| **역할** | 한 달치 활동을 **날짜별로 그룹화**. `Record<날짜, UiActivity[]>` |
| **왜 필요** | 대시보드에서 각 날짜별 활동 요약을 보여줄 때 사용 |

### `formatFlowActivityText(items: UiActivity[])`

| 항목 | 설명 |
|------|------|
| **역할** | `UiActivity[]` → `"💻 2 🔆 1 🥋 1"` 같은 짧은 문자열 |
| **왜 필요** | 대시보드 한 줄 요약에서 활동을 간단히 텍스트로 보여주기 위해 |

### `splitMemoLines(value: string)`

| 항목 | 설명 |
|------|------|
| **역할** | 메모 문자열을 줄바꿈으로 나누고, 공백/빈 줄 제거 후 배열 반환 |
| **왜 필요** | 대시보드에서 메모의 첫 몇 줄만 보여줄 때, 의미 있는 라인만 추출하기 위해 |

---

## 5. DailyDiary.tsx — 시드(샘플) 데이터 (개발/데모용)

### `toSampleDateKey(value: string)`

| 항목 | 설명 |
|------|------|
| **역할** | `"2026-02-17"` → `"17"` (2026년 2월이면 일자만 반환, 아니면 `undefined`) |
| **왜 필요** | `sampleFebruary2026` 같은 시드 데이터에서 해당 일의 데이터를 찾을 때 키로 사용 |

### `getSeedForDate(value: string)`

| 항목 | 설명 |
|------|------|
| **역할** | 시드 데이터에서 해당 날짜의 `{ activities, memo }` 반환 |
| **왜 필요** | 비로그인 상태에서도 2026년 2월 같은 일부 날짜에 샘플 데이터를 보여줄 때 사용 |

### `toSampleDraftActivities(value: string)`

| 항목 | 설명 |
|------|------|
| **역할** | 시드의 `activities`를 `UiActivityDraft[]` 형태로 변환 |
| **왜 필요** | 시드 데이터를 `draftActivitiesByDate`와 같은 구조로 맞춰서 화면에 표시하기 위해 |

---

## 6. DailyDiary.tsx — 데이터 로드

### `loadData(targetDate: string)`

| 항목 | 설명 |
|------|------|
| **역할** | 선택한 날짜의 **할 일, 일기, 활동**을 로드 |
| **왜 이렇게 했는가** | |
| **비로그인** | `draftTodosByDate`, `draftJournalByDate`, `draftActivitiesByDate` 또는 시드에서 가져옴. Supabase 호출 없음 |
| **로그인** | `Promise.all`로 `todos`, `journal_entries`, `daily_activities` 테이블을 동시에 조회 → 응답을 state에 반영 |
| **호출 시점** | `selectedDate` 또는 `user?.id`가 바뀔 때 `useEffect`에서 호출 |

### `loadMonthFlow(targetDate: string)`

| 항목 | 설명 |
|------|------|
| **역할** | 해당 **월 전체**의 일별 활동·일기 요약 로드 |
| **왜 필요** | 대시보드(왼쪽 또는 상단)에서 한 달치를 한 번에 보여주기 위해 |
| **비로그인** | `draft*` + 시드로 `monthActivitiesByDate`, `monthJournalByDate` 구성 |
| **로그인** | `gte(entry_date, monthStart)`, `lt(entry_date, nextMonth)`로 한 달 범위 쿼리 |

---

## 7. DailyDiary.tsx — Draft(로컬 저장)

### `updateDraftTodo(items: UiTodo[])`

| 항목 | 설명 |
|------|------|
| **역할** | 비로그인 시 할 일을 **로컬 state + localStorage**에 저장 |
| **왜 필요** | 로그인 전에도 할 일을 유지하고, 새로고침해도 남아 있게 하기 위해 |

### `updateDraftJournal(text: string)`

| 항목 | 설명 |
|------|------|
| **역할** | 비로그인 시 일기 내용을 state + localStorage에 저장 |

### `updateDraftActivities(items: UiActivity[])`

| 항목 | 설명 |
|------|------|
| **역할** | 비로그인 시 활동 기록을 state + localStorage에 저장. `UiActivity`를 `UiActivityDraft` 형태로 변환 후 저장 |

### `makeLocalTodoId()`

| 항목 | 설명 |
|------|------|
| **역할** | 로컬에서만 쓰이는 고유 ID 생성. `crypto.randomUUID()` 또는 `Date.now()-랜덤` |
| **왜 필요** | Supabase에 저장되지 않는 draft 항목에 `key`나 `id`가 필요할 때 사용 |

---

## 8. DailyDiary.tsx — 할 일(To-do)

### `toggleTodo(todo: UiTodo)`

| 항목 | 설명 |
|------|------|
| **역할** | 할 일의 완료 여부(`done`)를 토글 |
| **왜 Optimistic UI인가** | 체크 즉시 화면을 업데이트하고, 서버 요청은 그 뒤에. 에러 나면 `setTodos(todos)`로 롤백. 사용자가 기다리지 않아도 되어 UX 향상 |

---

## 9. DailyDiary.tsx — 일기

### `saveJournal()`

| 항목 | 설명 |
|------|------|
| **역할** | 일기 내용을 Supabase `journal_entries` 테이블에 저장 |
| **왜 upsert인가** | `user_id` + `entry_date`가 unique. 같은 날이면 수정, 없으면 삽입. `onConflict: "user_id,entry_date"` |
| **비로그인** | `onRequestAuth()` 호출 → 부모가 로그인 모달 표시 |

---

## 10. DailyDiary.tsx — 활동 기록

### `composeUpdatedActivities(emoji, nextHours, nextLabel?)`

| 항목 | 설명 |
|------|------|
| **역할** | 활동 목록에서 특정 이모지의 시간(및 라벨)을 바꾼 **새 배열**을 만듦. (직접 state를 바꾸지 않음) |
| **왜 별도 함수인가** | `updateActivity`에서 "계산"과 "저장/호출"을 분리하기 위해. 순수 함수 형태로 만들어 테스트·재사용이 쉬움 |

### `saveActivity(emoji, nextHours, nextLabel)`

| 항목 | 설명 |
|------|------|
| **역할** | 활동을 DB에 반영. `nextHours <= 0`이면 해당 이모지 행 삭제, 아니면 upsert |
| **왜 delete 후 upsert인가** | `(user_id, activity_date, emoji, label)` unique라서, 라벨이 바뀌면 기존 행을 지우고 새로 넣는 방식으로 처리 |

### `updateActivity(emoji, nextHours, nextLabel?)`

| 항목 | 설명 |
|------|------|
| **역할** | 1) `composeUpdatedActivities`로 새 배열 계산 → 2) `setActivities` → 3) 비로그인이면 `updateDraftActivities`, 로그인이면 `saveActivity` 호출 |
| **왜 이렇게 나눴는가** | 화면 반영(로컬 state)과 DB 저장을 한 곳에서 처리. 비로그인/로그인 분기를 이 함수에서만 처리 |

### `setActivityHours(activity, nextHours)`

| 항목 | 설명 |
|------|------|
| **역할** | `updateActivity(activity.emoji, nextHours, activity.label)` 호출. +/− 버튼용 래퍼 |
| **왜 필요** | `updateActivity` 시그니처가 `(emoji, nextHours, nextLabel?)`인데, +/− 버튼은 `activity`만 넘기면 되므로 편의 함수 |

### `addActivityFromTemplate(emoji: string)`

| 항목 | 설명 |
|------|------|
| **역할** | 퀵 이모지 버튼(💻, 🏋️ 등) 클릭 시. 이미 있으면 +1h, 없으면 1h 새로 추가 |
| **왜 필요** | 자주 쓰는 활동을 한 번에 추가해서 입력 수를 줄이기 위해 |

### `addCustomActivity()`

| 항목 | 설명 |
|------|------|
| **역할** | 사용자가 입력한 이모지+시간으로 활동 추가. `customEmoji`, `customHours` state 사용 |
| **왜 필요** | 퀵 버튼에 없는 활동(예: 🤿)을 직접 넣을 수 있게 하기 위해 |

### `removeActivity(activity: UiActivity)`

| 항목 | 설명 |
|------|------|
| **역할** | 해당 활동을 목록에서 제거. 로그인이면 `saveActivity(emoji, 0)`로 DB에서도 삭제 |

### `updateActivityLabel(emoji, nextLabel)` / `commitActivityLabel(activity, nextLabel)`

| 항목 | 설명 |
|------|------|
| **역할** | 활동에 부가 라벨(설명)을 수정. `updateActivityLabel`은 로컬 state만, `commitActivityLabel`은 DB 저장까지 |
| **왜 둘로 나눴는가** | 인라인 편집 시 "편집 중"에는 로컬만 바꾸고, blur/완료 시점에 `commitActivityLabel`로 DB에 반영 |

### `isActivityLabelEditing(activity)` / `startActivityLabelEdit(activity)`

| 항목 | 설명 |
|------|------|
| **역할** | 어떤 활동이 라벨 편집 모드인지 관리. `activityLabelEditingByDate` state 사용 |
| **왜 필요** | 클릭한 활동만 입력 필드로 바꾸고, 나머지는 텍스트로 보이게 하기 위해 |

---

## 11. DailyDiary.tsx — 기타

### `handleJournalChange(value: string)`

| 항목 | 설명 |
|------|------|
| **역할** | textarea 입력 시 `setJournalText` + 비로그인이면 `updateDraftJournal` 호출 |
| **왜 필요** | 비로그인 사용자도 메모를 입력할 때마다 localStorage에 자동 저장되게 하기 위해 |

### `signOut()`

| 항목 | 설명 |
|------|------|
| **역할** | `supabase.auth.signOut()` 호출. 세션 제거 후 `onAuthStateChange`로 `session`이 null로 갱신됨 |

---

## 12. 호출 관계 요약

```
선택한 날짜 변경 / 로그인 상태 변경
  → loadData(selectedDate)
  → loadMonthFlow(selectedDate)

퀵 이모지 클릭
  → addActivityFromTemplate(emoji)
  → updateActivity(emoji, hours+1, label)
  → composeUpdatedActivities → setActivities → saveActivity (로그인 시)

+/− 버튼 클릭
  → setActivityHours(activity, nextHours)
  → updateActivity(...)

저장 버튼 클릭
  → saveJournal()

할 일 체크
  → toggleTodo(todo)
```

이 가이드를 보면서 코드를 따라가면 각 함수가 언제·왜 호출되는지 흐름을 파악하기 쉬울 것입니다.

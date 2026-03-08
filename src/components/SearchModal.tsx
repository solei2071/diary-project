/**
 * SearchModal — 전역 검색 모달
 *
 * 로그인 사용자: Supabase에서 할 일 · 일기 · 활동 전체 검색
 * 게스트: localStorage 드래프트에서 검색
 *
 * 결과 클릭 시 해당 날짜로 이동
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { CalendarDays, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type SearchResult = {
  date: string;
  type: "todo" | "note" | "activity";
  title: string;
  excerpt: string;
};

type Props = {
  session: Session | null;
  appLanguage?: "en" | "ko";
  onClose: () => void;
  onSelectDate: (date: string) => void;
};

/** YYYY-MM-DD → 읽기 좋은 형식 */
function prettyDate(value: string, locale: string = "en-US") {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    weekday: "short"
  });
}

/** 검색어 하이라이트 — 매칭 부분을 <mark>로 감쌈 */
function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[var(--primary)]/20 text-[var(--primary)] rounded-[2px]">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

const TYPE_COLORS: Record<SearchResult["type"], string> = {
  todo: "bg-[var(--primary)]/12 text-[var(--primary)]",
  note: "bg-amber-100 text-amber-700",
  activity: "bg-[var(--success-bg)] text-[var(--success)]"
};

export default function SearchModal({
  session,
  appLanguage = "en",
  onClose,
  onSelectDate
}: Props) {
  const isKorean = appLanguage === "ko";
  const t = useCallback((en: string, ko: string) => (isKorean ? ko : en), [isKorean]);
  const locale = isKorean ? "ko-KR" : "en-US";
  const TYPE_LABELS: Record<SearchResult["type"], string> = useMemo(() => ({
    todo: t("Task", "할 일"),
    note: t("Note", "노트"),
    activity: t("Activity", "활동")
  }), [t]);
  const supabaseErrorMessage = useMemo(
    () =>
      t(
        "Some search sources are unavailable. Results may be partial.",
        "일부 검색 소스에 접근할 수 없어 결과가 누락될 수 있습니다."
      ),
    [t]
  );
  const defaultErrorMessage = useMemo(() => t("Search failed. Please retry.", "검색에 실패했습니다. 다시 시도해 주세요."), [t]);
  const getSearchErrorMessage = useCallback((error: unknown) => {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes("network") || message.includes("connection")) {
        return t("Network connection issue. Please try again.", "네트워크 연결에 문제가 있습니다. 다시 시도해 주세요.");
      }
      if (message.includes("not found") || message.includes("forbidden")) {
        return t("Search is currently unavailable. Please try again later.", "지금은 검색을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      }
    }
    return defaultErrorMessage;
  }, [defaultErrorMessage, t]);

  const user = session?.user ?? null;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [filterType, setFilterType] = useState<"all" | SearchResult["type"]>("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSearchRef = useRef(0);

  // 모달 열릴 때 포커스
  useEffect(() => {
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  // ESC 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const searchLocal = useCallback((q: string): SearchResult[] => {
    const found: SearchResult[] = [];
    const lower = q.toLowerCase();

    try {
      const rawTodos = localStorage.getItem("diary-draft-todos");
      if (rawTodos) {
        const byDate = JSON.parse(rawTodos) as Record<string, Array<{ title: string; due_date: string }>>;
        Object.entries(byDate).forEach(([date, items]) => {
          items.forEach((item) => {
            if (item.title.toLowerCase().includes(lower)) {
              found.push({ date, type: "todo", title: item.title, excerpt: item.title });
            }
          });
        });
      }

      const rawJournal = localStorage.getItem("diary-draft-journal");
      if (rawJournal) {
        const byDate = JSON.parse(rawJournal) as Record<string, string>;
        Object.entries(byDate).forEach(([date, content]) => {
          if (content.toLowerCase().includes(lower)) {
            const idx = content.toLowerCase().indexOf(lower);
            const start = Math.max(0, idx - 30);
            const end = Math.min(content.length, idx + 60);
            found.push({
              date,
              type: "note",
              title: t("Note", "노트"),
              excerpt: (start > 0 ? "…" : "") + content.slice(start, end) + (end < content.length ? "…" : "")
            });
          }
        });
      }

      const rawActivities = localStorage.getItem("diary-draft-activities");
      if (rawActivities) {
        const byDate = JSON.parse(rawActivities) as Record<string, Array<{ emoji: string; label: string; activity_date: string }>>;
        Object.entries(byDate).forEach(([date, items]) => {
          items.forEach((item) => {
            if (item.label?.toLowerCase().includes(lower) || item.emoji?.includes(q)) {
              found.push({
                date,
                type: "activity",
                title: `${item.emoji} ${item.label || t("Activity", "활동")}`,
                excerpt: item.label || item.emoji
              });
            }
          });
        });
      }
    } catch {
      // no-op
    }

    return found.sort((a, b) => b.date.localeCompare(a.date));
  }, [t]);

  const searchSupabase = useCallback(async (q: string): Promise<{ rows: SearchResult[]; hasPartialError: boolean }> => {
    if (!user) return { rows: [], hasPartialError: false };
    const found: SearchResult[] = [];

    const settled = await Promise.allSettled([
      supabase
        .from("todos")
        .select("title, due_date")
        .eq("user_id", user.id)
        .ilike("title", `%${q}%`)
        .limit(30),
      supabase
        .from("journal_entries")
        .select("content, entry_date")
        .eq("user_id", user.id)
        .ilike("content", `%${q}%`)
        .limit(20),
      supabase
        .from("daily_activities")
        .select("emoji, label, activity_date")
        .eq("user_id", user.id)
        .ilike("label", `%${q}%`)
        .limit(30)
    ]);

    const [todoRes, journalRes, activityRes] = settled;

    if (todoRes.status === "fulfilled" && !todoRes.value.error) {
      (todoRes.value.data ?? []).forEach((row) => {
        found.push({ date: row.due_date, type: "todo", title: t("Task", "할 일"), excerpt: row.title });
      });
    }

    if (journalRes.status === "fulfilled" && !journalRes.value.error) {
      (journalRes.value.data ?? []).forEach((row) => {
        const content = row.content ?? "";
        const lower = q.toLowerCase();
        const idx = content.toLowerCase().indexOf(lower);
        const start = Math.max(0, idx - 30);
        const end = Math.min(content.length, idx + 60);
        found.push({
          date: row.entry_date,
          type: "note",
          title: t("Note", "노트"),
          excerpt: (start > 0 ? "…" : "") + content.slice(start, end) + (end < content.length ? "…" : "")
        });
      });
    }

    if (activityRes.status === "fulfilled" && !activityRes.value.error) {
      (activityRes.value.data ?? []).forEach((row) => {
        found.push({
          date: row.activity_date,
          type: "activity",
          title: `${row.emoji ?? ""} ${row.label ?? t("Activity", "활동")}`.trim(),
          excerpt: row.label ?? row.emoji ?? ""
        });
      });
    }

    const hasError = settled.some(
      (entry) => entry.status === "rejected" || (entry.status === "fulfilled" && !!entry.value.error)
    );
    return {
      rows: found.sort((a, b) => b.date.localeCompare(a.date)),
      hasPartialError: hasError
    };
  }, [user, t]);

  const runSearch = useCallback(async (q: string) => {
    const queryId = ++activeSearchRef.current;
    const trimmedQuery = q.trim();

    if (!trimmedQuery || trimmedQuery.length < 2) {
      setResults([]);
      setErrorMessage("");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    try {
      if (user) {
        const { rows, hasPartialError } = await searchSupabase(trimmedQuery);
        if (queryId !== activeSearchRef.current) return;
        setResults(rows);
        if (hasPartialError) {
          setErrorMessage(supabaseErrorMessage);
        }
      } else {
        if (queryId !== activeSearchRef.current) return;
        setResults(searchLocal(trimmedQuery));
      }
    } catch (error: unknown) {
      if (queryId !== activeSearchRef.current) return;
      setResults([]);
      setErrorMessage(getSearchErrorMessage(error));
    } finally {
      if (queryId === activeSearchRef.current) {
        setIsLoading(false);
      }
    }
  }, [getSearchErrorMessage, searchLocal, searchSupabase, supabaseErrorMessage, user]);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(value), 300);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      activeSearchRef.current += 1;
    };
  }, []);

  // 타입 필터 적용
  const filteredResults = filterType === "all" ? results : results.filter((r) => r.type === filterType);

  // 날짜별로 그룹화
  const grouped = filteredResults.reduce<Record<string, SearchResult[]>>((acc, item) => {
    (acc[item.date] ??= []).push(item);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm px-4 pt-16"
      onClick={onClose}
    >
      <div
        role="search"
        aria-live="polite"
        className="fade-up w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 검색 입력창 */}
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={t("Search tasks, notes, activities…", "할 일, 노트, 활동 검색…")}
            className="flex-1 bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--muted)] outline-none"
            aria-label={t("Global search", "전체 검색")}
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }}
              className="shrink-0 rounded p-0.5 text-[var(--muted)] hover:text-[var(--ink)]"
              aria-label={t("Clear search", "검색 지우기")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)] border border-[var(--border)]"
            >
              {t("Close", "닫기")}
            </button>
          </div>

        {/* 타입 필터 탭 */}
        {query.length >= 2 && results.length > 0 && (
          <div className="flex items-center gap-1 border-b border-[var(--border)] px-3 py-2 overflow-x-auto">
            {(["all", "todo", "note", "activity"] as const).map((type) => {
              const count = type === "all" ? results.length : results.filter((r) => r.type === type).length;
              if (type !== "all" && count === 0) return null;
              const label = type === "all" ? t("All", "전체") : TYPE_LABELS[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFilterType(type)}
                  className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    filterType === type
                      ? "bg-[var(--primary)] text-white"
                      : "bg-[var(--bg-secondary)] text-[var(--muted)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  {label}
                  <span className={`rounded-full px-1 text-[10px] ${filterType === type ? "bg-white/20" : "bg-[var(--border)]"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* 결과 영역 */}
        <div className="max-h-[60vh] overflow-y-auto">
          {/* 로딩 */}
          {isLoading && (
            <p className="px-4 py-6 text-center text-xs text-[var(--muted)]">{t("Searching…", "검색 중…")}</p>
          )}

          {errorMessage && !isLoading && (
            <p className="px-4 py-6 text-center text-xs text-[var(--danger)]">{errorMessage}</p>
          )}

          {/* 빈 쿼리 */}
          {!isLoading && query.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <Search className="h-6 w-6 text-[var(--muted)] opacity-30" />
              <p className="text-sm text-[var(--muted)]">
                {user ? t("Search across all your entries", "모든 항목에서 검색") : t("Search your drafts for today", "오늘 작성한 임시저장에서 검색")}
              </p>
              <p className="text-xs text-[var(--muted)] opacity-60">{t("Type at least 2 characters", "검색어는 최소 2자 이상 입력해 주세요")}</p>
            </div>
          )}

          {/* 결과 없음 */}
          {!isLoading && query.length >= 2 && filteredResults.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <p className="text-sm font-medium text-[var(--muted)]">
                {results.length > 0
                  ? t("No results in this category", "이 카테고리에 결과가 없습니다")
                  : <>{t("No results for", "검색 결과가 없습니다:")} &ldquo;{query}&rdquo;</>
                }
              </p>
              <p className="text-xs text-[var(--muted)] opacity-60">{t("Try different keywords", "다른 키워드로 다시 검색해 주세요")}</p>
            </div>
          )}

          {/* 결과 목록 */}
          {!isLoading && sortedDates.map((date) => (
            <div key={date}>
              {/* 날짜 헤더 */}
              <div className="sticky top-0 flex items-center gap-1.5 bg-[var(--bg-secondary)] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                <CalendarDays className="h-3 w-3" />
                {prettyDate(date, locale)}
              </div>

              {/* 해당 날짜 결과 */}
              {grouped[date].map((result, i) => (
                <button
                  key={`${date}-${result.type}-${i}`}
                  type="button"
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]"
                  onClick={() => { onSelectDate(date); onClose(); }}
                >
                  <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${TYPE_COLORS[result.type]}`}>
                    {TYPE_LABELS[result.type]}
                  </span>
                  <span className="min-w-0 flex-1 text-xs text-[var(--ink)] leading-5">
                    {highlight(result.excerpt, query)}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* 게스트 안내 */}
        {!user && (
          <div className="border-t border-[var(--border)] px-4 py-2.5">
            <p className="text-[10px] text-[var(--muted)]">{t("Sign in to search across all dates", "모든 날짜를 검색하려면 로그인해 주세요")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

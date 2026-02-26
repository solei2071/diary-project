/**
 * SearchModal — 전역 검색 모달
 *
 * 로그인 사용자: Supabase에서 할 일 · 일기 · 활동 전체 검색
 * 게스트: localStorage 드래프트에서 검색
 *
 * 결과 클릭 시 해당 날짜로 이동
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  onClose: () => void;
  onSelectDate: (date: string) => void;
};

/** YYYY-MM-DD → 읽기 좋은 형식 */
function prettyDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("en-US", {
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

const TYPE_LABELS: Record<SearchResult["type"], string> = {
  todo: "Task",
  note: "Note",
  activity: "Activity"
};

const TYPE_COLORS: Record<SearchResult["type"], string> = {
  todo: "bg-[var(--primary)]/12 text-[var(--primary)]",
  note: "bg-amber-100 text-amber-700",
  activity: "bg-[var(--success-bg)] text-[var(--success)]"
};

export default function SearchModal({ session, onClose, onSelectDate }: Props) {
  const user = session?.user ?? null;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
              title: "Note",
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
                title: `${item.emoji} ${item.label || "Activity"}`,
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
  }, []);

  const searchSupabase = useCallback(async (q: string): Promise<SearchResult[]> => {
    if (!user) return [];
    const found: SearchResult[] = [];

    const [todoRes, journalRes, activityRes] = await Promise.all([
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

    (todoRes.data ?? []).forEach((row) => {
      found.push({ date: row.due_date, type: "todo", title: row.title, excerpt: row.title });
    });

    (journalRes.data ?? []).forEach((row) => {
      const content = row.content ?? "";
      const lower = q.toLowerCase();
      const idx = content.toLowerCase().indexOf(lower);
      const start = Math.max(0, idx - 30);
      const end = Math.min(content.length, idx + 60);
      found.push({
        date: row.entry_date,
        type: "note",
        title: "Note",
        excerpt: (start > 0 ? "…" : "") + content.slice(start, end) + (end < content.length ? "…" : "")
      });
    });

    (activityRes.data ?? []).forEach((row) => {
      found.push({
        date: row.activity_date,
        type: "activity",
        title: `${row.emoji ?? ""} ${row.label ?? "Activity"}`.trim(),
        excerpt: row.label ?? row.emoji ?? ""
      });
    });

    return found.sort((a, b) => b.date.localeCompare(a.date));
  }, [user]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const found = user ? await searchSupabase(q.trim()) : searchLocal(q.trim());
      setResults(found);
    } finally {
      setIsLoading(false);
    }
  }, [user, searchSupabase, searchLocal]);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(value), 300);
  };

  // 날짜별로 그룹화
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, item) => {
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
            placeholder="Search tasks, notes, activities…"
            className="flex-1 bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--muted)] outline-none"
            aria-label="Global search"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }}
              className="shrink-0 rounded p-0.5 text-[var(--muted)] hover:text-[var(--ink)]"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)] border border-[var(--border)]"
          >
            ESC
          </button>
        </div>

        {/* 결과 영역 */}
        <div className="max-h-[60vh] overflow-y-auto">
          {/* 로딩 */}
          {isLoading && (
            <p className="px-4 py-6 text-center text-xs text-[var(--muted)]">Searching…</p>
          )}

          {/* 빈 쿼리 */}
          {!isLoading && query.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <Search className="h-6 w-6 text-[var(--muted)] opacity-30" />
              <p className="text-sm text-[var(--muted)]">
                {user ? "Search across all your entries" : "Search your drafts for today"}
              </p>
              <p className="text-xs text-[var(--muted)] opacity-60">Type at least 2 characters</p>
            </div>
          )}

          {/* 결과 없음 */}
          {!isLoading && query.length >= 2 && results.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <p className="text-sm font-medium text-[var(--muted)]">No results for &ldquo;{query}&rdquo;</p>
              <p className="text-xs text-[var(--muted)] opacity-60">Try different keywords</p>
            </div>
          )}

          {/* 결과 목록 */}
          {!isLoading && sortedDates.map((date) => (
            <div key={date}>
              {/* 날짜 헤더 */}
              <div className="sticky top-0 flex items-center gap-1.5 bg-[var(--bg-secondary)] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                <CalendarDays className="h-3 w-3" />
                {prettyDate(date)}
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
            <p className="text-[10px] text-[var(--muted)]">Sign in to search across all dates</p>
          </div>
        )}
      </div>
    </div>
  );
}

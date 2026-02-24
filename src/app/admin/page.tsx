/**
 * 관리자 전용 Dashboard Export 페이지
 * - 일반 사용자: 접근 불가
 * - 관리자: 월/주 범위 선택 후 JSON/CSV export
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, Home, Loader2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  appendExportAudit,
  buildDashboardCsv,
  buildDashboardPayload,
  buildDashboardRowsByRange,
  buildDashboardSummary,
  buildExportRange,
  downloadTextFile,
  loadExportAudit,
  type DashboardExportAuditRecord,
  type DashboardRangeMode
} from "@/lib/dashboard-export";
import { getAdminDisplayName, isAdminUser } from "@/lib/admin";

const initialDate = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
})();

const prettyDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()} (${date.toLocaleDateString("en-US", {
    weekday: "short"
  })})`;
};

const toMonthLabel = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [mode, setMode] = useState<DashboardRangeMode>("month");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isExporting, setIsExporting] = useState<"json" | "csv" | null>(null);
  const [audit, setAudit] = useState<DashboardExportAuditRecord[]>([]);

  const isAdmin = useMemo(() => isAdminUser(session?.user ?? null), [session]);
  const adminName = useMemo(() => getAdminDisplayName(session?.user ?? null), [session]);
  const exportRange = useMemo(() => buildExportRange(mode, selectedDate), [mode, selectedDate]);

  const rangeLabel = useMemo(() => {
    if (mode === "month") {
      return `${toMonthLabel(exportRange.start)} (${exportRange.start} ~ ${exportRange.end})`;
    }
    const start = prettyDate(exportRange.start);
    const end = prettyDate(exportRange.end);
    return `${start} - ${end}`;
  }, [exportRange, mode]);

  const refreshAudit = useCallback(() => {
    setAudit(loadExportAudit());
  }, []);

  const movePeriod = useCallback(
    (step: number) => {
      const date = new Date(`${selectedDate}T00:00:00`);
      if (mode === "week") {
        date.setDate(date.getDate() + 7 * step);
      } else {
        date.setDate(1);
        date.setMonth(date.getMonth() + step);
      }
      setSelectedDate(
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(
          2,
          "0"
        )}`
      );
    },
    [mode, selectedDate]
  );

  const handleExport = useCallback(
    async (format: "json" | "csv") => {
      if (!session?.user) return;
      setIsExporting(format);
      setMessage("");
      setError("");
      try {
        const rows = await buildDashboardRowsByRange(supabase, session.user.id, exportRange);
        if (rows.length === 0) {
          setMessage("No data in the selected range.");
        }
        const summary = buildDashboardSummary(rows, exportRange);
        const payload = buildDashboardPayload(rows, exportRange, summary);
        const filename = `diary-${exportRange.mode}-${exportRange.start}-${exportRange.end}.${format}`;
        if (format === "json") {
          downloadTextFile(
            "application/json",
            filename,
            JSON.stringify(payload, null, 2)
          );
        } else {
          const csv = buildDashboardCsv(payload);
          downloadTextFile("text/csv", filename, csv);
        }
        appendExportAudit({
          at: new Date().toISOString(),
          userId: session.user.id,
          format,
          mode: exportRange.mode,
          rangeStart: exportRange.start,
          rangeEnd: exportRange.end,
          rows: rows.length,
          filename,
          status: "success"
        });
        refreshAudit();
        setMessage(`Export ready: ${filename}`);
      } catch (caught: unknown) {
        const errorMessage =
          caught instanceof Error ? caught.message : "Export failed. Please retry.";
        setError(errorMessage);
        appendExportAudit({
          at: new Date().toISOString(),
          userId: session?.user?.id ?? "unknown",
          format,
          mode: exportRange.mode,
          rangeStart: exportRange.start,
          rangeEnd: exportRange.end,
          rows: 0,
          filename: `diary-${exportRange.mode}-${exportRange.start}-${exportRange.end}.${format}`,
          status: "error",
          error: errorMessage
        });
        refreshAudit();
      } finally {
        setIsExporting(null);
      }
    },
    [exportRange, refreshAudit, session]
  );

  useEffect(() => {
    const load = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!sessionError) {
        setSession(data.session);
      }
      setReady(true);
      refreshAudit();
    };

    void load();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      refreshAudit();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshAudit]);

  if (!ready) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4">
        <p className="text-sm text-[var(--muted)]">Loading...</p>
      </main>
    );
  }

  if (!session || !isAdmin) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl px-4 pt-6">
        <section className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger-bg)] p-4">
          <h1 className="mb-1 text-lg font-semibold text-[var(--danger)]">No access</h1>
          <p className="mb-4 text-xs text-[var(--danger)]">This page is only available for admin users.</p>
          <div className="flex gap-2">
            <a
              href="/"
              className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-3 py-1.5 text-xs font-semibold"
            >
              <Home className="h-3.5 w-3.5" />
              Home
            </a>
            {session ? null : (
              <a
                href="/"
                className="inline-flex items-center gap-1 rounded bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white"
              >
                Sign in
              </a>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-4">
      <section className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
        <div>
          <p className="text-xs text-[var(--muted)]">Administrator</p>
          <h1 className="text-lg font-semibold text-[var(--ink)]">{adminName}</h1>
          <p className="text-xs text-[var(--muted)]">Daily flow export dashboard</p>
        </div>
        <a
          href="/"
          className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold"
        >
          <Home className="h-3.5 w-3.5" />
          Back to app
        </a>
      </section>

      <section className="rounded-lg border border-[var(--border)]">
        <div className="flex flex-col gap-2 border-b border-[var(--border)] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-center gap-2">
            <button
              onClick={() => setMode("week")}
              className={`rounded border px-2 py-1.5 text-xs font-semibold ${
                mode === "week" ? "bg-[var(--primary)] text-white" : "text-[var(--ink)]"
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setMode("month")}
              className={`rounded border px-2 py-1.5 text-xs font-semibold ${
                mode === "month" ? "bg-[var(--primary)] text-white" : "text-[var(--ink)]"
              }`}
            >
              Month
            </button>
          </div>
          <div className="inline-flex items-center gap-1">
            <button
              onClick={() => movePeriod(-1)}
              className="inline-flex items-center justify-center rounded border border-[var(--border)] p-2 text-xs"
              aria-label="Previous range"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <input
              value={selectedDate}
              type="date"
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-36 rounded border border-[var(--border)] p-1.5 text-xs"
            />
            <button
              onClick={() => movePeriod(1)}
              className="inline-flex items-center justify-center rounded border border-[var(--border)] p-2 text-xs"
              aria-label="Next range"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">{rangeLabel}</div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-[var(--border)] p-3">
          <button
            onClick={() => void handleExport("json")}
            disabled={isExporting === "json"}
            className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            {isExporting === "json" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            JSON
          </button>
          <button
            onClick={() => void handleExport("csv")}
            disabled={isExporting === "csv"}
            className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            {isExporting === "csv" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            CSV
          </button>
        </div>
        {message ? <p className="px-3 py-2 text-xs text-[var(--success)]">{message}</p> : null}
        {error ? <p className="px-3 py-2 text-xs text-[var(--danger)]">Export failed: {error}</p> : null}
      </section>

      <section className="mt-4 rounded-lg border border-[var(--border)]">
        <div className="border-b border-[var(--border)] px-3 py-2">
          <p className="text-xs font-semibold text-[var(--ink)]">Recent export history</p>
        </div>
        <div className="px-3 py-2">
          {audit.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">No history yet.</p>
          ) : (
            <ul className="grid gap-1">
              {audit.map((item) => (
                <li key={item.id} className="rounded border border-[var(--border)] px-2 py-1.5">
                  <p className="text-xs font-semibold text-[var(--ink)]">
                    {item.status === "success" ? "✅" : "⚠️"} {item.format.toUpperCase()} / {item.mode}
                  </p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {item.rangeStart} ~ {item.rangeEnd} · {item.rows} rows · {item.filename}
                  </p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {new Date(item.at).toLocaleString()}
                  </p>
                  {item.error ? <p className="text-[11px] text-[var(--danger)]">{item.error}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}


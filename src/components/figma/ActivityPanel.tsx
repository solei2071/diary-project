"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Settings, Smile } from "lucide-react";
import {
  previewCardClass,
  previewIconButtonClass,
  previewInputClass,
  previewLabelClass,
  previewMutedClass,
  previewPillClass,
  previewPrimaryButtonClass,
  previewSectionTitleClass,
  previewTitleClass
} from "@/components/figma/previewTheme";

const daysInMonth = [
  [null, null, null, null, null, null, 1, 2, 3, 4, 5, 6, 7],
  [8, 9, 10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19, 20, 21],
  [22, 23, 24, 25, 26, 27, 28],
  [29, 30, 31]
];

const summaryStats = [
  { label: "Mood Tags", value: "3" },
  { label: "Notes", value: "0" },
  { label: "Focus", value: "74%" }
];

export function ActivityPanel() {
  const [selectedDate] = useState(6);
  const [filter, setFilter] = useState("");
  const [emoji, setEmoji] = useState("");

  return (
    <div className="flex h-full flex-col px-4 pb-5 text-[var(--ink)]">
      <div className="flex items-center justify-between pb-4 pt-2">
        <div>
          <p className={previewLabelClass}>Activity Journal</p>
          <h1 className={`mt-1 ${previewTitleClass}`}>3/6 (Fri)</h1>
        </div>
        <button type="button" className={previewIconButtonClass}>
          <Settings className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto pb-2">
        <section className={`${previewCardClass} overflow-hidden`}>
          <div className="bg-[linear-gradient(135deg,rgba(59,130,246,0.12),rgba(251,191,36,0.08))] px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={previewLabelClass}>Daily Pulse</p>
                <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[var(--ink)]">
                  Capture the small things before they disappear.
                </h2>
                <p className="mt-2 max-w-[15rem] text-[13px] leading-5 text-[var(--ink-light)]">
                  Notes, symbols, and time blocks stay grouped like the main app instead of floating as isolated widgets.
                </p>
              </div>
              <div className="rounded-3xl bg-white/80 px-3 py-2 text-right shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Today</p>
                <p className="mt-1 text-[18px] font-semibold text-[var(--ink)]">Quiet Start</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 px-4 py-4">
            {summaryStats.map((stat) => (
              <div key={stat.label} className="rounded-[20px] border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{stat.label}</p>
                <p className="mt-2 text-[20px] font-semibold tracking-[-0.02em] text-[var(--ink)]">{stat.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={`${previewCardClass} p-4`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className={previewLabelClass}>Calendar</p>
              <h2 className="mt-1 text-[16px] font-semibold text-[var(--ink)]">March 2026</h2>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className={previewIconButtonClass}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button type="button" className={previewIconButtonClass}>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mb-3 grid grid-cols-7 gap-2">
            {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => (
              <div key={day} className="text-center text-[10px] font-semibold tracking-[0.14em] text-[var(--muted)]">
                {day}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {daysInMonth.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 gap-2">
                {week.map((day, dayIndex) => (
                  <div key={`${weekIndex}-${dayIndex}`} className="aspect-square">
                    {day ? (
                      <button
                        type="button"
                        className={`flex h-full w-full items-center justify-center rounded-2xl text-sm font-medium transition-all ${
                          day === selectedDate
                            ? "scale-[1.03] bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30"
                            : "border border-transparent text-[var(--ink-light)] hover:border-[var(--border)] hover:bg-[var(--bg-secondary)]"
                        }`}
                      >
                        {day}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className={`${previewCardClass} p-4`}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className={previewLabelClass}>Quick Capture</p>
              <h2 className={`mt-1 ${previewSectionTitleClass}`}>Add a symbol and short filter</h2>
            </div>
            <button type="button" className={previewIconButtonClass}>
              <Smile className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            <input
              type="text"
              placeholder="Filter activity type"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className={previewInputClass}
            />
            <input
              type="text"
              placeholder="Emoji or symbol"
              value={emoji}
              onChange={(event) => setEmoji(event.target.value)}
              className={previewInputClass}
            />

            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <span className={previewPillClass}>Morning</span>
                <span className={previewPillClass}>Work</span>
                <span className={previewPillClass}>Health</span>
              </div>
              <button type="button" className={previewPrimaryButtonClass}>
                Save
              </button>
            </div>
          </div>
        </section>

        <section className={`${previewCardClass} p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className={previewLabelClass}>Entries</p>
              <h2 className={`mt-1 ${previewSectionTitleClass}`}>Today&apos;s activity summary</h2>
            </div>
            <span className={previewPillClass}>No records yet</span>
          </div>

          <div className="flex flex-col items-center justify-center rounded-[22px] border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] px-5 py-10 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
              <svg className="h-7 w-7 text-[var(--muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <p className="text-sm font-medium text-[var(--ink)]">No activities yet</p>
            <p className={`mt-1 text-center ${previewMutedClass}`}>
              Start with one symbol or short note and let the rest of the layout stay quiet.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

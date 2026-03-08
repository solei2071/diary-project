"use client";

import { Award, Calendar, Clock, Target, TrendingUp, Zap } from "lucide-react";
import {
  previewCardClass,
  previewLabelClass,
  previewMutedClass,
  previewPillClass,
  previewPrimaryButtonClass,
  previewSecondaryButtonClass,
  previewSectionTitleClass,
  previewTitleClass
} from "@/components/figma/previewTheme";

const stats = [
  { icon: Target, label: "Tasks Completed", value: "24", change: "+12%", tone: "from-blue-500 to-indigo-600" },
  { icon: Zap, label: "Streak Days", value: "7", change: "+2", tone: "from-amber-400 to-orange-500" },
  { icon: Clock, label: "Hours Tracked", value: "42", change: "+5h", tone: "from-slate-700 to-slate-900" },
  { icon: Award, label: "Achievements", value: "8", change: "+1", tone: "from-emerald-500 to-teal-600" }
];

const recentActivity = [
  { emoji: "📝", text: 'Completed "Review documentation"', time: "2h ago" },
  { emoji: "✅", text: "Added new task", time: "4h ago" },
  { emoji: "🎯", text: "Reached daily goal", time: "1d ago" },
  { emoji: "🔥", text: "7-day streak achieved!", time: "1d ago" }
];

export function DashboardPanel() {
  return (
    <div className="flex h-full flex-col px-4 pb-5">
      <div className="pb-4 pt-2">
        <p className={previewLabelClass}>Overview</p>
        <h1 className={`mt-1 ${previewTitleClass}`}>Dashboard</h1>
        <p className={`mt-2 max-w-[16rem] ${previewMutedClass}`}>
          Metrics now sit on the same card system as notes and activity instead of looking like a separate product.
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto pb-2">
        <section className={`${previewCardClass} overflow-hidden`}>
          <div className="bg-[linear-gradient(135deg,rgba(59,130,246,0.12),rgba(251,191,36,0.08))] px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={previewLabelClass}>This Week</p>
                <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[var(--ink)]">
                  A clearer summary with less dashboard noise.
                </h2>
              </div>
              <span className={previewPillClass}>Updated today</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 px-4 py-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-[24px] border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${stat.tone} shadow-md`}>
                  <stat.icon className="h-5 w-5 text-white" />
                </div>
                <p className="text-[24px] font-semibold tracking-[-0.03em] text-[var(--ink)]">{stat.value}</p>
                <p className="mt-1 text-[12px] text-[var(--ink-light)]">{stat.label}</p>
                <p className="mt-2 text-[12px] font-semibold text-emerald-600">{stat.change}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={`${previewCardClass} p-4`}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className={previewLabelClass}>Progress</p>
              <h2 className={`mt-1 ${previewSectionTitleClass}`}>Weekly rhythm</h2>
            </div>
            <Calendar className="h-4 w-4 text-[var(--muted)]" />
          </div>

          <div className="flex h-36 items-end justify-between gap-2">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, index) => {
              const heights = [58, 78, 42, 88, 66, 82, 94];
              return (
                <div key={day} className="flex flex-1 flex-col items-center gap-2">
                  <div className="relative h-full w-full overflow-hidden rounded-[18px] bg-[var(--bg-secondary)]">
                    <div
                      className={`absolute bottom-0 w-full rounded-[18px] ${
                        index === 6 ? "bg-gradient-to-t from-blue-500 to-indigo-500" : "bg-slate-300"
                      }`}
                      style={{ height: `${heights[index]}%` }}
                    />
                  </div>
                  <span className={`text-[11px] font-medium ${index === 6 ? "text-[var(--primary)]" : "text-[var(--muted)]"}`}>
                    {day}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className={`${previewCardClass} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div>
              <p className={previewLabelClass}>Timeline</p>
              <h2 className={`mt-1 ${previewSectionTitleClass}`}>Recent activity</h2>
            </div>
            <TrendingUp className="h-4 w-4 text-[var(--muted)]" />
          </div>

          <div className="divide-y divide-[var(--border)]">
            {recentActivity.map((activity) => (
              <div key={`${activity.text}-${activity.time}`} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--bg-secondary)] text-xl">
                  {activity.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[var(--ink)]">{activity.text}</p>
                  <p className="text-[12px] text-[var(--muted)]">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <button type="button" className={`${previewPrimaryButtonClass} w-full py-4 text-left`}>
            <span>Add New Task</span>
          </button>
          <button type="button" className={`${previewSecondaryButtonClass} w-full py-4 text-left`}>
            <span>View All Stats</span>
          </button>
        </section>
      </div>
    </div>
  );
}

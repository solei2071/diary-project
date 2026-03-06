"use client";

import { Award, Calendar, Clock, Target, TrendingUp, Zap } from "lucide-react";

const stats = [
  { icon: Target, label: "Tasks Completed", value: "24", change: "+12%", color: "bg-blue-500" },
  { icon: Zap, label: "Streak Days", value: "7", change: "+2", color: "bg-yellow-500" },
  { icon: Clock, label: "Hours Tracked", value: "42", change: "+5h", color: "bg-purple-500" },
  { icon: Award, label: "Achievements", value: "8", change: "+1", color: "bg-green-500" }
];

const recentActivity = [
  { emoji: "📝", text: 'Completed "Review documentation"', time: "2h ago" },
  { emoji: "✅", text: "Added new task", time: "4h ago" },
  { emoji: "🎯", text: "Reached daily goal", time: "1d ago" },
  { emoji: "🔥", text: "7-day streak achieved!", time: "1d ago" }
];

export function DashboardPanel() {
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-gray-50 to-white px-4 pb-4">
      <div className="pb-4 pt-2">
        <h1 className="mb-1 text-3xl font-semibold">Dashboard</h1>
        <p className="text-gray-500">Your productivity overview</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto">
        <section className="grid grid-cols-2 gap-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-transform active:scale-[0.98]"
            >
              <div className={`${stat.color} mb-3 flex h-10 w-10 items-center justify-center rounded-full`}>
                <stat.icon className="h-5 w-5 text-white" />
              </div>
              <p className="mb-1 text-2xl font-semibold text-gray-900">{stat.value}</p>
              <p className="mb-1 text-xs text-gray-500">{stat.label}</p>
              <p className="text-xs font-medium text-green-600">{stat.change}</p>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h2 className="font-semibold text-gray-900">Weekly Progress</h2>
            <Calendar className="h-4 w-4 text-gray-400" />
          </div>
          <div className="px-4 py-4">
            <div className="flex h-32 items-end justify-between gap-2">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, index) => {
                const heights = [60, 80, 45, 90, 70, 85, 95];
                return (
                  <div key={day} className="flex flex-1 flex-col items-center gap-2">
                    <div className="relative h-full w-full overflow-hidden rounded-lg bg-gray-100">
                      <div
                        className={`absolute bottom-0 w-full rounded-lg ${index === 6 ? "bg-blue-500" : "bg-gray-300"}`}
                        style={{ height: `${heights[index]}%` }}
                      />
                    </div>
                    <span className={`text-xs ${index === 6 ? "font-semibold text-blue-500" : "text-gray-500"}`}>
                      {day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h2 className="font-semibold text-gray-900">Recent Activity</h2>
            <TrendingUp className="h-4 w-4 text-gray-400" />
          </div>
          <div className="divide-y divide-gray-100">
            {recentActivity.map((activity) => (
              <div key={`${activity.text}-${activity.time}`} className="flex items-center gap-3 px-4 py-3 transition-colors active:bg-gray-50">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl">
                  {activity.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-900">{activity.text}</p>
                  <p className="text-xs text-gray-400">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 p-4 text-left text-white shadow-lg transition-transform active:scale-[0.98]"
          >
            <p className="mb-1 text-sm opacity-90">Add</p>
            <p className="font-semibold">New Task</p>
          </button>
          <button
            type="button"
            className="rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 p-4 text-left text-white shadow-lg transition-transform active:scale-[0.98]"
          >
            <p className="mb-1 text-sm opacity-90">View</p>
            <p className="font-semibold">All Stats</p>
          </button>
        </section>
      </div>
    </div>
  );
}

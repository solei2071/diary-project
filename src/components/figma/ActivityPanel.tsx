"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Settings, Smile } from "lucide-react";

const daysInMonth = [
  [null, null, null, null, null, null, 1, 2, 3, 4, 5, 6, 7],
  [8, 9, 10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19, 20, 21],
  [22, 23, 24, 25, 26, 27, 28],
  [29, 30, 31]
];

export function ActivityPanel() {
  const [selectedDate] = useState(6);
  const [filter, setFilter] = useState("");
  const [emoji, setEmoji] = useState("");

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-gray-50 to-white px-4 pb-4">
      <div className="flex items-center justify-between pb-4 pt-2">
        <h1 className="text-3xl font-semibold">3/6 (Fri)</h1>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 transition-colors active:bg-gray-200"
        >
          <Settings className="h-5 w-5 text-gray-600" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto">
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="font-semibold text-gray-900">Today&apos;s activity summary</h2>
          </div>
          <div className="px-4 py-8">
            <p className="text-center text-gray-400">No records yet</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="font-semibold text-gray-900">Notes</h2>
          </div>
          <div className="px-4 py-8">
            <p className="text-center text-gray-400">No notes yet.</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-gray-100 active:bg-gray-200"
            >
              <ChevronLeft className="h-5 w-5 text-gray-600" />
            </button>
            <h2 className="font-semibold text-gray-900">March 2026</h2>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-gray-100 active:bg-gray-200"
            >
              <ChevronRight className="h-5 w-5 text-gray-600" />
            </button>
          </div>

          <div className="px-4 py-4">
            <div className="mb-3 grid grid-cols-7 gap-2">
              {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => (
                <div key={day} className="text-center text-xs font-medium text-gray-400">
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
                          className={`flex h-full w-full items-center justify-center rounded-full text-sm font-medium transition-all ${
                            day === selectedDate
                              ? "scale-105 bg-gray-900 text-white shadow-lg"
                              : "text-gray-700 hover:bg-gray-100 active:bg-gray-200"
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
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h2 className="font-semibold text-gray-900">Activity</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 transition-colors active:bg-blue-100"
              >
                <Smile className="h-4 w-4" />
                Symbol management
              </button>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-gray-100 active:bg-gray-200"
              >
                <Settings className="h-4 w-4 text-gray-600" />
              </button>
            </div>
          </div>

          <div className="space-y-3 px-4 py-4">
            <input
              type="text"
              placeholder="Filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />

            <input
              type="text"
              placeholder="Emoji"
              value={emoji}
              onChange={(event) => setEmoji(event.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />

            <div className="flex flex-col items-center justify-center py-12">
              <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                <svg className="h-8 w-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <p className="text-sm text-gray-400">No activities yet</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

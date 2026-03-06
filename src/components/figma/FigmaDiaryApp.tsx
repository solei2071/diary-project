"use client";

import { useState, type ReactNode } from "react";
import { ActivityPanel } from "@/components/figma/ActivityPanel";
import { NotesPanel } from "@/components/figma/NotesPanel";
import { TodoPanel } from "@/components/figma/TodoPanel";
import { DashboardPanel } from "@/components/figma/DashboardPanel";

type TabKey = "activity" | "notes" | "todo" | "dashboard";

export default function FigmaDiaryApp() {
  const [activeTab, setActiveTab] = useState<TabKey>("activity");

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-sky-100 p-4 sm:p-8">
      <div className="mx-auto w-full max-w-[440px] rounded-[56px] bg-black p-3 shadow-2xl">
        <div className="relative h-[844px] w-full overflow-hidden rounded-[46px] bg-white">
          <div className="absolute left-1/2 top-0 z-20 h-7 w-40 -translate-x-1/2 rounded-b-3xl bg-black" />

          <div className="h-12 px-8 pt-2 text-sm font-medium">
            <div className="flex items-center justify-between">
              <span>9:41</span>
              <span className="text-xs text-gray-500">Figma Preview</span>
            </div>
          </div>

          <div className="h-[calc(100%-8rem)] overflow-y-auto">
            {activeTab === "activity" ? <ActivityPanel /> : null}
            {activeTab === "notes" ? <NotesPanel /> : null}
            {activeTab === "todo" ? <TodoPanel /> : null}
            {activeTab === "dashboard" ? <DashboardPanel /> : null}
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-20 border-t border-gray-200 bg-white/85 px-4 pb-2 backdrop-blur-xl">
            <div className="flex h-full items-center justify-around">
              <TabButton
                icon={<ActivityIcon />}
                label="Activity"
                active={activeTab === "activity"}
                onClick={() => setActiveTab("activity")}
              />
              <TabButton
                icon={<NotesIcon />}
                label="Notes"
                active={activeTab === "notes"}
                onClick={() => setActiveTab("notes")}
              />
              <TabButton
                icon={<TodoIcon />}
                label="To-do"
                active={activeTab === "todo"}
                onClick={() => setActiveTab("todo")}
              />
              <TabButton
                icon={<DashIcon />}
                label="Dash"
                active={activeTab === "dashboard"}
                onClick={() => setActiveTab("dashboard")}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function TabButton({
  icon,
  label,
  active,
  onClick
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 transition-colors"
    >
      <div className={active ? "text-blue-500" : "text-gray-400"}>{icon}</div>
      <span className={`text-[10px] ${active ? "text-blue-500" : "text-gray-400"}`}>
        {label}
      </span>
    </button>
  );
}

function ActivityIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
    </svg>
  );
}

function TodoIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  );
}

function DashIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
    </svg>
  );
}

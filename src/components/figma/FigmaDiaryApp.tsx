"use client";

import { type ReactNode, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ActivityPanel } from "@/components/figma/ActivityPanel";
import { DashboardPanel } from "@/components/figma/DashboardPanel";
import { Login } from "@/components/figma/Login";
import { NotesPanel } from "@/components/figma/NotesPanel";
import { TodoPanel } from "@/components/figma/TodoPanel";
import { previewScreenClass } from "@/components/figma/previewTheme";

type TabKey = "activity" | "notes" | "todo" | "dashboard";

export default function FigmaDiaryApp() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("activity");

  const contentKey = isLoggedIn ? activeTab : "login";

  const renderContent = () => {
    if (!isLoggedIn) {
      return <Login onLogin={() => setIsLoggedIn(true)} />;
    }

    switch (activeTab) {
      case "activity":
        return <ActivityPanel />;
      case "notes":
        return <NotesPanel />;
      case "todo":
        return <TodoPanel />;
      case "dashboard":
        return <DashboardPanel />;
      default:
        return null;
    }
  };

  return (
    <main className={`min-h-screen p-4 sm:p-8 ${previewScreenClass}`}>
      <div className="mx-auto flex min-h-screen items-center justify-center">
        <div className="relative w-full max-w-[390px] rounded-[60px] bg-[#0f172a] p-3 shadow-[0_32px_120px_rgba(15,23,42,0.28)]">
          <div className="pointer-events-none absolute inset-[2px] rounded-[58px] border border-white/10" />
          <div className="absolute left-1/2 top-0 z-50 h-7 w-40 -translate-x-1/2 rounded-b-3xl bg-[#0f172a]" />

          <div className="relative flex h-[844px] w-full flex-col overflow-hidden rounded-[48px] bg-[linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#ffffff_100%)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_70%)]" />

            <div className="relative h-12 px-8 pt-2 text-sm font-medium text-slate-700">
              <div className="flex items-center justify-between">
                <span>9:41</span>
                <div className="flex items-center gap-1">
                  <svg className="h-3 w-4" viewBox="0 0 16 12" fill="currentColor" aria-hidden="true">
                    <path d="M1 4.5C1 3.67157 1.67157 3 2.5 3H3.5C4.32843 3 5 3.67157 5 4.5V7.5C5 8.32843 4.32843 9 3.5 9H2.5C1.67157 9 1 8.32843 1 7.5V4.5Z" />
                    <path d="M6 3.5C6 2.67157 6.67157 2 7.5 2H8.5C9.32843 2 10 2.67157 10 3.5V8.5C10 9.32843 9.32843 10 8.5 10H7.5C6.67157 10 6 9.32843 6 8.5V3.5Z" />
                    <path d="M11 1.5C11 0.671573 11.6716 0 12.5 0H13.5C14.3284 0 15 0.671573 15 1.5V10.5C15 11.3284 14.3284 12 13.5 12H12.5C11.6716 12 11 11.3284 11 10.5V1.5Z" />
                  </svg>
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M1.5 5.5A.5.5 0 0 1 2 5h12a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5v-5Z" />
                    <path d="M14.5 6v4h.5a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-.5Z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="relative flex-1 overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={contentKey}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="h-full"
                >
                  {renderContent()}
                </motion.div>
              </AnimatePresence>
            </div>

            {isLoggedIn ? (
              <div className="relative h-24 border-t border-[var(--border)] bg-white/82 px-4 pb-3 pt-2 backdrop-blur-2xl">
                <div className="absolute left-1/2 top-2 h-1 w-12 -translate-x-1/2 rounded-full bg-slate-200" />
                <div className="flex h-full items-end justify-around">
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
            ) : null}
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
      aria-pressed={active}
      className={`flex min-w-[72px] flex-col items-center gap-1 rounded-[20px] px-3 py-2.5 transition-all ${
        active
          ? "bg-[var(--bg-secondary)] text-[var(--primary)] shadow-[0_10px_20px_rgba(59,130,246,0.12)]"
          : "text-[var(--muted)] hover:text-[var(--ink-light)]"
      }`}
    >
      <div className={active ? "text-[var(--primary)]" : "text-[var(--muted)]"}>{icon}</div>
      <span className={`text-[10px] font-medium ${active ? "text-[var(--primary)]" : "text-[var(--muted)]"}`}>
        {label}
      </span>
    </button>
  );
}

function ActivityIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
    </svg>
  );
}

function TodoIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41Z" />
    </svg>
  );
}

function DashIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z" />
    </svg>
  );
}

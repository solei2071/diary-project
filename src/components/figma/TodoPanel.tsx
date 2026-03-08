"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
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

type TodoPriority = "high" | "medium" | "low";

type TodoItem = {
  id: number;
  text: string;
  completed: boolean;
  priority: TodoPriority;
};

const priorityMeta: Record<TodoPriority, { label: string; accent: string; soft: string }> = {
  high: {
    label: "High",
    accent: "bg-rose-500",
    soft: "bg-rose-50 text-rose-700"
  },
  medium: {
    label: "Medium",
    accent: "bg-amber-500",
    soft: "bg-amber-50 text-amber-700"
  },
  low: {
    label: "Low",
    accent: "bg-emerald-500",
    soft: "bg-emerald-50 text-emerald-700"
  }
};

export function TodoPanel() {
  const [todos, setTodos] = useState<TodoItem[]>([
    { id: 1, text: "Review project documentation", completed: false, priority: "high" },
    { id: 2, text: "Update design system", completed: true, priority: "medium" },
    { id: 3, text: "Team meeting at 3 PM", completed: false, priority: "high" },
    { id: 4, text: "Respond to emails", completed: false, priority: "low" }
  ]);
  const [newTodo, setNewTodo] = useState("");

  const toggleTodo = (id: number) => {
    setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo)));
  };

  const deleteTodo = (id: number) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id));
  };

  const addTodo = () => {
    if (!newTodo.trim()) return;

    setTodos((prev) => [
      ...prev,
      {
        id: Date.now(),
        text: newTodo,
        completed: false,
        priority: "medium"
      }
    ]);
    setNewTodo("");
  };

  const activeTodos = todos.filter((todo) => !todo.completed);
  const completedTodos = todos.filter((todo) => todo.completed);

  return (
    <div className="flex h-full flex-col px-4 pb-5">
      <div className="pb-4 pt-2">
        <p className={previewLabelClass}>Checklist</p>
        <h1 className={`mt-1 ${previewTitleClass}`}>To-do</h1>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto pb-2">
        <section className={`${previewCardClass} overflow-hidden`}>
          <div className="bg-[linear-gradient(135deg,rgba(59,130,246,0.1),rgba(15,23,42,0.04))] px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={previewLabelClass}>Today&apos;s queue</p>
                <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[var(--ink)]">
                  Fewer colors. Clearer task weight.
                </h2>
                <p className={`mt-2 max-w-[15rem] ${previewMutedClass}`}>
                  Priority is shown as a quiet badge and edge marker so the list feels closer to the real diary.
                </p>
              </div>
              <div className="rounded-3xl bg-white/85 px-3 py-2 text-right shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Open</p>
                <p className="mt-1 text-[18px] font-semibold text-[var(--ink)]">{activeTodos.length}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 px-4 py-4">
            <div className="rounded-[22px] border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Completed</p>
              <p className="mt-2 text-[18px] font-semibold text-[var(--ink)]">{completedTodos.length}</p>
            </div>
            <div className="rounded-[22px] border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Focus mode</p>
              <p className="mt-2 text-[18px] font-semibold text-[var(--ink)]">Single list</p>
            </div>
          </div>
        </section>

        <section className={`${previewCardClass} p-4`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className={previewLabelClass}>Add Task</p>
              <h2 className={`mt-1 ${previewSectionTitleClass}`}>Quick input</h2>
            </div>
            <button type="button" onClick={addTodo} className={previewIconButtonClass}>
              <Plus className="h-5 w-5" />
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add new task..."
              value={newTodo}
              onChange={(event) => setNewTodo(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addTodo();
              }}
              className={previewInputClass}
            />
            <button type="button" onClick={addTodo} className={`${previewPrimaryButtonClass} shrink-0 px-4`}>
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </section>

        {activeTodos.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className={previewLabelClass}>Active</p>
              <span className={previewPillClass}>{activeTodos.length} items</span>
            </div>

            {activeTodos.map((todo) => {
              const meta = priorityMeta[todo.priority];
              return (
                <article key={todo.id} className={`${previewCardClass} overflow-hidden`}>
                  <div className="flex items-center gap-3 px-4 py-4">
                    <div className={`h-12 w-1.5 rounded-full ${meta.accent}`} />
                    <button
                      type="button"
                      onClick={() => toggleTodo(todo.id)}
                      className="shrink-0 text-[var(--muted)] transition-colors hover:text-[var(--primary)]"
                    >
                      <Circle className="h-6 w-6" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.soft}`}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-[14px] font-medium text-[var(--ink)]">{todo.text}</p>
                    </div>
                    <button type="button" onClick={() => deleteTodo(todo.id)} className={previewIconButtonClass}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}

        {completedTodos.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className={previewLabelClass}>Completed</p>
              <span className={previewPillClass}>{completedTodos.length} done</span>
            </div>

            {completedTodos.map((todo) => (
            <article key={todo.id} className={`${previewCardClass} bg-[var(--bg-secondary)]`}>
                <div className="flex items-center gap-3 px-4 py-4">
                  <button
                    type="button"
                    onClick={() => toggleTodo(todo.id)}
                    className="shrink-0 text-emerald-500 transition-colors hover:text-emerald-600"
                  >
                    <CheckCircle2 className="h-6 w-6" />
                  </button>
                  <p className="flex-1 text-[14px] text-[var(--muted)] line-through">{todo.text}</p>
                  <button type="button" onClick={() => deleteTodo(todo.id)} className={previewIconButtonClass}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";

type TodoPriority = "high" | "medium" | "low";

type TodoItem = {
  id: number;
  text: string;
  completed: boolean;
  priority: TodoPriority;
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

  const getPriorityColor = (priority: TodoPriority) => {
    if (priority === "high") return "border-l-red-500";
    if (priority === "medium") return "border-l-yellow-500";
    return "border-l-green-500";
  };

  const activeTodos = todos.filter((todo) => !todo.completed);
  const completedTodos = todos.filter((todo) => todo.completed);

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-gray-50 to-white">
      <div className="px-4 pb-4 pt-2">
        <h1 className="mb-4 text-3xl font-semibold">To-Do</h1>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Add new task..."
            value={newTodo}
            onChange={(event) => setNewTodo(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addTodo();
            }}
            className="flex-1 rounded-xl border border-transparent bg-gray-100 px-4 py-2.5 outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="button"
            onClick={addTodo}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-white shadow-md transition-transform active:scale-95"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {activeTodos.length > 0 ? (
          <section className="mb-6">
            <h2 className="mb-3 px-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Active ({activeTodos.length})
            </h2>
            <div className="space-y-2">
              {activeTodos.map((todo) => (
                <div
                  key={todo.id}
                  className={`flex items-center gap-3 rounded-xl border-l-4 bg-white p-4 shadow-sm transition-transform active:scale-[0.98] ${getPriorityColor(todo.priority)}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleTodo(todo.id)}
                    className="flex-shrink-0 text-gray-400 transition-colors hover:text-blue-500"
                  >
                    <Circle className="h-6 w-6" />
                  </button>
                  <p className="flex-1 text-gray-900">{todo.text}</p>
                  <button
                    type="button"
                    onClick={() => deleteTodo(todo.id)}
                    className="flex-shrink-0 text-gray-400 transition-colors hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {completedTodos.length > 0 ? (
          <section>
            <h2 className="mb-3 px-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Completed ({completedTodos.length})
            </h2>
            <div className="space-y-2">
              {completedTodos.map((todo) => (
                <div
                  key={todo.id}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 transition-transform active:scale-[0.98]"
                >
                  <button
                    type="button"
                    onClick={() => toggleTodo(todo.id)}
                    className="flex-shrink-0 text-green-500 transition-colors hover:text-green-600"
                  >
                    <CheckCircle2 className="h-6 w-6" />
                  </button>
                  <p className="flex-1 text-gray-400 line-through">{todo.text}</p>
                  <button
                    type="button"
                    onClick={() => deleteTodo(todo.id)}
                    className="flex-shrink-0 text-gray-400 transition-colors hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {todos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
              <CheckCircle2 className="h-10 w-10 text-gray-400" />
            </div>
            <p className="text-center text-gray-400">No tasks yet. Add one to get started!</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Edit3, Plus, Search } from "lucide-react";

type Note = {
  id: number;
  title: string;
  preview: string;
  date: string;
  color: string;
};

export function NotesPanel() {
  const [notes] = useState<Note[]>([
    {
      id: 1,
      title: "Meeting Notes",
      preview: "Discussed project timeline and deliverables...",
      date: "3/5/2026",
      color: "bg-yellow-50 border-yellow-200"
    },
    {
      id: 2,
      title: "Ideas",
      preview: "New feature concepts for the app...",
      date: "3/4/2026",
      color: "bg-blue-50 border-blue-200"
    },
    {
      id: 3,
      title: "Shopping List",
      preview: "Groceries, office supplies...",
      date: "3/3/2026",
      color: "bg-green-50 border-green-200"
    }
  ]);

  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-gray-50 to-white">
      <div className="px-4 pb-4 pt-2">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-3xl font-semibold">Notes</h1>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg transition-transform active:scale-95"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search notes"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full rounded-xl border border-transparent bg-gray-100 py-2.5 pl-10 pr-4 outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {notes.map((note) => (
          <div
            key={note.id}
            className={`${note.color} cursor-pointer rounded-2xl border p-4 shadow-sm transition-transform active:scale-[0.98]`}
          >
            <div className="mb-2 flex items-start justify-between">
              <h3 className="font-semibold text-gray-900">{note.title}</h3>
              <Edit3 className="h-4 w-4 text-gray-400" />
            </div>
            <p className="mb-2 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-gray-600">
              {note.preview}
            </p>
            <p className="text-xs text-gray-400">{note.date}</p>
          </div>
        ))}

        <button
          type="button"
          className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 p-8 transition-all hover:border-blue-400 hover:bg-blue-50/50 active:scale-[0.98]"
        >
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <Plus className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">Create new note</p>
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Edit3, Plus, Search } from "lucide-react";
import {
  previewCardClass,
  previewIconButtonClass,
  previewInputClass,
  previewLabelClass,
  previewMutedClass,
  previewPillClass,
  previewSectionTitleClass,
  previewTitleClass
} from "@/components/figma/previewTheme";

type Note = {
  id: number;
  title: string;
  preview: string;
  date: string;
  tone: string;
  tag: string;
};

const initialNotes: Note[] = [
  {
    id: 1,
    title: "Meeting Notes",
    preview: "Timeline and deliverables stayed clear once the notes were grouped into calmer cards.",
    date: "Mar 5",
    tone: "from-amber-100 to-white",
    tag: "Work"
  },
  {
    id: 2,
    title: "Ideas",
    preview: "A cleaner dashboard needs fewer loud colors and better hierarchy between actions and records.",
    date: "Mar 4",
    tone: "from-sky-100 to-white",
    tag: "Product"
  },
  {
    id: 3,
    title: "Shopping List",
    preview: "Groceries, office supplies, and Sunday prep all live in the same visual system.",
    date: "Mar 3",
    tone: "from-emerald-100 to-white",
    tag: "Home"
  }
];

export function NotesPanel() {
  const [notes] = useState<Note[]>(initialNotes);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="flex h-full flex-col px-4 pb-5">
      <div className="flex items-end justify-between pb-4 pt-2">
        <div>
          <p className={previewLabelClass}>Notebook</p>
          <h1 className={`mt-1 ${previewTitleClass}`}>Notes</h1>
        </div>
        <button type="button" className={previewIconButtonClass}>
          <Plus className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto pb-2">
        <section className={`${previewCardClass} overflow-hidden`}>
          <div className="bg-[linear-gradient(135deg,rgba(59,130,246,0.1),rgba(255,255,255,0.7))] px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={previewLabelClass}>Pinned</p>
                <h2 className="mt-2 text-[21px] font-semibold tracking-[-0.03em] text-[var(--ink)]">
                  Capture the rough draft first. Clean it later.
                </h2>
                <p className={`mt-2 max-w-[15rem] ${previewMutedClass}`}>
                  The visual treatment now matches the calmer cards used in the main diary instead of bright isolated tiles.
                </p>
              </div>
              <div className="rounded-3xl bg-white/85 px-3 py-2 text-right shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Notes</p>
                <p className="mt-1 text-[18px] font-semibold text-[var(--ink)]">{notes.length}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 px-4 py-4">
            <div className="rounded-[22px] border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Recently edited</p>
              <p className="mt-2 text-[18px] font-semibold text-[var(--ink)]">Today</p>
            </div>
            <div className="rounded-[22px] border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Focus</p>
              <p className="mt-2 text-[18px] font-semibold text-[var(--ink)]">Ideas + work</p>
            </div>
          </div>
        </section>

        <section className={`${previewCardClass} p-4`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className={previewLabelClass}>Search</p>
              <h2 className={`mt-1 ${previewSectionTitleClass}`}>Find a note quickly</h2>
            </div>
            <span className={previewPillClass}>Preview</span>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="text"
              placeholder="Search notes"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className={`${previewInputClass} pl-10 pr-4`}
            />
          </div>
        </section>

        <section className="space-y-3">
          {notes.map((note) => (
            <article
              key={note.id}
              className={`${previewCardClass} overflow-hidden transition-transform active:scale-[0.99]`}
            >
              <div className={`bg-gradient-to-br ${note.tone} px-4 py-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className={previewPillClass}>{note.tag}</span>
                    <h3 className="mt-3 text-[17px] font-semibold tracking-[-0.02em] text-[var(--ink)]">{note.title}</h3>
                    <p className={`mt-2 ${previewMutedClass}`}>{note.preview}</p>
                  </div>
                  <button type="button" className={previewIconButtonClass}>
                    <Edit3 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-[12px] font-medium text-[var(--ink-light)]">{note.date}</p>
                <button type="button" className="text-[12px] font-semibold text-[var(--primary)]">
                  Open
                </button>
              </div>
            </article>
          ))}
        </section>

        <button
          type="button"
          className={`${previewCardClass} flex w-full flex-col items-center justify-center border-dashed px-5 py-10 transition-all hover:border-blue-200 active:scale-[0.99]`}
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-secondary)]">
            <Plus className="h-6 w-6 text-[var(--muted)]" />
          </div>
          <p className="text-sm font-medium text-[var(--ink)]">Create new note</p>
          <p className={`mt-1 ${previewMutedClass}`}>Use the same card system rather than a separate floating CTA style.</p>
        </button>
      </div>
    </div>
  );
}

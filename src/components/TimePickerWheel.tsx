"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TimePickerWheelProps = {
  value: string; // "HH:MM" format
  onChange: (value: string) => void;
  appLanguage: "en" | "ko";
};

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const HALF = Math.floor(VISIBLE_ITEMS / 2);

const hours = Array.from({ length: 24 }, (_, i) => i);
const minutes = Array.from({ length: 60 }, (_, i) => i);

const pad = (n: number) => n.toString().padStart(2, "0");

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function WheelColumn({
  items,
  selected,
  onSelect,
}: {
  items: number[];
  selected: number;
  onSelect: (value: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const el = containerRef.current;
    if (!el || scrollingRef.current) return;
    el.scrollTop = selected * ITEM_HEIGHT;
  }, [selected]);

  const handleScroll = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    scrollingRef.current = true;
    timeoutRef.current = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      const index = Math.round(el.scrollTop / ITEM_HEIGHT);
      const clamped = clamp(index, 0, items.length - 1);
      el.scrollTo({ top: clamped * ITEM_HEIGHT, behavior: "smooth" });
      scrollingRef.current = false;
      onSelect(items[clamped]);
    }, 80);
  };

  return (
    <div
      ref={containerRef}
      className="hide-scrollbar relative h-[200px] w-16 overflow-y-auto overscroll-contain scroll-smooth snap-y snap-mandatory"
      onScroll={handleScroll}
      style={{
        scrollSnapType: "y mandatory",
        paddingTop: `${HALF * ITEM_HEIGHT}px`,
        paddingBottom: `${HALF * ITEM_HEIGHT}px`,
      }}
    >
      {items.map((item) => (
        <div
          key={item}
          className="flex snap-center items-center justify-center"
          style={{ height: ITEM_HEIGHT }}
        >
          <span
            className={`text-base transition-all ${
              item === selected
                ? "text-lg font-bold text-[var(--ink)]"
                : "text-sm text-[var(--muted)]"
            }`}
          >
            {pad(item)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function TimePickerWheel({
  value,
  onChange,
  appLanguage,
}: TimePickerWheelProps) {
  const isKorean = appLanguage === "ko";
  const t = useCallback((en: string, ko: string) => (isKorean ? ko : en), [isKorean]);

  const [hour, minute] = (value || "21:00").split(":").map(Number);
  const [editingHour, setEditingHour] = useState(false);
  const [editingMinute, setEditingMinute] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const handleHourSelect = (h: number) => {
    onChange(`${pad(h)}:${pad(minute)}`);
  };

  const handleMinuteSelect = (m: number) => {
    onChange(`${pad(hour)}:${pad(m)}`);
  };

  const handleInputSubmit = (type: "hour" | "minute") => {
    const num = parseInt(inputValue, 10);
    if (isNaN(num)) {
      setEditingHour(false);
      setEditingMinute(false);
      return;
    }
    if (type === "hour") {
      const clamped = clamp(num, 0, 23);
      onChange(`${pad(clamped)}:${pad(minute)}`);
      setEditingHour(false);
    } else {
      const clamped = clamp(num, 0, 59);
      onChange(`${pad(hour)}:${pad(clamped)}`);
      setEditingMinute(false);
    }
    setInputValue("");
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
      <p className="mb-3 text-center text-xs font-semibold text-[var(--ink)]">
        {t("Reminder time", "리마인더 시간")}
      </p>

      <div className="relative flex items-center justify-center gap-1">
        {/* Hour column */}
        <div className="flex flex-col items-center">
          {editingHour ? (
            <input
              type="number"
              min={0}
              max={23}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={() => handleInputSubmit("hour")}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleInputSubmit("hour");
                if (e.key === "Escape") setEditingHour(false);
              }}
              autoFocus
              className="h-10 w-16 rounded-lg border border-[var(--primary)] bg-[var(--bg)] text-center text-lg font-bold text-[var(--ink)] outline-none"
              placeholder={pad(hour)}
            />
          ) : (
            <div
              className="cursor-pointer"
              onDoubleClick={() => {
                setEditingHour(true);
                setInputValue(pad(hour));
              }}
            >
              <WheelColumn items={hours} selected={hour} onSelect={handleHourSelect} />
            </div>
          )}
          <span className="mt-1 text-[10px] text-[var(--muted)]">{t("Hour", "시")}</span>
        </div>

        {/* Separator */}
        <span className="mb-5 text-2xl font-bold text-[var(--ink)]">:</span>

        {/* Minute column */}
        <div className="flex flex-col items-center">
          {editingMinute ? (
            <input
              type="number"
              min={0}
              max={59}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={() => handleInputSubmit("minute")}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleInputSubmit("minute");
                if (e.key === "Escape") setEditingMinute(false);
              }}
              autoFocus
              className="h-10 w-16 rounded-lg border border-[var(--primary)] bg-[var(--bg)] text-center text-lg font-bold text-[var(--ink)] outline-none"
              placeholder={pad(minute)}
            />
          ) : (
            <div
              className="cursor-pointer"
              onDoubleClick={() => {
                setEditingMinute(true);
                setInputValue(pad(minute));
              }}
            >
              <WheelColumn items={minutes} selected={minute} onSelect={handleMinuteSelect} />
            </div>
          )}
          <span className="mt-1 text-[10px] text-[var(--muted)]">{t("Min", "분")}</span>
        </div>

        {/* Selection highlight */}
        <div
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/5"
          style={{
            height: ITEM_HEIGHT,
            width: "calc(100% - 1rem)",
            top: `calc(50% - ${ITEM_HEIGHT / 2}px - 10px)`,
          }}
        />
      </div>

      <p className="mt-2 text-center text-[10px] text-[var(--muted)]">
        {t("Double-tap to type directly", "더블 탭으로 직접 입력")}
      </p>
    </div>
  );
}

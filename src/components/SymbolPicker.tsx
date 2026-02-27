/**
 * SymbolPicker — 이모지 심볼 브라우저 & 관리 컴포넌트
 *
 * 사용자가 이모지를 검색/카테고리별 탐색하여
 * 자신만의 심볼 팔레트에 추가하고 라벨(의미)을 부여할 수 있습니다.
 */
"use client";

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";
import { Search, X, GripVertical, ChevronUp } from "lucide-react";
import { emojiCategories, searchEmojis } from "@/lib/emoji-data";
import type { UserSymbol } from "@/lib/user-symbols";
import { getMaxUserSymbols } from "@/lib/user-symbols";

type SymbolPickerProps = {
  currentSymbols: UserSymbol[];
  onSymbolsChange: (symbols: UserSymbol[]) => void;
  onClose: () => void;
  maxSymbols?: number;
  labelCharacterLimit?: number;
};

function SymbolPicker({
  currentSymbols,
  onSymbolsChange,
  onClose,
  maxSymbols: maxSymbolsOverride,
  labelCharacterLimit = 30
}: SymbolPickerProps) {
  const [activeCategory, setActiveCategory] = useState(emojiCategories[0].name);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingLabels, setEditingLabels] = useState<Record<string, string>>({});
  const [limitShakeState, setLimitShakeState] = useState<Record<string, boolean>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const symbolsListRef = useRef<HTMLDivElement>(null);
  const draggingSymbol = useRef<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    emoji: string;
    x: number;
    y: number;
  } | null>(null);
  const [limitReachedMessage, setLimitReachedMessage] = useState("");

  const orderedSymbols = useMemo(
    () => [...currentSymbols].sort((a, b) => a.order - b.order),
    [currentSymbols]
  );

  /** 현재 선택된 이모지 Set (빠른 조회용) */
  const selectedSet = useMemo(
    () => new Set(currentSymbols.map((s) => s.emoji)),
    [currentSymbols]
  );

  /** 검색 결과 또는 카테고리별 이모지 */
  const displayEmojis = useMemo(() => {
    if (searchQuery.trim()) {
      return searchEmojis(searchQuery);
    }
    const cat = emojiCategories.find((c) => c.name === activeCategory);
    return cat ? cat.emojis : [];
  }, [searchQuery, activeCategory]);

  /** 이모지 토글 (추가/제거) */
  const toggleEmoji = (emoji: string) => {
    if (selectedSet.has(emoji)) {
      // 제거
      const next = currentSymbols
        .filter((s) => s.emoji !== emoji)
        .map((s, i) => ({ ...s, order: i }));
      onSymbolsChange(next);
      setLimitReachedMessage("");
    } else {
      if (isLimitReached) {
        setLimitReachedMessage(`Maximum ${maxSymbols} symbols reached`);
        return;
      }
      // 추가
      const next = [
        ...currentSymbols,
        { emoji, label: "", order: currentSymbols.length },
      ];
      onSymbolsChange(next);
      setLimitReachedMessage("");
    }
  };

  /** 심볼 삭제 */
  const removeSymbol = (emoji: string) => {
    const next = currentSymbols
      .filter((s) => s.emoji !== emoji)
      .map((s, i) => ({ ...s, order: i }));
    onSymbolsChange(next);
    setLimitReachedMessage("");
  };

  /** 라벨 변경 시작 */
  const startEditLabel = (emoji: string, current: string) => {
    setEditingLabels((prev) => ({ ...prev, [emoji]: current }));
  };

  /** 라벨 변경 확정 */
  const commitLabel = (emoji: string) => {
    const label = editingLabels[emoji] ?? "";
    const next = currentSymbols.map((s) =>
      s.emoji === emoji
        ? { ...s, label: label.trim().slice(0, labelCharacterLimit) }
        : s
    );
    onSymbolsChange(next);
    setEditingLabels((prev) => {
      const copy = { ...prev };
      delete copy[emoji];
      return copy;
    });
  };

  const triggerLimitShake = (emoji: string) => {
    setLimitShakeState((prev) => ({ ...prev, [emoji]: true }));
    window.setTimeout(() => {
      setLimitShakeState((prev) => ({ ...prev, [emoji]: false }));
    }, 280);
  };

  const updateLabel = (emoji: string, nextRaw: string) => {
    const next = nextRaw.slice(0, labelCharacterLimit);
    const prev = editingLabels[emoji] ?? "";
    if (
      next.length === labelCharacterLimit &&
      prev.length < labelCharacterLimit
    ) {
      triggerLimitShake(emoji);
    }
    setEditingLabels((prevMap) => ({ ...prevMap, [emoji]: next }));
  };

  const applySymbolOrder = (nextSymbols: UserSymbol[]) => {
    const normalized = nextSymbols.map((item, index) => ({
      ...item,
      order: index
    }));
    onSymbolsChange(normalized);
  };

  const openSymbolContextMenu = (
    emoji: string,
    event: MouseEvent<HTMLDivElement>
  ) => {
    event.preventDefault();
    setContextMenu({ emoji, x: event.clientX, y: event.clientY });
  };

  const maxSymbols = maxSymbolsOverride ?? getMaxUserSymbols();
  const isLimitReached = currentSymbols.length >= maxSymbols;

  useEffect(() => {
    if (isLimitReached) {
      setLimitReachedMessage(`Maximum ${maxSymbols} symbols reached`);
      return;
    }

    setLimitReachedMessage("");
  }, [isLimitReached, maxSymbols]);

  const moveSymbolToIndex = (emoji: string, targetIndex: number) => {
    const sourceIndex = orderedSymbols.findIndex((item) => item.emoji === emoji);
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= orderedSymbols.length) {
      return;
    }

    const next = orderedSymbols.filter((item) => item.emoji !== emoji);
    const [current] = orderedSymbols.filter((item) => item.emoji === emoji);
    if (!current) return;

    next.splice(targetIndex, 0, current);
    applySymbolOrder(next);
  };

  const handleSymbolDragStart = (emoji: string, event: DragEvent<HTMLDivElement>) => {
    draggingSymbol.current = emoji;
    setIsDragging(true);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", emoji);
  };

  const handleSymbolDragOver = (emoji: string, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const from = draggingSymbol.current;
    if (!from || from === emoji) return;

    const targetIndex = orderedSymbols.findIndex((item) => item.emoji === emoji);
    if (targetIndex < 0) return;

    moveSymbolToIndex(from, targetIndex);
  };

  const handleSymbolDragEnd = (event: DragEvent<HTMLDivElement>) => {
    setIsDragging(false);
    const active = draggingSymbol.current;
    draggingSymbol.current = null;
    if (!active) return;

    const containerRect = symbolsListRef.current?.getBoundingClientRect();
    if (!containerRect) {
      removeSymbol(active);
      return;
    }

    const { clientX, clientY } = event;
    const isOutside =
      clientX < containerRect.left ||
      clientX > containerRect.right ||
      clientY < containerRect.top ||
      clientY > containerRect.bottom;

    if (isOutside) {
      removeSymbol(active);
    }
  };

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener("mousedown", closeContextMenu);
    return () => window.removeEventListener("mousedown", closeContextMenu);
  }, []);

  return (
    <div className="px-3 py-3">
      {/* ── Header ── */}
      <div className="mb-3 flex items-center justify-between">
        <span className="n-h2">Customize Symbols</span>
        <span className="text-xs text-[var(--muted)]">
          {currentSymbols.length}/{maxSymbols}
        </span>
        {limitReachedMessage ? (
          <p className="mt-1 text-xs text-[var(--danger)]">{limitReachedMessage}</p>
        ) : null}
        <button
          onClick={onClose}
          className="n-btn-ghost h-7 w-7 p-0"
          aria-label="Close"
        >
          <X className="mx-auto h-4 w-4" />
        </button>
      </div>

      {/* ── Search ── */}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <input
          ref={searchRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="n-input w-full"
          style={{ paddingLeft: "2.5rem" }}
          placeholder="Search emojis... (e.g. gym, coffee, music)"
          aria-label="Search emojis"
        />
        {searchQuery && (
          <button
            onClick={() => {
              setSearchQuery("");
              searchRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--muted)] hover:text-[var(--ink)]"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Category Tabs ── */}
      {!searchQuery && (
      <div className="n-category-tabs mb-3">
        {emojiCategories.map((cat) => (
          <button
            key={cat.name}
            onClick={() => setActiveCategory(cat.name)}
            className={`n-btn-ghost shrink-0 px-2.5 py-1.5 text-sm ${
              activeCategory === cat.name
                ? "bg-[var(--bg-hover)] font-semibold"
                : ""
            }`}
            aria-label={cat.name}
          >
            <span className="mr-1">{cat.icon}</span>
          </button>
        ))}
      </div>
      )}

      {/* ── Emoji Grid ── */}
      <div className="n-emoji-grid mb-3 max-h-[16rem] overflow-y-auto rounded-md border border-[var(--border)] p-2">
        {displayEmojis.length > 0 ? (
          displayEmojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => toggleEmoji(emoji)}
              disabled={isLimitReached && !selectedSet.has(emoji)}
              className={`n-emoji-btn ${
                selectedSet.has(emoji) ? "n-emoji-btn--selected" : ""
              } ${isLimitReached && !selectedSet.has(emoji) ? "opacity-45 cursor-not-allowed" : ""}`}
	              title={
	                selectedSet.has(emoji)
	                  ? `Remove ${emoji}`
	                  : isLimitReached
	                    ? `Maximum ${maxSymbols} symbols reached`
	                    : `Add ${emoji}`
	              }
            >
              {emoji}
            </button>
          ))
        ) : (
          <p className="n-empty col-span-full py-4 text-center">
            {searchQuery ? "No emojis found" : "Select a category"}
          </p>
        )}
      </div>

      {/* ── Your Symbols List ── */}
      {currentSymbols.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="n-label">Your Symbols</span>
            <span className="text-xs text-[var(--muted)]">
              {currentSymbols.length} selected
            </span>
          </div>
          <div
            ref={symbolsListRef}
            className="grid max-h-[16rem] divide-y divide-[var(--border)] overflow-y-auto rounded-md border border-[var(--border)]"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => event.preventDefault()}
          >
            {orderedSymbols
              .map((symbol) => {
                const isEditing = symbol.emoji in editingLabels;
                return (
                  <div
                    key={symbol.emoji}
                    draggable
                    onDragStart={(event) => handleSymbolDragStart(symbol.emoji, event)}
                    onDragOver={(event) => handleSymbolDragOver(symbol.emoji, event)}
                    onDrop={(event) => event.preventDefault()}
                    onDragEnd={handleSymbolDragEnd}
                    onContextMenu={(event) =>
                      openSymbolContextMenu(symbol.emoji, event)
                    }
                    className={`group flex items-center gap-2 px-2.5 py-2 transition-colors ${
                      isDragging ? "cursor-grab active:cursor-grabbing" : ""
                    }`}
                  >
                    {/* Drag handle */}
                    <GripVertical className="h-4 w-4 flex-shrink-0 text-[var(--muted)]" />

                    {/* 삭제 (원 안의 - 버튼) */}
                    <button
                      onClick={() => removeSymbol(symbol.emoji)}
                      className="h-6 w-6 shrink-0 rounded-full border border-[var(--danger)]/50 bg-white text-[11px] font-bold text-[var(--danger)] hover:bg-[var(--danger)]/10 dark:bg-transparent"
                      aria-label={`Remove ${symbol.emoji}`}
                      title="Remove symbol"
                    >
                      <X className="mx-auto h-3.5 w-3.5" />
                    </button>

                    {/* 이모지 */}
                    <span className="text-xl leading-none">{symbol.emoji}</span>

                    {/* 라벨 입력 */}
                    {isEditing ? (
                      <div className="min-w-0 flex-1">
                        <input
                          autoFocus
                          value={editingLabels[symbol.emoji] ?? ""}
                          onChange={(e) => updateLabel(symbol.emoji, e.target.value)}
                          onBlur={() => commitLabel(symbol.emoji)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitLabel(symbol.emoji);
                              return;
                            }

                            if (
                              e.key.length === 1 &&
                              (editingLabels[symbol.emoji]?.length ?? 0) >=
                                labelCharacterLimit
                            ) {
                              e.preventDefault();
                              triggerLimitShake(symbol.emoji);
                            }
                          }}
                          className={`n-input w-full py-1 text-sm ${
                            limitShakeState[symbol.emoji] ? "n-input-shake" : ""
                          }`}
                          placeholder="What does this mean?"
                          maxLength={labelCharacterLimit}
                        />
                        {(editingLabels[symbol.emoji]?.length ?? 0) >=
                          labelCharacterLimit && (
                          <p className="mt-1 text-xs text-[var(--danger)]" aria-live="polite">
                            {editingLabels[symbol.emoji]?.length === labelCharacterLimit
                              ? "Character limit reached"
                              : null}
                          </p>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() =>
                          startEditLabel(symbol.emoji, symbol.label)
                        }
                        className="n-btn-ghost min-w-0 flex-1 justify-start px-2 py-1 text-sm text-left"
                      >
                        {symbol.label || (
                          <span className="text-[var(--muted)]">
                            Tap to add label...
                          </span>
                        )}
                      </button>
                    )}

                  </div>
                );
              })}
          </div>
        </div>
      )}

      {contextMenu && (
          <div
            className="fixed z-30 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 shadow"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            transform: "translate(4px, 4px)",
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            onClick={(event) => {
              event.stopPropagation();
              removeSymbol(contextMenu.emoji);
              setContextMenu(null);
            }}
            className="rounded px-2 py-1 text-xs font-medium text-[var(--danger)] hover:bg-[var(--danger)]/10"
          >
            Remove
          </button>
        </div>
      )}

      {/* ── Fold / Close ── */}
      <button
        onClick={onClose}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-xs text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink)] transition-colors"
      >
        <ChevronUp className="h-3.5 w-3.5" />
        <span>Fold</span>
      </button>
    </div>
  );
}

export default memo(SymbolPicker);

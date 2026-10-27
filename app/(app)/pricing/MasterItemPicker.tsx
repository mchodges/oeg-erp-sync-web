"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MasterCatalogOption } from "@/types";
import { unitsConflict } from "@/lib/units";

/** Work-sequence order of the Master_Catalog categories; anything else follows alphabetically. */
const CATEGORY_ORDER = [
  "clearing, grubbing, and site preparation",
  "water distribution system",
  "wastewater collection system",
  "storm water collection system",
  "detention basin",
  "amenity lake",
  "low impact development landscaping",
  "excavation and paving",
  "boring & casing",
  "swppp",
  "miscellaneous",
];

const SUGGESTED = "__suggested__";

interface Group {
  key: string;
  label: string;
  items: MasterCatalogOption[];
}

function groupItems(items: MasterCatalogOption[], suggested: MasterCatalogOption | undefined): Group[] {
  const byKey = new Map<string, Group>();
  for (const item of items) {
    const label = item.category || "Uncategorized";
    const key = label.toLowerCase();
    const group = byKey.get(key);
    if (group) group.items.push(item);
    else byKey.set(key, { key, label, items: [item] });
  }
  const rank = (key: string) => {
    const i = CATEGORY_ORDER.indexOf(key);
    return i === -1 ? (key === "uncategorized" ? 1001 : 1000) : i;
  };
  const groups = [...byKey.values()].sort(
    (a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label),
  );
  for (const g of groups) {
    g.items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }
  if (suggested) groups.unshift({ key: SUGGESTED, label: "AI suggestion", items: [suggested] });
  return groups;
}

function matchesSearch(item: MasterCatalogOption, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const hay = `${item.name} ${item.category} ${item.unit}`.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

const PANEL_WIDTH = 440;
const PANEL_MAX_HEIGHT = 360;

interface Props {
  items: MasterCatalogOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  /** The bid line's unit; catalog items with a different unit get a warning mark. */
  rowUnit?: string;
  /** The AI's own guess, pinned to the top of the list when it is a real catalog item. */
  suggestedId?: string;
  /** Shown as a footer action, e.g. to add a missing item to the catalog. */
  onAddNew?: () => void;
}

export function MasterItemPicker({ items, value, onChange, disabled, rowUnit, suggestedId, onAddNew }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = items.find((i) => i.id === value);
  const suggested = suggestedId ? items.find((i) => i.id === suggestedId) : undefined;

  const visible = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = items.filter((i) => matchesSearch(i, tokens));
    // The pinned suggestion only appears while nothing is typed, so search results are not duplicated.
    const pin = tokens.length === 0 ? suggested : undefined;
    return groupItems(filtered, pin);
  }, [items, query, suggested]);

  const flat = useMemo(() => visible.flatMap((g) => g.items.map((item) => ({ item, group: g.key }))), [visible]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const choose = (id: string) => {
    onChange(id);
    close();
    buttonRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < PANEL_MAX_HEIGHT + 24 && rect.top > spaceBelow) {
      setPos({ left, bottom: window.innerHeight - rect.top + 4 });
    } else {
      setPos({ left, top: rect.bottom + 4 });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      close();
    };
    const onScrollOrResize = (e: Event) => {
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return;
      close();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = flat[active];
      if (hit) choose(hit.item.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
      buttonRef.current?.focus();
    }
  };

  let index = -1;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center justify-between gap-2 w-[240px] text-left text-xs bg-white border border-gray-300
          rounded-md px-2 py-1.5 hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500
          disabled:opacity-50"
      >
        <span className={`truncate ${selected ? "text-gray-900" : "text-gray-400"}`}>
          {selected ? selected.name : "— select a match —"}
        </span>
        <span className="text-gray-400 text-[10px]">▼</span>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: PANEL_WIDTH, zIndex: 50 }}
            className="bg-white border border-gray-300 rounded-lg shadow-xl"
            onKeyDown={onKeyDown}
          >
            <div className="p-2 border-b border-gray-100">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search: e.g. 36 hpp, 8 c900, lime…"
                className="w-full text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none
                  focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div ref={listRef} role="listbox" style={{ maxHeight: PANEL_MAX_HEIGHT - 90 }} className="overflow-y-auto">
              {flat.length === 0 && <p className="px-3 py-4 text-xs text-gray-400">No catalog items match “{query}”.</p>}
              {visible.map((g) => (
                <div key={g.key}>
                  <div className="sticky top-0 bg-gray-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    {g.label}
                  </div>
                  {g.items.map((item) => {
                    index++;
                    const i = index;
                    const conflict = rowUnit ? unitsConflict(rowUnit, item.unit) : false;
                    return (
                      <div
                        key={`${g.key}-${item.id}`}
                        role="option"
                        aria-selected={item.id === value}
                        data-index={i}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => choose(item.id)}
                        className={`flex items-center justify-between gap-3 px-3 py-1.5 text-xs cursor-pointer
                          ${i === active ? "bg-indigo-50" : ""} ${item.id === value ? "font-semibold" : ""}`}
                      >
                        <span className="text-gray-900">{item.name}</span>
                        <span
                          title={conflict ? `This line is priced per ${rowUnit}, the catalog item is per ${item.unit}` : undefined}
                          className={`shrink-0 ${conflict ? "text-amber-600 font-semibold" : "text-gray-400"}`}
                        >
                          {conflict && "⚠ "}
                          {item.unit}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {onAddNew && (
              <button
                type="button"
                onClick={() => {
                  close();
                  onAddNew();
                }}
                className="w-full text-left px-3 py-2 text-xs font-medium text-indigo-600 border-t border-gray-100
                  hover:bg-indigo-50 rounded-b-lg"
              >
                + Not in the catalog — add a new item…
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

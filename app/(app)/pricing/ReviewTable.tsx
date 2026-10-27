"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LivingMatchRecord, MasterCatalogOption } from "@/types";
import { unitsConflict } from "@/lib/units";
import { Card, ConfidenceBadge } from "./ui";
import { MasterItemPicker } from "./MasterItemPicker";

interface Props {
  records: LivingMatchRecord[];
  masterItems: MasterCatalogOption[];
  onReviewed: (recordId: string) => void;
}

type SortKey = "rawDescription" | "rawUnit" | "confidence" | "masterItem";
type SortDir = "asc" | "desc";
type Decision = "approve" | "reject";

const CONFIDENCE_RANK = { High: 0, Medium: 1, Low: 2 } as const;
const BULK_CONCURRENCY = 4;

const isNoMatch = (guess: string) => guess.trim().toUpperCase() === "NO MATCH";

export function ReviewTable({ records, masterItems, onReviewed }: Props) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [search, setSearch] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState<"All" | "High" | "Medium" | "Low">("All");
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const itemById = useMemo(() => new Map(masterItems.map((m) => [m.id, m])), [masterItems]);
  const itemByName = useMemo(() => new Map(masterItems.map((m) => [m.name, m])), [masterItems]);

  // Default to the linked Master_Item if set; otherwise try to preselect the
  // option whose name matches the AI's text guess, so the reviewer usually
  // just has to click Approve rather than search the list.
  const choiceFor = (r: LivingMatchRecord) => {
    if (choices[r.recordId] !== undefined) return choices[r.recordId];
    if (r.masterItemId) return r.masterItemId;
    return itemByName.get(r.aiGuess)?.id ?? "";
  };

  const mismatchFor = (r: LivingMatchRecord) => {
    const item = itemById.get(choiceFor(r));
    return item && unitsConflict(r.rawUnit, item.unit) ? item : undefined;
  };

  // Search and sort use the item each line started with (its link, else the AI's guess), not
  // the live dropdown choice, so a row does not jump or vanish the moment you pick a different item.
  const startingItemName = (r: LivingMatchRecord) =>
    itemById.get(r.masterItemId || itemByName.get(r.aiGuess)?.id || "")?.name ?? "";

  const visible = useMemo(() => {
    const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = records.filter((r) => {
      if (confidenceFilter !== "All" && r.confidence !== confidenceFilter) return false;
      if (tokens.length === 0) return true;
      const hay = `${r.rawDescription} ${startingItemName(r)} ${r.aiGuess}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      let cmp: number;
      if (sort.key === "confidence") cmp = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
      else if (sort.key === "masterItem") {
        cmp = startingItemName(a).localeCompare(startingItemName(b), undefined, { numeric: true });
      } else cmp = a[sort.key].localeCompare(b[sort.key], undefined, { numeric: true });
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [records, search, confidenceFilter, sort, itemById, itemByName]);

  const selectedVisible = visible.filter((r) => selected.has(r.recordId));
  const allVisibleSelected = visible.length > 0 && selectedVisible.length === visible.length;
  const someVisibleSelected = selectedVisible.length > 0 && !allVisibleSelected;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected;
  }, [someVisibleSelected]);

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) for (const r of visible) next.delete(r.recordId);
      else for (const r of visible) next.add(r.recordId);
      return next;
    });

  /** Sends one decision; throws on failure so callers decide how to report it. */
  const send = async (recordId: string, decision: Decision, masterItemId?: string) => {
    const res = await fetch(`/api/pricing/living-matches/${recordId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, masterItemId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `Server error ${res.status}`);
    }
  };

  const review = async (recordId: string, decision: Decision, masterItemId?: string) => {
    setPending((p) => ({ ...p, [recordId]: true }));
    try {
      await send(recordId, decision, masterItemId);
      setSelected((prev) => {
        if (!prev.has(recordId)) return prev;
        const next = new Set(prev);
        next.delete(recordId);
        return next;
      });
      onReviewed(recordId);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setPending((p) => ({ ...p, [recordId]: false }));
    }
  };

  const runBulk = async (decision: Decision) => {
    const rows = selectedVisible;
    const targets = decision === "approve" ? rows.filter((r) => choiceFor(r)) : rows;
    const skipped = rows.length - targets.length;
    if (targets.length === 0) {
      alert("None of the selected lines has a catalog item chosen yet.");
      return;
    }

    const lines: string[] = [];
    if (decision === "approve") {
      lines.push(`Approve ${targets.length} line${targets.length === 1 ? "" : "s"} with the catalog item shown on each row?`);
      if (skipped > 0) lines.push(`${skipped} selected line${skipped === 1 ? " has" : "s have"} no item chosen and will be skipped.`);
      const mismatched = targets.filter((r) => mismatchFor(r)).length;
      if (mismatched > 0) {
        lines.push(
          mismatched === 1
            ? "1 of them has a unit that differs from the catalog item; its prices will be left out of the pricing report."
            : `${mismatched} of them have a unit that differs from the catalog item; their prices will be left out of the pricing report.`,
        );
      }
    } else {
      lines.push(`Mark ${targets.length} line${targets.length === 1 ? "" : "s"} as "No catalog match"?`);
      lines.push("They will be left out of pricing and will not be asked about again.");
    }
    if (!window.confirm(lines.join("\n\n"))) return;

    setBulk({ done: 0, total: targets.length });
    setPending((p) => {
      const next = { ...p };
      for (const r of targets) next[r.recordId] = true;
      return next;
    });

    const failures: string[] = [];
    let cursor = 0;
    let done = 0;
    const worker = async () => {
      while (cursor < targets.length) {
        const r = targets[cursor++];
        try {
          await send(r.recordId, decision, decision === "approve" ? choiceFor(r) : undefined);
          setSelected((prev) => {
            const next = new Set(prev);
            next.delete(r.recordId);
            return next;
          });
          onReviewed(r.recordId);
        } catch (e) {
          failures.push(e instanceof Error ? e.message : String(e));
          setPending((p) => ({ ...p, [r.recordId]: false }));
        }
        done++;
        setBulk({ done, total: targets.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, targets.length) }, worker));
    setBulk(null);
    if (failures.length > 0) {
      alert(`${failures.length} of ${targets.length} could not be saved and are still in the list.\n\n${failures[0]}`);
    }
  };

  if (records.length === 0) {
    return (
      <Card className="px-6 py-12 text-center text-gray-400 text-sm">
        No pending matches to review.
      </Card>
    );
  }

  const header = (label: string, key: SortKey, className = "px-4 py-3") => {
    const active = sort?.key === key;
    return (
      <th
        onClick={() => toggleSort(key)}
        className={`${className} font-medium cursor-pointer select-none hover:text-gray-700`}
      >
        {label}
        <span className={`ml-1 inline-block w-3 ${active ? "text-gray-600" : "text-gray-300"}`}>
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "▲"}
        </span>
      </th>
    );
  };

  return (
    <Card className="overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Pending AI matches</h2>
        <span className="text-sm text-gray-400">
          {visible.length === records.length
            ? `${records.length} to review`
            : `${visible.length} shown of ${records.length}`}
        </span>
      </div>

      <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search descriptions or catalog items…"
          className="text-sm border border-gray-300 rounded-md px-3 py-1.5 w-72 focus:outline-none
            focus:ring-2 focus:ring-indigo-500"
        />
        <label className="text-xs text-gray-500 flex items-center gap-1.5">
          Confidence
          <select
            value={confidenceFilter}
            onChange={(e) => setConfidenceFilter(e.target.value as typeof confidenceFilter)}
            className="text-xs border border-gray-300 rounded-md px-2 py-1.5"
          >
            <option>All</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          {bulk ? (
            <span className="text-xs text-gray-500">
              Saving {bulk.done} of {bulk.total}…
            </span>
          ) : (
            selectedVisible.length > 0 && (
              <>
                <span className="text-xs text-gray-600">{selectedVisible.length} selected</span>
                <button
                  onClick={() => runBulk("approve")}
                  className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-md hover:bg-green-700"
                >
                  Approve selected
                </button>
                <button
                  onClick={() => runBulk("reject")}
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-semibold rounded-md hover:bg-gray-300"
                >
                  No match for selected
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Clear
                </button>
              </>
            )
          )}
        </div>
      </div>

      <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="pl-5 pr-2 py-3 w-8">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  disabled={visible.length === 0 || !!bulk}
                  aria-label="Select all shown lines"
                />
              </th>
              {header("Raw Description", "rawDescription", "px-3 py-3")}
              {header("Unit", "rawUnit")}
              {header("Confidence", "confidence")}
              {header("Master Item", "masterItem")}
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">
                  No lines match the search or filter.
                </td>
              </tr>
            )}
            {visible.map((r) => {
              const mismatch = mismatchFor(r);
              const aiNoMatch = isNoMatch(r.aiGuess);
              return (
                <tr key={r.recordId} className="hover:bg-gray-50 transition-colors">
                  <td className="pl-5 pr-2 py-3 align-top">
                    <input
                      type="checkbox"
                      checked={selected.has(r.recordId)}
                      onChange={() => toggleRow(r.recordId)}
                      disabled={pending[r.recordId]}
                      aria-label="Select this line"
                    />
                  </td>
                  <td className="px-3 py-3 text-gray-900 max-w-md whitespace-normal break-words">
                    {r.rawDescription}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{r.rawUnit}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <ConfidenceBadge confidence={r.confidence} />
                  </td>
                  <td className="px-4 py-3">
                    <MasterItemPicker
                      items={masterItems}
                      value={choiceFor(r)}
                      onChange={(id) => setChoices((c) => ({ ...c, [r.recordId]: id }))}
                      disabled={pending[r.recordId]}
                      rowUnit={r.rawUnit}
                      suggestedId={itemByName.get(r.aiGuess)?.id}
                    />
                    {aiNoMatch && !choiceFor(r) && (
                      <p className="mt-1 text-[11px] text-gray-500">
                        The AI found no suitable catalog item.
                      </p>
                    )}
                    {mismatch && (
                      <p className="mt-1 text-[11px] text-amber-700 max-w-[240px]">
                        ⚠ This line is priced per {r.rawUnit}; “{mismatch.name}” is per {mismatch.unit}.
                        Its prices will be left out of the report.
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap align-top">
                    <button
                      onClick={() => review(r.recordId, "approve", choiceFor(r))}
                      disabled={pending[r.recordId] || !choiceFor(r)}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-md
                        hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed mr-2"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => review(r.recordId, "reject")}
                      disabled={pending[r.recordId]}
                      title="No catalog item fits this line. It is left out of pricing and not asked about again."
                      className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-semibold rounded-md
                        hover:bg-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      No match
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

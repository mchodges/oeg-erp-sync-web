"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LivingMatchRecord, MasterCatalogOption } from "@/types";
import { CATALOG_UNITS, normalizeUnit } from "@/lib/units";
import { distinctCategories } from "@/lib/catalogCategories";
import { Spinner } from "./ui";

interface Props {
  record: LivingMatchRecord;
  items: MasterCatalogOption[];
  onCancel: () => void;
  /** Called once the item exists in the catalog; the caller then approves the line to it. */
  onAdded: (item: MasterCatalogOption) => void;
}

export function AddCatalogItemDialog({ record, items, onCancel, onAdded }: Props) {
  const categories = useMemo(() => distinctCategories(items), [items]);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState(normalizeUnit(record.rawUnit));
  const [category, setCategory] = useState("");
  const [proposing, setProposing] = useState(true);
  const [proposalNote, setProposalNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  // Ask the AI for a starting point; the reviewer can still type over any field.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/pricing/master-catalog/propose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: record.rawDescription, unit: record.rawUnit }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
        if (cancelled) return;
        setName(data.name ?? "");
        if (data.unit) setUnit(data.unit);
        setCategory(categories.find((c) => c.toLowerCase() === String(data.category).toLowerCase()) ?? "");
        setProposalNote("Filled in by the AI. Check it and edit anything that is off.");
      } catch (e) {
        if (!cancelled) {
          setProposalNote(
            `The AI could not suggest an entry (${e instanceof Error ? e.message : String(e)}). Fill it in by hand.`,
          );
        }
      } finally {
        if (!cancelled) setProposing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [record.recordId]);

  useEffect(() => {
    if (!proposing) nameRef.current?.focus();
  }, [proposing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  const canSave = !proposing && !saving && name.trim() !== "" && unit !== "" && category !== "";

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/pricing/master-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, unit, category }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      onAdded(data as MasterCatalogOption);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Add a new catalog item" className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Add a new item to the Master Catalog</h2>
          <p className="mt-1 text-xs text-gray-500">
            This creates the item in Airtable and approves the line below to it. Every bid line with this
            exact description will be priced under the new item from now on.
          </p>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
            <span className="font-medium text-gray-500">Bid line ({record.rawUnit || "no unit"}): </span>
            {record.rawDescription}
          </div>

          {proposing ? (
            <div className="flex items-center gap-3 py-6 justify-center text-sm text-gray-500">
              <Spinner /> Asking the AI for a suggested name…
            </div>
          ) : (
            <>
              {proposalNote && <p className="text-xs text-gray-500">{proposalNote}</p>}
              <label className="block text-xs font-medium text-gray-600">
                Item name
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={200}
                  className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none
                    focus:ring-2 focus:ring-indigo-500"
                />
              </label>
              <div className="flex gap-4">
                <label className="block text-xs font-medium text-gray-600 w-28">
                  Unit
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="mt-1 w-full text-sm border border-gray-300 rounded-md px-2 py-2"
                  >
                    {!unit && <option value="">—</option>}
                    {CATALOG_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-gray-600 flex-1">
                  Category
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 w-full text-sm border border-gray-300 rounded-md px-2 py-2"
                  >
                    {!category && <option value="">— choose a category —</option>}
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg border border-gray-300 hover:bg-gray-50
              disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Adding…" : "Add to catalog and approve"}
          </button>
        </div>
      </div>
    </div>
  );
}

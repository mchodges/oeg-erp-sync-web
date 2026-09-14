"use client";

import { useState } from "react";
import type { LivingMatchRecord, MasterCatalogOption } from "@/types";
import { Card, ConfidenceBadge } from "./ui";

interface Props {
  records: LivingMatchRecord[];
  masterItems: MasterCatalogOption[];
  onReviewed: (recordId: string) => void;
}

export function ReviewTable({ records, masterItems, onReviewed }: Props) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});

  // Default to the linked Master_Item if set; otherwise try to preselect the
  // option whose name matches the AI's text guess, so the reviewer usually
  // just has to click Approve rather than search the dropdown.
  const choiceFor = (r: LivingMatchRecord) => {
    if (choices[r.recordId] !== undefined) return choices[r.recordId];
    if (r.masterItemId) return r.masterItemId;
    return masterItems.find((m) => m.name === r.aiGuess)?.id ?? "";
  };

  const review = async (recordId: string, decision: "approve" | "reject", masterItemId?: string) => {
    setPending((p) => ({ ...p, [recordId]: true }));
    try {
      const res = await fetch(`/api/pricing/living-matches/${recordId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, masterItemId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }
      onReviewed(recordId);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setPending((p) => ({ ...p, [recordId]: false }));
    }
  };

  if (records.length === 0) {
    return (
      <Card className="px-6 py-12 text-center text-gray-400 text-sm">
        No pending matches to review.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Pending AI matches</h2>
        <span className="text-sm text-gray-400">{records.length} to review</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-5 py-3 font-medium">Raw Description</th>
              <th className="px-4 py-3 font-medium">Unit</th>
              <th className="px-4 py-3 font-medium">Confidence</th>
              <th className="px-4 py-3 font-medium">Master Item</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {records.map((r) => (
              <tr key={r.recordId} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 text-gray-900 max-w-xs truncate" title={r.rawDescription}>
                  {r.rawDescription}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{r.rawUnit}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <ConfidenceBadge confidence={r.confidence} />
                </td>
                <td className="px-4 py-3">
                  <select
                    value={choiceFor(r)}
                    onChange={(e) =>
                      setChoices((c) => ({ ...c, [r.recordId]: e.target.value }))
                    }
                    disabled={pending[r.recordId]}
                    className="text-xs border border-gray-300 rounded-md px-2 py-1.5 max-w-[220px]
                      focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {!choiceFor(r) && <option value="">— select a match —</option>}
                    {masterItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
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
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-semibold rounded-md
                      hover:bg-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

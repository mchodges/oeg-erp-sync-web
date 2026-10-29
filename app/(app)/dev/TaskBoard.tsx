"use client";

import { useState } from "react";
import type { DevTask } from "@/lib/devTasks";

type Filter = "open" | "done" | "wontdo" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
  { value: "wontdo", label: "Won't do" },
  { value: "all", label: "All" },
];

function inFilter(task: DevTask, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "done") return task.status === "Done";
  if (filter === "wontdo") return task.status === "Won't Do";
  return task.status !== "Done" && task.status !== "Won't Do";
}

const PRIORITY_CLASS: Record<string, string> = {
  High: "bg-red-100 text-red-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-gray-100 text-gray-500",
};

const STATUS_CLASS: Record<string, string> = {
  "In Progress": "bg-yellow-100 text-yellow-800",
  "Not Started": "bg-gray-100 text-gray-600",
  Answered: "bg-cyan-100 text-cyan-800",
  Done: "bg-green-100 text-green-800",
  "Won't Do": "bg-red-50 text-red-700",
};

function Badge({ text, cls }: { text: string; cls: string }) {
  if (!text) return null;
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{text}</span>;
}

export function TaskBoard({ tasks }: { tasks: DevTask[] }) {
  const [filter, setFilter] = useState<Filter>("open");
  const shown = tasks.filter((t) => inFilter(t, filter));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
              filter === f.value
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            {f.label} ({tasks.filter((t) => inFilter(t, f.value)).length})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="px-1 py-4 text-sm text-gray-400">Nothing here.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {shown.map((t) => (
            <li key={t.id}>
              <details className="group">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-2.5 text-sm text-gray-900 hover:bg-gray-50">
                  <span className="min-w-0 flex-1 font-medium">{t.title}</span>
                  <Badge text={t.priority} cls={PRIORITY_CLASS[t.priority] ?? "bg-gray-100 text-gray-500"} />
                  <Badge text={t.type} cls="bg-indigo-50 text-indigo-700" />
                  <Badge text={t.status} cls={STATUS_CLASS[t.status] ?? "bg-gray-100 text-gray-600"} />
                </summary>
                <div className="space-y-3 px-4 pb-4 pt-1 text-sm text-gray-700">
                  {t.description && <p className="whitespace-pre-wrap">{t.description}</p>}
                  {t.resolutionNotes && (
                    <div className="rounded-md bg-gray-50 px-3 py-2">
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</div>
                      <p className="whitespace-pre-wrap">{t.resolutionNotes}</p>
                    </div>
                  )}
                  {!t.description && !t.resolutionNotes && <p className="text-gray-400">No details.</p>}
                  {t.dateAdded && <p className="text-xs text-gray-400">Added {t.dateAdded}</p>}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useState, useCallback, useRef } from "react";
import type { PlanResult, ProjectAction, SyncResult } from "@/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

function topPositions(pos: Record<string, number>, n = 3): string {
  return (
    Object.entries(pos)
      .sort(([, a], [, b]) => b - a)
      .slice(0, n)
      .filter(([, h]) => h > 0)
      .map(([p, h]) => `${p}: ${h.toFixed(1)}`)
      .join(", ") || "—"
  );
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: ProjectAction["action"] }) {
  const map: Record<ProjectAction["action"], { label: string; cls: string }> = {
    CREATE:       { label: "CREATE",     cls: "bg-green-100 text-green-800" },
    UPDATE:       { label: "UPDATE",     cls: "bg-blue-100 text-blue-800" },
    "SKIP-TODAY": { label: "synced",     cls: "bg-gray-100 text-gray-500" },
    "SKIP-NOERP": { label: "no codes",  cls: "bg-gray-100 text-gray-500" },
    NOMATCH:      { label: "no match",   cls: "bg-amber-100 text-amber-700" },
  };
  const { label, cls } = map[action];
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-6 w-6 text-indigo-600"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v8H4z"
      />
    </svg>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type AppState = "idle" | "planning" | "preview" | "syncing" | "done" | "error";

export default function Home() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [plan, setPlan]         = useState<PlanResult | null>(null);
  const [result, setResult]     = useState<SyncResult | null>(null);
  const [error, setError]       = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setAppState("idle");
    setPlan(null);
    setResult(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Please upload an .xlsx file.");
      setAppState("error");
      return;
    }
    setAppState("planning");
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch("/api/plan", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      setPlan(data as PlanResult);
      setAppState("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAppState("error");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleSync = useCallback(async () => {
    if (!plan) return;
    setAppState("syncing");
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.plan, filename: plan.filename }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      setResult(data as SyncResult);
      setAppState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAppState("error");
    }
  }, [plan]);

  // Derived counts (only used in preview state)
  const writable     = plan?.plan.filter((p) => p.action === "CREATE" || p.action === "UPDATE") ?? [];
  const nCreate      = writable.filter((p) => p.action === "CREATE").length;
  const nUpdate      = writable.filter((p) => p.action === "UPDATE").length;
  const nSkipToday   = plan?.plan.filter((p) => p.action === "SKIP-TODAY").length ?? 0;
  const nNoErp       = plan?.plan.filter((p) => p.action === "SKIP-NOERP").length ?? 0;
  const nNoMatch     = plan?.plan.filter((p) => p.action === "NOMATCH").length ?? 0;

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-indigo-700 px-6 py-4 shadow">
        <h1 className="text-xl font-semibold text-white tracking-tight">
          OEG ERP Hours Sync
        </h1>
        <p className="text-indigo-300 text-sm mt-0.5">
          DPP Projects → Hours Table
        </p>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-5">

        {/* ── IDLE: upload zone ─────────────────────────────────────────── */}
        {appState === "idle" && (
          <div
            role="button"
            tabIndex={0}
            className={`rounded-xl border-2 border-dashed transition-colors cursor-pointer
              ${isDragging
                ? "border-indigo-500 bg-indigo-50"
                : "border-gray-300 bg-white hover:border-indigo-400 hover:bg-gray-50"
              }`}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center justify-center py-20 px-8 text-center select-none">
              <div className="text-5xl mb-4">📂</div>
              <p className="text-gray-700 font-semibold text-lg">
                Drop your ERP report here
              </p>
              <p className="text-gray-500 text-sm mt-1">
                or click to browse · .xlsx only
              </p>
              <p className="text-gray-400 text-xs mt-4">
                Reads sheet: "Time and Expenses Summarized"
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
        )}

        {/* ── PLANNING / SYNCING: loading ───────────────────────────────── */}
        {(appState === "planning" || appState === "syncing") && (
          <Card className="px-8 py-20 flex flex-col items-center gap-4">
            <Spinner />
            <p className="text-gray-600 font-medium">
              {appState === "planning"
                ? "Parsing report and fetching Airtable projects…"
                : "Writing to Airtable…"}
            </p>
            <p className="text-gray-400 text-sm">This may take a few seconds.</p>
          </Card>
        )}

        {/* ── PREVIEW: plan table ───────────────────────────────────────── */}
        {appState === "preview" && plan && (
          <>
            {/* Parse stats bar */}
            <Card className="px-6 py-3.5 flex flex-wrap items-center gap-6 text-sm">
              <span>
                <strong className="text-gray-900">
                  {plan.parseStats.totalRows.toLocaleString()}
                </strong>
                <span className="text-gray-500 ml-1.5">title rows parsed</span>
              </span>
              <span>
                <strong className="text-gray-900">
                  {plan.parseStats.uniqueCodes.toLocaleString()}
                </strong>
                <span className="text-gray-500 ml-1.5">unique ERP codes</span>
              </span>
              <span className="ml-auto font-mono text-gray-400 text-xs truncate max-w-[240px]">
                {plan.filename}
              </span>
            </Card>

            {/* Writable actions table */}
            <Card className="overflow-hidden">
              <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">
                  Records to write
                </h2>
                <span className="text-sm text-gray-400">
                  {nCreate} create · {nUpdate} update
                </span>
              </div>

              {writable.length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-400 text-sm">
                  No records to write — all projects are skipped or unmatched.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                        <th className="px-5 py-3 font-medium">Project #</th>
                        <th className="px-4 py-3 font-medium">Action</th>
                        <th className="px-4 py-3 font-medium">ERP Codes</th>
                        <th className="px-4 py-3 font-medium text-right">
                          Total Hrs
                        </th>
                        <th className="px-4 py-3 font-medium">Top 3 Positions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {writable.map((item, i) => {
                        const codes = (item.atCodes ?? []).join(", ");
                        return (
                          <tr key={i} className="hover:bg-gray-50 transition-colors">
                            <td className="px-5 py-3 font-mono text-xs text-gray-900 whitespace-nowrap">
                              {item.projNum}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <ActionBadge action={item.action} />
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 max-w-[180px]">
                              <span
                                className="block truncate"
                                title={codes}
                              >
                                {codes}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-gray-900 whitespace-nowrap">
                              {fmt(item.totalHrs ?? 0)}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600">
                              {item.positionHours
                                ? topPositions(item.positionHours)
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Other-action summary */}
            {(nSkipToday + nNoErp + nNoMatch) > 0 && (
              <div className="px-5 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-500 flex flex-wrap gap-5">
                {nSkipToday > 0 && (
                  <span>
                    <strong className="text-gray-700">{nSkipToday}</strong>{" "}
                    already synced today
                  </span>
                )}
                {nNoMatch > 0 && (
                  <span>
                    <strong className="text-gray-700">{nNoMatch}</strong>{" "}
                    no report match
                  </span>
                )}
                {nNoErp > 0 && (
                  <span>
                    <strong className="text-gray-700">{nNoErp}</strong>{" "}
                    no ERP codes configured
                  </span>
                )}
              </div>
            )}

            {/* Unrecognized titles (collapsible) */}
            {Object.keys(plan.unrecognized).length > 0 && (
              <details className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm">
                <summary className="cursor-pointer font-medium text-amber-800">
                  {Object.keys(plan.unrecognized).length} unrecognized title(s)
                  — hours not written to Airtable
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-amber-700">
                  {Object.entries(plan.unrecognized)
                    .sort(([, a], [, b]) => b - a)
                    .map(([title, hrs]) => (
                      <li key={title}>
                        <span className="font-mono">{hrs.toFixed(2)} hrs</span>{" "}
                        — {title}
                      </li>
                    ))}
                </ul>
                <p className="mt-2 text-xs text-amber-600">
                  Add these to TITLE_MAP in lib/erpCodes.ts to track them.
                </p>
              </details>
            )}

            {/* CTA buttons */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleSync}
                disabled={writable.length === 0}
                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold
                  rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed
                  focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                  transition-colors"
              >
                Confirm Sync —{" "}
                {nCreate > 0 && `${nCreate} create${nCreate !== 1 ? "s" : ""}`}
                {nCreate > 0 && nUpdate > 0 && ", "}
                {nUpdate > 0 && `${nUpdate} update${nUpdate !== 1 ? "s" : ""}`}
              </button>
              <button
                onClick={reset}
                className="px-5 py-2.5 text-gray-600 text-sm font-medium rounded-lg
                  border border-gray-300 hover:bg-gray-50
                  focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2
                  transition-colors"
              >
                Start Over
              </button>
            </div>
          </>
        )}

        {/* ── DONE ──────────────────────────────────────────────────────── */}
        {appState === "done" && result && (
          <Card className="px-8 py-8">
            <div className="flex items-center gap-3 mb-7">
              <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-lg font-bold">
                ✓
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Sync complete
                </h2>
                <p className="text-sm text-gray-500">{result.today}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
              {[
                { label: "Created",       value: result.created,      color: "green" },
                { label: "Updated",       value: result.updated,      color: "blue" },
                { label: "Skipped today", value: result.skippedToday, color: "gray" },
                { label: "No match",      value: result.noMatch,      color: "gray" },
                { label: "No ERP codes",  value: result.noErp,        color: "gray" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-gray-50 rounded-lg px-5 py-4">
                  <div
                    className={`text-3xl font-bold ${
                      color === "green"
                        ? "text-green-700"
                        : color === "blue"
                        ? "text-blue-700"
                        : "text-gray-700"
                    }`}
                  >
                    {value}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{label}</div>
                </div>
              ))}

              <div className="bg-indigo-50 rounded-lg px-5 py-4">
                <div className="text-3xl font-bold text-indigo-700">
                  {fmt(result.totalHrs)}
                </div>
                <div className="text-xs text-gray-500 mt-1">total hours written</div>
              </div>
            </div>

            <button
              onClick={reset}
              className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg
                hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500
                focus:ring-offset-2 transition-colors"
            >
              Sync Another File
            </button>
          </Card>
        )}

        {/* ── ERROR ─────────────────────────────────────────────────────── */}
        {appState === "error" && (
          <Card className="px-8 py-8 border-red-200">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-lg font-bold">
                !
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                Something went wrong
              </h2>
            </div>
            <pre className="text-sm text-red-700 bg-red-50 rounded-lg p-4 mb-6 whitespace-pre-wrap break-all font-mono">
              {error}
            </pre>
            <button
              onClick={reset}
              className="px-5 py-2.5 bg-gray-800 text-white text-sm font-semibold rounded-lg
                hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500
                focus:ring-offset-2 transition-colors"
            >
              Try Again
            </button>
          </Card>
        )}

      </div>
    </main>
  );
}

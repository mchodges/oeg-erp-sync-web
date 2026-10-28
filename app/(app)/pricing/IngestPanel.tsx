"use client";

import { useCallback, useRef, useState } from "react";
import type {
  HarvestPlanResult,
  HarvestSyncResult,
  LivingMatchRecord,
  MasterCatalogOption,
  UnmatchedItem,
} from "@/types";
import { Card, Spinner, ErrorCard } from "./ui";
import { ReviewTable } from "./ReviewTable";

type AppState =
  | "idle"
  | "planning"
  | "preview"
  | "syncing"
  | "harvested"
  | "scanning"
  | "matching"
  | "review"
  | "error";

const BATCH_SIZE = 25;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function IngestPanel() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [plan, setPlan] = useState<HarvestPlanResult | null>(null);
  const [syncResult, setSyncResult] = useState<HarvestSyncResult | null>(null);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [matchProgress, setMatchProgress] = useState({ current: 0, total: 0 });
  const [reviewRecords, setReviewRecords] = useState<LivingMatchRecord[]>([]);
  const [masterItems, setMasterItems] = useState<MasterCatalogOption[]>([]);
  const [autoApproved, setAutoApproved] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setAppState("idle");
    setPlan(null);
    setSyncResult(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const processFiles = useCallback(async (files: File[]) => {
    const xlsxFiles = files.filter((f) => f.name.toLowerCase().endsWith(".xlsx"));
    if (xlsxFiles.length === 0) {
      setError("Please upload .xlsx bid tab files.");
      setAppState("error");
      return;
    }
    setAppState("planning");
    setError("");
    try {
      const fd = new FormData();
      for (const f of xlsxFiles) fd.append("files", f);
      const res = await fetch("/api/pricing/harvest-plan", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      setPlan(data as HarvestPlanResult);
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
      processFiles(Array.from(e.dataTransfer.files));
    },
    [processFiles],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      processFiles(Array.from(e.target.files ?? []));
    },
    [processFiles],
  );

  const handleSync = useCallback(async () => {
    if (!plan) return;
    setAppState("syncing");
    try {
      const files = plan.files.filter((f) => f.rows.length > 0);
      const res = await fetch("/api/pricing/harvest-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      setSyncResult(data as HarvestSyncResult);
      setAppState("harvested");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAppState("error");
    }
  }, [plan]);

  const loadReview = useCallback(async () => {
    try {
      const res = await fetch("/api/pricing/living-matches");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      setReviewRecords(data.records);
      setMasterItems(data.masterItems);
      setAppState("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAppState("error");
    }
  }, []);

  const scanAndMatch = useCallback(async () => {
    setAppState("scanning");
    setError("");
    setAutoApproved(0);
    try {
      const res = await fetch("/api/pricing/unmatched");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      const items: UnmatchedItem[] = data.items;

      if (items.length === 0) {
        await loadReview();
        return;
      }

      const batches = chunk(items, BATCH_SIZE);
      setAppState("matching");
      setMatchProgress({ current: 0, total: batches.length });

      let autoTotal = 0;
      for (let i = 0; i < batches.length; i++) {
        const res = await fetch("/api/pricing/ai-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: batches[i] }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
        autoTotal += data.autoApproved ?? 0;
        setAutoApproved(autoTotal);
        setMatchProgress({ current: i + 1, total: batches.length });
      }

      await loadReview();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAppState("error");
    }
  }, [loadReview]);

  const handleReviewed = useCallback((recordId: string) => {
    setReviewRecords((records) => records.filter((r) => r.recordId !== recordId));
  }, []);

  const handleCatalogItemAdded = useCallback((item: MasterCatalogOption) => {
    setMasterItems((items) =>
      [...items, item].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    );
  }, []);

  return (
    <div className={`space-y-5 ${appState === "review" ? "" : "max-w-5xl"}`}>
      {appState === "idle" && (
        <>
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
              <div className="text-5xl mb-4">📋</div>
              <p className="text-gray-700 font-semibold text-lg">
                Drop bid tab files here
              </p>
              <p className="text-gray-500 text-sm mt-1">
                or click to browse · .xlsx, multiple files OK
              </p>
              <p className="text-gray-400 text-xs mt-4">
                Only new/never-uploaded files need to be added — history persists.
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              multiple
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
          <div className="text-center space-x-4">
            <button
              onClick={scanAndMatch}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Scan for AI matches →
            </button>
            <button
              onClick={loadReview}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Review pending AI matches instead →
            </button>
          </div>
        </>
      )}

      {(appState === "planning" || appState === "syncing" || appState === "scanning") && (
        <Card className="px-8 py-20 flex flex-col items-center gap-4">
          <Spinner />
          <p className="text-gray-600 font-medium">
            {appState === "planning" && "Parsing bid tab files…"}
            {appState === "syncing" && "Writing to bid history…"}
            {appState === "scanning" && "Scanning for unmatched items…"}
          </p>
        </Card>
      )}

      {appState === "matching" && (
        <Card className="px-8 py-20 flex flex-col items-center gap-4">
          <Spinner />
          <p className="text-gray-600 font-medium">
            Matching new items with AI — batch {matchProgress.current} of {matchProgress.total}
          </p>
          {autoApproved > 0 && (
            <p className="text-sm text-gray-400">{autoApproved} approved automatically so far</p>
          )}
        </Card>
      )}

      {appState === "preview" && plan && (
        <>
          <Card className="overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Files parsed</h2>
              <span className="text-sm text-gray-400">
                {plan.totalNewRows.toLocaleString()} new rows total
              </span>
            </div>
            <div className="divide-y divide-gray-50">
              {plan.files.map((f, i) => (
                <div key={i} className="px-6 py-4">
                  {f.error ? (
                    <div>
                      <p className="text-sm font-medium text-gray-900">{f.filename}</p>
                      <p className="text-xs text-red-600 mt-1">{f.error}</p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{f.filename}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {f.projectName ?? "Unknown project"} · {f.bidDate ?? "Unknown date"}
                        </p>
                        {f.duplicateOfFiles && f.duplicateOfFiles.length > 0 && (
                          <p className="text-xs text-amber-700 mt-0.5">
                            Same rows already ingested from: {f.duplicateOfFiles.join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 whitespace-nowrap">
                        <span className="font-semibold text-gray-900">{f.newRows}</span> new
                        {f.duplicateRows > 0 && (
                          <span className="text-gray-400">
                            {" "}
                            · {f.duplicateRows} already in history
                          </span>
                        )}
                        {(f.repeatedRows ?? 0) > 0 && (
                          <span className="text-gray-400">
                            {" "}
                            · {f.repeatedRows} repeated in file
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {!f.error && (f.repeatedRows ?? 0) > 0 && (
                    <details className="mt-2 text-xs text-gray-500">
                      <summary className="cursor-pointer text-amber-700">
                        Why are {f.repeatedRows} lines being skipped?
                      </summary>
                      <p className="mt-1.5 max-w-2xl">
                        These lines appear more than once in this file with the same contractor,
                        description, quantity and price. Each is stored once. Prices are not
                        affected, because the pricing report counts a repeated price once anyway.
                      </p>
                      <ul className="mt-1.5 space-y-0.5 max-w-2xl">
                        {(f.repeatedSamples ?? []).map((r, j) => (
                          <li key={j} className="truncate">
                            {r.contractor} · {r.originalDescription} · {r.qty} {r.unit} @ {r.price}
                          </li>
                        ))}
                        {(f.repeatedRows ?? 0) > (f.repeatedSamples?.length ?? 0) && (
                          <li>
                            …and {(f.repeatedRows ?? 0) - (f.repeatedSamples?.length ?? 0)} more
                          </li>
                        )}
                      </ul>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSync}
              disabled={plan.totalNewRows === 0}
              className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold
                rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                transition-colors"
            >
              Confirm Ingest — {plan.totalNewRows.toLocaleString()} rows
            </button>
            <button
              onClick={reset}
              className="px-5 py-2.5 text-gray-600 text-sm font-medium rounded-lg
                border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Start Over
            </button>
          </div>
        </>
      )}

      {appState === "harvested" && syncResult && (
        <Card className="px-8 py-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-lg font-bold">
              ✓
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Bid history updated</h2>
              <p className="text-sm text-gray-500">
                {syncResult.inserted} rows added to the bid history
                {syncResult.duplicatesSkipped > 0 &&
                  `; ${syncResult.duplicatesSkipped} more were skipped because identical rows were already stored`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={scanAndMatch}
              className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg
                hover:bg-indigo-700 transition-colors"
            >
              Scan for AI Matches
            </button>
            <button
              onClick={reset}
              className="px-5 py-2.5 text-gray-600 text-sm font-medium rounded-lg
                border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Done
            </button>
          </div>
        </Card>
      )}

      {appState === "review" && (
        <>
          {autoApproved > 0 && (
            <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
              <strong>{autoApproved.toLocaleString()}</strong> new line{autoApproved === 1 ? " was" : "s were"} approved
              automatically because the wording is nearly identical to one you already approved and the AI was
              highly confident. They are not in the list below. To check or undo them, filter Living_Matches in
              Airtable by Auto_Approved.
            </div>
          )}
          <ReviewTable
            records={reviewRecords}
            masterItems={masterItems}
            onReviewed={handleReviewed}
            onCatalogItemAdded={handleCatalogItemAdded}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={reset}
              className="px-5 py-2.5 text-gray-600 text-sm font-medium rounded-lg
                border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Upload More Files
            </button>
          </div>
        </>
      )}

      {appState === "error" && <ErrorCard error={error} onRetry={reset} />}
    </div>
  );
}

"use client";

import { useCallback, useState } from "react";
import type { EstimateSyncResult, MasterCatalogStat, PricingEstimateResult } from "@/types";
import { Card, Spinner, ErrorCard } from "./ui";

type AppState = "idle" | "generating" | "preview" | "writing" | "done" | "error";

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function toCsv(report: MasterCatalogStat[]): string {
  const header = ["Master Item", "Standard Unit", "Count", "Weighted Avg", "Median", "Low", "High"];
  const rows = report.map((r) => [
    r.masterItem,
    r.standardUnit,
    String(r.count),
    r.weightedAvg ?? "",
    r.median ?? "",
    r.low ?? "",
    r.high ?? "",
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function downloadCsv(report: MasterCatalogStat[]) {
  const blob = new Blob([toCsv(report)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Pricing_Estimate_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function EstimatePanel() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [estimate, setEstimate] = useState<PricingEstimateResult | null>(null);
  const [syncResult, setSyncResult] = useState<EstimateSyncResult | null>(null);
  const [error, setError] = useState("");

  const reset = useCallback(() => {
    setAppState("idle");
    setEstimate(null);
    setSyncResult(null);
    setError("");
  }, []);

  const generate = useCallback(async () => {
    setAppState("generating");
    setError("");
    try {
      const res = await fetch("/api/pricing/estimate-plan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      setEstimate(data as PricingEstimateResult);
      setAppState("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAppState("error");
    }
  }, []);

  const writeToAirtable = useCallback(async () => {
    if (!estimate) return;
    setAppState("writing");
    try {
      const res = await fetch("/api/pricing/estimate-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: estimate.report }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      setSyncResult(data as EstimateSyncResult);
      setAppState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAppState("error");
    }
  }, [estimate]);

  return (
    <div className="space-y-5">
      {appState === "idle" && (
        <Card className="px-8 py-20 flex flex-col items-center gap-4 text-center">
          <div className="text-5xl mb-2">📈</div>
          <p className="text-gray-700 font-semibold text-lg">Generate a pricing report</p>
          <p className="text-gray-500 text-sm max-w-md">
            Computes Weighted Average / Median / Low / High pricing per catalog item from
            the full bid history, and can write it back to Airtable.
          </p>
          <button
            onClick={generate}
            className="mt-2 px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold
              rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Generate Pricing Report
          </button>
        </Card>
      )}

      {(appState === "generating" || appState === "writing") && (
        <Card className="px-8 py-20 flex flex-col items-center gap-4">
          <Spinner />
          <p className="text-gray-600 font-medium">
            {appState === "generating" ? "Computing pricing report…" : "Writing to Airtable…"}
          </p>
        </Card>
      )}

      {appState === "preview" && estimate && (
        <>
          {estimate.reviewCount > 0 && (
            <div className="px-5 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
              {estimate.reviewCount.toLocaleString()} bid history rows still need matching —
              see the Ingest tab.
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Pricing report</h2>
              <span className="text-sm text-gray-400">
                {estimate.report.filter((r) => r.count > 0).length} of {estimate.report.length} items priced
              </span>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-5 py-3 font-medium">Master Item</th>
                    <th className="px-4 py-3 font-medium">Unit</th>
                    <th className="px-4 py-3 font-medium text-right">Count</th>
                    <th className="px-4 py-3 font-medium text-right">Weighted Avg</th>
                    <th className="px-4 py-3 font-medium text-right">Median</th>
                    <th className="px-4 py-3 font-medium text-right">Low</th>
                    <th className="px-4 py-3 font-medium text-right">High</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {estimate.report.map((r) => (
                    <tr key={r.recordId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-gray-900">{r.masterItem}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{r.standardUnit}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">{r.count}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-gray-900">{fmtMoney(r.weightedAvg)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">{fmtMoney(r.median)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">{fmtMoney(r.low)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">{fmtMoney(r.high)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={writeToAirtable}
              className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold
                rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Write to Airtable
            </button>
            <button
              onClick={() => downloadCsv(estimate.report)}
              className="px-5 py-2.5 text-gray-600 text-sm font-medium rounded-lg
                border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Download CSV
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

      {appState === "done" && syncResult && (
        <Card className="px-8 py-8">
          <div className="flex items-center gap-3 mb-7">
            <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-lg font-bold">
              ✓
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Master Catalog updated</h2>
              <p className="text-sm text-gray-500">{syncResult.today}</p>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg px-5 py-4 mb-8 inline-block">
            <div className="text-3xl font-bold text-green-700">{syncResult.updated}</div>
            <div className="text-xs text-gray-500 mt-1">records updated</div>
          </div>
          <div>
            <button
              onClick={reset}
              className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg
                hover:bg-indigo-700 transition-colors"
            >
              Generate Another Report
            </button>
          </div>
        </Card>
      )}

      {appState === "error" && <ErrorCard error={error} onRetry={reset} />}
    </div>
  );
}

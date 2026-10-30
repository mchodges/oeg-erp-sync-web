"use client";

import { useCallback, useMemo, useState } from "react";
import type { EstimateSyncResult, MasterCatalogStat, OutlierBid, PricingEstimateResult } from "@/types";
import { Card, Spinner, ErrorCard } from "./ui";

type AppState = "idle" | "generating" | "preview" | "writing" | "done" | "error";

type SortKey =
  | "masterItem"
  | "category"
  | "standardUnit"
  | "count"
  | "recommendedPrice"
  | "weightedAvg"
  | "median"
  | "low"
  | "high";
type SortDir = "asc" | "desc";

const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: "masterItem", dir: "asc" };

/** Nulls (no data / excluded items) always sort to the bottom, regardless of direction. */
function compareRows(a: MasterCatalogStat, b: MasterCatalogStat, key: SortKey, dir: SortDir): number {
  const av = a[key];
  const bv = b[key];
  let cmp: number;
  if (typeof av === "string" || typeof bv === "string") {
    cmp = String(av ?? "").localeCompare(String(bv ?? ""));
  } else if (av == null && bv == null) {
    cmp = 0;
  } else if (av == null) {
    return 1;
  } else if (bv == null) {
    return -1;
  } else {
    cmp = av - bv;
  }
  return dir === "asc" ? cmp : -cmp;
}

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function toCsv(report: MasterCatalogStat[]): string {
  const header = [
    "Master Item",
    "Category",
    "Standard Unit",
    "Count",
    "Recommended Price",
    "25th Percentile",
    "75th Percentile",
    "Confidence",
    "Basis",
    "Latest Bid",
    "Stats Window",
    "Core",
    "Manual Override",
    "Weighted Avg",
    "Median",
    "Low",
    "High",
    "Notes",
  ];
  const rows = report.map((r) => [
    r.masterItem,
    r.category,
    r.standardUnit,
    String(r.count),
    r.recommendedPrice ?? "",
    r.priceP25 ?? "",
    r.priceP75 ?? "",
    r.priceConfidence,
    r.priceBasis,
    r.latestBidDate ?? "",
    r.statsWindow,
    r.core ? "Yes" : "",
    r.manualOverride ?? "",
    r.weightedAvg ?? "",
    r.median ?? "",
    r.low ?? "",
    r.high ?? "",
    [
      r.excludeFromStats ? "Allowance/contingency item — excluded from pricing stats" : "",
      r.combinedCount > 0 ? `${r.combinedCount} of ${r.count} samples combine a contractor's excavate and haul/place lines` : "",
      r.outliersRemoved > 0 ? `${r.outliersRemoved} bid${r.outliersRemoved === 1 ? "" : "s"} thrown out as price outliers` : "",
    ]
      .filter(Boolean)
      .join("; "),
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function outliersToCsv(outliers: OutlierBid[]): string {
  const header = ["Master Item", "Unit", "Project", "Contractor", "Bid Price", "Qty", "Item's Typical Price (median)"];
  const rows = outliers.map((o) => [o.masterItem, o.unit, o.projectName, o.contractor, o.price, o.qty, o.typicalPrice]);
  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function downloadText(csv: string, filename: string) {
  // The leading BOM tells Excel the file is UTF-8; without it Excel on Windows reads it as
  // ANSI and garbles non-ASCII characters such as the em dash in the Notes column.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCsv(report: MasterCatalogStat[]) {
  downloadText(toCsv(report), `Pricing_Estimate_${new Date().toISOString().split("T")[0]}.csv`);
}

function downloadOutliersCsv(outliers: OutlierBid[]) {
  downloadText(outliersToCsv(outliers), `Pricing_Outliers_${new Date().toISOString().split("T")[0]}.csv`);
}

const CONFIDENCE_CLASS: Record<MasterCatalogStat["priceConfidence"], string> = {
  Solid: "bg-green-100 text-green-800",
  Thin: "bg-amber-100 text-amber-700",
  None: "bg-gray-100 text-gray-500",
};

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  align?: "right";
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`${className ?? "px-4 py-3"} font-medium cursor-pointer select-none
        hover:text-gray-700 ${align === "right" ? "text-right" : "text-left"}`}
    >
      {label}
      <span className={`ml-1 inline-block w-3 ${active ? "text-gray-600" : "text-gray-300"}`}>
        {active ? (sort.dir === "asc" ? "▲" : "▼") : "▲"}
      </span>
    </th>
  );
}

export function EstimatePanel() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [estimate, setEstimate] = useState<PricingEstimateResult | null>(null);
  const [syncResult, setSyncResult] = useState<EstimateSyncResult | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORT);

  const reset = useCallback(() => {
    setAppState("idle");
    setEstimate(null);
    setSyncResult(null);
    setError("");
    setSort(DEFAULT_SORT);
  }, []);

  const toggleSort = useCallback((key: SortKey) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }, []);

  const sortedReport = useMemo(() => {
    if (!estimate) return [];
    return [...estimate.report].sort((a, b) => compareRows(a, b, sort.key, sort.dir));
  }, [estimate, sort]);

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
      // The server recomputes the report itself; nothing from the browser is written.
      const res = await fetch("/api/pricing/estimate-sync", { method: "POST" });
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
            Works out a recommended price for every catalog item (recent bids count more),
            with the middle half of bids and how solid the data is. Can write it back to
            Airtable, plus a monthly price history for the core items.
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

          {estimate.ignoredCount > 0 && (
            <div className="px-5 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-500">
              {estimate.ignoredCount.toLocaleString()} bid history rows have no catalog match
              and were marked Ignored — excluded from pricing, no action needed.
            </div>
          )}

          {estimate.unitMismatchCount > 0 && (
            <details className="px-5 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <summary className="cursor-pointer">
                {estimate.unitMismatchCount.toLocaleString()} bid rows were left out of the
                prices because their unit does not match the catalog item's unit (for example
                priced per LF where the catalog item is per EA).
              </summary>
              <ul className="mt-2 space-y-0.5 text-xs">
                {estimate.unitMismatches.map((m, i) => (
                  <li key={i}>
                    {m.masterItem}: bid in {m.bidUnit}, catalog is {m.catalogUnit} — {m.rows}{" "}
                    {m.rows === 1 ? "row" : "rows"}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {estimate.outlierCount > 0 && (
            <details className="px-5 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <summary className="cursor-pointer">
                {estimate.outlierCount.toLocaleString()} bids were thrown out of the prices because their
                price is far from the other bids for the same item.
              </summary>
              <ul className="mt-2 space-y-0.5 text-xs">
                {estimate.outliers.map((o, i) => (
                  <li key={i}>
                    {o.masterItem}: {fmtMoney(o.price)} per {o.unit} (typical {fmtMoney(o.typicalPrice)}) —{" "}
                    {o.contractor}, {o.projectName || "unknown project"}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <Card className="overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Pricing report</h2>
              <span className="text-sm text-gray-400">
                {estimate.report.filter((r) => r.recommendedPrice !== null).length} of {estimate.report.length} items priced
              </span>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                    <SortHeader label="Master Item" sortKey="masterItem" sort={sort} onSort={toggleSort} className="px-5 py-3" />
                    <SortHeader label="Category" sortKey="category" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Unit" sortKey="standardUnit" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Count" sortKey="count" sort={sort} onSort={toggleSort} align="right" />
                    <SortHeader label="Recommended" sortKey="recommendedPrice" sort={sort} onSort={toggleSort} align="right" />
                    <th className="px-4 py-3 font-medium text-right">Middle half</th>
                    <th className="px-4 py-3 font-medium text-left">Confidence</th>
                    <SortHeader label="Weighted Avg" sortKey="weightedAvg" sort={sort} onSort={toggleSort} align="right" />
                    <SortHeader label="Median" sortKey="median" sort={sort} onSort={toggleSort} align="right" />
                    <SortHeader label="Low" sortKey="low" sort={sort} onSort={toggleSort} align="right" />
                    <SortHeader label="High" sortKey="high" sort={sort} onSort={toggleSort} align="right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sortedReport.map((r) => (
                    <tr key={r.recordId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-gray-900">
                        {r.core && (
                          <span title="Core item: gets a monthly Price_History row" className="mr-1.5 text-amber-500">
                            ★
                          </span>
                        )}
                        {r.masterItem}
                        {r.excludeFromStats && (
                          <span
                            title="Allowance/contingency item — bid unit prices are nominal placeholders, not real market pricing. Excluded from stats."
                            className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]
                              font-semibold bg-amber-50 text-amber-700 border border-amber-200"
                          >
                            ⚠ Allowance item
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{r.category}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{r.standardUnit}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">
                        {r.count}
                        {r.statsWindow && (
                          <span
                            className="block text-[10px] font-sans text-gray-400"
                            title="Count, average, median, low and high use only these bids: the last 12 months, widened to 24 months or all history when there are too few"
                          >
                            {r.statsWindow}
                          </span>
                        )}
                        {r.combinedCount > 0 && (
                          <span
                            className="block text-[10px] font-sans text-gray-400"
                            title="Samples built by adding one contractor's excavate line and haul/place line on one project"
                          >
                            {r.combinedCount} combined
                          </span>
                        )}
                      </td>
                      {r.excludeFromStats ? (
                        <td colSpan={7} className="px-4 py-3 text-center text-xs text-amber-700">
                          Not priced — excluded from stats
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-gray-900">
                            {fmtMoney(r.recommendedPrice)}
                            {r.manualOverride != null && (
                              <span
                                className="block text-[10px] font-sans font-normal text-indigo-600"
                                title="Typed by hand in Airtable (Manual_Override); used instead of the recommended price"
                              >
                                override {fmtMoney(r.manualOverride)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-gray-500 whitespace-nowrap">
                            {r.priceP25 != null && r.priceP75 != null
                              ? `${fmtMoney(r.priceP25)} – ${fmtMoney(r.priceP75)}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span
                              title={r.priceBasis}
                              className={`inline-flex items-center rounded px-2 py-0.5 font-medium ${CONFIDENCE_CLASS[r.priceConfidence]}`}
                            >
                              {r.priceConfidence}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-gray-900">{fmtMoney(r.weightedAvg)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">{fmtMoney(r.median)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">{fmtMoney(r.low)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">{fmtMoney(r.high)}</td>
                        </>
                      )}
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
              onClick={() => downloadCsv(sortedReport)}
              className="px-5 py-2.5 text-gray-600 text-sm font-medium rounded-lg
                border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Download CSV
            </button>
            {estimate.outlierCount > 0 && (
              <button
                onClick={() => downloadOutliersCsv(estimate.outliers)}
                className="px-5 py-2.5 text-gray-600 text-sm font-medium rounded-lg
                  border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                Download thrown-out bids
              </button>
            )}
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
            <div className="text-xs text-gray-500 mt-1">catalog items updated</div>
          </div>
          <div className="bg-gray-50 rounded-lg px-5 py-4 mb-8 ml-3 inline-block">
            <div className="text-3xl font-bold text-green-700">{syncResult.historyRows}</div>
            <div className="text-xs text-gray-500 mt-1">price history rows (core items)</div>
          </div>
          {syncResult.historyError && (
            <p className="mb-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              The catalog was updated, but the price history could not be written: {syncResult.historyError}
            </p>
          )}
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

import type { MasterCatalogStat } from "@/types";
import type { BidHistoryRow } from "./supabase";
import type { MasterCatalogRecord } from "./airtablePricing";

const REVIEW = "REVIEW";
const OUTLIER_TRIM_PCT = 0.1;
const MIN_SAMPLES_FOR_TRIM = 5;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function resolveMasterItem(
  description: string,
  dictionaryMap: Map<string, string>,
): string {
  return dictionaryMap.get(description.trim()) ?? REVIEW;
}

interface StatRow {
  count: number;
  weightedAvg: number;
  median: number;
  low: number;
  high: number;
}

function computeStats(pairs: { price: number; qty: number }[]): StatRow {
  const sorted = [...pairs].sort((a, b) => a.price - b.price);

  let trimmed = sorted;
  if (sorted.length >= MIN_SAMPLES_FOR_TRIM) {
    const trim = Math.floor(sorted.length * OUTLIER_TRIM_PCT);
    if (trim > 0) trimmed = sorted.slice(trim, sorted.length - trim);
  }

  const prices = trimmed.map((p) => p.price);
  const totalQty = trimmed.reduce((s, p) => s + p.qty, 0);
  const totalCost = trimmed.reduce((s, p) => s + p.price * p.qty, 0);

  const mid = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0
      ? (prices[mid - 1] + prices[mid]) / 2
      : prices[mid];

  return {
    count: trimmed.length,
    weightedAvg: round2(totalQty > 0 ? totalCost / totalQty : 0),
    median: round2(median),
    low: round2(prices[0]),
    high: round2(prices[prices.length - 1]),
  };
}

export interface EstimateReport {
  report: MasterCatalogStat[];
  reviewCount: number;
}

/** Port of notebook Chunk 5: resolve → clean → dedupe → group → outlier-trim → stats → merge onto catalog. */
export function computeEstimateReport(
  bidHistory: BidHistoryRow[],
  dictionaryMap: Map<string, string>,
  masterCatalog: MasterCatalogRecord[],
): EstimateReport {
  let reviewCount = 0;
  const seenDupeKeys = new Set<string>();
  const groups = new Map<string, { price: number; qty: number }[]>();

  for (const row of bidHistory) {
    if (!Number.isFinite(row.price) || row.price <= 0) continue;
    if (!Number.isFinite(row.qty)) continue;

    const masterItem = resolveMasterItem(row.originalDescription, dictionaryMap);
    if (masterItem === REVIEW) {
      reviewCount++;
      continue;
    }

    const dupeKey = `${row.projectName ?? ""}|${row.contractor}|${masterItem}|${row.price}`;
    if (seenDupeKeys.has(dupeKey)) continue;
    seenDupeKeys.add(dupeKey);

    const group = groups.get(masterItem);
    const pair = { price: row.price, qty: row.qty };
    if (group) group.push(pair);
    else groups.set(masterItem, [pair]);
  }

  const calcResults = new Map<string, StatRow>();
  for (const [masterItem, pairs] of groups) {
    calcResults.set(masterItem, computeStats(pairs));
  }

  const report: MasterCatalogStat[] = masterCatalog.map((item) => {
    const stats = calcResults.get(item.id);
    return {
      recordId: item.id,
      masterItem: item.masterItemName,
      standardUnit: item.standardUnit,
      category: item.category,
      count: stats?.count ?? 0,
      weightedAvg: item.excludeFromStats ? null : stats?.weightedAvg ?? null,
      median: item.excludeFromStats ? null : stats?.median ?? null,
      low: item.excludeFromStats ? null : stats?.low ?? null,
      high: item.excludeFromStats ? null : stats?.high ?? null,
      excludeFromStats: item.excludeFromStats,
    };
  });

  return { report, reviewCount };
}

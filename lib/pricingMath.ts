import type { MasterCatalogStat, UnitMismatch } from "@/types";
import type { BidHistoryRow } from "./supabase";
import type { MasterCatalogRecord } from "./airtablePricing";
import { combineSplitBids, type AcceptedLine } from "./combineBids";
import { normalizeDescription } from "./normalizeText";
import { normalizeUnit, unitsConflict } from "./units";

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
  return dictionaryMap.get(normalizeDescription(description)) ?? REVIEW;
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
  /** Rows with no dictionary match yet AND no Ignored decision — genuinely need review. */
  reviewCount: number;
  /** Rows explicitly marked Ignored (no match exists) — will never resolve, not a backlog. */
  ignoredCount: number;
  /** Priced rows left out because the bid's unit differs from the catalog item's unit. */
  unitMismatchCount: number;
  unitMismatches: UnitMismatch[];
}

/** Port of notebook Chunk 5: resolve → clean → dedupe → group → outlier-trim → stats → merge onto catalog. */
export function computeEstimateReport(
  bidHistory: BidHistoryRow[],
  dictionaryMap: Map<string, string>,
  masterCatalog: MasterCatalogRecord[],
  ignoredDescriptions: Set<string>,
): EstimateReport {
  let reviewCount = 0;
  let ignoredCount = 0;
  let unitMismatchCount = 0;
  const catalogById = new Map(masterCatalog.map((c) => [c.id, c]));
  const mismatchGroups = new Map<string, UnitMismatch>();
  const seenDupeKeys = new Set<string>();
  const groups = new Map<string, { price: number; qty: number }[]>();
  const accepted: AcceptedLine[] = [];

  // The dedupe below keeps the first line seen per project+contractor+item+price, so the
  // order must be fixed: oldest ingested row (lowest id) wins, the same on every run.
  const ordered = [...bidHistory].sort((a, b) => a.id - b.id);

  for (const row of ordered) {
    if (!Number.isFinite(row.price) || row.price <= 0) continue;
    if (!Number.isFinite(row.qty)) continue;

    const masterItem = resolveMasterItem(row.originalDescription, dictionaryMap);
    if (masterItem === REVIEW) {
      if (ignoredDescriptions.has(normalizeDescription(row.originalDescription))) {
        ignoredCount++;
      } else {
        reviewCount++;
      }
      continue;
    }

    // A line with no quantity bids no work (contract-clause lines such as a per-day bonus or a
    // damage deduct are listed at qty 0), so its price says nothing about unit cost. Skipped here,
    // after the review/ignored counting above, so those banner counts stay accurate.
    if (row.qty <= 0) continue;

    // A price per LF and a price per EA are different scales, so averaging them together
    // would skew the item. Rows whose unit disagrees with the catalog are left out and reported.
    const catalogItem = catalogById.get(masterItem);
    if (catalogItem && unitsConflict(row.unit, catalogItem.standardUnit)) {
      unitMismatchCount++;
      const groupKey = `${masterItem}|${normalizeUnit(row.unit)}`;
      const group = mismatchGroups.get(groupKey);
      if (group) group.rows++;
      else {
        mismatchGroups.set(groupKey, {
          masterItem: catalogItem.masterItemName,
          catalogUnit: catalogItem.standardUnit,
          bidUnit: normalizeUnit(row.unit),
          rows: 1,
        });
      }
      continue;
    }

    const dupeKey = `${row.projectName ?? ""}|${row.contractor}|${masterItem}|${row.price}`;
    if (seenDupeKeys.has(dupeKey)) continue;
    seenDupeKeys.add(dupeKey);

    const group = groups.get(masterItem);
    const pair = { price: row.price, qty: row.qty };
    if (group) group.push(pair);
    else groups.set(masterItem, [pair]);
    accepted.push({
      projectName: row.projectName ?? "",
      contractor: row.contractor,
      itemId: masterItem,
      price: row.price,
      qty: row.qty,
    });
  }

  // Split bids (excavate line + haul/place line) become one all-in sample for the all-in item.
  const combinedCounts = new Map<string, number>();
  for (const line of combineSplitBids(accepted, masterCatalog)) {
    const pair = { price: line.price, qty: line.qty };
    const group = groups.get(line.itemId);
    if (group) group.push(pair);
    else groups.set(line.itemId, [pair]);
    combinedCounts.set(line.itemId, (combinedCounts.get(line.itemId) ?? 0) + 1);
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
      combinedCount: combinedCounts.get(item.id) ?? 0,
    };
  });

  const unitMismatches = [...mismatchGroups.values()].sort((a, b) => b.rows - a.rows);
  return { report, reviewCount, ignoredCount, unitMismatchCount, unitMismatches };
}

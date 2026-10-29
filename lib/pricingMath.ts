import type { MasterCatalogStat, OutlierBid, PriceHistoryRow, UnitMismatch } from "@/types";
import type { BidHistoryRow } from "./supabase";
import type { MasterCatalogRecord } from "./airtablePricing";
import { combineSplitBids, type AcceptedLine } from "./combineBids";
import { normalizeDescription } from "./normalizeText";
import { normalizeUnit, unitsConflict } from "./units";
import { parseBidDate } from "./priceTrend";
import { monthlyHistory, recommend } from "./recommendedPrice";

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

interface Sample {
  price: number;
  qty: number;
  projectName: string;
  contractor: string;
  /** Bid date (YYYY-MM-DD), or null when the bid tab had none. */
  date: string | null;
}

/**
 * A bid is thrown out when its price is far from the rest of the item's bids, judged on a ratio
 * scale (a $20 price for a $90 item is as far off as $450 is). "Far" is measured in robust spreads
 * from the median of the log-prices, and the spread never counts as smaller than 0.25, so a bid is
 * never thrown out unless it is under about 0.42 times or over about 3.5 times the item's typical price.
 */
const SCREEN_MIN_SAMPLES = 8;
/** Stray low prices are usually placeholders ($0.01, $1), so they are screened closely; a high price is more often a real expensive job, so it gets more room. */
const SCREEN_MAX_DEVIATIONS_LOW = 3.5;
const SCREEN_MAX_DEVIATIONS_HIGH = 5;
const SCREEN_MIN_SPREAD = 0.25;
/** If this share or more of an item's bids would go, the item has two kinds of bid, not stray ones: keep them all. */
const SCREEN_MAX_REMOVED_SHARE = 0.25;

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function screenOutliers(samples: Sample[]): { kept: Sample[]; removed: Sample[]; typicalPrice: number } {
  const logs = samples.map((s) => Math.log(s.price));
  const center = medianOf(logs);
  const typicalPrice = Math.exp(center);
  if (samples.length < SCREEN_MIN_SAMPLES) return { kept: samples, removed: [], typicalPrice };

  const spread = Math.max(1.4826 * medianOf(logs.map((l) => Math.abs(l - center))), SCREEN_MIN_SPREAD);
  const kept: Sample[] = [];
  const removed: Sample[] = [];
  samples.forEach((s, i) => {
    const away = (logs[i] - center) / spread;
    if (away < -SCREEN_MAX_DEVIATIONS_LOW || away > SCREEN_MAX_DEVIATIONS_HIGH) removed.push(s);
    else kept.push(s);
  });
  if (removed.length >= samples.length * SCREEN_MAX_REMOVED_SHARE) {
    return { kept: samples, removed: [], typicalPrice };
  }
  return { kept, removed, typicalPrice };
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
  /** Bids thrown out because their price is far from the item's other bids (see screenOutliers). */
  outlierCount: number;
  outliers: OutlierBid[];
  /** Monthly rows for the core catalog items (Master_Catalog.Core), for the Price_History table. */
  history: PriceHistoryRow[];
}

/**
 * Port of notebook Chunk 5: resolve → clean → dedupe → group → outlier screen → stats and recommended
 * price → merge onto catalog. `asOf` (YYYY-MM-DD) is "today" for the recency weighting.
 */
export function computeEstimateReport(
  bidHistory: BidHistoryRow[],
  dictionaryMap: Map<string, string>,
  masterCatalog: MasterCatalogRecord[],
  ignoredDescriptions: Set<string>,
  asOf: string,
): EstimateReport {
  let reviewCount = 0;
  let ignoredCount = 0;
  let unitMismatchCount = 0;
  const catalogById = new Map(masterCatalog.map((c) => [c.id, c]));
  const mismatchGroups = new Map<string, UnitMismatch>();
  const seenDupeKeys = new Set<string>();
  const groups = new Map<string, Sample[]>();
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

    const date = parseBidDate(row.bidDate);
    const group = groups.get(masterItem);
    const pair = {
      price: row.price,
      qty: row.qty,
      projectName: row.projectName ?? "",
      contractor: row.contractor,
      date,
    };
    if (group) group.push(pair);
    else groups.set(masterItem, [pair]);
    accepted.push({
      projectName: row.projectName ?? "",
      contractor: row.contractor,
      itemId: masterItem,
      price: row.price,
      qty: row.qty,
      date: date ?? undefined,
    });
  }

  // Split bids (excavate line + haul/place line) become one all-in sample for the all-in item.
  const combinedCounts = new Map<string, number>();
  for (const line of combineSplitBids(accepted, masterCatalog)) {
    const pair = {
      price: line.price,
      qty: line.qty,
      projectName: line.projectName,
      contractor: line.contractor,
      date: line.date ?? null,
    };
    const group = groups.get(line.itemId);
    if (group) group.push(pair);
    else groups.set(line.itemId, [pair]);
    combinedCounts.set(line.itemId, (combinedCounts.get(line.itemId) ?? 0) + 1);
  }

  const calcResults = new Map<string, StatRow>();
  const recommendations = new Map<string, ReturnType<typeof recommend>>();
  const history: PriceHistoryRow[] = [];
  const outliers: OutlierBid[] = [];
  const outlierCounts = new Map<string, number>();
  for (const [masterItem, samples] of groups) {
    const item = catalogById.get(masterItem);
    // Allowance items are not priced at all, so there is nothing to screen.
    const { kept, removed, typicalPrice } = item?.excludeFromStats
      ? { kept: samples, removed: [], typicalPrice: 0 }
      : screenOutliers(samples);
    for (const s of removed) {
      outliers.push({
        masterItem: item?.masterItemName ?? masterItem,
        unit: item?.standardUnit ?? "",
        projectName: s.projectName,
        contractor: s.contractor,
        price: round2(s.price),
        qty: s.qty,
        typicalPrice: round2(typicalPrice),
      });
    }
    if (removed.length > 0) outlierCounts.set(masterItem, removed.length);
    calcResults.set(masterItem, computeStats(kept));
    if (!item?.excludeFromStats) {
      recommendations.set(masterItem, recommend(kept, asOf));
      if (item?.core) {
        for (const m of monthlyHistory(kept, asOf)) {
          history.push({
            key: `${masterItem}|${m.month.slice(0, 7)}`,
            recordId: masterItem,
            masterItem: item.masterItemName,
            month: m.month,
            bids: m.bids,
            projects: m.projects,
            median: m.median,
            p25: m.p25,
            p75: m.p75,
            recommended: m.recommended,
            confidence: m.confidence,
          });
        }
      }
    }
  }
  history.sort((a, b) => a.masterItem.localeCompare(b.masterItem) || a.month.localeCompare(b.month));
  outliers.sort((a, b) => a.masterItem.localeCompare(b.masterItem) || a.price - b.price);

  const report: MasterCatalogStat[] = masterCatalog.map((item) => {
    const stats = calcResults.get(item.id);
    const rec = recommendations.get(item.id) ?? recommend([], asOf);
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
      outliersRemoved: outlierCounts.get(item.id) ?? 0,
      recommendedPrice: rec.price,
      priceP25: rec.p25,
      priceP75: rec.p75,
      priceConfidence: rec.confidence,
      priceBasis: item.excludeFromStats ? "Allowance item: not priced" : rec.basis,
      latestBidDate: rec.latestBidDate,
      core: item.core,
      manualOverride: item.manualOverride,
    };
  });

  const unitMismatches = [...mismatchGroups.values()].sort((a, b) => b.rows - a.rows);
  return {
    report,
    reviewCount,
    ignoredCount,
    unitMismatchCount,
    unitMismatches,
    outlierCount: outliers.length,
    outliers,
    history,
  };
}

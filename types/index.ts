import type { PriceConfidence } from "@/lib/recommendedPrice";

export type ActionType =
  | "CREATE"
  | "UPDATE"
  | "SKIP-TODAY"
  | "SKIP-NOERP"
  | "NOMATCH";

export interface ProjectAction {
  action: ActionType;
  projNum: string;
  projectId?: string;
  atCodes?: string[];
  positionHours?: Record<string, number>;
  totalHrs?: number;
  recId?: string | null;
}

export interface PlanResult {
  plan: ProjectAction[];
  unrecognized: Record<string, number>;
  filename: string;
  parseStats: {
    totalRows: number;
    uniqueCodes: number;
  };
  today: string;
}

export interface SyncResult {
  created: number;
  updated: number;
  skippedToday: number;
  noErp: number;
  noMatch: number;
  totalHrs: number;
  today: string;
}

// ── Budget Sync Types ──────────────────────────────────────────────────────────

export type BudgetActionType = "CREATE" | "SKIP-TODAY" | "SKIP-NOERP" | "NOMATCH";

export interface BudgetProjectAction {
  action: BudgetActionType;
  projNum: string;
  projectId: string;
  totalBudget: number;
  totalSpent: number;
  engBudget: number;
  engSpent: number;
  hasTotalData: boolean;
  hasEngData: boolean;
  totalCodes: string[];
  engCodes: string[];
}

export interface BudgetPlanResult {
  plan: BudgetProjectAction[];
  filename: string;
  parseStats: { totalRows: number; uniqueKeys: number };
  today: string;
}

export interface BudgetSyncResult {
  created: number;
  skippedToday: number;
  noErp: number;
  noMatch: number;
  today: string;
}

// ── Pricing Estimator Types ─────────────────────────────────────────────────

export interface RawBidRow {
  contractor: string;
  originalDescription: string;
  qty: number;
  unit: string;
  price: number;
}

export interface HarvestFileResult {
  filename: string;
  projectName: string | null;
  bidDate: string | null;
  totalRows: number;
  newRows: number;
  duplicateRows: number;
  /** Lines repeated inside this file (same contractor, description, qty and price); kept once. */
  repeatedRows?: number;
  /** A few of the repeated lines, for the preview. */
  repeatedSamples?: RawBidRow[];
  /** Other filenames (or this upload) that already contain some of this file's rows. */
  duplicateOfFiles?: string[];
  rows: RawBidRow[];
  error?: string;
}

export interface HarvestPlanResult {
  files: HarvestFileResult[];
  totalNewRows: number;
}

export interface HarvestSyncResult {
  inserted: number;
  duplicatesSkipped: number;
}

export interface UnmatchedItem {
  description: string;
  unit: string;
}

export interface UnmatchedItemsResult {
  items: UnmatchedItem[];
  totalCount: number;
}

export type MatchConfidence = "High" | "Medium" | "Low";
export type LivingMatchStatus = "Pending" | "Verified" | "Ignored";

export interface LivingMatchGuess {
  recordId: string;
  rawDescription: string;
  rawUnit: string;
  aiGuess: string;
  confidence: MatchConfidence;
}

export interface LivingMatchRecord extends LivingMatchGuess {
  /** Master_Catalog record id currently linked via Living_Matches.Master_Item, or "" if unresolved. */
  masterItemId: string;
  status: LivingMatchStatus;
}

export interface MasterCatalogOption {
  id: string;
  name: string;
  /** Standard_Unit of the catalog item (SY, LF, EA …), "" if unset. */
  unit: string;
  category: string;
}

export interface LivingMatchesResult {
  records: LivingMatchRecord[];
  masterItems: MasterCatalogOption[];
}

export interface MasterCatalogStat {
  recordId: string;
  masterItem: string;
  standardUnit: string;
  category: string;
  count: number;
  weightedAvg: number | null;
  median: number | null;
  low: number | null;
  high: number | null;
  /** True for allowance/contingency-type items (e.g. Ductile Iron Fittings) where bid
   * unit prices are nominal placeholders, not real market pricing — stats are withheld. */
  excludeFromStats: boolean;
  /** How many of `count` are all-in samples built by adding a contractor's split lines (excavate + haul/place). */
  combinedCount: number;
  /** Bids thrown out of this item's pricing because their price is far from the item's other bids. */
  outliersRemoved: number;
  /** Recency-weighted median of the item's bids (see lib/recommendedPrice.ts); null with no bids or for allowance items. */
  recommendedPrice: number | null;
  /** Low and high ends of the middle half of bids. */
  priceP25: number | null;
  priceP75: number | null;
  priceConfidence: PriceConfidence;
  /** Plain-English basis, e.g. "41 bids from 14 projects, latest Oct 2026". */
  priceBasis: string;
  /** Date (YYYY-MM-DD) of the newest bid behind the recommended price. */
  latestBidDate: string | null;
  /** Master_Catalog.Core: gets a monthly Price_History row. */
  core: boolean;
  /** Master_Catalog.Manual_Override: a price typed by hand; shown for reference only. */
  manualOverride: number | null;
}

/** One core item in one month, written to the Price_History table. */
export interface PriceHistoryRow {
  /** Master_Catalog record id + month (YYYY-MM), unique, so each run updates rather than duplicates. */
  key: string;
  recordId: string;
  masterItem: string;
  /** First day of the month, YYYY-MM-01. */
  month: string;
  bids: number;
  projects: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  /** The recommended price as it stood at the end of that month, using only bids up to then. */
  recommended: number | null;
  confidence: PriceConfidence;
}

/** One bid thrown out of an item's pricing for being far from the item's typical price. */
export interface OutlierBid {
  masterItem: string;
  unit: string;
  projectName: string;
  contractor: string;
  price: number;
  qty: number;
  /** Median price of the item's bids (before the throw-outs), for comparison. */
  typicalPrice: number;
}

/** Bid rows left out of an item's pricing because their unit disagrees with the catalog unit. */
export interface UnitMismatch {
  masterItem: string;
  catalogUnit: string;
  bidUnit: string;
  rows: number;
}

export interface PricingEstimateResult {
  report: MasterCatalogStat[];
  reviewCount: number;
  ignoredCount: number;
  unitMismatchCount: number;
  unitMismatches: UnitMismatch[];
  outlierCount: number;
  outliers: OutlierBid[];
  /** Monthly rows for the core items, written to Price_History by "Write to Airtable". */
  history: PriceHistoryRow[];
  today: string;
}

export interface EstimateSyncResult {
  updated: number;
  /** Price_History rows created or updated. */
  historyRows: number;
  /** Set when the catalog was updated but the Price_History write failed. */
  historyError?: string;
  today: string;
}

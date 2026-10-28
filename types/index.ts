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
  today: string;
}

export interface EstimateSyncResult {
  updated: number;
  today: string;
}

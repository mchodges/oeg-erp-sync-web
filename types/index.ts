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
}

export interface PricingEstimateResult {
  report: MasterCatalogStat[];
  reviewCount: number;
  today: string;
}

export interface EstimateSyncResult {
  updated: number;
  today: string;
}

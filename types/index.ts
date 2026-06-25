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

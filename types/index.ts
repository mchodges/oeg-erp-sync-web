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

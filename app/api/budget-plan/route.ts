import { NextRequest, NextResponse } from "next/server";
import { parseBudget } from "@/lib/parseBudget";
import {
  fetchAllRecords,
  normalizeLinkedIds,
  PROJECTS_TABLE,
  BUDGETS_TABLE,
} from "@/lib/airtable";
import type { BudgetPlanResult, BudgetProjectAction } from "@/types";

function parseCodes(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split("\n")
    .map((line) => line.split("|")[0].trim())
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const f = file as File;
    const buffer = await f.arrayBuffer();
    const filename = f.name;

    // ── 1. Parse the Excel report ─────────────────────────────────────────
    const { rows: budgetRows, stats } = parseBudget(buffer);

    // Build a lookup map: ERP code → { budget, spent } (summing duplicates)
    const budgetMap = new Map<string, { budget: number; spent: number }>();
    for (const row of budgetRows) {
      const existing = budgetMap.get(row.lookupKey);
      if (existing) {
        existing.budget += row.budget;
        existing.spent += row.spent;
      } else {
        budgetMap.set(row.lookupKey, { budget: row.budget, spent: row.spent });
      }
    }

    // ── 2. Fetch all tracked projects ─────────────────────────────────────
    const projects = await fetchAllRecords(PROJECTS_TABLE, {
      filterByFormula: "{Tracking}=1",
      fields: ["ProjectNumber", "ERP_Codes_Total", "ERP_Codes_Eng"],
    });

    // ── 3. Check which project+category combos already exist today ────────
    const today = new Date().toISOString().split("T")[0];

    const todayBudgets = await fetchAllRecords(BUDGETS_TABLE, {
      filterByFormula: `{EntryDate} = '${today}'`,
      fields: ["Projects", "Category"],
    });

    const existingKeys = new Set<string>();
    for (const rec of todayBudgets) {
      const projIds = normalizeLinkedIds(rec.fields.Projects);
      const category = rec.fields.Category as string;
      if (category) {
        for (const projId of projIds) {
          existingKeys.add(`${projId}|${category}`);
        }
      }
    }

    // ── 4. Build plan ─────────────────────────────────────────────────────
    const plan: BudgetProjectAction[] = [];

    for (const project of projects) {
      const projNum   = (project.fields.ProjectNumber as string) || "—";
      const projectId = project.id;

      const totalCodes = parseCodes(project.fields.ERP_Codes_Total as string | undefined);
      const engCodes   = parseCodes(project.fields.ERP_Codes_Eng   as string | undefined);

      // No ERP codes at all
      if (totalCodes.length === 0) {
        plan.push({
          action: "SKIP-NOERP",
          projNum, projectId,
          totalBudget: 0, totalSpent: 0,
          engBudget: 0, engSpent: 0,
          hasTotalData: false, hasEngData: false,
          totalCodes, engCodes,
        });
        continue;
      }

      // Sum budget/spent for each category
      let totalBudget = 0, totalSpent = 0, totalHasMatch = false;
      for (const code of totalCodes) {
        const match = budgetMap.get(code);
        if (match) {
          totalBudget += match.budget;
          totalSpent  += match.spent;
          totalHasMatch = true;
        }
      }

      let engBudget = 0, engSpent = 0, engHasMatch = false;
      for (const code of engCodes) {
        const match = budgetMap.get(code);
        if (match) {
          engBudget += match.budget;
          engSpent  += match.spent;
          engHasMatch = true;
        }
      }

      // Check which categories are new vs. already created today
      const totalAlreadyExists = existingKeys.has(`${projectId}|Total`);
      const engAlreadyExists   = engCodes.length > 0 && existingKeys.has(`${projectId}|Engineering`);

      const hasTotalData = totalHasMatch && !totalAlreadyExists;
      const hasEngData   = engCodes.length > 0 && engHasMatch && !engAlreadyExists;

      if (hasTotalData || hasEngData) {
        plan.push({
          action: "CREATE",
          projNum, projectId,
          totalBudget, totalSpent,
          engBudget, engSpent,
          hasTotalData, hasEngData,
          totalCodes, engCodes,
        });
      } else if (totalAlreadyExists || engAlreadyExists) {
        plan.push({
          action: "SKIP-TODAY",
          projNum, projectId,
          totalBudget, totalSpent,
          engBudget, engSpent,
          hasTotalData: false, hasEngData: false,
          totalCodes, engCodes,
        });
      } else {
        plan.push({
          action: "NOMATCH",
          projNum, projectId,
          totalBudget: 0, totalSpent: 0,
          engBudget: 0, engSpent: 0,
          hasTotalData: false, hasEngData: false,
          totalCodes, engCodes,
        });
      }
    }

    const result: BudgetPlanResult = { plan, filename, parseStats: stats, today };
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[budget-plan]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

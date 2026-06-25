import { NextRequest, NextResponse } from "next/server";
import { createRecord, BUDGETS_TABLE } from "@/lib/airtable";
import type { BudgetProjectAction, BudgetSyncResult } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { plan } = (await req.json()) as { plan: BudgetProjectAction[] };

    const today = new Date().toISOString().split("T")[0];

    let created = 0, skippedToday = 0, noErp = 0, noMatch = 0;

    for (const item of plan) {
      if (item.action === "SKIP-NOERP") { noErp++;       continue; }
      if (item.action === "SKIP-TODAY") { skippedToday++; continue; }
      if (item.action === "NOMATCH")    { noMatch++;      continue; }

      // CREATE
      if (item.hasTotalData) {
        await createRecord(BUDGETS_TABLE, {
          Projects:  [item.projectId],
          EntryDate: today,
          Category:  "Total",
          Budget:    item.totalBudget,
          Spent:     item.totalSpent,
        });
        created++;
      }

      if (item.hasEngData) {
        await createRecord(BUDGETS_TABLE, {
          Projects:  [item.projectId],
          EntryDate: today,
          Category:  "Engineering",
          Budget:    item.engBudget,
          Spent:     item.engSpent,
        });
        created++;
      }
    }

    const result: BudgetSyncResult = { created, skippedToday, noErp, noMatch, today };
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[budget-sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

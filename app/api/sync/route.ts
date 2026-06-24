import { NextRequest, NextResponse } from "next/server";
import { ALL_POSITIONS } from "@/lib/erpCodes";
import { createRecord, updateRecord, HOURS_TABLE } from "@/lib/airtable";
import type { ProjectAction, SyncResult } from "@/types";

function buildPayload(
  positionHours: Record<string, number>,
  today: string,
  filename: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    EntryDate: today,
    Notes: `ERP sync ${today} | file: ${filename}`,
  };
  for (const pos of ALL_POSITIONS) {
    // Explicitly write 0.0 so stale values from a prior week are overwritten
    payload[pos] = Math.round((positionHours[pos] ?? 0) * 100) / 100;
  }
  return payload;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      plan: ProjectAction[];
      filename: string;
    };

    if (!body?.plan || !Array.isArray(body.plan)) {
      return NextResponse.json(
        { error: "Invalid request: missing plan array." },
        { status: 400 },
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const filename = body.filename || "report.xlsx";

    let created = 0,
      updated = 0,
      skippedToday = 0,
      noErp = 0,
      noMatch = 0,
      totalHrs = 0;

    for (const action of body.plan) {
      if (
        action.action === "CREATE" &&
        action.projectId &&
        action.positionHours
      ) {
        const payload = buildPayload(action.positionHours, today, filename);
        payload["Project"] = [{ id: action.projectId }];
        await createRecord(HOURS_TABLE, payload);
        created++;
        totalHrs += action.totalHrs ?? 0;
      } else if (
        action.action === "UPDATE" &&
        action.recId &&
        action.positionHours
      ) {
        const payload = buildPayload(action.positionHours, today, filename);
        await updateRecord(HOURS_TABLE, action.recId, payload);
        updated++;
        totalHrs += action.totalHrs ?? 0;
      } else if (action.action === "SKIP-TODAY") {
        skippedToday++;
      } else if (action.action === "SKIP-NOERP") {
        noErp++;
      } else if (action.action === "NOMATCH") {
        noMatch++;
      }
    }

    const result: SyncResult = {
      created,
      updated,
      skippedToday,
      noErp,
      noMatch,
      totalHrs,
      today,
    };

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

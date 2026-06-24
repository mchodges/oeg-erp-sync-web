import { NextRequest, NextResponse } from "next/server";
import { parseReport } from "@/lib/parseReport";
import { aggregateHours, extractErpCodes } from "@/lib/erpCodes";
import {
  fetchAllRecords,
  normalizeLinkedIds,
  PROJECTS_TABLE,
  HOURS_TABLE,
} from "@/lib/airtable";
import type { PlanResult, ProjectAction } from "@/types";

const CHUNK = 50; // max record IDs per OR() formula

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
    const { rows, stats } = parseReport(buffer);

    // ── 2. Fetch all tracked projects ─────────────────────────────────────
    const projects = await fetchAllRecords(PROJECTS_TABLE, {
      filterByFormula: "{Tracking}=1",
      fields: ["ProjectNumber", "ERP_Codes_Total", "Hours"],
    });

    // ── 3. Batch-fetch all linked Hours records ───────────────────────────
    const allHoursIds: string[] = [];
    for (const p of projects) {
      allHoursIds.push(...normalizeLinkedIds(p.fields.Hours));
    }
    const uniqueIds = [...new Set(allHoursIds)];

    // Map of record ID → { EntryDate }
    const hoursCache = new Map<string, { id: string; entryDate: string }>();

    for (let i = 0; i < uniqueIds.length; i += CHUNK) {
      const chunk = uniqueIds.slice(i, i + CHUNK);
      const formula = `OR(${chunk.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
      const recs = await fetchAllRecords(HOURS_TABLE, {
        filterByFormula: formula,
        fields: ["EntryDate"],
      });
      for (const rec of recs) {
        hoursCache.set(rec.id, {
          id: rec.id,
          entryDate: (rec.fields.EntryDate as string) ?? "",
        });
      }
    }

    // ── 4. Build plan ─────────────────────────────────────────────────────
    const today = new Date().toISOString().split("T")[0];
    const unrecognized: Record<string, number> = {};
    const plan: ProjectAction[] = [];

    for (const project of projects) {
      const projNum = (project.fields.ProjectNumber as string) || "—";
      const projId = project.id;
      const erpRaw = ((project.fields.ERP_Codes_Total as string) || "").trim();
      const hoursIds = normalizeLinkedIds(project.fields.Hours);

      // STEP 1 — no ERP codes configured
      if (!erpRaw) {
        plan.push({ action: "SKIP-NOERP", projNum });
        continue;
      }
      const atCodes = extractErpCodes(erpRaw);
      if (atCodes.length === 0) {
        plan.push({ action: "SKIP-NOERP", projNum });
        continue;
      }

      // STEP 2 — already synced today
      const hoursRecs = hoursIds
        .map((id) => hoursCache.get(id))
        .filter(Boolean) as { id: string; entryDate: string }[];

      if (hoursRecs.some((r) => r.entryDate === today)) {
        plan.push({ action: "SKIP-TODAY", projNum, atCodes });
        continue;
      }

      // STEP 3 — match report rows
      const { positionHours, nMatched } = aggregateHours(
        rows,
        atCodes,
        unrecognized,
      );
      if (nMatched === 0) {
        plan.push({ action: "NOMATCH", projNum, atCodes });
        continue;
      }

      const totalHrs = Object.values(positionHours).reduce(
        (a, b) => a + b,
        0,
      );

      // STEP 4 — CREATE or UPDATE
      if (hoursIds.length === 0) {
        plan.push({
          action: "CREATE",
          projNum,
          projectId: projId,
          atCodes,
          positionHours,
          totalHrs,
          recId: null,
        });
      } else {
        // Pick the most recent linked Hours record by EntryDate
        const sorted = [...hoursRecs].sort((a, b) =>
          b.entryDate.localeCompare(a.entryDate),
        );
        plan.push({
          action: "UPDATE",
          projNum,
          projectId: projId,
          atCodes,
          positionHours,
          totalHrs,
          recId: sorted[0].id,
        });
      }
    }

    const result: PlanResult = {
      plan,
      unrecognized,
      filename,
      parseStats: stats,
      today,
    };

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[plan]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

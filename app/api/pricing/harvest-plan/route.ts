import { NextRequest, NextResponse } from "next/server";
import { parseBidTab } from "@/lib/parseBidTab";
import { filterNewRows } from "@/lib/supabase";
import type { HarvestFileResult, HarvestPlanResult } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files").filter((f): f is File => typeof f !== "string");

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided." }, { status: 400 });
    }

    const results: HarvestFileResult[] = [];

    for (const file of files) {
      try {
        const buffer = await file.arrayBuffer();
        const { projectName, bidDate, rows } = parseBidTab(buffer);
        const { newRows, duplicateRows } = await filterNewRows(file.name, rows);

        results.push({
          filename: file.name,
          projectName,
          bidDate,
          totalRows: rows.length,
          newRows: newRows.length,
          duplicateRows: duplicateRows.length,
          rows: newRows,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        results.push({
          filename: file.name,
          projectName: null,
          bidDate: null,
          totalRows: 0,
          newRows: 0,
          duplicateRows: 0,
          rows: [],
          error: message,
        });
      }
    }

    const result: HarvestPlanResult = {
      files: results,
      totalNewRows: results.reduce((s, f) => s + f.newRows, 0),
    };
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[pricing/harvest-plan]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

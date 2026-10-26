import { NextResponse } from "next/server";
import { updateRecords } from "@/lib/airtable";
import { MASTER_CATALOG_TABLE, PRICING_BASE_ID } from "@/lib/airtablePricing";
import { generateEstimate } from "@/lib/estimate";
import type { EstimateSyncResult } from "@/types";

export const maxDuration = 60;

/**
 * Recomputes the report on the server instead of trusting a report posted by the browser,
 * so this endpoint can only ever write what the data actually says.
 */
export async function POST() {
  try {
    const { report, today } = await generateEstimate();

    const updated = await updateRecords(
      MASTER_CATALOG_TABLE(),
      report.map((row) => ({
        id: row.recordId,
        fields: {
          Count: row.count,
          Weighted_Avg: row.weightedAvg,
          Median: row.median,
          Low: row.low,
          High: row.high,
          Last_Estimated_Date: today,
        },
      })),
      PRICING_BASE_ID(),
    );

    const result: EstimateSyncResult = { updated: updated.length, today };
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[pricing/estimate-sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

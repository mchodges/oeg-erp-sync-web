import { NextResponse } from "next/server";
import { updateRecords, upsertRecords } from "@/lib/airtable";
import { MASTER_CATALOG_TABLE, PRICE_HISTORY_TABLE, PRICING_BASE_ID } from "@/lib/airtablePricing";
import { generateEstimate } from "@/lib/estimate";
import type { EstimateSyncResult } from "@/types";

export const maxDuration = 60;

/**
 * Recomputes the report on the server instead of trusting a report posted by the browser,
 * so this endpoint can only ever write what the data actually says.
 *
 * Writes two things: the price columns on every Master_Catalog item (never Manual_Override or
 * Core, which are typed by hand), then one Price_History row per core item per month. The history
 * rows are matched on their Key, so running this again updates them rather than adding copies.
 */
export async function POST() {
  try {
    const { report, history, today } = await generateEstimate();

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
          Recommended_Price: row.recommendedPrice,
          Price_P25: row.priceP25,
          Price_P75: row.priceP75,
          Price_Confidence: row.priceConfidence,
          Price_Basis: row.priceBasis,
          Latest_Bid_Date: row.latestBidDate,
        },
      })),
      PRICING_BASE_ID(),
    );

    const result: EstimateSyncResult = { updated: updated.length, historyRows: 0, today };
    try {
      result.historyRows = await upsertRecords(
        PRICE_HISTORY_TABLE(),
        history.map((h) => ({
          fields: {
            Key: h.key,
            Item: [h.recordId],
            Month: h.month,
            Bids: h.bids,
            Projects: h.projects,
            Median: h.median,
            P25: h.p25,
            P75: h.p75,
            Recommended_As_Of: h.recommended,
            Confidence: h.confidence,
          },
        })),
        ["Key"],
        PRICING_BASE_ID(),
      );
    } catch (e) {
      // The catalog is already written; say so rather than reporting the whole run as failed.
      result.historyError = e instanceof Error ? e.message : String(e);
      console.error("[pricing/estimate-sync] price history", result.historyError);
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[pricing/estimate-sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

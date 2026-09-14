import { NextResponse } from "next/server";
import { fetchAllBidHistory } from "@/lib/supabase";
import { buildDictionaryMap, fetchMasterCatalog } from "@/lib/airtablePricing";
import { computeEstimateReport } from "@/lib/pricingMath";
import type { PricingEstimateResult } from "@/types";

export async function POST() {
  try {
    const [dictionaryMap, masterCatalog, bidHistory] = await Promise.all([
      buildDictionaryMap(),
      fetchMasterCatalog(),
      fetchAllBidHistory(),
    ]);

    const { report, reviewCount } = computeEstimateReport(bidHistory, dictionaryMap, masterCatalog);
    const today = new Date().toISOString().split("T")[0];

    const result: PricingEstimateResult = { report, reviewCount, today };
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[pricing/estimate-plan]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

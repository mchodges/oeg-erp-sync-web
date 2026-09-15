import { NextResponse } from "next/server";
import { fetchAllBidHistory } from "@/lib/supabase";
import { buildDictionaryMap, fetchIgnoredRawDescriptions, fetchMasterCatalog } from "@/lib/airtablePricing";
import { computeEstimateReport } from "@/lib/pricingMath";
import type { PricingEstimateResult } from "@/types";

export async function POST() {
  try {
    const [dictionaryMap, masterCatalog, bidHistory, ignoredDescriptions] = await Promise.all([
      buildDictionaryMap(),
      fetchMasterCatalog(),
      fetchAllBidHistory(),
      fetchIgnoredRawDescriptions(),
    ]);

    const { report, reviewCount, ignoredCount } = computeEstimateReport(
      bidHistory,
      dictionaryMap,
      masterCatalog,
      ignoredDescriptions,
    );
    const today = new Date().toISOString().split("T")[0];

    const result: PricingEstimateResult = { report, reviewCount, ignoredCount, today };
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[pricing/estimate-plan]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

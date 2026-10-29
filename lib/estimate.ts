import { fetchAllBidHistory } from "./supabase";
import {
  buildDictionaryMap,
  fetchIgnoredRawDescriptions,
  fetchMasterCatalog,
} from "./airtablePricing";
import { computeEstimateReport } from "./pricingMath";
import type { PricingEstimateResult } from "@/types";

/** Reads bid history + catalog + review decisions and computes the pricing report. */
export async function generateEstimate(): Promise<PricingEstimateResult> {
  const [dictionaryMap, masterCatalog, bidHistory, ignoredDescriptions] = await Promise.all([
    buildDictionaryMap(),
    fetchMasterCatalog(),
    fetchAllBidHistory(),
    fetchIgnoredRawDescriptions(),
  ]);

  const { report, reviewCount, ignoredCount, unitMismatchCount, unitMismatches, outlierCount, outliers } =
    computeEstimateReport(bidHistory, dictionaryMap, masterCatalog, ignoredDescriptions);
  const today = new Date().toISOString().split("T")[0];

  return { report, reviewCount, ignoredCount, unitMismatchCount, unitMismatches, outlierCount, outliers, today };
}

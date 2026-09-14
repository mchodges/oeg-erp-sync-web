import { NextResponse } from "next/server";
import { catalogAsOptions, fetchMasterCatalog, fetchPendingLivingMatches } from "@/lib/airtablePricing";
import type { LivingMatchRecord, LivingMatchesResult, MatchConfidence } from "@/types";

const CONFIDENCE_VALUES: MatchConfidence[] = ["High", "Medium", "Low"];

export async function GET() {
  try {
    const [pending, catalog] = await Promise.all([
      fetchPendingLivingMatches(),
      fetchMasterCatalog(),
    ]);

    const records: LivingMatchRecord[] = pending.map((r) => ({
      recordId: r.id,
      rawDescription: r.rawDescription,
      rawUnit: r.rawUnit,
      aiGuess: r.aiGuess,
      confidence: (CONFIDENCE_VALUES.includes(r.confidence as MatchConfidence)
        ? r.confidence
        : "Low") as MatchConfidence,
      masterItemId: r.masterItemId,
      status: "Pending",
    }));

    const result: LivingMatchesResult = {
      records,
      masterItems: catalogAsOptions(catalog),
    };
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[pricing/living-matches]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

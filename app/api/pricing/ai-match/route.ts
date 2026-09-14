import { NextRequest, NextResponse } from "next/server";
import { createRecords } from "@/lib/airtable";
import {
  catalogIdToName,
  catalogNameToId,
  fetchMasterCatalog,
  fetchVerifiedLivingMatches,
  LIVING_MATCHES_TABLE,
  PRICING_BASE_ID,
} from "@/lib/airtablePricing";
import { matchBatch, type FewShotExample } from "@/lib/aiMatch";
import type { LivingMatchGuess, UnmatchedItem } from "@/types";

export const maxDuration = 60;

function sampleFewShot(verified: FewShotExample[], n: number): FewShotExample[] {
  const shuffled = [...verified].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export async function POST(req: NextRequest) {
  try {
    const { items } = (await req.json()) as { items: UnmatchedItem[] };
    if (!items?.length) {
      return NextResponse.json({ error: "No items provided." }, { status: 400 });
    }

    const [catalog, verified] = await Promise.all([
      fetchMasterCatalog(),
      fetchVerifiedLivingMatches(),
    ]);

    const idToName = catalogIdToName(catalog);
    const nameToId = catalogNameToId(catalog);

    const fewShot = sampleFewShot(
      verified
        .map((v) => ({
          rawDescription: v.rawDescription,
          rawUnit: v.rawUnit,
          masterItem: idToName.get(v.masterItemId) ?? "",
        }))
        .filter((f) => f.masterItem),
      20,
    );

    const guesses = await matchBatch(items, catalog, fewShot);

    // Master_Item is a Link field to Master_Catalog — only set it when the AI's
    // guess exactly matches a real catalog item; otherwise leave it unlinked so
    // the reviewer picks one by hand rather than silently storing a bad link.
    const created = await createRecords(
      LIVING_MATCHES_TABLE(),
      guesses.map((g) => {
        const matchedId = nameToId.get(g.aiGuess);
        return {
          fields: {
            Raw_Description: g.rawDescription,
            Raw_Unit: g.rawUnit,
            AI_Guessed_Master_Item: g.aiGuess,
            Master_Item: matchedId ? [matchedId] : [],
            Confidence: g.confidence,
            Status: "Pending",
          },
        };
      }),
      PRICING_BASE_ID(),
    );

    const result: LivingMatchGuess[] = created.map((rec, i) => ({
      recordId: rec.id,
      rawDescription: guesses[i].rawDescription,
      rawUnit: guesses[i].rawUnit,
      aiGuess: guesses[i].aiGuess,
      confidence: guesses[i].confidence,
    }));

    return NextResponse.json({ created: result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[pricing/ai-match]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createRecords } from "@/lib/airtable";
import {
  catalogIdToName,
  catalogNameToId,
  fetchAllLivingMatches,
  fetchMasterCatalog,
  LIVING_MATCHES_TABLE,
  PRICING_BASE_ID,
} from "@/lib/airtablePricing";
import { matchBatch } from "@/lib/aiMatch";
import { selectExamples } from "@/lib/matchExamples";
import { normalizeDescription } from "@/lib/normalizeText";
import type { LivingMatchGuess, UnmatchedItem } from "@/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { items: requested } = (await req.json()) as { items: UnmatchedItem[] };
    if (!requested?.length) {
      return NextResponse.json({ error: "No items provided." }, { status: 400 });
    }

    const [catalog, allMatches] = await Promise.all([fetchMasterCatalog(), fetchAllLivingMatches()]);
    const known = new Set(allMatches.map((r) => normalizeDescription(r.rawDescription)).filter(Boolean));

    // Guard against double scans (two tabs, a retried batch): never create a second
    // Living_Matches row for a description that already has one in any status.
    const items = requested.filter((i) => !known.has(normalizeDescription(i.description)));
    if (items.length === 0) {
      return NextResponse.json({ created: [] });
    }

    const idToName = catalogIdToName(catalog);
    const nameToId = catalogNameToId(catalog);

    // Every past reviewer decision is available to the AI: approved matches teach it which item a
    // kind of line belongs to, and "no match" decisions teach it which lines the catalog lacks.
    const verified = allMatches
      .filter((r) => r.status === "Verified")
      .map((v) => ({
        rawDescription: v.rawDescription,
        rawUnit: v.rawUnit,
        masterItem: idToName.get(v.masterItemId) ?? "",
      }))
      .filter((f) => f.masterItem && f.rawDescription);
    const rejected = allMatches
      .filter((r) => r.status === "Ignored" && r.rawDescription)
      .map((r) => ({ rawDescription: r.rawDescription, rawUnit: r.rawUnit }));

    const examples = selectExamples(items, verified, rejected);
    const guesses = await matchBatch(items, catalog, examples.fewShot, examples.rejected);

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

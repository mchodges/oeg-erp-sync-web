import { NextResponse } from "next/server";
import { fetchAllBidHistory } from "@/lib/supabase";
import { buildDictionaryMap, fetchKnownRawDescriptions } from "@/lib/airtablePricing";
import type { UnmatchedItem, UnmatchedItemsResult } from "@/types";

export async function GET() {
  try {
    const [dictionaryMap, knownDescriptions, bidHistory] = await Promise.all([
      buildDictionaryMap(),
      fetchKnownRawDescriptions(),
      fetchAllBidHistory(),
    ]);

    const seen = new Set<string>();
    const items: UnmatchedItem[] = [];

    for (const row of bidHistory) {
      const desc = row.originalDescription.trim();
      if (!desc || seen.has(desc)) continue;
      seen.add(desc);

      if (dictionaryMap.has(desc)) continue; // already resolves
      if (knownDescriptions.has(desc)) continue; // already has a Living_Matches row (any status)

      items.push({ description: desc, unit: row.unit });
    }

    const result: UnmatchedItemsResult = { items, totalCount: items.length };
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[pricing/unmatched]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

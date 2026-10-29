import { NextResponse } from "next/server";
import { fetchMasterCatalog, fetchMatchingRules } from "@/lib/airtablePricing";

export const dynamic = "force-dynamic";

/** Shows what the AI matcher will read from Airtable: the active rulebook text and how many items carry notes. */
export async function GET() {
  try {
    const [rules, catalog] = await Promise.all([fetchMatchingRules(), fetchMasterCatalog()]);
    const withNotes = catalog.filter((c) => c.matchNotes);
    return NextResponse.json({
      rulebookActive: rules.length > 0,
      rulebookCharacters: rules.length,
      rulebook: rules,
      itemsWithNotes: withNotes.length,
      itemsWithNotesList: withNotes.map((c) => c.masterItemName),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[pricing/matching-rules]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

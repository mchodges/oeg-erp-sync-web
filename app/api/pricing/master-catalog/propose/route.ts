import { NextRequest, NextResponse } from "next/server";
import { fetchMasterCatalog } from "@/lib/airtablePricing";
import { proposeCatalogItem } from "@/lib/aiMatch";
import { distinctCategories } from "@/lib/catalogCategories";

export const maxDuration = 60;

/** Read-only: asks Claude how a bid line should be added to the catalog. Nothing is saved. */
export async function POST(req: NextRequest) {
  try {
    const { description, unit } = (await req.json()) as { description?: string; unit?: string };
    if (!description?.trim()) {
      return NextResponse.json({ error: "description is required." }, { status: 400 });
    }

    const catalog = await fetchMasterCatalog();
    const categories = distinctCategories(catalog);
    const proposal = await proposeCatalogItem(description.trim(), unit?.trim() ?? "", catalog, categories);
    return NextResponse.json(proposal);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[pricing/master-catalog/propose]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

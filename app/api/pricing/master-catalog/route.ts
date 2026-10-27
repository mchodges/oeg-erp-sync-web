import { NextRequest, NextResponse } from "next/server";
import { createRecords } from "@/lib/airtable";
import { fetchMasterCatalog, MASTER_CATALOG_TABLE, PRICING_BASE_ID } from "@/lib/airtablePricing";
import { distinctCategories } from "@/lib/catalogCategories";
import { normalizeDescription } from "@/lib/normalizeText";
import { CATALOG_UNITS, normalizeUnit } from "@/lib/units";
import type { MasterCatalogOption } from "@/types";

const MAX_NAME_LENGTH = 200;

/** Adds one new item to the Master Catalog (the reviewer has already confirmed name, unit and category). */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { name?: string; unit?: string; category?: string };
    const name = (body.name ?? "").trim().replace(/\s+/g, " ");
    const unit = normalizeUnit(body.unit);

    if (!name) return NextResponse.json({ error: "A name is required." }, { status: 400 });
    if (name.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: `The name must be ${MAX_NAME_LENGTH} characters or fewer.` }, { status: 400 });
    }
    if (!(CATALOG_UNITS as readonly string[]).includes(unit)) {
      return NextResponse.json({ error: `Unit must be one of ${CATALOG_UNITS.join(", ")}.` }, { status: 400 });
    }

    const catalog = await fetchMasterCatalog();

    // Airtable only accepts a category that already exists, and the field holds two spellings of
    // one category, so match case-insensitively and send the stored spelling.
    const category = distinctCategories(catalog.map((c) => ({ category: c.category }))).find(
      (c) => c.toLowerCase() === (body.category ?? "").trim().toLowerCase(),
    );
    if (!category) {
      return NextResponse.json({ error: "Pick one of the existing categories." }, { status: 400 });
    }

    const existing = catalog.find(
      (c) => normalizeDescription(c.masterItemName).toLowerCase() === normalizeDescription(name).toLowerCase(),
    );
    if (existing) {
      return NextResponse.json(
        { error: `The catalog already has an item named “${existing.masterItemName}”.`, existingId: existing.id },
        { status: 409 },
      );
    }

    const [created] = await createRecords(
      MASTER_CATALOG_TABLE(),
      [{ fields: { Master_Item_Name: name, Standard_Unit: unit, Category: category } }],
      PRICING_BASE_ID(),
    );

    const option: MasterCatalogOption = { id: created.id, name, unit, category };
    return NextResponse.json(option);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[pricing/master-catalog]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

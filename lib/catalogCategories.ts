import type { MasterCatalogOption } from "@/types";

/** Work-sequence order of the Master_Catalog categories (lower-cased); anything else follows alphabetically. */
export const CATEGORY_ORDER = [
  "clearing, grubbing, and site preparation",
  "water distribution system",
  "wastewater collection system",
  "storm water collection system",
  "detention basin",
  "amenity lake",
  "low impact development landscaping",
  "excavation and paving",
  "boring & casing",
  "swppp",
  "miscellaneous",
];

export function categoryRank(key: string): number {
  const i = CATEGORY_ORDER.indexOf(key);
  return i === -1 ? (key === "uncategorized" ? 1001 : 1000) : i;
}

/**
 * The catalog's categories, one per case-insensitive spelling (the Airtable field has both
 * "…And Site Preparation" and "…and Site Preparation"), in work-sequence order.
 */
export function distinctCategories(items: Pick<MasterCatalogOption, "category">[]): string[] {
  const byKey = new Map<string, string>();
  for (const item of items) {
    const label = item.category.trim();
    if (label && !byKey.has(label.toLowerCase())) byKey.set(label.toLowerCase(), label);
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => categoryRank(a) - categoryRank(b) || a.localeCompare(b))
    .map(([, label]) => label);
}

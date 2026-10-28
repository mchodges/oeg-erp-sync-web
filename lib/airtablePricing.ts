import { fetchAllRecords, normalizeLinkedIds, type AirtableRecord } from "./airtable";
import type { MasterCatalogOption } from "@/types";
import { normalizeDescription } from "./normalizeText";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is not set.`);
  return value;
}

export const PRICING_BASE_ID = () => requireEnv("PRICING_BASE_ID");
export const MASTER_CATALOG_TABLE = () => requireEnv("MASTER_CATALOG_TABLE_ID");
export const LIVING_MATCHES_TABLE = () => requireEnv("LIVING_MATCHES_TABLE_ID");

export interface MasterCatalogRecord {
  id: string;
  masterItemName: string;
  standardUnit: string;
  category: string;
  excludeFromStats: boolean;
  /** Master_Catalog record id of the all-in item this item is one part of, or "" (see combineBids.ts). */
  combinesInto: string;
  /** What belongs in this item and what does not, written for the AI matcher (Master_Catalog.Match_Notes). */
  matchNotes: string;
}

export async function fetchMasterCatalog(): Promise<MasterCatalogRecord[]> {
  const records = await fetchAllRecords(
    MASTER_CATALOG_TABLE(),
    { fields: ["Master_Item_Name", "Standard_Unit", "Category", "Exclude_From_Stats", "Combines_Into", "Match_Notes"] },
    PRICING_BASE_ID(),
  );
  return records.map((r) => ({
    id: r.id,
    masterItemName: String(r.fields.Master_Item_Name ?? "").trim(),
    standardUnit: String(r.fields.Standard_Unit ?? "").trim(),
    category: String(r.fields.Category ?? "").trim(),
    excludeFromStats: Boolean(r.fields.Exclude_From_Stats),
    combinesInto: normalizeLinkedIds(r.fields.Combines_Into)[0] ?? "",
    matchNotes: String(r.fields.Match_Notes ?? "").trim(),
  }));
}

/** The Matching_Rules table: general instructions for the AI matcher, edited in Airtable without a deploy. */
const MATCHING_RULES_TABLE = () => process.env.MATCHING_RULES_TABLE_ID ?? "tblj0iUlOtRYMuGVV";

/**
 * The active rows of Matching_Rules joined into one text block, in Name order. Matching still works
 * without it, so a missing table or a failed read yields "" instead of stopping the scan.
 */
export async function fetchMatchingRules(): Promise<string> {
  try {
    const records = await fetchAllRecords(
      MATCHING_RULES_TABLE(),
      { fields: ["Name", "Rules", "Active"] },
      PRICING_BASE_ID(),
    );
    return records
      .filter((r) => Boolean(r.fields.Active) && String(r.fields.Rules ?? "").trim())
      .sort((a, b) =>
        String(a.fields.Name ?? "").localeCompare(String(b.fields.Name ?? ""), undefined, { numeric: true }),
      )
      .map((r) => `## ${String(r.fields.Name ?? "").trim()}\n${String(r.fields.Rules).trim()}`)
      .join("\n\n");
  } catch (e) {
    console.error("[matching-rules]", e instanceof Error ? e.message : String(e));
    return "";
  }
}

export function catalogAsOptions(catalog: MasterCatalogRecord[]): MasterCatalogOption[] {
  return catalog
    .filter((c) => c.masterItemName)
    .map((c) => ({ id: c.id, name: c.masterItemName, unit: c.standardUnit, category: c.category }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function catalogNameToId(catalog: MasterCatalogRecord[]): Map<string, string> {
  return new Map(catalog.filter((c) => c.masterItemName).map((c) => [c.masterItemName, c.id]));
}

export function catalogIdToName(catalog: MasterCatalogRecord[]): Map<string, string> {
  return new Map(catalog.map((c) => [c.id, c.masterItemName]));
}

export interface LivingMatchAirtableRecord {
  id: string;
  rawDescription: string;
  rawUnit: string;
  aiGuess: string;
  /** Master_Catalog record id linked via the Master_Item link field, or "" if unset. */
  masterItemId: string;
  confidence: string;
  status: string;
  /** Approved by the tool (near-identical to a person-approved line), not by a person. */
  autoApproved: boolean;
}

function toLivingMatch(r: AirtableRecord): LivingMatchAirtableRecord {
  return {
    id: r.id,
    rawDescription: String(r.fields.Raw_Description ?? "").trim(),
    rawUnit: String(r.fields.Raw_Unit ?? "").trim(),
    aiGuess: String(r.fields.AI_Guessed_Master_Item ?? "").trim(),
    masterItemId: normalizeLinkedIds(r.fields.Master_Item)[0] ?? "",
    confidence: String(r.fields.Confidence ?? "").trim(),
    status: String(r.fields.Status ?? "").trim(),
    autoApproved: Boolean(r.fields.Auto_Approved),
  };
}

export async function fetchAllLivingMatches(): Promise<LivingMatchAirtableRecord[]> {
  const records = await fetchAllRecords(LIVING_MATCHES_TABLE(), {}, PRICING_BASE_ID());
  return records.map(toLivingMatch);
}

export async function fetchPendingLivingMatches(): Promise<LivingMatchAirtableRecord[]> {
  const records = await fetchAllRecords(
    LIVING_MATCHES_TABLE(),
    { filterByFormula: "{Status}='Pending'" },
    PRICING_BASE_ID(),
  );
  return records.map(toLivingMatch);
}

export async function fetchVerifiedLivingMatches(): Promise<LivingMatchAirtableRecord[]> {
  const records = await fetchAllRecords(
    LIVING_MATCHES_TABLE(),
    { filterByFormula: "{Status}='Verified'" },
    PRICING_BASE_ID(),
  );
  return records.map(toLivingMatch);
}

/**
 * Master Catalog exact-name matches, overlaid with Verified Living_Matches raw→master
 * mappings. Values are Master_Catalog record ids (not names) so renaming a catalog
 * item never orphans historical Living_Matches links. Master_Item resolution at
 * estimate/scan time always goes through this.
 */
export async function buildDictionaryMap(): Promise<Map<string, string>> {
  const [catalog, verified] = await Promise.all([
    fetchMasterCatalog(),
    fetchVerifiedLivingMatches(),
  ]);

  // Keys are normalizeDescription() forms; look up with the same function.
  const map = new Map<string, string>();
  for (const item of catalog) {
    if (item.masterItemName) map.set(normalizeDescription(item.masterItemName), item.id);
  }
  for (const row of verified) {
    if (row.rawDescription && row.masterItemId) {
      map.set(normalizeDescription(row.rawDescription), row.masterItemId);
    }
  }
  return map;
}

/** Every raw description that already has a Living_Matches row, regardless of status (normalized keys). */
export async function fetchKnownRawDescriptions(): Promise<Set<string>> {
  const all = await fetchAllLivingMatches();
  return new Set(all.map((r) => normalizeDescription(r.rawDescription)).filter(Boolean));
}

/** Raw descriptions explicitly rejected as having no Master_Catalog match — these will
 * never resolve and should be reported separately from ones still awaiting review. */
export async function fetchIgnoredRawDescriptions(): Promise<Set<string>> {
  const records = await fetchAllRecords(
    LIVING_MATCHES_TABLE(),
    { filterByFormula: "{Status}='Ignored'" },
    PRICING_BASE_ID(),
  );
  return new Set(
    records.map((r) => normalizeDescription(toLivingMatch(r).rawDescription)).filter(Boolean),
  );
}

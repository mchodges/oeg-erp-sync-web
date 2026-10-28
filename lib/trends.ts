import { fetchAllBidHistory, type BidHistoryRow } from "./supabase";
import { buildDictionaryMap, fetchMasterCatalog, type MasterCatalogRecord } from "./airtablePricing";
import { normalizeDescription } from "./normalizeText";
import { unitsConflict } from "./units";
import { BENCHMARKS } from "./benchmarks";
import { combineSplitBids, type AcceptedLine } from "./combineBids";
import { parseBidDate, type TrendData, type TrendItem } from "./priceTrend";

/**
 * Turns the bid history into per-item lists of dated bids. A bid is kept under the same rules as
 * the pricing report (linked to a catalog item, priced, quantity above zero, unit agrees with the
 * catalog, one line per project + contractor + item + price), so the trend and the report agree.
 */
export function buildTrendData(
  bidHistory: BidHistoryRow[],
  dictionaryMap: Map<string, string>,
  catalog: MasterCatalogRecord[],
): TrendData {
  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const items = new Map<string, TrendItem>();
  const projectIndex = new Map<string, number>();
  const projects: string[] = [];
  const seen = new Set<string>();
  const accepted: AcceptedLine[] = [];
  const skipped = { undated: 0, unitMismatch: 0 };
  let lastDate: string | null = null;

  // Oldest ingested row first, so the dedupe keeps the same line the pricing report keeps.
  for (const row of [...bidHistory].sort((a, b) => a.id - b.id)) {
    if (!Number.isFinite(row.price) || row.price <= 0) continue;
    if (!Number.isFinite(row.qty) || row.qty <= 0) continue;

    const itemId = dictionaryMap.get(normalizeDescription(row.originalDescription));
    const item = itemId ? catalogById.get(itemId) : undefined;
    if (!item || item.excludeFromStats) continue;

    if (unitsConflict(row.unit, item.standardUnit)) {
      skipped.unitMismatch++;
      continue;
    }

    const dupeKey = `${row.projectName ?? ""}|${row.contractor}|${item.id}|${row.price}`;
    if (seen.has(dupeKey)) continue;
    seen.add(dupeKey);

    const date = parseBidDate(row.bidDate);
    if (!date) {
      skipped.undated++;
      continue;
    }
    if (!lastDate || date > lastDate) lastDate = date;

    const projectName = row.projectName?.trim() || "(unknown project)";
    let project = projectIndex.get(projectName);
    if (project === undefined) {
      project = projects.length;
      projects.push(projectName);
      projectIndex.set(projectName, project);
    }

    let entry = items.get(item.id);
    if (!entry) {
      entry = { id: item.id, name: item.masterItemName, unit: item.standardUnit, category: item.category, bids: [] };
      items.set(item.id, entry);
    }
    entry.bids.push({ date, price: row.price, project, contractor: row.contractor });
    accepted.push({ projectName, contractor: row.contractor, itemId: item.id, price: row.price, qty: row.qty, date });
  }

  // Split bids (excavate line + haul/place line) become one all-in bid for the all-in item.
  for (const line of combineSplitBids(accepted, catalog)) {
    const target = catalogById.get(line.itemId);
    if (!target || !line.date) continue;
    let entry = items.get(target.id);
    if (!entry) {
      entry = { id: target.id, name: target.masterItemName, unit: target.standardUnit, category: target.category, bids: [] };
      items.set(target.id, entry);
    }
    entry.bids.push({ date: line.date, price: line.price, project: projectIndex.get(line.projectName) ?? 0, contractor: line.contractor });
  }

  const idByName = new Map(catalog.map((c) => [normalizeDescription(c.masterItemName), c.id]));
  const benchmarks = BENCHMARKS.map((b) => ({
    key: b.key,
    label: b.label,
    itemId: idByName.get(normalizeDescription(b.catalogName)) ?? null,
  }));

  return { items: [...items.values()], projects, benchmarks, lastDate, skipped };
}

export async function generateTrendData(): Promise<TrendData> {
  const [dictionaryMap, catalog, bidHistory] = await Promise.all([
    buildDictionaryMap(),
    fetchMasterCatalog(),
    fetchAllBidHistory(),
  ]);
  return buildTrendData(bidHistory, dictionaryMap, catalog);
}

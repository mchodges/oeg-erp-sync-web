import type { MasterCatalogRecord } from "./airtablePricing";

/** One accepted bid line: priced, quantity above zero, unit agrees with the catalog, de-duplicated. */
export interface AcceptedLine {
  projectName: string;
  contractor: string;
  itemId: string;
  price: number;
  qty: number;
  /** Bid date (YYYY-MM-DD) when the caller has one; the combined line takes the earliest component's. */
  date?: string;
}

/**
 * Some bidders price earthwork as one line (excavate, haul, place) and others split it into an
 * excavate line and a haul/place line. Catalog items marked "Combines_Into" an all-in item are the
 * components of a split. When one contractor bids EVERY component on one project, their unit prices
 * (each averaged by quantity if the project repeats it) are added into one all-in line for the
 * target item, so split and all-in bidders can be compared. The component lines still count under
 * their own items; a contractor who bid only some of the components yields nothing here.
 */
export function combineSplitBids(lines: AcceptedLine[], catalog: MasterCatalogRecord[]): AcceptedLine[] {
  const componentsOf = new Map<string, Set<string>>();
  for (const item of catalog) {
    if (!item.combinesInto || item.combinesInto === item.id) continue;
    const set = componentsOf.get(item.combinesInto) ?? new Set<string>();
    set.add(item.id);
    componentsOf.set(item.combinesInto, set);
  }
  // A split needs at least two pieces; a lone link is a setup slip, not a split.
  for (const [target, set] of componentsOf) if (set.size < 2) componentsOf.delete(target);
  if (componentsOf.size === 0) return [];

  const isComponent = new Set([...componentsOf.values()].flatMap((s) => [...s]));
  type Part = { cost: number; qty: number; date?: string };
  // One entry per contractor on one project: componentId -> totals.
  const parts = new Map<string, { projectName: string; contractor: string; byItem: Map<string, Part> }>();
  for (const l of lines) {
    if (!isComponent.has(l.itemId)) continue;
    const key = JSON.stringify([l.projectName, l.contractor]);
    const entry = parts.get(key) ?? { projectName: l.projectName, contractor: l.contractor, byItem: new Map<string, Part>() };
    const p = entry.byItem.get(l.itemId) ?? { cost: 0, qty: 0, date: l.date };
    p.cost += l.price * l.qty;
    p.qty += l.qty;
    if (l.date && (!p.date || l.date < p.date)) p.date = l.date;
    entry.byItem.set(l.itemId, p);
    parts.set(key, entry);
  }

  const out: AcceptedLine[] = [];
  for (const { projectName, contractor, byItem } of parts.values()) {
    for (const [target, components] of componentsOf) {
      const have = [...components].map((id) => byItem.get(id));
      if (have.some((p) => !p)) continue;
      const present = have as Part[];
      const dates = present.map((p) => p.date).filter((d): d is string => !!d).sort();
      out.push({
        projectName,
        contractor,
        itemId: target,
        price: Math.round(present.reduce((s, p) => s + p.cost / p.qty, 0) * 100) / 100,
        qty: Math.max(...present.map((p) => p.qty)),
        date: dates[0],
      });
    }
  }
  return out;
}

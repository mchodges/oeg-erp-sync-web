/** One contractor's unit price on one project, for one catalog item. */
export interface TrendBid {
  /** Bid date as YYYY-MM-DD. */
  date: string;
  price: number;
  /** Index into TrendData.projects. */
  project: number;
  contractor: string;
}

export interface TrendItem {
  id: string;
  name: string;
  unit: string;
  category: string;
  bids: TrendBid[];
}

export interface TrendBenchmark {
  key: string;
  label: string;
  /** The catalog item this benchmark follows, or null when the catalog has no item by that name. */
  itemId: string | null;
}

export interface TrendData {
  items: TrendItem[];
  projects: string[];
  benchmarks: TrendBenchmark[];
  /** Latest bid date across all items (YYYY-MM-DD), so every chart ends on the same period. */
  lastDate: string | null;
  skipped: { undated: number; unitMismatch: number };
}

export type Granularity = "month" | "quarter";

export interface TrendPeriod {
  key: string;
  label: string;
  n: number;
  projects: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  low: number | null;
  high: number | null;
  /** Too few bids or projects for the median to mean much. */
  thin: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Fewer bids or projects than this and a period's median is flagged as thin. */
export const MIN_BIDS = 3;
export const MIN_PROJECTS = 2;

/** Reads the bid dates found in bid tabs (M/D/YYYY, M/D/YY, YYYY-MM-DD) into YYYY-MM-DD, or null. */
export function parseBidDate(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let hit = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (hit) {
    [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  } else {
    hit = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
    if (!hit) return null;
    [m, d, y] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
    if (y < 100) y += 2000;
  }
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Absolute index of the month/quarter a YYYY-MM-DD date falls in. */
function periodIndex(date: string, g: Granularity): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - 1;
  return g === "month" ? y * 12 + m : y * 4 + Math.floor(m / 3);
}

function periodLabel(index: number, g: Granularity): string {
  if (g === "month") return `${MONTHS[index % 12]} ${Math.floor(index / 12)}`;
  return `Q${(index % 4) + 1} ${Math.floor(index / 4)}`;
}

/** The label of the month/quarter a bid date falls in, e.g. "Mar 2026" or "Q1 2026". */
export function bidPeriodLabel(date: string, g: Granularity): string {
  return periodLabel(periodIndex(date, g), g);
}

/**
 * Groups one item's bids into months or quarters. The periods run unbroken up to the latest bid
 * date in the whole data set (a quiet month shows as a gap, not a missing point). `lastPeriods`
 * keeps only the most recent N periods; null keeps everything from the item's first bid.
 */
export function buildPeriods(
  bids: TrendBid[],
  g: Granularity,
  lastDate: string | null,
  lastPeriods: number | null,
): TrendPeriod[] {
  if (bids.length === 0 || !lastDate) return [];
  const buckets = new Map<number, TrendBid[]>();
  for (const b of bids) {
    const i = periodIndex(b.date, g);
    const list = buckets.get(i);
    if (list) list.push(b);
    else buckets.set(i, [b]);
  }

  const end = Math.max(periodIndex(lastDate, g), ...buckets.keys());
  let start = Math.min(...buckets.keys());
  if (lastPeriods !== null) start = Math.max(start, end - lastPeriods + 1);

  const periods: TrendPeriod[] = [];
  for (let i = start; i <= end; i++) {
    const list = buckets.get(i) ?? [];
    const label = periodLabel(i, g);
    if (list.length === 0) {
      periods.push({ key: String(i), label, n: 0, projects: 0, median: null, p25: null, p75: null, low: null, high: null, thin: true });
      continue;
    }
    const prices = list.map((b) => b.price).sort((a, b) => a - b);
    const projects = new Set(list.map((b) => b.project)).size;
    periods.push({
      key: String(i),
      label,
      n: list.length,
      projects,
      median: round2(percentile(prices, 0.5)),
      p25: round2(percentile(prices, 0.25)),
      p75: round2(percentile(prices, 0.75)),
      low: round2(prices[0]),
      high: round2(prices[prices.length - 1]),
      thin: list.length < MIN_BIDS || projects < MIN_PROJECTS,
    });
  }
  return periods;
}

/**
 * The recommended price for a catalog item: a recency-weighted median of its bids. A bid counts
 * half as much for every HALF_LIFE_MONTHS it is older than the "as of" date, so recent bids lead
 * but older ones still help when an item is bid rarely. In a replay of past quarters (predicting
 * each item's next three months of bids) this was as accurate as the best fixed window for common
 * items and clearly better for items with few recent bids; a plain 3-month window was the worst.
 */
export type PriceConfidence = "Solid" | "Thin" | "None";

export const HALF_LIFE_MONTHS = 6;
/** Solid = at least this many bids from at least this many projects inside the window. */
export const SOLID_MIN_BIDS = 10;
export const SOLID_MIN_PROJECTS = 4;
export const SOLID_WINDOW_MONTHS = 12;

const DAYS_PER_MONTH = 30.4;
/** An undated bid is treated as this old (months); it is never counted when replaying past months. */
const UNDATED_AGE_MONTHS = 12;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface DatedSample {
  price: number;
  /** Bid date as YYYY-MM-DD, or null when the bid tab had none. */
  date: string | null;
  projectName: string;
}

export interface Recommendation {
  price: number | null;
  /** Low and high ends of the middle half of bids (25th and 75th percentile, same weighting). */
  p25: number | null;
  p75: number | null;
  bids: number;
  projects: number;
  latestBidDate: string | null;
  confidence: PriceConfidence;
  /** Plain-English basis, e.g. "41 bids from 14 projects, latest Oct 2026". */
  basis: string;
}

export interface MonthHistory {
  /** First day of the month, YYYY-MM-01. */
  month: string;
  bids: number;
  projects: number;
  /** Median and middle half of this month's own bids; null in a month with no bids. */
  median: number | null;
  p25: number | null;
  p75: number | null;
  /** The recommendation as it stood at the end of this month (or today, for the current month). */
  recommended: number | null;
  confidence: PriceConfidence;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function isoFromDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/** The first price whose running share of the total weight reaches q, for each q. */
function weightedQuantiles(items: { price: number; weight: number }[], qs: number[]): number[] {
  const sorted = [...items].sort((a, b) => a.price - b.price);
  const total = sorted.reduce((s, i) => s + i.weight, 0);
  return qs.map((q) => {
    let running = 0;
    for (const item of sorted) {
      running += item.weight;
      if (running / total >= q - 1e-12) return item.price;
    }
    return sorted[sorted.length - 1].price;
  });
}

function projectKey(name: string): string {
  return name.trim().toLowerCase();
}

function describe(bids: number, projects: number, latest: string | null): string {
  if (bids === 0) return "No usable bids";
  const when = latest ? `, latest ${MONTH_NAMES[Number(latest.slice(5, 7)) - 1]} ${latest.slice(0, 4)}` : "";
  return `${bids} bid${bids === 1 ? "" : "s"} from ${projects} project${projects === 1 ? "" : "s"}${when}`;
}

/**
 * The recommendation using only bids dated on or before `asOf` (YYYY-MM-DD). `includeUndated`
 * is for the live price (an undated bid still carries information); replays of past months leave
 * them out because there is no telling when they belong.
 */
export function recommend(samples: DatedSample[], asOf: string, includeUndated = true): Recommendation {
  const asOfDay = dayNumber(asOf);
  const usable = samples.filter((s) => (s.date === null ? includeUndated : s.date <= asOf));
  if (usable.length === 0) {
    return { price: null, p25: null, p75: null, bids: 0, projects: 0, latestBidDate: null, confidence: "None", basis: describe(0, 0, null) };
  }

  const ageMonths = (s: DatedSample) =>
    s.date === null ? UNDATED_AGE_MONTHS : Math.max(0, (asOfDay - dayNumber(s.date)) / DAYS_PER_MONTH);
  const [p25, median, p75] = weightedQuantiles(
    usable.map((s) => ({ price: s.price, weight: 0.5 ** (ageMonths(s) / HALF_LIFE_MONTHS) })),
    [0.25, 0.5, 0.75],
  );

  const projects = new Set(usable.map((s) => projectKey(s.projectName))).size;
  const dated = usable.map((s) => s.date).filter((d): d is string => d !== null);
  const latestBidDate = dated.length ? dated.reduce((a, b) => (a > b ? a : b)) : null;

  const inWindow = usable.filter((s) => s.date !== null && ageMonths(s) <= SOLID_WINDOW_MONTHS);
  const windowProjects = new Set(inWindow.map((s) => projectKey(s.projectName))).size;
  const confidence: PriceConfidence =
    inWindow.length >= SOLID_MIN_BIDS && windowProjects >= SOLID_MIN_PROJECTS ? "Solid" : "Thin";

  return {
    price: round2(median),
    p25: round2(p25),
    p75: round2(p75),
    bids: usable.length,
    projects,
    latestBidDate,
    confidence,
    basis: describe(usable.length, projects, latestBidDate),
  };
}

/** The windows tried, in order, for the catalog's count / average / median / low / high. */
export const STATS_WINDOWS_MONTHS = [12, 24];

/**
 * The bids the catalog's count, average, median, low and high are computed from: the last 12 months
 * if that holds enough bids to judge (the same bar as a Solid price: SOLID_MIN_BIDS bids from
 * SOLID_MIN_PROJECTS projects), otherwise the last 24 months, otherwise all history. Undated bids
 * only count when it falls back to all history. In the replay of past quarters this rule predicted
 * the next three months about as well as the recency-weighted median (8.1% vs 7.8% typical miss).
 */
export function recentWindow<T extends DatedSample>(samples: T[], asOf: string): { samples: T[]; label: string } {
  const asOfDay = dayNumber(asOf);
  for (const months of STATS_WINDOWS_MONTHS) {
    const inWindow = samples.filter(
      (s) => s.date !== null && s.date <= asOf && (asOfDay - dayNumber(s.date)) / DAYS_PER_MONTH <= months,
    );
    const projects = new Set(inWindow.map((s) => projectKey(s.projectName))).size;
    if (inWindow.length >= SOLID_MIN_BIDS && projects >= SOLID_MIN_PROJECTS) {
      return { samples: inWindow, label: `last ${months} months` };
    }
  }
  return { samples, label: "all history" };
}

function lastDayOfMonth(year: number, month: number): string {
  return isoFromDay(Date.UTC(year, month, 0) / 86_400_000);
}

/**
 * One row per month from the item's first dated bid through the month of `today`: that month's own
 * bids, and the recommendation as it would have stood at the end of the month (using only bids up
 * to then). Months with no bids still carry the recommendation, so a chart line stays continuous.
 */
export function monthlyHistory(samples: DatedSample[], today: string): MonthHistory[] {
  const dated = samples.filter((s): s is DatedSample & { date: string } => s.date !== null);
  if (dated.length === 0) return [];
  const first = dated.reduce((a, b) => (a.date < b.date ? a : b)).date;

  const rows: MonthHistory[] = [];
  let year = Number(first.slice(0, 4));
  let month = Number(first.slice(5, 7));
  const lastYear = Number(today.slice(0, 4));
  const lastMonth = Number(today.slice(5, 7));
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;
    const own = dated.filter((s) => s.date.startsWith(monthKey));
    const end = lastDayOfMonth(year, month);
    const asOf = end < today ? end : today;
    const rec = recommend(samples, asOf, false);

    let median: number | null = null;
    let p25: number | null = null;
    let p75: number | null = null;
    if (own.length > 0) {
      const [lo, mid, hi] = weightedQuantiles(own.map((s) => ({ price: s.price, weight: 1 })), [0.25, 0.5, 0.75]);
      [p25, median, p75] = [round2(lo), round2(mid), round2(hi)];
    }
    rows.push({
      month: `${monthKey}-01`,
      bids: own.length,
      projects: new Set(own.map((s) => projectKey(s.projectName))).size,
      median,
      p25,
      p75,
      recommended: rec.price,
      confidence: rec.confidence,
    });

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return rows;
}

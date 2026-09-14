import { createClient } from "@supabase/supabase-js";
import type { RawBidRow } from "@/types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is not set.`);
  return value;
}

interface BidHistoryDbRow {
  id: number;
  source_file: string;
  project_name: string | null;
  bid_date: string | null;
  contractor: string;
  original_description: string;
  qty: number;
  unit: string | null;
  price: number;
}

let client: ReturnType<typeof createClient> | null = null;

function supabase() {
  if (!client) {
    client = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
  }
  return client;
}

const TABLE = "bid_history";
const PAGE_SIZE = 1000;

/**
 * postgrest-js's column-selection generics need a full generated Database
 * schema type to resolve row shapes; without one they collapse to `never`.
 * We type our own row shapes by hand instead (below) and cast query results.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function table(): any {
  return supabase().from(TABLE);
}

export interface BidHistoryRow {
  sourceFile: string;
  projectName: string | null;
  bidDate: string | null;
  contractor: string;
  originalDescription: string;
  qty: number;
  unit: string;
  price: number;
}

function fromDbRow(r: BidHistoryDbRow): BidHistoryRow {
  return {
    sourceFile: r.source_file,
    projectName: r.project_name,
    bidDate: r.bid_date,
    contractor: r.contractor,
    originalDescription: r.original_description,
    qty: r.qty,
    unit: r.unit ?? "",
    price: r.price,
  };
}

function dedupeKey(contractor: string, description: string, qty: number, price: number): string {
  return `${contractor}${description}${qty}${price}`;
}

/** Splits rows already parsed from a file into new vs. already-ingested (by dedup key), scoped to that filename. */
export async function filterNewRows(
  filename: string,
  rows: RawBidRow[],
): Promise<{ newRows: RawBidRow[]; duplicateRows: RawBidRow[] }> {
  const { data, error } = await table()
    .select("contractor, original_description, qty, price")
    .eq("source_file", filename);

  if (error) throw new Error(`Supabase select failed: ${error.message}`);

  const existingRows = (data ?? []) as Pick<
    BidHistoryDbRow,
    "contractor" | "original_description" | "qty" | "price"
  >[];
  const existingKeys = new Set(
    existingRows.map((r) =>
      dedupeKey(
        String(r.contractor),
        String(r.original_description),
        Number(r.qty),
        Number(r.price),
      ),
    ),
  );

  const newRows: RawBidRow[] = [];
  const duplicateRows: RawBidRow[] = [];
  for (const row of rows) {
    const key = dedupeKey(row.contractor, row.originalDescription, row.qty, row.price);
    if (existingKeys.has(key)) duplicateRows.push(row);
    else newRows.push(row);
  }
  return { newRows, duplicateRows };
}

export async function insertBidHistoryRows(
  filename: string,
  projectName: string | null,
  bidDate: string | null,
  rows: RawBidRow[],
): Promise<{ inserted: number; duplicatesSkipped: number }> {
  if (rows.length === 0) return { inserted: 0, duplicatesSkipped: 0 };

  const dbRows = rows.map((r) => ({
    source_file: filename,
    project_name: projectName,
    bid_date: bidDate,
    contractor: r.contractor,
    original_description: r.originalDescription,
    qty: r.qty,
    unit: r.unit,
    price: r.price,
  }));

  const { data, error } = await table()
    .upsert(dbRows, {
      onConflict: "source_file,contractor,original_description,qty,price",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);

  const inserted = (data as unknown[] | null)?.length ?? 0;
  return { inserted, duplicatesSkipped: rows.length - inserted };
}

export async function fetchAllBidHistory(): Promise<BidHistoryRow[]> {
  const rows: BidHistoryRow[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await table()
      .select("id, source_file, project_name, bid_date, contractor, original_description, qty, unit, price")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Supabase select failed: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...(data as unknown as BidHistoryDbRow[]).map(fromDbRow));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

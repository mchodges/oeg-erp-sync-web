import { createClient } from "@supabase/supabase-js";
import type { RawBidRow } from "@/types";
import { normalizeDescription } from "./normalizeText";

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
  id: number;
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
    id: r.id,
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
  return `${contractor}${normalizeDescription(description)}${qty}${price}`;
}

type KeyRow = Pick<
  BidHistoryDbRow,
  "contractor" | "original_description" | "qty" | "price" | "source_file"
>;

/** Reads every matching row; PostgREST caps a single response at 1,000 rows. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function selectAllKeyRows(filter: (q: any) => any): Promise<KeyRow[]> {
  const out: KeyRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await filter(
      table().select("contractor, original_description, qty, price, source_file"),
    )
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Supabase select failed: ${error.message}`);
    const page = (data ?? []) as KeyRow[];
    out.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return out;
}

/** Same line item regardless of which file it came from (a renamed copy of a bid tab). */
function contentKey(
  projectName: string | null,
  contractor: string,
  description: string,
  qty: number,
  price: number,
): string {
  return JSON.stringify([
    projectName ?? "",
    contractor,
    normalizeDescription(description),
    Number(qty),
    Number(price),
  ]);
}

/**
 * Splits rows already parsed from a file into new vs. already-ingested. A row is a
 * duplicate if the same line exists under this filename (dedup key), under ANY other
 * filename for the same project (a renamed or re-downloaded copy), or in an earlier
 * file of the same upload (`batchSeen`, shared across the files of one request).
 */
export async function filterNewRows(
  filename: string,
  projectName: string | null,
  rows: RawBidRow[],
  batchSeen: Set<string> = new Set(),
): Promise<{ newRows: RawBidRow[]; duplicateRows: RawBidRow[]; duplicateOfFiles: string[] }> {
  const sameFile = await selectAllKeyRows((q) => q.eq("source_file", filename));
  const sameFileKeys = new Set(
    sameFile.map((r) =>
      dedupeKey(
        String(r.contractor),
        String(r.original_description),
        Number(r.qty),
        Number(r.price),
      ),
    ),
  );

  const otherFiles = await selectAllKeyRows((q) =>
    (projectName === null ? q.is("project_name", null) : q.eq("project_name", projectName)).neq(
      "source_file",
      filename,
    ),
  );
  const otherFileByKey = new Map<string, string>();
  for (const r of otherFiles) {
    otherFileByKey.set(
      contentKey(projectName, r.contractor, r.original_description, r.qty, r.price),
      r.source_file,
    );
  }

  const newRows: RawBidRow[] = [];
  const duplicateRows: RawBidRow[] = [];
  const duplicateOfFiles = new Set<string>();
  for (const row of rows) {
    const key = dedupeKey(row.contractor, row.originalDescription, row.qty, row.price);
    const ckey = contentKey(projectName, row.contractor, row.originalDescription, row.qty, row.price);
    const other = otherFileByKey.get(ckey);
    if (sameFileKeys.has(key)) {
      duplicateRows.push(row);
    } else if (other) {
      duplicateRows.push(row);
      duplicateOfFiles.add(other);
    } else if (batchSeen.has(ckey)) {
      duplicateRows.push(row);
      duplicateOfFiles.add("another file in this upload");
    } else {
      newRows.push(row);
    }
  }
  // Remember this file's new rows only after classifying it, so repeats inside one file are unaffected.
  for (const row of newRows) {
    batchSeen.add(
      contentKey(projectName, row.contractor, row.originalDescription, row.qty, row.price),
    );
  }
  return { newRows, duplicateRows, duplicateOfFiles: [...duplicateOfFiles] };
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
      // Without an ORDER BY, Postgres may return rows in any order, so paging can skip or
      // repeat rows and the estimate dedupe (first row wins) can pick a different line each run.
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Supabase select failed: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...(data as unknown as BidHistoryDbRow[]).map(fromDbRow));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

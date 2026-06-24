const BASE_URL = "https://api.airtable.com/v0";

export const BASE_ID         = "app5bWT0n7TPWHWWy";
export const PROJECTS_TABLE  = "tblWeL8UyZm5pRf6h";
export const HOURS_TABLE     = "tbl1vOP20ZQUg6nG6";

export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

function apiKey(): string {
  const key = process.env.AIRTABLE_API_KEY;
  if (!key) throw new Error("AIRTABLE_API_KEY environment variable is not set.");
  return key;
}

async function atFetch(
  method: string,
  path: string,
  body?: object,
  attempt = 0,
): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  // Respect Airtable rate limit (5 req/s): retry once on 429
  if (res.status === 429 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    return atFetch(method, path, body, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Airtable ${method} ${path.split("?")[0]} → ${res.status}: ${text}`,
    );
  }

  return res.json();
}

export async function fetchAllRecords(
  tableId: string,
  options: { filterByFormula?: string; fields?: string[] } = {},
): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams();
    if (options.filterByFormula)
      params.set("filterByFormula", options.filterByFormula);
    if (options.fields) {
      for (const f of options.fields) params.append("fields[]", f);
    }
    if (offset) params.set("offset", offset);

    const data = (await atFetch(
      "GET",
      `/${BASE_ID}/${tableId}?${params}`,
    )) as { records: AirtableRecord[]; offset?: string };

    records.push(...data.records);
    offset = data.offset;
  } while (offset);

  return records;
}

export async function createRecord(
  tableId: string,
  fields: Record<string, unknown>,
): Promise<AirtableRecord> {
  return (await atFetch("POST", `/${BASE_ID}/${tableId}`, {
    fields,
  })) as AirtableRecord;
}

export async function updateRecord(
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>,
): Promise<AirtableRecord> {
  return (await atFetch(
    "PATCH",
    `/${BASE_ID}/${tableId}/${recordId}`,
    { fields },
  )) as AirtableRecord;
}

/** Normalize a linked-record field value to a flat list of record ID strings. */
export function normalizeLinkedIds(field: unknown): string[] {
  if (!field || !Array.isArray(field)) return [];
  return field
    .map((item) =>
      typeof item === "string"
        ? item
        : (item as { id?: string })?.id ?? "",
    )
    .filter(Boolean);
}

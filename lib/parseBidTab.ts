import * as XLSX from "xlsx";
import type { RawBidRow } from "@/types";

export interface BidTabParseResult {
  projectName: string | null;
  bidDate: string | null;
  rows: RawBidRow[];
}

const HEADER_SCAN_WINDOW = 20;

/**
 * Repairs "UTF-8 decoded as Windows-1252" mojibake for curly quotes (frequently
 * used for inch/foot marks in bid tabs, e.g. a right-double-quote U+201D typed
 * via autocorrect) and strips any other unpaired UTF-16 surrogate that slips
 * through. Without this, a corrupted description byte-mismatches its own record
 * forever - every later exact-string lookup (dedupe, dictionary map, "already
 * reviewed" checks) silently fails, so the same line item never resolves and
 * keeps getting re-sent to the AI matcher on every scan.
 */
function fixMojibake(s: string): string {
  const replacements: [RegExp, string][] = [
    [/â€˜/g, "'"], // U+2018 left single quote
    [/â€™/g, "'"], // U+2019 right single quote
    [/â€œ/g, '"'], // U+201C left double quote
    [/â€[\udc9d]/g, '"'], // U+201D right double quote (unmapped cp1252 byte -> surrogate)
  ];
  let out = s;
  for (const [pattern, repl] of replacements) out = out.replace(pattern, repl);
  return out.replace(/[\uD800-\uDFFF]/g, ""); // strip any remaining unpaired surrogate
}

function cellStr(v: unknown): string {
  return v == null ? "" : fixMojibake(String(v).trim());
}

function findHeaderRowIndex(rawRows: unknown[][]): number | null {
  const window = rawRows.slice(0, HEADER_SCAN_WINDOW);
  for (let i = 0; i < window.length; i++) {
    const rowStr = window[i]
      .map((c) => cellStr(c).toUpperCase())
      .join(" ");
    if (rowStr.includes("DESCRIPTION") && rowStr.includes("QTY")) return i;
  }
  return null;
}

function findProjectName(rawRows: unknown[][]): string | null {
  const v = rawRows[0]?.[1];
  return v != null && cellStr(v) ? cellStr(v) : null;
}

function findBidDate(rawRows: unknown[][]): string | null {
  const window = rawRows.slice(0, HEADER_SCAN_WINDOW);
  for (const row of window) {
    for (let c = 0; c < row.length - 1; c++) {
      if (cellStr(row[c]).toUpperCase() === "BID DATE:") {
        const next = row[c + 1];
        if (next != null && cellStr(next)) return cellStr(next).split(/\s+/)[0];
      }
    }
  }
  return null;
}

/** Parses a single bid-tab .xlsx file (notebook Chunk 4, ported). */
export function parseBidTab(buffer: ArrayBuffer): BidTabParseResult {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: true,
  });

  if (rawRows.length === 0) {
    return { projectName: null, bidDate: null, rows: [] };
  }

  const projectName = findProjectName(rawRows);
  const bidDate = findBidDate(rawRows);

  const headerIdx = findHeaderRowIndex(rawRows);
  if (headerIdx === null) {
    throw new Error("Could not find a Description/Qty data table header.");
  }

  const header = rawRows[headerIdx].map((c) => cellStr(c));
  const lowerHeader = header.map((c) => c.toLowerCase());

  const descIdx = lowerHeader.indexOf("description");
  const qtyIdx = lowerHeader.indexOf("qty");
  const unitIdx = lowerHeader.indexOf("unit");
  const unitPriceIdx = lowerHeader.indexOf("unit price");

  if (descIdx === -1 || qtyIdx === -1) {
    throw new Error("Could not find Description/Qty columns in the data table header.");
  }

  const contractorStartIdx = unitPriceIdx !== -1 ? unitPriceIdx + 1 : qtyIdx + 1;
  const contractors: { idx: number; name: string }[] = [];
  for (let c = contractorStartIdx; c < header.length; c++) {
    if (header[c]) contractors.push({ idx: c, name: header[c] });
  }

  const rows: RawBidRow[] = [];

  for (const row of rawRows.slice(headerIdx + 1)) {
    const rawDesc = cellStr(row[descIdx]);
    const rawQty = row[qtyIdx];

    if (!rawDesc || rawDesc.toUpperCase() === "DESCRIPTION") continue;
    if (rawQty == null || rawQty === "") continue;

    const qty = parseFloat(String(rawQty).replace(/,/g, ""));
    if (Number.isNaN(qty)) continue;

    const unit = unitIdx !== -1 && row[unitIdx] != null ? cellStr(row[unitIdx]) : "EA";

    for (const { idx, name } of contractors) {
      const rawPrice = row[idx];
      if (rawPrice == null || rawPrice === "") continue;

      const priceStr = String(rawPrice).replace(/\$/g, "").replace(/,/g, "").trim();
      const price = parseFloat(priceStr);
      if (Number.isNaN(price) || price <= 0) continue;

      rows.push({
        contractor: name,
        originalDescription: rawDesc,
        qty,
        unit,
        price,
      });
    }
  }

  return { projectName, bidDate, rows };
}

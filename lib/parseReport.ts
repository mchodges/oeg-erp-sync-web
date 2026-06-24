import * as XLSX from "xlsx";
import type { ReportRow } from "./erpCodes";

const SHEET_NAME = "Time and Expenses Summarized";

export interface ParseResult {
  rows: ReportRow[];
  stats: { totalRows: number; uniqueCodes: number };
}

export function parseReport(buffer: ArrayBuffer): ParseResult {
  const wb = XLSX.read(new Uint8Array(buffer), {
    type: "array",
    cellDates: false,
  });

  if (!wb.SheetNames.includes(SHEET_NAME)) {
    throw new Error(
      `Sheet "${SHEET_NAME}" not found. Available: ${wb.SheetNames.join(", ")}`,
    );
  }

  const ws = wb.Sheets[SHEET_NAME];
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: true,
  });

  const rows: ReportRow[] = [];
  let currentErp: string | null = null;

  for (const row of rawRows) {
    // Verified column layout from live report:
    //   C = index 2 → "ERP_CODE | Project Name" on header rows, "... Total:" on total rows
    //   D = index 3 → employee title on title rows
    //   I = index 8 → ACTUAL HOURS on title rows
    const colC = row[2] != null ? String(row[2]).trim() : "";
    const colD = row[3] != null ? String(row[3]).trim() : "";
    const colI = row[8];

    // PROJECT HEADER: Col C contains " | " and does not end with "Total:"
    if (colC && colC.includes(" | ") && !colC.endsWith("Total:")) {
      currentErp = colC.split(" | ")[0].trim();
      continue;
    }

    // PROJECT TOTAL ROW: Col C ends with "Total:"
    if (colC.endsWith("Total:")) {
      currentErp = null;
      continue;
    }

    // TITLE ROW: Col D non-empty, Col I numeric, inside a project block
    if (
      colD &&
      colD !== "<Missing Employee Title>" &&
      currentErp !== null &&
      typeof colI === "number"
    ) {
      rows.push({ erpCode: currentErp, title: colD, hours: colI });
    }
  }

  const uniqueCodes = new Set(rows.map((r) => r.erpCode)).size;
  return { rows, stats: { totalRows: rows.length, uniqueCodes } };
}

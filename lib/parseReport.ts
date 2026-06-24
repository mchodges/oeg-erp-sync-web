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
    const colB = row[1] != null ? String(row[1]).trim() : "";
    const colD = row[3] != null ? String(row[3]).trim() : "";
    const colH = row[7];

    // PROJECT HEADER: non-empty Col B with " | " that doesn't end "Total:"
    if (colB && colB.includes(" | ") && !colB.endsWith("Total:")) {
      currentErp = colB.split(" | ")[0].trim();
      continue;
    }

    // PROJECT TOTAL ROW: Col B ends with "Total:"
    if (colB.endsWith("Total:")) {
      currentErp = null;
      continue;
    }

    // TITLE ROW: Col D non-empty, Col H numeric, inside a project block
    if (
      colD &&
      colD !== "<Missing Employee Title>" &&
      currentErp !== null &&
      typeof colH === "number"
    ) {
      rows.push({ erpCode: currentErp, title: colD, hours: colH });
    }
  }

  const uniqueCodes = new Set(rows.map((r) => r.erpCode)).size;
  return { rows, stats: { totalRows: rows.length, uniqueCodes } };
}

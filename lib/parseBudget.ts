import * as XLSX from "xlsx";

export interface BudgetRow {
  lookupKey: string;
  budget: number;
  spent: number;
}

export interface BudgetParseResult {
  rows: BudgetRow[];
  stats: { totalRows: number; uniqueKeys: number };
}

export function parseBudget(buffer: ArrayBuffer): BudgetParseResult {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: false });

  const rows: BudgetRow[] = [];

  for (const sheetName of wb.SheetNames) {
    if (sheetName.toLowerCase().includes("document map")) continue;

    const ws = wb.Sheets[sheetName];
    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
      raw: true,
    });

    if (rawRows.length === 0) continue;

    // Find header row: col B (index 1) contains "PROJECT" (within first 20 rows)
    let headerRowIdx: number | null = null;
    for (let i = 0; i < Math.min(20, rawRows.length); i++) {
      const colB = rawRows[i][1];
      if (colB != null && String(colB).toUpperCase().includes("PROJECT")) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === null) continue;

    for (const row of rawRows.slice(headerRowIdx + 1)) {
      const colB = row[1]; // Project Name (format: "ERP-CODE | Project Name")
      const colE = row[4]; // Budget
      const colF = row[5]; // Spent

      if (colB == null) continue;

      // Take the part before "|" as the lookup key
      const lookupKey = String(colB).split("|")[0].trim();
      if (!lookupKey) continue;

      const budget = typeof colE === "number" ? colE : parseFloat(String(colE ?? "")) || 0;
      const spent  = typeof colF === "number" ? colF : parseFloat(String(colF ?? "")) || 0;

      rows.push({ lookupKey, budget, spent });
    }
  }

  const uniqueKeys = new Set(rows.map((r) => r.lookupKey)).size;
  return { rows, stats: { totalRows: rows.length, uniqueKeys } };
}

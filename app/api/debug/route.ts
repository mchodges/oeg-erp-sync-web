import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

const SHEET_NAME = "Time and Expenses Summarized";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    const buffer = await (file as File).arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: false });

    const sheetNames = wb.SheetNames;
    const targetSheet = wb.Sheets[SHEET_NAME];

    if (!targetSheet) {
      return NextResponse.json({ sheetNames, error: `Sheet "${SHEET_NAME}" not found` });
    }

    // Get raw rows as arrays
    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(targetSheet, {
      header: 1,
      defval: null,
      raw: true,
    });

    // Return first 40 non-empty rows with their column content
    const sample = rawRows
      .slice(0, 200)
      .map((row, i) => ({
        rowIndex: i,
        A: row[0],
        B: row[1],
        C: row[2],
        D: row[3],
        E: row[4],
        F: row[5],
        G: row[6],
        H: row[7],
        I: row[8],
        len: row.length,
      }))
      .filter((r) => r.B != null || r.D != null || r.H != null);

    return NextResponse.json({ sheetNames, totalRows: rawRows.length, sample });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

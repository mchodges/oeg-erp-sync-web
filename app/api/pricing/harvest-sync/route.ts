import { NextRequest, NextResponse } from "next/server";
import { insertBidHistoryRows } from "@/lib/supabase";
import type { HarvestFileResult, HarvestSyncResult } from "@/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { files } = (await req.json()) as { files: HarvestFileResult[] };

    let inserted = 0;
    let duplicatesSkipped = 0;

    for (const file of files) {
      if (!file.rows.length) continue;
      const result = await insertBidHistoryRows(
        file.filename,
        file.projectName,
        file.bidDate,
        file.rows,
      );
      inserted += result.inserted;
      duplicatesSkipped += result.duplicatesSkipped;
    }

    const result: HarvestSyncResult = { inserted, duplicatesSkipped };
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[pricing/harvest-sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

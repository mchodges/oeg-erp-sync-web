import { NextRequest, NextResponse } from "next/server";
import { updateRecord } from "@/lib/airtable";
import { LIVING_MATCHES_TABLE, PRICING_BASE_ID } from "@/lib/airtablePricing";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ recordId: string }> },
) {
  try {
    const { recordId } = await params;
    const { decision, masterItemId } = (await req.json()) as {
      decision: "approve" | "reject";
      masterItemId?: string;
    };

    if (decision === "approve") {
      if (!masterItemId?.trim()) {
        return NextResponse.json(
          { error: "masterItemId is required to approve a match." },
          { status: 400 },
        );
      }
      await updateRecord(
        LIVING_MATCHES_TABLE(),
        recordId,
        { Status: "Verified", Master_Item: [masterItemId.trim()] },
        PRICING_BASE_ID(),
      );
      return NextResponse.json({ status: "Verified" });
    }

    if (decision === "reject") {
      await updateRecord(
        LIVING_MATCHES_TABLE(),
        recordId,
        { Status: "Ignored" },
        PRICING_BASE_ID(),
      );
      return NextResponse.json({ status: "Ignored" });
    }

    return NextResponse.json({ error: "decision must be 'approve' or 'reject'." }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[pricing/living-matches/review]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

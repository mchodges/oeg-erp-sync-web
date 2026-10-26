import { NextResponse } from "next/server";
import { generateEstimate } from "@/lib/estimate";

export async function POST() {
  try {
    return NextResponse.json(await generateEstimate());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[pricing/estimate-plan]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

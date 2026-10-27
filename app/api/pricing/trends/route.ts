import { NextResponse } from "next/server";
import { generateTrendData } from "@/lib/trends";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await generateTrendData());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[pricing/trends]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

import { fetchCursorPlanUsage } from "@/lib/cursor-plan-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Local Cursor subscription usage (Auto / API) for the console sidebar. */
export async function GET() {
  try {
    const usage = await fetchCursorPlanUsage();
    if (!usage) {
      return NextResponse.json(
        { ok: false, error: "unavailable", usage: null },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, usage });
  } catch {
    return NextResponse.json(
      { ok: false, error: "failed", usage: null },
      { status: 502 },
    );
  }
}

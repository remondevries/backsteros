import { NextResponse } from "next/server";

import { isWhoopAuthenticated } from "@/lib/whoop/config";
import { fetchWhoopDaySnapshot } from "@/lib/whoop/fetch-snapshot";
import {
  peekWhoopSnapshotCache,
  setWhoopSnapshotCache,
} from "@/lib/whoop/snapshot-cache";
import type { WhoopDayApiResponse } from "@/lib/whoop/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isWhoopAuthenticated()) {
    return NextResponse.json({
      authenticated: false,
      snapshot: null,
    } satisfies WhoopDayApiResponse);
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date")?.trim() ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  try {
    const cached = peekWhoopSnapshotCache(date);
    if (cached) {
      return NextResponse.json({
        authenticated: true,
        snapshot: cached,
      } satisfies WhoopDayApiResponse);
    }

    const snapshot = await fetchWhoopDaySnapshot({
      includeStrainDeepDive: true,
      date,
    });

    if (snapshot) {
      setWhoopSnapshotCache(date, snapshot);
    }

    return NextResponse.json({
      authenticated: true,
      snapshot,
    } satisfies WhoopDayApiResponse);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load Whoop data";
    return NextResponse.json(
      {
        authenticated: true,
        snapshot: null,
        error: message,
      } satisfies WhoopDayApiResponse,
      { status: 500 },
    );
  }
}

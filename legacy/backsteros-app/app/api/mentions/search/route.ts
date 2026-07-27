import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  buildMentionSections,
  flattenMentionSections,
} from "@/lib/documents/mentions/search-catalog";
import { fetchMentionCatalog } from "@/lib/documents/mentions/build-catalog-from-api";
import { getCachedMentionCatalog } from "@/lib/documents/mentions/catalog-cache";
import { createAuthenticatedApiClient } from "@/lib/server/api-client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  const client = await createAuthenticatedApiClient();
  if (!client || !session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";

  try {
    const catalog = await getCachedMentionCatalog(session.userId, () =>
      fetchMentionCatalog(client),
    );
    const sections = buildMentionSections(catalog, query);
    return NextResponse.json({
      sections,
      items: flattenMentionSections(sections),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to search mentions" },
      { status: 502 },
    );
  }
}

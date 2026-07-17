import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  fetchMentionCatalog,
  filterCatalogForTokens,
} from "@/lib/documents/mentions/build-catalog-from-api";
import { getCachedMentionCatalog } from "@/lib/documents/mentions/catalog-cache";
import type { ParsedMentionToken } from "@/lib/documents/mentions/mention-menu-types";
import { createAuthenticatedApiClient } from "@/lib/server/api-client";

export const dynamic = "force-dynamic";

type ResolveRequestBody = {
  tokens?: ParsedMentionToken[];
};

export async function POST(request: Request) {
  const session = await auth();
  const client = await createAuthenticatedApiClient();
  if (!client || !session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as ResolveRequestBody;
  const tokens = Array.isArray(body.tokens) ? body.tokens : [];

  try {
    const catalog = await getCachedMentionCatalog(session.userId, () =>
      fetchMentionCatalog(client),
    );
    return NextResponse.json({
      catalog: filterCatalogForTokens(catalog, tokens),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to resolve mentions" },
      { status: 502 },
    );
  }
}

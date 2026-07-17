import { NextResponse } from "next/server";

import { resolveAvatarContentType } from "@/lib/avatars/content-type";
import { createAuthenticatedApiClient } from "@/lib/server/api-client";

export const dynamic = "force-dynamic";

const CACHE_CONTROL = "private, max-age=300";

type ServeAvatarOptions = {
  entityType: "contact" | "organization";
  entityId: string;
};

async function bytesFromDownload(payload: unknown): Promise<Uint8Array> {
  if (payload instanceof Blob) {
    return new Uint8Array(await payload.arrayBuffer());
  }
  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload);
  }
  if (ArrayBuffer.isView(payload)) {
    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  }
  throw new Error("Avatar response was not binary");
}

export async function serveProxiedAvatar({
  entityType,
  entityId,
}: ServeAvatarOptions) {
  const client = await createAuthenticatedApiClient();
  if (!client) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!entityId.trim()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const payload = await client.downloadAvatar(entityType, entityId);
    const bytes = await bytesFromDownload(payload);
    const declared =
      payload instanceof Blob && payload.type ? payload.type : null;
    const contentType = resolveAvatarContentType(declared, bytes);

    // Clone to a concrete ArrayBuffer-backed view for NextResponse BodyInit.
    const body = new Uint8Array(bytes);
    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": CACHE_CONTROL,
        "Content-Length": String(bytes.byteLength),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status =
      error &&
      typeof error === "object" &&
      "status" in error &&
      typeof (error as { status: unknown }).status === "number"
        ? (error as { status: number }).status
        : 500;

    if (status === 404) {
      return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to load avatar." },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}

import type { BacksterosApiClient } from "@backsteros/api-client";
import { File, Paths } from "expo-file-system";
import { useEffect, useMemo, useState } from "react";

type AvatarEntity = {
  id: string;
  avatarStorageKey?: string | null;
};

type AvatarKind = "contact" | "organization";

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Uint8Array(await new Response(blob).arrayBuffer());
}

async function cacheAvatar(
  client: BacksterosApiClient,
  kind: AvatarKind,
  entityId: string,
): Promise<string> {
  const blob = await client.downloadAvatar(kind, entityId);
  const bytes = await blobToBytes(blob);
  const file = new File(Paths.cache, `avatar-${kind}-${entityId}`);
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

/**
 * Resolve local file URIs for entities that have an uploaded avatar.
 * Entities without `avatarStorageKey` are omitted (text-only rows).
 */
export function useEntityAvatarSrcMap(
  kind: AvatarKind,
  entities: readonly AvatarEntity[],
  client: BacksterosApiClient | null,
): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  const fingerprint = useMemo(
    () =>
      entities
        .filter((entry) => entry.avatarStorageKey)
        .map((entry) => `${entry.id}:${entry.avatarStorageKey}`)
        .sort()
        .join("|"),
    [entities],
  );

  useEffect(() => {
    if (!client || !fingerprint) {
      setUrls({});
      return;
    }

    let cancelled = false;
    const targets = fingerprint.split("|").map((entry) => {
      const [id] = entry.split(":");
      return id;
    });

    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        targets.map(async (entityId) => {
          if (!entityId) return;
          try {
            const uri = await cacheAvatar(client, kind, entityId);
            if (!cancelled) next[entityId] = uri;
          } catch {
            // Missing/unauthorized avatar — keep text-only row.
          }
        }),
      );
      if (!cancelled) setUrls(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [client, fingerprint, kind]);

  return urls;
}

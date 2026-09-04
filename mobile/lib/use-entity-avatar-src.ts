import type { BacksterosApiClient } from "@backsteros/api-client";
import { File, Paths } from "expo-file-system";
import { useEffect, useMemo, useState } from "react";

type AvatarEntity = {
  id: string;
  avatarStorageKey?: string | null;
};

type AvatarKind = "contact" | "organization" | "bank_account";

type AvatarTarget = {
  id: string;
  storageKey: string;
};

const AVATAR_DOWNLOAD_CONCURRENCY = 4;
const EMPTY_URLS: Record<string, string> = {};

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Uint8Array(await new Response(blob).arrayBuffer());
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, 512))
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase();
  if (head.startsWith("<svg")) return true;
  if (head.startsWith("<?xml") && head.includes("<svg")) return true;
  if (head.startsWith("<!doctype svg")) return true;
  return false;
}

function cachePathForAvatar(
  kind: AvatarKind,
  entityId: string,
  storageKey: string,
  ext: string,
): File {
  const safeKey = storageKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
  return new File(
    Paths.cache,
    `avatar-${kind}-${entityId}-${safeKey}${ext}`,
  );
}

function readCachedAvatarUri(
  kind: AvatarKind,
  entityId: string,
  storageKey: string,
): string | null {
  for (const ext of ["", ".svg"]) {
    const file = cachePathForAvatar(kind, entityId, storageKey, ext);
    if (file.exists) return file.uri;
  }
  return null;
}

async function cacheAvatar(
  client: BacksterosApiClient,
  kind: AvatarKind,
  entityId: string,
  storageKey: string,
): Promise<string> {
  const cached = readCachedAvatarUri(kind, entityId, storageKey);
  if (cached) return cached;

  const blob = await client.downloadAvatar(kind, entityId);
  const bytes = await blobToBytes(blob);
  const ext = looksLikeSvg(bytes) ? ".svg" : "";
  const file = cachePathForAvatar(kind, entityId, storageKey, ext);
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current]!);
    }
  });
  await Promise.all(runners);
  return results;
}

function targetsFromEntities(entities: readonly AvatarEntity[]): AvatarTarget[] {
  return entities
    .filter((entry) => entry.avatarStorageKey)
    .map((entry) => ({
      id: entry.id,
      storageKey: entry.avatarStorageKey!.trim(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function fingerprintTargets(targets: readonly AvatarTarget[]): string {
  return targets.map((t) => `${t.id}\0${t.storageKey}`).join("|");
}

function urlsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
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
  const [urls, setUrls] = useState<Record<string, string>>(EMPTY_URLS);

  // Primitive fingerprint so unstable `entities` array identity does not re-fire the effect.
  const fingerprint = useMemo(
    () => fingerprintTargets(targetsFromEntities(entities)),
    [entities],
  );

  useEffect(() => {
    if (!client || fingerprint.length === 0) {
      setUrls((prev) => (Object.keys(prev).length === 0 ? prev : EMPTY_URLS));
      return;
    }

    const targets = fingerprint.split("|").map((part) => {
      const sep = part.indexOf("\0");
      return {
        id: part.slice(0, sep),
        storageKey: part.slice(sep + 1),
      };
    });

    let cancelled = false;

    void (async () => {
      const pairs = await mapWithConcurrency(
        targets,
        AVATAR_DOWNLOAD_CONCURRENCY,
        async (target) => {
          try {
            const uri = await cacheAvatar(
              client,
              kind,
              target.id,
              target.storageKey,
            );
            return [target.id, uri] as const;
          } catch {
            return null;
          }
        },
      );

      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const pair of pairs) {
        if (pair) next[pair[0]] = pair[1];
      }
      setUrls((prev) => (urlsEqual(prev, next) ? prev : next));
    })();

    return () => {
      cancelled = true;
    };
  }, [client, fingerprint, kind]);

  return urls;
}

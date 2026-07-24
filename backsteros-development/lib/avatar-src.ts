"use client";

import type { BacksterosApiClient } from "@backsteros/api-client";
import { useEffect, useMemo, useState } from "react";

import { useConsoleApi } from "@/lib/api-context";

type AvatarEntity = {
  id: string;
  avatarStorageKey?: string | null;
  updatedAt?: string | number | null;
};

type AvatarKind = "contact" | "organization";

/**
 * Resolve avatar blob URLs for contacts/orgs that have `avatarStorageKey`.
 * Mirrors desktop `useDesktopAvatarSrcMap` for the console API client.
 */
export function useConsoleAvatarSrcMap(
  kind: AvatarKind,
  entities: AvatarEntity[],
): Record<string, string> {
  const { client } = useConsoleApi();
  const [urls, setUrls] = useState<Record<string, string>>({});

  const fingerprint = useMemo(
    () =>
      entities
        .filter((entry) => entry.avatarStorageKey)
        .map(
          (entry) =>
            `${entry.id}:${entry.avatarStorageKey}:${entry.updatedAt ?? 0}`,
        )
        .sort()
        .join("|"),
    [entities],
  );

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    const targets = entities.filter((entry) => entry.avatarStorageKey);

    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        targets.map(async (entry) => {
          try {
            const blob = await downloadAvatar(client, kind, entry.id);
            if (cancelled) return;
            const url = URL.createObjectURL(blob);
            created.push(url);
            next[entry.id] = url;
          } catch {
            // Missing/unauthorized avatar — keep fallback icon.
          }
        }),
      );
      if (!cancelled) setUrls(next);
    })();

    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
    // fingerprint encodes the entity set we care about
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, fingerprint, kind]);

  return urls;
}

async function downloadAvatar(
  client: BacksterosApiClient,
  kind: AvatarKind,
  entityId: string,
): Promise<Blob> {
  return client.downloadAvatar(kind, entityId);
}

export function withAvatarSrc<T extends { id: string }>(
  entities: T[],
  srcById: Record<string, string>,
): Array<T & { avatarSrc?: string | null }> {
  return entities.map((entry) => ({
    ...entry,
    avatarSrc: srcById[entry.id] ?? null,
  }));
}

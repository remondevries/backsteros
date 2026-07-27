"use client";

import { useEffect, type ReactNode } from "react";

import { useAppApi } from "@/lib/api-context";
import { usePowerSync } from "@/lib/powersync-context";

import { setMutationContext } from "./client";

export function MutationProvider({ children }: { children: ReactNode }) {
  const { client, refresh } = useAppApi();
  const sync = usePowerSync();

  useEffect(() => {
    setMutationContext({
      client,
      refresh,
      sync: {
        ready: sync.ready,
        createMetadata: sync.createMetadata,
        patchMetadata: sync.patchMetadata,
      },
    });
    return () => setMutationContext(null);
  }, [
    client,
    refresh,
    sync.createMetadata,
    sync.patchMetadata,
    sync.ready,
  ]);

  return children;
}

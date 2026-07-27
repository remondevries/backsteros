"use client";

import { useMemo, useState } from "react";

export function useMergedAssignableList<T extends { id: string }>(source: T[]) {
  const [extraItems, setExtraItems] = useState<T[]>([]);

  const merged = useMemo(() => {
    if (extraItems.length === 0) {
      return source;
    }

    const sourceIds = new Set(source.map((item) => item.id));
    const pendingExtras = extraItems.filter((item) => !sourceIds.has(item.id));
    return [...source, ...pendingExtras];
  }, [extraItems, source]);

  function addOptimistic(item: T) {
    setExtraItems((current) => [...current, item]);
  }

  function replaceOptimistic(tempId: string, item: T) {
    setExtraItems((current) =>
      current.map((entry) => (entry.id === tempId ? item : entry)),
    );
  }

  function removeOptimistic(tempId: string) {
    setExtraItems((current) => current.filter((entry) => entry.id !== tempId));
  }

  return {
    merged,
    addOptimistic,
    replaceOptimistic,
    removeOptimistic,
  };
}

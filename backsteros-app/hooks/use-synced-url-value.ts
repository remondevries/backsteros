"use client";

import { useState } from "react";

/**
 * Keeps local UI state aligned with a URL-driven value (search param or path).
 * Matches the optimistic-then-sync pattern used by projects area tabs.
 */
export function useSyncedUrlValue<T>(
  urlValue: T,
  isEqual: (left: T, right: T) => boolean = Object.is,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => urlValue);
  const [prevUrlValue, setPrevUrlValue] = useState(urlValue);

  if (!isEqual(urlValue, prevUrlValue)) {
    setPrevUrlValue(urlValue);
    setValue(urlValue);
  }

  return [value, setValue];
}

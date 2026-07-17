"use client";

import { useEffect, useRef } from "react";

/** Keeps a ref in sync with the latest value without updating ref during render. */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  });

  return ref;
}

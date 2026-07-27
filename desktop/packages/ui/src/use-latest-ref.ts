"use client";

import { useRef, type RefObject } from "react";

/** Always-current ref for values used inside stable event listeners. */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

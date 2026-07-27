import { useRef, type RefObject } from "react";

/** Keep a ref pointing at the latest value without re-subscribing effects. */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

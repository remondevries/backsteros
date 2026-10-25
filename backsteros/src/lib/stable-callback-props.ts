import { useRef } from "react";

type AnyFunction = (...args: never[]) => unknown;

/**
 * `React.memo` comparator that treats function props as equal by kind only
 * (both functions, or both absent). Pair with {@link useStableCallbackProps}
 * so the memoized component always invokes the latest callbacks.
 */
export function propsEqualIgnoringCallbacks<P extends object>(
  prev: Readonly<P>,
  next: Readonly<P>,
): boolean {
  return comparePropsIgnoringCallbacks(prev, next, NO_STRICT_KEYS);
}

/**
 * Like {@link propsEqualIgnoringCallbacks}, but `strictKeys` (functions the
 * child calls during render, e.g. resolvers) are compared by identity.
 */
export function propsEqualIgnoringCallbacksExcept<P extends object>(
  strictKeys: readonly (keyof P & string)[],
): (prev: Readonly<P>, next: Readonly<P>) => boolean {
  const strict = new Set<string>(strictKeys);
  return (prev, next) => comparePropsIgnoringCallbacks(prev, next, strict);
}

const NO_STRICT_KEYS: ReadonlySet<string> = new Set();

function comparePropsIgnoringCallbacks(
  prev: object,
  next: object,
  strictKeys: ReadonlySet<string>,
): boolean {
  const prevRecord = prev as Record<string, unknown>;
  const nextRecord = next as Record<string, unknown>;
  const keys = new Set([
    ...Object.keys(prevRecord),
    ...Object.keys(nextRecord),
  ]);
  for (const key of keys) {
    const a = prevRecord[key];
    const b = nextRecord[key];
    if (
      !strictKeys.has(key) &&
      (typeof a === "function" || typeof b === "function")
    ) {
      if (typeof a !== typeof b) return false;
      continue;
    }
    if (!Object.is(a, b)) return false;
  }
  return true;
}

/**
 * Returns `props` with every function replaced by an identity-stable wrapper
 * that forwards to the latest render's function.
 */
export function useStableCallbackProps<P extends object>(props: P): P {
  const latestRef = useRef(props);
  latestRef.current = props;
  const wrappersRef = useRef(new Map<string, AnyFunction>());
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value !== "function") {
      out[key] = value;
      continue;
    }
    let wrapper = wrappersRef.current.get(key);
    if (!wrapper) {
      wrapper = (...args: never[]) =>
        (latestRef.current as Record<string, AnyFunction>)[key]?.(...args);
      wrappersRef.current.set(key, wrapper);
    }
    out[key] = wrapper;
  }
  return out as P;
}

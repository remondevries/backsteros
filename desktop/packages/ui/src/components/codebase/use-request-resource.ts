"use client";

import { useEffect, useRef, useState } from "react";

import type { CodebaseRequestJson } from "./codebase-request-json.js";

type ResourceState<T> = {
  data: T | null;
  error: Error | null;
  loading: boolean;
};

/**
 * Lightweight replacement for legacy `useApiResource` — loaders take the
 * injected `requestJson` instead of a console API context.
 */
export function useRequestResource<T>(
  requestJson: CodebaseRequestJson,
  load: (requestJson: CodebaseRequestJson, signal: AbortSignal) => Promise<T>,
  dependencies: readonly unknown[] = [],
): ResourceState<T> {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const dataRef = useRef<T | null>(null);
  const identityKey = dependencies.map((entry) => String(entry)).join("\0");
  const identityKeyRef = useRef(identityKey);
  dataRef.current = data;

  useEffect(() => {
    const controller = new AbortController();
    const identityChanged = identityKeyRef.current !== identityKey;
    identityKeyRef.current = identityKey;

    setError(null);
    if (identityChanged) {
      dataRef.current = null;
      setData(null);
      setLoading(true);
    } else if (dataRef.current == null) {
      setLoading(true);
    }

    loadRef
      .current(requestJson, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          dataRef.current = value;
          setData(value);
          setLoading(false);
        }
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        if ((loadError as { name?: string }).name === "AbortError") return;
        setError(
          loadError instanceof Error
            ? loadError
            : new Error("Something went wrong"),
        );
        setLoading(false);
      });

    return () => controller.abort();
    // Intentionally keyed by identity + requestJson identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps via identityKey
  }, [identityKey, requestJson]);

  return { data, error, loading };
}

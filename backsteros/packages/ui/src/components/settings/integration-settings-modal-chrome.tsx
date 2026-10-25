"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type IntegrationSettingsModalChromeValue = {
  setHeaderTrailing: (node: ReactNode | null) => void;
};

const IntegrationSettingsModalChromeContext =
  createContext<IntegrationSettingsModalChromeValue | null>(null);

export function IntegrationSettingsModalChromeProvider({
  children,
  onTrailingChange,
}: {
  children: ReactNode;
  onTrailingChange: (node: ReactNode | null) => void;
}) {
  const setHeaderTrailing = useCallback(
    (node: ReactNode | null) => {
      onTrailingChange(node);
    },
    [onTrailingChange],
  );

  const value = useMemo(
    () => ({ setHeaderTrailing }),
    [setHeaderTrailing],
  );

  return (
    <IntegrationSettingsModalChromeContext.Provider value={value}>
      {children}
    </IntegrationSettingsModalChromeContext.Provider>
  );
}

/** Register a control into the integration modal header subtitle row (far right). */
export function useIntegrationSettingsHeaderTrailing(
  trailing: ReactNode | null,
): void {
  const ctx = useContext(IntegrationSettingsModalChromeContext);

  useLayoutEffect(() => {
    if (!ctx) return;
    ctx.setHeaderTrailing(trailing);
    return () => {
      ctx.setHeaderTrailing(null);
    };
  }, [ctx, trailing]);
}

export function useIntegrationSettingsHeaderTrailingState(): [
  ReactNode | null,
  (node: ReactNode | null) => void,
] {
  const [trailing, setTrailing] = useState<ReactNode | null>(null);
  return [trailing, setTrailing];
}

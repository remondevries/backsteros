"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Keep-alive panes set this to false while hidden so nested list keyboard
 * nav and entity header action registrations unregister — they must not
 * target stacked sections that are no longer on screen.
 *
 * Outside a keep-alive pane the default is true (Outlet / finance / etc.).
 */
const ListKeyboardNavMountGateContext = createContext(true);

export function ListKeyboardNavMountGate({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <ListKeyboardNavMountGateContext.Provider value={active}>
      {children}
    </ListKeyboardNavMountGateContext.Provider>
  );
}

export function useListKeyboardNavMountGate(): boolean {
  return useContext(ListKeyboardNavMountGateContext);
}

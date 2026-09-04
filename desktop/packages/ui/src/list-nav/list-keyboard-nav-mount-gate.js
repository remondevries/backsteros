"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext } from "react";
/**
 * Keep-alive panes set this to false while hidden so nested list keyboard
 * nav and entity header action registrations unregister — they must not
 * target stacked sections that are no longer on screen.
 *
 * Outside a keep-alive pane the default is true (Outlet / finance / etc.).
 */
const ListKeyboardNavMountGateContext = createContext(true);
export function ListKeyboardNavMountGate({ active, children, }) {
    return (_jsx(ListKeyboardNavMountGateContext.Provider, { value: active, children: children }));
}
export function useListKeyboardNavMountGate() {
    return useContext(ListKeyboardNavMountGateContext);
}

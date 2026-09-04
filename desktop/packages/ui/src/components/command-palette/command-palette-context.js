"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { clearGoFinanceChord } from "../../finance/go-finance-chord-gate.js";
import { clearGoLeaderSequence } from "../../shortcuts/go-leader-sequence-gate.js";
import { concealCommandPaletteChrome, revealCommandPaletteChrome, showInstantCommandOverlay, } from "../../command-palette/conceal-command-palette-chrome.js";
import { createContext, useCallback, useContext, useMemo, useRef, useState, } from "react";
const CommandPaletteStateContext = createContext(null);
const CommandPaletteActionsContext = createContext(null);
const CommandPaletteRuntimeRefsContext = createContext(null);
export function CommandPaletteProvider({ children, onOpenChange, }) {
    const [open, setOpenState] = useState(false);
    const [mode, setMode] = useState("search");
    const openRef = useRef(open);
    const modeRef = useRef(mode);
    openRef.current = open;
    modeRef.current = mode;
    const runtimeRefs = useMemo(() => ({ openRef, modeRef }), []);
    const setOpen = useCallback((next) => {
        if (!next) {
            clearGoFinanceChord();
            clearGoLeaderSequence();
            concealCommandPaletteChrome();
            openRef.current = false;
            setOpenState(false);
            setMode("search");
            onOpenChange?.(false);
            return;
        }
        openRef.current = true;
        // Reveal before commit so reused cmdk portal nodes are not left hidden.
        revealCommandPaletteChrome();
        showInstantCommandOverlay();
        setOpenState(true);
        onOpenChange?.(true);
    }, [onOpenChange]);
    const toggle = useCallback(() => {
        setOpenState((current) => {
            const next = !current;
            openRef.current = next;
            if (!next) {
                clearGoFinanceChord();
                clearGoLeaderSequence();
                concealCommandPaletteChrome();
            }
            else {
                revealCommandPaletteChrome();
                showInstantCommandOverlay();
            }
            setMode("search");
            onOpenChange?.(next);
            return next;
        });
    }, [onOpenChange]);
    const openSearch = useCallback(() => {
        setMode("search");
        openRef.current = true;
        showInstantCommandOverlay();
        setOpenState(true);
        onOpenChange?.(true);
    }, [onOpenChange]);
    const openGo = useCallback(() => {
        setMode("go");
        openRef.current = true;
        showInstantCommandOverlay();
        setOpenState(true);
        onOpenChange?.(true);
    }, [onOpenChange]);
    const openFinanceGo = useCallback(() => {
        setMode("finance-go");
        openRef.current = true;
        showInstantCommandOverlay();
        setOpenState(true);
        onOpenChange?.(true);
    }, [onOpenChange]);
    const state = useMemo(() => ({ open, mode }), [mode, open]);
    const actions = useMemo(() => ({
        setOpen,
        toggle,
        openSearch,
        openGo,
        openFinanceGo,
    }), [openFinanceGo, openGo, openSearch, setOpen, toggle]);
    return (_jsx(CommandPaletteRuntimeRefsContext.Provider, { value: runtimeRefs, children: _jsx(CommandPaletteActionsContext.Provider, { value: actions, children: _jsx(CommandPaletteStateContext.Provider, { value: state, children: children }) }) }));
}
export function useCommandPalette() {
    const state = useContext(CommandPaletteStateContext);
    const actions = useContext(CommandPaletteActionsContext);
    if (!state || !actions) {
        throw new Error("useCommandPalette must be used within CommandPaletteProvider");
    }
    return { ...state, ...actions };
}
/** Stable actions — shortcut hosts do not re-render when open/mode changes. */
export function useCommandPaletteActions() {
    const actions = useContext(CommandPaletteActionsContext);
    if (!actions) {
        throw new Error("useCommandPaletteActions must be used within CommandPaletteProvider");
    }
    return actions;
}
export function useCommandPaletteState() {
    const state = useContext(CommandPaletteStateContext);
    if (!state) {
        throw new Error("useCommandPaletteState must be used within CommandPaletteProvider");
    }
    return state;
}
/** Stable — use in shortcut handlers to avoid re-subscribing on every open/close. */
export function useCommandPaletteRuntimeRefs() {
    const context = useContext(CommandPaletteRuntimeRefsContext);
    if (!context) {
        throw new Error("useCommandPaletteRuntimeRefs must be used within CommandPaletteProvider");
    }
    return context;
}

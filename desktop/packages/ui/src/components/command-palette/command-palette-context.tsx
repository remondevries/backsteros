"use client";

import { clearGoFinanceChord } from "../../finance/go-finance-chord-gate.js";
import { clearGoLeaderSequence } from "../../shortcuts/go-leader-sequence-gate.js";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

export type CommandPaletteMode = "search" | "go" | "finance-go";

type CommandPaletteState = {
  open: boolean;
  mode: CommandPaletteMode;
};

type CommandPaletteActions = {
  setOpen: (open: boolean) => void;
  toggle: () => void;
  openSearch: () => void;
  openGo: () => void;
  openFinanceGo: () => void;
};

type CommandPaletteContextValue = CommandPaletteState & CommandPaletteActions;

/** Stable refs — consumers never re-render when open/mode changes. */
export type CommandPaletteRuntimeRefs = {
  openRef: RefObject<boolean>;
  modeRef: RefObject<CommandPaletteMode>;
};

const CommandPaletteStateContext = createContext<CommandPaletteState | null>(
  null,
);

const CommandPaletteActionsContext = createContext<CommandPaletteActions | null>(
  null,
);

const CommandPaletteRuntimeRefsContext =
  createContext<CommandPaletteRuntimeRefs | null>(null);

export function CommandPaletteProvider({
  children,
  onOpenChange,
}: {
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const [mode, setMode] = useState<CommandPaletteMode>("search");
  const openRef = useRef(open);
  const modeRef = useRef(mode);
  openRef.current = open;
  modeRef.current = mode;

  const runtimeRefs = useMemo(
    (): CommandPaletteRuntimeRefs => ({ openRef, modeRef }),
    [],
  );

  const setOpen = useCallback(
    (next: boolean) => {
      if (!next) {
        clearGoFinanceChord();
        clearGoLeaderSequence();
        setOpenState(false);
        setMode("search");
        onOpenChange?.(false);
        return;
      }
      setOpenState(true);
      onOpenChange?.(true);
    },
    [onOpenChange],
  );

  const toggle = useCallback(() => {
    setOpenState((current) => {
      const next = !current;
      if (!next) {
        clearGoFinanceChord();
        clearGoLeaderSequence();
      }
      setMode("search");
      onOpenChange?.(next);
      return next;
    });
  }, [onOpenChange]);

  const openSearch = useCallback(() => {
    setMode("search");
    setOpenState(true);
    onOpenChange?.(true);
  }, [onOpenChange]);

  const openGo = useCallback(() => {
    setMode("go");
    setOpenState(true);
    onOpenChange?.(true);
  }, [onOpenChange]);

  const openFinanceGo = useCallback(() => {
    setMode("finance-go");
    setOpenState(true);
    onOpenChange?.(true);
  }, [onOpenChange]);

  const state = useMemo((): CommandPaletteState => ({ open, mode }), [mode, open]);

  const actions = useMemo(
    (): CommandPaletteActions => ({
      setOpen,
      toggle,
      openSearch,
      openGo,
      openFinanceGo,
    }),
    [openFinanceGo, openGo, openSearch, setOpen, toggle],
  );

  return (
    <CommandPaletteRuntimeRefsContext.Provider value={runtimeRefs}>
      <CommandPaletteActionsContext.Provider value={actions}>
        <CommandPaletteStateContext.Provider value={state}>
          {children}
        </CommandPaletteStateContext.Provider>
      </CommandPaletteActionsContext.Provider>
    </CommandPaletteRuntimeRefsContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteContextValue {
  const state = useContext(CommandPaletteStateContext);
  const actions = useContext(CommandPaletteActionsContext);
  if (!state || !actions) {
    throw new Error(
      "useCommandPalette must be used within CommandPaletteProvider",
    );
  }
  return { ...state, ...actions };
}

/** Stable actions — shortcut hosts do not re-render when open/mode changes. */
export function useCommandPaletteActions(): CommandPaletteActions {
  const actions = useContext(CommandPaletteActionsContext);
  if (!actions) {
    throw new Error(
      "useCommandPaletteActions must be used within CommandPaletteProvider",
    );
  }
  return actions;
}

export function useCommandPaletteState(): CommandPaletteState {
  const state = useContext(CommandPaletteStateContext);
  if (!state) {
    throw new Error(
      "useCommandPaletteState must be used within CommandPaletteProvider",
    );
  }
  return state;
}

/** Stable — use in shortcut handlers to avoid re-subscribing on every open/close. */
export function useCommandPaletteRuntimeRefs() {
  const context = useContext(CommandPaletteRuntimeRefsContext);
  if (!context) {
    throw new Error(
      "useCommandPaletteRuntimeRefs must be used within CommandPaletteProvider",
    );
  }
  return context;
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type CommandPaletteMode = "search" | "go";

type CommandPaletteContextValue = {
  open: boolean;
  mode: CommandPaletteMode;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  openSearch: () => void;
  openGo: () => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
  null,
);

export function CommandPaletteProvider({
  children,
  onOpenChange,
}: {
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const [mode, setMode] = useState<CommandPaletteMode>("search");

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      if (!next) setMode("search");
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const toggle = useCallback(() => {
    setOpenState((current) => {
      const next = !current;
      setMode("search");
      onOpenChange?.(next);
      return next;
    });
  }, [onOpenChange]);

  const openSearch = useCallback(() => {
    setMode("search");
    setOpenState(true);
  }, []);

  const openGo = useCallback(() => {
    setMode("go");
    setOpenState(true);
  }, []);

  const value = useMemo(
    () => ({ open, mode, setOpen, toggle, openSearch, openGo }),
    [mode, open, openGo, openSearch, setOpen, toggle],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette() {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error(
      "useCommandPalette must be used within CommandPaletteProvider",
    );
  }
  return context;
}

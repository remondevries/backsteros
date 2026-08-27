import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type CommandPaletteContextValue = {
  open: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openPalette = useCallback(() => setOpen(true), []);
  const closePalette = useCallback(() => setOpen(false), []);
  const togglePalette = useCallback(() => setOpen((value) => !value), []);

  const value = useMemo(
    () => ({ open, openPalette, closePalette, togglePalette }),
    [closePalette, open, openPalette, togglePalette],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteContextValue {
  const value = useContext(CommandPaletteContext);
  if (!value) {
    throw new Error("useCommandPalette requires CommandPaletteProvider");
  }
  return value;
}

export function useCommandPaletteOptional(): CommandPaletteContextValue | null {
  return useContext(CommandPaletteContext);
}

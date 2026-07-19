import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";

type JournalSelectionContextValue = {
  /** Optimistic date from the last side-panel activation (click / Enter / Space). */
  pendingDate: string | null;
  /**
   * Date whose journal body is allowed on screen.
   * `null` or mismatch with the active date ⇒ skeleton only.
   */
  readyDate: string | null;
  /**
   * Call on pointerdown / Enter / Space BEFORE navigate.
   * flushSync so the journal pane unmounts content and paints skeleton
   * in the same event turn.
   */
  selectDate: (dateSlug: string) => void;
  /** Content finished loading for this date — swap skeleton → body. */
  markReady: (dateSlug: string) => void;
  clearPending: () => void;
};

const JournalSelectionContext =
  createContext<JournalSelectionContextValue | null>(null);

export function JournalSelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [readyDate, setReadyDate] = useState<string | null>(null);

  const selectDate = useCallback((dateSlug: string) => {
    const trimmed = dateSlug.trim();
    if (!trimmed) return;
    // Both updates in one flushSync: new date + clear ready ⇒ skeleton now.
    flushSync(() => {
      setPendingDate(trimmed);
      setReadyDate(null);
    });
  }, []);

  const markReady = useCallback((dateSlug: string) => {
    const trimmed = dateSlug.trim();
    if (!trimmed) return;
    setReadyDate(trimmed);
  }, []);

  const clearPending = useCallback(() => {
    setPendingDate(null);
  }, []);

  const value = useMemo(
    () => ({
      pendingDate,
      readyDate,
      selectDate,
      markReady,
      clearPending,
    }),
    [clearPending, markReady, pendingDate, readyDate, selectDate],
  );

  return (
    <JournalSelectionContext.Provider value={value}>
      {children}
    </JournalSelectionContext.Provider>
  );
}

export function useJournalSelection(): JournalSelectionContextValue {
  const ctx = useContext(JournalSelectionContext);
  if (!ctx) {
    throw new Error(
      "useJournalSelection must be used within JournalSelectionProvider",
    );
  }
  return ctx;
}

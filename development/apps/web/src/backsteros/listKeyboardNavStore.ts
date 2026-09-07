import { create } from "zustand";

import {
  getListKeyboardNavTabDirection,
  listKeyboardNavDirection,
  resolveListKeyboardStepTarget,
  shouldHandleListKeyboardActivate,
  shouldHandleListKeyboardEscape,
  shouldHandleListKeyboardNavigation,
  shouldHandleListKeyboardTabNavigation,
  stepListKeyboardNavZone,
  type ListKeyboardNavZone,
} from "./listKeyboardNav";

export type ListKeyboardNavRegistration = {
  readonly zone: ListKeyboardNavZone;
  readonly getItemIds: () => readonly string[];
  /**
   * Row used as the j/k cursor (and Enter target). Prefer a keyboard highlight
   * id over an “opened” selection so browsing does not open details.
   */
  readonly getSelectedId: () => string | null;
  /** Enter / Space — open or commit the row. */
  readonly onActivate: (id: string) => void;
  /**
   * j/k / arrows — move the cursor only. When set, stepping does not call
   * `onActivate` (so task details are not fetched until Enter).
   */
  readonly onHighlight?: (id: string) => void;
  /**
   * After Enter/Space on a sidepanel row, move j/k into the main list when
   * both zones are present (project list → project task list).
   */
  readonly enterMovesToMain?: boolean;
};

type ListKeyboardNavState = {
  readonly registrations: ReadonlyMap<ListKeyboardNavZone, ListKeyboardNavRegistration>;
  readonly activeZone: ListKeyboardNavZone;
  readonly register: (registration: ListKeyboardNavRegistration) => () => void;
  readonly setActiveZone: (zone: ListKeyboardNavZone) => void;
};

export const useListKeyboardNavStore = create<ListKeyboardNavState>((set, get) => ({
  registrations: new Map(),
  activeZone: "sidepanel",
  register: (registration) => {
    set((state) => {
      const next = new Map(state.registrations);
      next.set(registration.zone, registration);
      return { registrations: next };
    });
    return () => {
      set((state) => {
        const next = new Map(state.registrations);
        next.delete(registration.zone);
        const activeZone =
          state.activeZone === registration.zone
            ? ([...next.keys()][0] ?? "sidepanel")
            : state.activeZone;
        return { registrations: next, activeZone };
      });
    };
  },
  setActiveZone: (zone) => set({ activeZone: zone }),
}));

export function handleListKeyboardNavEvent(
  event: KeyboardEvent,
  options: {
    readonly terminalFocus?: boolean;
    readonly commandPaletteOpen?: boolean;
    readonly modelPickerOpen?: boolean;
    /**
     * Called when Escape cannot step to the sidepanel (already there / missing)
     * and the host wants a further “up” action (e.g. leave the open project).
     */
    readonly onEscapeUp?: () => boolean;
    /**
     * When Enter opens a project from the sidepanel before the main list has
     * registered, still move the active zone to `main` for the upcoming page.
     */
    readonly assumeMainAfterSidepanelEnter?: boolean;
  } = {},
): boolean {
  const guard = {
    event,
    terminalFocus: options.terminalFocus,
    commandPaletteOpen: options.commandPaletteOpen,
    modelPickerOpen: options.modelPickerOpen,
  };
  const { registrations, activeZone, setActiveZone } = useListKeyboardNavStore.getState();
  const available = [...registrations.keys()];

  if (shouldHandleListKeyboardTabNavigation(guard)) {
    if (available.length < 2) return false;
    const direction = getListKeyboardNavTabDirection(event);
    const current = available.includes(activeZone) ? activeZone : available[0]!;
    const nextZone = stepListKeyboardNavZone(current, direction, available);
    if (!nextZone || nextZone === current) return false;
    event.preventDefault();
    event.stopPropagation();
    // Switch focus only — do not activate the first row (that would open a
    // different project / task). j/k continues from the zone’s current selection.
    setActiveZone(nextZone);
    return true;
  }

  if (shouldHandleListKeyboardEscape(guard)) {
    const current = available.includes(activeZone) ? activeZone : available[0];
    if (current && current !== "sidepanel" && available.includes("sidepanel")) {
      event.preventDefault();
      event.stopPropagation();
      setActiveZone("sidepanel");
      return true;
    }
    if (options.onEscapeUp?.()) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    return false;
  }

  if (shouldHandleListKeyboardActivate(guard)) {
    const zone = available.includes(activeZone) ? activeZone : available[0];
    if (!zone) return false;
    const registration = registrations.get(zone);
    if (!registration) return false;

    const itemIds = registration.getItemIds();
    const selectedId = registration.getSelectedId();
    const targetId =
      selectedId != null && itemIds.includes(selectedId) ? selectedId : (itemIds[0] ?? null);
    if (!targetId) return false;

    event.preventDefault();
    event.stopPropagation();
    registration.onActivate(targetId);
    if (
      zone === "sidepanel" &&
      registration.enterMovesToMain &&
      (available.includes("main") || options.assumeMainAfterSidepanelEnter)
    ) {
      setActiveZone("main");
    }
    return true;
  }

  if (!shouldHandleListKeyboardNavigation(guard)) return false;

  const direction = listKeyboardNavDirection(event.key);
  if (!direction) return false;

  const zone = available.includes(activeZone) ? activeZone : available[0];
  if (!zone) return false;
  const registration = registrations.get(zone);
  if (!registration) return false;

  const itemIds = registration.getItemIds();
  const nextId = resolveListKeyboardStepTarget({
    direction,
    selectedId: registration.getSelectedId(),
    itemIds,
  });
  if (!nextId) return false;

  event.preventDefault();
  event.stopPropagation();
  if (registration.onHighlight) {
    registration.onHighlight(nextId);
  } else if (nextId !== registration.getSelectedId()) {
    registration.onActivate(nextId);
  }
  return true;
}

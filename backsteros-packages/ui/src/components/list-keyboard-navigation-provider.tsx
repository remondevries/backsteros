"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";

import {
  installKeyboardNavHoverModalityListeners,
  resolveListKeyboardAnchorId,
  setKeyboardNavMouseResumeHandler,
  suppressKeyboardNavHover,
} from "../keyboard-nav-hover-modality.js";
import { registerActiveListKeyboardItemResolver } from "../active-list-keyboard-item.js";
import { registerFocusedListKeyboardItemResolver } from "../focused-list-keyboard-item.js";
import {
  KEYBOARD_NAV_ITEM_ATTR,
  focusListKeyboardNavItem,
  scrollKeyboardNavItemIntoView,
} from "../keyboard-nav-item.js";
import { stepListKeyboardIndex } from "../list-keyboard-nav-index.js";
import {
  getDefaultListKeyboardNavZone,
  getListKeyboardNavTabDirection,
  LIST_KEYBOARD_NAV_CONTENT_PRIORITY,
  LIST_KEYBOARD_NAV_ZONE_ORDER,
  resolveActiveListKeyboardNavZone,
  resolveListKeyboardNavTabTargetZone,
  shouldAutoSwitchJkToMainList,
  shouldHandleListKeyboardZoneTab,
  type ApplyListKeyboardNavZoneOptions,
  type ListKeyboardNavZone,
} from "../list-keyboard-nav-zone.js";
import {
  boardKeyboardNavDirection,
  listKeyboardNavDirection,
  shouldHandleBoardKeyboardNavigation,
  shouldHandleListKeyboardActivate,
  shouldHandleListKeyboardNavigation,
} from "../should-handle-list-keyboard-navigation.js";
import { useCommandPalette } from "./command-palette-context.js";

export const LIST_KEYBOARD_NAV_SIDE_PANEL_PRIORITY = 10;
export { LIST_KEYBOARD_NAV_CONTENT_PRIORITY } from "../list-keyboard-nav-zone.js";
export const LIST_KEYBOARD_NAV_MAIN_PRIORITY = 5;

function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export type ListKeyboardNavigationRegistration = {
  id: string;
  zone: ListKeyboardNavZone;
  containerRef: RefObject<HTMLElement | null>;
  getItemIds: () => string[];
  getSelectedId: () => string | null;
  getHighlightedId: () => string | null;
  setHighlightedId: Dispatch<SetStateAction<string | null>>;
  onActivate: (itemId: string) => void;
  priority: number;
  resolveNextItemId?: (params: {
    key: string;
    currentId: string | null;
    itemIds: string[];
  }) => string | null;
};

type ListKeyboardNavigationContextValue = {
  register: (registration: ListKeyboardNavigationRegistration) => () => void;
  setActiveZone: (
    zone: ListKeyboardNavZone,
    options?: ApplyListKeyboardNavZoneOptions,
  ) => void;
  activeZone: ListKeyboardNavZone | null;
};

const ListKeyboardNavigationContext =
  createContext<ListKeyboardNavigationContextValue | null>(null);

/**
 * No-op fallback so shared views (e.g. overview lists) can call the keyboard
 * nav hooks even when rendered outside a provider (mobile / non-shell hosts).
 */
const noopListKeyboardNavigationContext: ListKeyboardNavigationContextValue = {
  register: () => () => {},
  setActiveZone: () => {},
  activeZone: null,
};

function useListKeyboardNavigationContext(): ListKeyboardNavigationContextValue {
  return (
    useContext(ListKeyboardNavigationContext) ??
    noopListKeyboardNavigationContext
  );
}

function isRegistrationVisible(
  registration: ListKeyboardNavigationRegistration,
): boolean {
  const container = registration.containerRef.current;
  if (!container || !container.isConnected) {
    return false;
  }

  return container.getClientRects().length > 0;
}

function hasListItems(
  registration: ListKeyboardNavigationRegistration,
): boolean {
  return registration.getItemIds().length > 0;
}

function pickBestRegistrationInZone(
  registrations: ListKeyboardNavigationRegistration[],
  zone: ListKeyboardNavZone,
): ListKeyboardNavigationRegistration | null {
  const visible = registrations.filter(
    (registration) =>
      registration.zone === zone &&
      isRegistrationVisible(registration) &&
      hasListItems(registration),
  );

  if (visible.length === 0) {
    return null;
  }

  return visible.reduce((best, current) =>
    current.priority > best.priority ? current : best,
  );
}

export function pickActiveListKeyboardRegistration(
  registrations: ListKeyboardNavigationRegistration[],
  activeZone: ListKeyboardNavZone | null,
): ListKeyboardNavigationRegistration | null {
  const visible = registrations.filter(
    (registration) =>
      isRegistrationVisible(registration) && hasListItems(registration),
  );
  if (visible.length === 0) {
    return null;
  }

  const focused = visible.find((registration) => {
    const container = registration.containerRef.current;
    if (!container) {
      return false;
    }
    return container.contains(document.activeElement);
  });
  if (focused) {
    return focused;
  }

  if (activeZone) {
    const inZone = pickBestRegistrationInZone(visible, activeZone);
    if (inZone) {
      return inZone;
    }
  }

  return visible.reduce((best, current) =>
    current.priority > best.priority ? current : best,
  );
}

function resolveListKeyboardRegistrationForNavigation(
  registrations: ListKeyboardNavigationRegistration[],
  activeZone: ListKeyboardNavZone | null,
  preferSidepanelForJk: boolean,
  pathname: string,
): ListKeyboardNavigationRegistration | null {
  const main = pickBestRegistrationInZone(registrations, "main");
  const zone = activeZone ?? "sidepanel";

  if (
    main &&
    zone === "sidepanel" &&
    !preferSidepanelForJk &&
    shouldAutoSwitchJkToMainList(pathname)
  ) {
    return main;
  }

  const inZone = pickBestRegistrationInZone(registrations, zone);
  if (inZone) {
    return inZone;
  }

  return pickActiveListKeyboardRegistration(registrations, activeZone);
}

function getAvailableKeyboardNavZones(
  registrations: ListKeyboardNavigationRegistration[],
): ListKeyboardNavZone[] {
  return LIST_KEYBOARD_NAV_ZONE_ORDER.filter(
    (zone) => pickBestRegistrationInZone(registrations, zone) != null,
  );
}

function zoneHasNavigableItems(
  registrations: ListKeyboardNavigationRegistration[],
  zone: ListKeyboardNavZone,
): boolean {
  return pickBestRegistrationInZone(registrations, zone) != null;
}

function syncActiveZoneToAvailableRegistrations(
  registrations: ListKeyboardNavigationRegistration[],
  preferredZone: ListKeyboardNavZone,
  applyActiveZone: (
    zone: ListKeyboardNavZone,
    options?: ApplyListKeyboardNavZoneOptions,
  ) => void,
): void {
  const available = getAvailableKeyboardNavZones(registrations);
  const zone = resolveActiveListKeyboardNavZone(preferredZone, available);
  if (!zone) {
    return;
  }

  applyActiveZone(zone, { preferSidepanelForJk: zone === "sidepanel" });

  const registration = pickBestRegistrationInZone(registrations, zone);
  if (registration) {
    activateListKeyboardRegistration(registrations, registration);
  }
}

function clearHighlightsExceptZone(
  registrations: ListKeyboardNavigationRegistration[],
  zone: ListKeyboardNavZone,
): void {
  for (const registration of registrations) {
    if (registration.zone === zone) {
      continue;
    }

    registration.setHighlightedId(null);
  }
}

function clearAllListKeyboardHighlights(
  registrations: ListKeyboardNavigationRegistration[],
): void {
  for (const registration of registrations) {
    registration.setHighlightedId(null);
  }

  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    active.closest(`[${KEYBOARD_NAV_ITEM_ATTR}]`)
  ) {
    active.blur();
  }
}

function activateListKeyboardRegistration(
  registrations: ListKeyboardNavigationRegistration[],
  registration: ListKeyboardNavigationRegistration,
): void {
  clearHighlightsExceptZone(registrations, registration.zone);
  focusListKeyboardRegistration(registration);
}

function focusListKeyboardRegistration(
  registration: ListKeyboardNavigationRegistration,
): void {
  const container = registration.containerRef.current;
  if (!container) {
    return;
  }

  const itemIds = registration.getItemIds();
  const selectedId = registration.getSelectedId();
  const anchorId =
    selectedId && itemIds.includes(selectedId) ? selectedId : itemIds[0] ?? null;

  if (anchorId) {
    registration.setHighlightedId(anchorId);
  }

  container.focus({ preventScroll: true });

  if (anchorId) {
    requestAnimationFrame(() => {
      scrollKeyboardNavItemIntoView(container, anchorId);
      focusListKeyboardNavItem(container, anchorId);
    });
  }
}

function scrollHighlightedItem(
  registration: ListKeyboardNavigationRegistration,
  itemId: string,
): void {
  const container = registration.containerRef.current;
  if (!container) {
    return;
  }

  requestAnimationFrame(() => {
    scrollKeyboardNavItemIntoView(container, itemId);
    focusListKeyboardNavItem(container, itemId);
  });
}

export function ListKeyboardNavigationProvider({
  children,
  pathname,
}: {
  children: ReactNode;
  pathname: string;
}) {
  const registrationsRef = useRef<ListKeyboardNavigationRegistration[]>([]);
  const activeZoneRef = useRef<ListKeyboardNavZone | null>(null);
  const preferSidepanelForJkRef = useRef(false);
  const [activeZone, setActiveZoneState] = useState<ListKeyboardNavZone | null>(
    null,
  );
  const pathnameRef = useLatestRef(pathname);
  const lastPathnameZoneRef = useRef<ListKeyboardNavZone | null>(null);

  const applyActiveZone = useCallback(
    (zone: ListKeyboardNavZone, options?: ApplyListKeyboardNavZoneOptions) => {
      activeZoneRef.current = zone;
      setActiveZoneState(zone);
      preferSidepanelForJkRef.current = options?.preferSidepanelForJk ?? false;
      document.body.setAttribute("data-keyboard-nav-active-zone", zone);
      clearHighlightsExceptZone(registrationsRef.current, zone);
    },
    [],
  );

  useEffect(() => {
    const preferredZone = getDefaultListKeyboardNavZone(pathname);
    lastPathnameZoneRef.current = preferredZone;

    const frame = requestAnimationFrame(() => {
      syncActiveZoneToAvailableRegistrations(
        registrationsRef.current,
        preferredZone,
        applyActiveZone,
      );
    });

    return () => cancelAnimationFrame(frame);
  }, [applyActiveZone, pathname]);

  useEffect(() => {
    setKeyboardNavMouseResumeHandler(() => {
      clearAllListKeyboardHighlights(registrationsRef.current);
    });
    const uninstallHoverModality = installKeyboardNavHoverModalityListeners();
    return () => {
      setKeyboardNavMouseResumeHandler(null);
      uninstallHoverModality();
    };
  }, []);

  useEffect(() => {
    function resolveListKeyboardItemId(
      requireContainerFocus: boolean,
    ): string | null {
      const registration = pickActiveListKeyboardRegistration(
        registrationsRef.current,
        activeZoneRef.current,
      );
      if (!registration) {
        return null;
      }

      const container = registration.containerRef.current;
      if (
        requireContainerFocus &&
        (!container || !container.contains(document.activeElement))
      ) {
        return null;
      }

      const itemIds = registration.getItemIds();
      const itemId =
        registration.getHighlightedId() ?? registration.getSelectedId();
      if (!itemId || !itemIds.includes(itemId)) {
        return null;
      }

      return itemId;
    }

    const unregisterActive = registerActiveListKeyboardItemResolver(() =>
      resolveListKeyboardItemId(false),
    );
    const unregisterFocused = registerFocusedListKeyboardItemResolver(() =>
      resolveListKeyboardItemId(true),
    );

    return () => {
      unregisterActive();
      unregisterFocused();
    };
  }, []);

  const register = useCallback(
    (registration: ListKeyboardNavigationRegistration) => {
      registrationsRef.current = [
        ...registrationsRef.current.filter(
          (entry) => entry.id !== registration.id,
        ),
        registration,
      ];

      requestAnimationFrame(() => {
        const zone = activeZoneRef.current;
        if (zone && !zoneHasNavigableItems(registrationsRef.current, zone)) {
          syncActiveZoneToAvailableRegistrations(
            registrationsRef.current,
            zone,
            applyActiveZone,
          );
        }
      });

      return () => {
        registrationsRef.current = registrationsRef.current.filter(
          (entry) => entry.id !== registration.id,
        );

        requestAnimationFrame(() => {
          const zone = activeZoneRef.current;
          if (zone && !zoneHasNavigableItems(registrationsRef.current, zone)) {
            syncActiveZoneToAvailableRegistrations(
              registrationsRef.current,
              zone,
              applyActiveZone,
            );
          }
        });
      };
    },
    [applyActiveZone],
  );

  return (
    <ListKeyboardNavigationContext.Provider
      value={{ register, setActiveZone: applyActiveZone, activeZone }}
    >
      <ListKeyboardNavigationGlobalListener
        registrationsRef={registrationsRef}
        activeZoneRef={activeZoneRef}
        preferSidepanelForJkRef={preferSidepanelForJkRef}
        pathnameRef={pathnameRef}
        applyActiveZone={applyActiveZone}
      />
      {children}
    </ListKeyboardNavigationContext.Provider>
  );
}

function ListKeyboardNavigationGlobalListener({
  registrationsRef,
  activeZoneRef,
  preferSidepanelForJkRef,
  pathnameRef,
  applyActiveZone,
}: {
  registrationsRef: RefObject<ListKeyboardNavigationRegistration[]>;
  activeZoneRef: RefObject<ListKeyboardNavZone | null>;
  preferSidepanelForJkRef: RefObject<boolean>;
  pathnameRef: RefObject<string>;
  applyActiveZone: (
    zone: ListKeyboardNavZone,
    options?: ApplyListKeyboardNavZoneOptions,
  ) => void;
}) {
  const { open: commandPaletteOpen } = useCommandPalette();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (commandPaletteOpen) {
        return;
      }

      if (shouldHandleListKeyboardZoneTab(event)) {
        const available = getAvailableKeyboardNavZones(registrationsRef.current);
        if (available.length === 0) {
          event.preventDefault();
          return;
        }

        const currentZone =
          activeZoneRef.current ??
          pickActiveListKeyboardRegistration(
            registrationsRef.current,
            activeZoneRef.current,
          )?.zone ??
          available[0]!;
        const direction = getListKeyboardNavTabDirection(event);
        const currentHasItems = zoneHasNavigableItems(
          registrationsRef.current,
          currentZone,
        );
        const nextZone = resolveListKeyboardNavTabTargetZone(
          currentZone,
          direction,
          available,
          currentHasItems,
        );
        if (!nextZone || nextZone === currentZone) {
          event.preventDefault();
          return;
        }

        const nextRegistration = pickBestRegistrationInZone(
          registrationsRef.current,
          nextZone,
        );
        if (!nextRegistration) {
          event.preventDefault();
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        suppressKeyboardNavHover();
        applyActiveZone(nextZone, {
          preferSidepanelForJk: nextZone === "sidepanel",
        });
        activateListKeyboardRegistration(
          registrationsRef.current,
          nextRegistration,
        );
        return;
      }

      const registration = resolveListKeyboardRegistrationForNavigation(
        registrationsRef.current,
        activeZoneRef.current,
        preferSidepanelForJkRef.current,
        pathnameRef.current,
      );
      if (!registration) {
        return;
      }

      const itemIds = registration.getItemIds();
      if (itemIds.length === 0) {
        return;
      }

      const direction = listKeyboardNavDirection(event.key);
      const isListNav = Boolean(
        direction && shouldHandleListKeyboardNavigation(event),
      );
      const boardDirection = boardKeyboardNavDirection(event.key);
      const isBoardNav = Boolean(
        registration.resolveNextItemId &&
          boardDirection &&
          shouldHandleBoardKeyboardNavigation(event),
      );
      const isActivate = shouldHandleListKeyboardActivate(event);
      const isNavigationIntent = isListNav || isBoardNav || isActivate;

      if (
        isNavigationIntent &&
        registration.zone === "main" &&
        activeZoneRef.current !== "main" &&
        shouldAutoSwitchJkToMainList(pathnameRef.current)
      ) {
        event.preventDefault();
        event.stopPropagation();
        suppressKeyboardNavHover();
        applyActiveZone("main");
        activateListKeyboardRegistration(registrationsRef.current, registration);
        if (isActivate) {
          const targetId =
            registration.getSelectedId() ??
            (itemIds.length > 0 ? itemIds[0] : null);
          if (targetId && itemIds.includes(targetId)) {
            registration.onActivate(targetId);
          }
        }
        return;
      }

      const highlightedId = registration.getHighlightedId();
      const selectedId = registration.getSelectedId();
      const anchorId = resolveListKeyboardAnchorId(
        highlightedId,
        selectedId,
        itemIds,
      );

      if (registration.resolveNextItemId) {
        if (boardDirection && isBoardNav) {
          const nextItemId = registration.resolveNextItemId({
            key: event.key,
            currentId: anchorId,
            itemIds,
          });
          if (!nextItemId) {
            return;
          }

          if (nextItemId === highlightedId && anchorId === highlightedId) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          suppressKeyboardNavHover();
          registration.setHighlightedId(nextItemId);
          scrollHighlightedItem(registration, nextItemId);
          return;
        }
      } else if (direction && isListNav) {
        const currentIndex = anchorId != null ? itemIds.indexOf(anchorId) : -1;
        const nextIndex = stepListKeyboardIndex(
          currentIndex,
          direction,
          itemIds.length,
        );
        const nextItemId = itemIds[nextIndex];
        if (!nextItemId) {
          return;
        }

        if (nextItemId === highlightedId && anchorId === highlightedId) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        suppressKeyboardNavHover();
        registration.setHighlightedId(nextItemId);
        scrollHighlightedItem(registration, nextItemId);
        return;
      }

      if (!shouldHandleListKeyboardActivate(event)) {
        return;
      }

      const activateItemIds = registration.getItemIds();
      if (activateItemIds.length === 0) {
        return;
      }

      const targetId = resolveListKeyboardAnchorId(
        registration.getHighlightedId(),
        registration.getSelectedId(),
        activateItemIds,
      );
      if (!targetId || !activateItemIds.includes(targetId)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      registration.onActivate(targetId);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    activeZoneRef,
    applyActiveZone,
    commandPaletteOpen,
    pathnameRef,
    preferSidepanelForJkRef,
    registrationsRef,
  ]);

  return null;
}

export function useListKeyboardNavigation({
  containerRef,
  itemIds,
  selectedId,
  onNavigate,
  zone,
  priority,
  enabled = true,
  resolveNextItemId,
}: {
  containerRef: RefObject<HTMLElement | null>;
  itemIds: string[];
  selectedId: string | null;
  onNavigate: (itemId: string) => void;
  zone: ListKeyboardNavZone;
  priority?: number;
  enabled?: boolean;
  resolveNextItemId?: (params: {
    key: string;
    currentId: string | null;
    itemIds: string[];
  }) => string | null;
}): { highlightedId: string | null } {
  const context = useListKeyboardNavigationContext();
  const { activeZone, register } = context;
  const resolvedPriority =
    priority ??
    (zone === "sidepanel"
      ? LIST_KEYBOARD_NAV_SIDE_PANEL_PRIORITY
      : zone === "content"
        ? LIST_KEYBOARD_NAV_CONTENT_PRIORITY
        : LIST_KEYBOARD_NAV_MAIN_PRIORITY);

  const [manualHighlight, setManualHighlight] = useState<string | null>(null);
  const itemIdsRef = useLatestRef(itemIds);
  const selectedIdRef = useLatestRef(selectedId);
  const onNavigateRef = useLatestRef(onNavigate);
  const resolveNextItemIdRef = useLatestRef(resolveNextItemId);
  const registrationId = useId();

  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    if (manualHighlight !== null) {
      setManualHighlight(null);
    }
  }

  const resolvedHighlight =
    activeZone !== zone
      ? null
      : manualHighlight != null && itemIds.includes(manualHighlight)
        ? manualHighlight
        : null;

  const highlightedIdRef = useLatestRef(resolvedHighlight);

  useEffect(() => {
    if (!enabled || itemIds.length === 0) {
      return;
    }

    return register({
      id: registrationId,
      zone,
      containerRef,
      getItemIds: () => itemIdsRef.current,
      getSelectedId: () => selectedIdRef.current,
      getHighlightedId: () => highlightedIdRef.current,
      setHighlightedId: setManualHighlight,
      onActivate: (itemId) => onNavigateRef.current(itemId),
      priority: resolvedPriority,
      resolveNextItemId: resolveNextItemIdRef.current
        ? (params) => resolveNextItemIdRef.current!(params)
        : undefined,
    });
  }, [
    containerRef,
    enabled,
    highlightedIdRef,
    itemIds.length,
    itemIdsRef,
    onNavigateRef,
    register,
    registrationId,
    resolvedPriority,
    resolveNextItemIdRef,
    selectedIdRef,
    zone,
  ]);

  return {
    highlightedId: activeZone === zone ? resolvedHighlight : null,
  };
}

export function useListKeyboardNavigationContainerProps(
  zone?: ListKeyboardNavZone,
) {
  const context = useListKeyboardNavigationContext();

  return {
    tabIndex: -1,
    "data-list-keyboard-nav-container": true,
    onPointerDownCapture: (event: PointerEvent<HTMLElement>) => {
      event.currentTarget.focus({ preventScroll: true });
      if (zone) {
        context.setActiveZone(zone, {
          preferSidepanelForJk: zone === "sidepanel",
        });
      }
    },
  } as const;
}

export function isKeyboardNavHighlighted(
  highlightedId: string | null,
  itemId: string,
): boolean {
  return highlightedId === itemId;
}

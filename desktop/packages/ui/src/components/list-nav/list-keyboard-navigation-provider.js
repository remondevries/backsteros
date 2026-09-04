"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, } from "react";
import { getLastHoveredKeyboardNavItemId, installKeyboardNavHoverModalityListeners, isKeyboardNavHoverSuppressed, resolveListKeyboardAnchorId, setKeyboardNavMouseResumeHandler, suppressKeyboardNavHover, } from "../../list-nav/keyboard-nav-hover-modality.js";
import { registerActiveListKeyboardItemResolver } from "../../list-nav/active-list-keyboard-item.js";
import { registerFocusedListKeyboardItemResolver } from "../../list-nav/focused-list-keyboard-item.js";
import { KEYBOARD_NAV_ITEM_ATTR, focusListKeyboardNavItem, scrollKeyboardNavItemIntoView, } from "../../list-nav/keyboard-nav-item.js";
import { resolveListKeyboardStepTarget } from "../../list-nav/list-keyboard-nav-index.js";
import { useListKeyboardNavMountGate } from "../../list-nav/list-keyboard-nav-mount-gate.js";
import { isListKeyboardNavContainerVisible } from "../../list-nav/list-keyboard-nav-visibility.js";
import { getListKeyboardNavSurfaceKey, getListKeyboardNavTabDirection, filterListKeyboardNavZonesForTab, LIST_KEYBOARD_NAV_CONTENT_PRIORITY, LIST_KEYBOARD_NAV_ZONE_ORDER, readCalendarPageModeFromDocument, resolveActiveListKeyboardNavZone, resolveListKeyboardNavTabTargetZone, resolveZonePolicy, shouldHandleListKeyboardZoneTab, } from "../../list-nav/list-keyboard-nav-zone.js";
import { boardKeyboardNavDirection, listKeyboardNavDirection, shouldHandleBoardKeyboardNavigation, shouldHandleListKeyboardActivate, shouldHandleListKeyboardNavigation, } from "../../list-nav/should-handle-list-keyboard-navigation.js";
import { isListDetailPanelOpen, shouldYieldListKeyboardEscapeToShortcutStack, } from "../../list-nav/use-list-clear-selection-shortcut.js";
import { isBlockingModalOpen } from "../../shortcuts/shortcut-guards.js";
import { useCommandPaletteRuntimeRefs } from "../command-palette/command-palette-context.js";
function shouldHandleListKeyboardEscape(event, commandPaletteOpen) {
    if (event.key !== "Escape" || event.repeat) {
        return false;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return false;
    }
    if (commandPaletteOpen || isBlockingModalOpen()) {
        return false;
    }
    if (document.querySelector("[data-searchable-dropdown-panel]")) {
        return false;
    }
    const target = event.target;
    if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" ||
            tag === "TEXTAREA" ||
            tag === "SELECT" ||
            target.isContentEditable ||
            target.closest(".cm-editor") ||
            target.closest("[role='textbox']") ||
            target.closest(".xterm")) {
            return false;
        }
    }
    return true;
}
export const LIST_KEYBOARD_NAV_SIDE_PANEL_PRIORITY = 10;
export { LIST_KEYBOARD_NAV_CONTENT_PRIORITY } from "../../list-nav/list-keyboard-nav-zone.js";
export const LIST_KEYBOARD_NAV_MAIN_PRIORITY = 5;
function useLatestRef(value) {
    const ref = useRef(value);
    ref.current = value;
    return ref;
}
const ListKeyboardNavigationContext = createContext(null);
/**
 * No-op fallback so shared views (e.g. overview lists) can call the keyboard
 * nav hooks even when rendered outside a provider (mobile / non-shell hosts).
 */
const noopListKeyboardNavigationContext = {
    register: () => () => { },
    setActiveZone: () => { },
    clearHighlights: () => { },
    activeZone: null,
};
function useListKeyboardNavigationContext() {
    return (useContext(ListKeyboardNavigationContext) ??
        noopListKeyboardNavigationContext);
}
function isRegistrationVisible(registration) {
    return isListKeyboardNavContainerVisible(registration.containerRef.current);
}
function hasListItems(registration) {
    return registration.getItemIds().length > 0;
}
function pickBestRegistrationInZone(registrations, zone) {
    const visible = registrations.filter((registration) => registration.zone === zone &&
        isRegistrationVisible(registration) &&
        hasListItems(registration));
    if (visible.length === 0) {
        return null;
    }
    // Equal priority → prefer the most recently registered list (warm flip).
    return visible.reduce((best, current) => current.priority >= best.priority ? current : best);
}
export function pickActiveListKeyboardRegistration(registrations, activeZone) {
    const visible = registrations.filter((registration) => isRegistrationVisible(registration) && hasListItems(registration));
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
    return visible.reduce((best, current) => current.priority >= best.priority ? current : best);
}
function resolveListKeyboardRegistrationForNavigation(registrations, activeZone, preferSidepanelForJk, pathname) {
    const policy = resolveZonePolicy(pathname, {
        calendarPageMode: readCalendarPageModeFromDocument(),
        preferSidepanelForJk,
        activeZone,
        hasMainList: pickBestRegistrationInZone(registrations, "main") != null,
    });
    const inZone = pickBestRegistrationInZone(registrations, policy.jkZone);
    if (inZone) {
        return inZone;
    }
    // Warm flip left jkZone empty (e.g. sidepanel preference after leaving
    // inbox). Fall through to the path default, then any visible list.
    if (policy.jkZone !== policy.defaultZone) {
        const byDefault = pickBestRegistrationInZone(registrations, policy.defaultZone);
        if (byDefault) {
            return byDefault;
        }
    }
    if (policy.autoSwitchJkToMain && policy.jkZone !== "main") {
        const main = pickBestRegistrationInZone(registrations, "main");
        if (main) {
            return main;
        }
    }
    return pickActiveListKeyboardRegistration(registrations, activeZone);
}
function getAvailableKeyboardNavZones(registrations) {
    return LIST_KEYBOARD_NAV_ZONE_ORDER.filter((zone) => pickBestRegistrationInZone(registrations, zone) != null);
}
function zoneHasNavigableItems(registrations, zone) {
    return pickBestRegistrationInZone(registrations, zone) != null;
}
function syncActiveZoneToAvailableRegistrations(registrations, preferredZone, applyActiveZone, options) {
    const available = getAvailableKeyboardNavZones(registrations);
    const zone = resolveActiveListKeyboardNavZone(preferredZone, available);
    if (!zone) {
        return;
    }
    const shouldActivate = options?.activate !== false;
    applyActiveZone(zone, {
        preferSidepanelForJk: shouldActivate && zone === "sidepanel",
        activate: shouldActivate,
        landAtStart: shouldActivate && options?.landAtStart === true,
    });
}
function clearHighlightsExceptZone(registrations, zone) {
    for (const registration of registrations) {
        if (registration.zone === zone) {
            continue;
        }
        registration.setHighlightedId(null);
    }
}
/** Drop highlights on every list except the one that now owns the keys. */
function clearHighlightsExceptRegistration(registrations, keep) {
    for (const registration of registrations) {
        if (registration.id === keep.id) {
            continue;
        }
        registration.setHighlightedId(null);
    }
}
function clearAllListKeyboardHighlights(registrations) {
    for (const registration of registrations) {
        registration.setHighlightedId(null);
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement &&
        active.closest(`[${KEYBOARD_NAV_ITEM_ATTR}]`)) {
        active.blur();
    }
}
function activateListKeyboardRegistration(registrations, registration, highlightItemId) {
    clearHighlightsExceptRegistration(registrations, registration);
    focusListKeyboardRegistration(registration, highlightItemId);
}
function focusListKeyboardRegistration(registration, preferredItemId) {
    const container = registration.containerRef.current;
    if (!container) {
        return;
    }
    const itemIds = registration.getItemIds();
    const selectedId = registration.getSelectedId();
    const preferred = preferredItemId && itemIds.includes(preferredItemId)
        ? preferredItemId
        : null;
    const anchorId = preferred ??
        (selectedId && itemIds.includes(selectedId) ? selectedId : null) ??
        itemIds[0] ??
        null;
    suppressKeyboardNavHover();
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
function scrollHighlightedItem(registration, itemId) {
    const container = registration.containerRef.current;
    if (!container) {
        return;
    }
    requestAnimationFrame(() => {
        scrollKeyboardNavItemIntoView(container, itemId);
        focusListKeyboardNavItem(container, itemId);
    });
}
export function ListKeyboardNavigationProvider({ children, pathname, 
/**
 * When true (default), Escape from main/content activates the side panel.
 * Agent console keeps Escape in the content column — use G then P for projects.
 */
escapeReturnsToSidepanel = true, }) {
    const registrationsRef = useRef([]);
    const activeZoneRef = useRef(null);
    const preferSidepanelForJkRef = useRef(false);
    const pendingActivateZoneRef = useRef(null);
    const pendingActivateHighlightItemIdRef = useRef(null);
    const pendingActivateLandAtStartRef = useRef(false);
    const [activeZone, setActiveZoneState] = useState(null);
    const pathnameRef = useLatestRef(pathname);
    const lastPathnameZoneRef = useRef(null);
    const lastSurfaceKeyRef = useRef(null);
    const applyActiveZone = useCallback((zone, options) => {
        activeZoneRef.current = zone;
        setActiveZoneState(zone);
        preferSidepanelForJkRef.current = options?.preferSidepanelForJk ?? false;
        document.body.setAttribute("data-keyboard-nav-active-zone", zone);
        clearHighlightsExceptZone(registrationsRef.current, zone);
        if (options?.activate) {
            const registration = pickBestRegistrationInZone(registrationsRef.current, zone);
            const landAtStart = options.landAtStart === true;
            if (registration) {
                pendingActivateZoneRef.current = null;
                pendingActivateHighlightItemIdRef.current = null;
                pendingActivateLandAtStartRef.current = false;
                const highlightItemId = landAtStart
                    ? (registration.getItemIds()[0] ?? null)
                    : options.highlightItemId;
                activateListKeyboardRegistration(registrationsRef.current, registration, highlightItemId);
            }
            else {
                pendingActivateZoneRef.current = zone;
                pendingActivateLandAtStartRef.current = landAtStart;
                pendingActivateHighlightItemIdRef.current = landAtStart
                    ? null
                    : (options.highlightItemId ?? null);
            }
        }
        else {
            pendingActivateZoneRef.current = null;
            pendingActivateHighlightItemIdRef.current = null;
            pendingActivateLandAtStartRef.current = false;
        }
    }, []);
    const clearHighlights = useCallback(() => {
        pendingActivateZoneRef.current = null;
        pendingActivateHighlightItemIdRef.current = null;
        pendingActivateLandAtStartRef.current = false;
        preferSidepanelForJkRef.current = false;
        clearAllListKeyboardHighlights(registrationsRef.current);
    }, []);
    useEffect(() => {
        const preferredZone = resolveZonePolicy(pathname).defaultZone;
        const surfaceKey = getListKeyboardNavSurfaceKey(pathname);
        // Soft transitions that keep the same list mounted (inbox → email,
        // journal day → journal day) must not re-activate / scroll the list.
        // Crossing keep-alive surfaces (journal → inbox, inbox → tasks) must
        // re-claim j/k even when zones look similar.
        if (lastPathnameZoneRef.current === preferredZone &&
            lastSurfaceKeyRef.current === surfaceKey) {
            return;
        }
        const surfaceChanged = lastSurfaceKeyRef.current != null &&
            lastSurfaceKeyRef.current !== surfaceKey;
        lastPathnameZoneRef.current = preferredZone;
        lastSurfaceKeyRef.current = surfaceKey;
        // Drop inbox/journal sidepanel preference so the new surface can own j/k.
        preferSidepanelForJkRef.current = false;
        if (surfaceChanged) {
            clearAllListKeyboardHighlights(registrationsRef.current);
        }
        const frame = requestAnimationFrame(() => {
            syncActiveZoneToAvailableRegistrations(registrationsRef.current, preferredZone, applyActiveZone, { landAtStart: surfaceChanged });
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
        function resolveListKeyboardItemId(requireContainerFocus) {
            const registration = pickActiveListKeyboardRegistration(registrationsRef.current, activeZoneRef.current);
            if (!registration) {
                return null;
            }
            const container = registration.containerRef.current;
            if (requireContainerFocus &&
                (!container || !container.contains(document.activeElement))) {
                return null;
            }
            const itemIds = registration.getItemIds();
            const itemId = registration.getHighlightedId() ?? registration.getSelectedId();
            if (!itemId || !itemIds.includes(itemId)) {
                return null;
            }
            return itemId;
        }
        const unregisterActive = registerActiveListKeyboardItemResolver(() => resolveListKeyboardItemId(false));
        const unregisterFocused = registerFocusedListKeyboardItemResolver(() => resolveListKeyboardItemId(true));
        return () => {
            unregisterActive();
            unregisterFocused();
        };
    }, []);
    const register = useCallback((registration) => {
        registrationsRef.current = [
            ...registrationsRef.current.filter((entry) => entry.id !== registration.id),
            registration,
        ];
        requestAnimationFrame(() => {
            const pendingZone = pendingActivateZoneRef.current;
            if (pendingZone &&
                zoneHasNavigableItems(registrationsRef.current, pendingZone)) {
                const landAtStart = pendingActivateLandAtStartRef.current;
                const pendingHighlightItemId = pendingActivateHighlightItemIdRef.current;
                pendingActivateZoneRef.current = null;
                pendingActivateHighlightItemIdRef.current = null;
                pendingActivateLandAtStartRef.current = false;
                const pendingRegistration = pickBestRegistrationInZone(registrationsRef.current, pendingZone);
                if (pendingRegistration) {
                    const highlightItemId = landAtStart
                        ? (pendingRegistration.getItemIds()[0] ?? null)
                        : pendingHighlightItemId;
                    activateListKeyboardRegistration(registrationsRef.current, pendingRegistration, highlightItemId);
                }
                return;
            }
            const zone = activeZoneRef.current;
            if (zone && !zoneHasNavigableItems(registrationsRef.current, zone)) {
                // List went empty/hidden — retarget zone only; do not focus a row
                // (would steal from terminal when a project task opens).
                syncActiveZoneToAvailableRegistrations(registrationsRef.current, zone, applyActiveZone, { activate: false });
            }
        });
        return () => {
            registrationsRef.current = registrationsRef.current.filter((entry) => entry.id !== registration.id);
            requestAnimationFrame(() => {
                const zone = activeZoneRef.current;
                if (zone && !zoneHasNavigableItems(registrationsRef.current, zone)) {
                    syncActiveZoneToAvailableRegistrations(registrationsRef.current, zone, applyActiveZone, { activate: false });
                }
            });
        };
    }, [applyActiveZone]);
    const escapeReturnsToSidepanelRef = useRef(escapeReturnsToSidepanel);
    escapeReturnsToSidepanelRef.current = escapeReturnsToSidepanel;
    return (_jsxs(ListKeyboardNavigationContext.Provider, { value: {
            register,
            setActiveZone: applyActiveZone,
            clearHighlights,
            activeZone,
        }, children: [_jsx(ListKeyboardNavigationGlobalListener, { registrationsRef: registrationsRef, activeZoneRef: activeZoneRef, preferSidepanelForJkRef: preferSidepanelForJkRef, pathnameRef: pathnameRef, escapeReturnsToSidepanelRef: escapeReturnsToSidepanelRef, applyActiveZone: applyActiveZone }), children] }));
}
function ListKeyboardNavigationGlobalListener({ registrationsRef, activeZoneRef, preferSidepanelForJkRef, pathnameRef, escapeReturnsToSidepanelRef, applyActiveZone, }) {
    const { openRef } = useCommandPaletteRuntimeRefs();
    const commandPaletteOpenRef = openRef;
    useEffect(() => {
        function handleKeyDown(event) {
            const commandPaletteOpen = commandPaletteOpenRef.current ?? false;
            if (commandPaletteOpen) {
                return;
            }
            if (escapeReturnsToSidepanelRef.current &&
                shouldHandleListKeyboardEscape(event, commandPaletteOpen)) {
                // Detail open / multi-select: another window capture listener owns Escape.
                // Yield even if that listener is registered after this one.
                if (shouldYieldListKeyboardEscapeToShortcutStack()) {
                    return;
                }
                const currentZone = activeZoneRef.current;
                if (currentZone === "main" || currentZone === "content") {
                    const sidepanel = pickBestRegistrationInZone(registrationsRef.current, "sidepanel");
                    if (sidepanel) {
                        event.preventDefault();
                        event.stopPropagation();
                        suppressKeyboardNavHover();
                        applyActiveZone("sidepanel", {
                            preferSidepanelForJk: true,
                            activate: true,
                        });
                        return;
                    }
                }
            }
            if (shouldHandleListKeyboardZoneTab(event)) {
                const available = filterListKeyboardNavZonesForTab(getAvailableKeyboardNavZones(registrationsRef.current), isListDetailPanelOpen());
                if (available.length === 0) {
                    event.preventDefault();
                    return;
                }
                const currentZone = activeZoneRef.current ??
                    pickActiveListKeyboardRegistration(registrationsRef.current, activeZoneRef.current)?.zone ??
                    available[0];
                const direction = getListKeyboardNavTabDirection(event);
                const currentHasItems = available.includes(currentZone) &&
                    zoneHasNavigableItems(registrationsRef.current, currentZone);
                const nextZone = resolveListKeyboardNavTabTargetZone(currentZone, direction, available, currentHasItems);
                if (!nextZone || nextZone === currentZone) {
                    event.preventDefault();
                    return;
                }
                const nextRegistration = pickBestRegistrationInZone(registrationsRef.current, nextZone);
                if (!nextRegistration) {
                    event.preventDefault();
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                suppressKeyboardNavHover();
                applyActiveZone(nextZone, {
                    preferSidepanelForJk: nextZone === "sidepanel",
                    activate: true,
                });
                return;
            }
            const registration = resolveListKeyboardRegistrationForNavigation(registrationsRef.current, activeZoneRef.current, preferSidepanelForJkRef.current, pathnameRef.current);
            if (!registration) {
                return;
            }
            // Side panel is active and has a list — never steal the first j/k to
            // main content (org/contact entity tabs previously auto-switched).
            let navigationRegistration = registration;
            if (activeZoneRef.current === "sidepanel" &&
                registration.zone !== "sidepanel") {
                const sidepanel = pickBestRegistrationInZone(registrationsRef.current, "sidepanel");
                if (sidepanel) {
                    navigationRegistration = sidepanel;
                }
            }
            const itemIds = navigationRegistration.getItemIds();
            if (itemIds.length === 0) {
                return;
            }
            const direction = listKeyboardNavDirection(event.key);
            const isListNav = Boolean(direction && shouldHandleListKeyboardNavigation(event));
            const boardDirection = boardKeyboardNavDirection(event.key);
            const isBoardNav = Boolean(navigationRegistration.resolveNextItemId &&
                boardDirection &&
                shouldHandleBoardKeyboardNavigation(event));
            const isActivate = shouldHandleListKeyboardActivate(event);
            const isNavigationIntent = isListNav || isBoardNav || isActivate;
            if (isNavigationIntent &&
                navigationRegistration.zone === "main" &&
                activeZoneRef.current !== "main" &&
                activeZoneRef.current !== "sidepanel" &&
                resolveZonePolicy(pathnameRef.current, {
                    calendarPageMode: readCalendarPageModeFromDocument(),
                }).autoSwitchJkToMain) {
                event.preventDefault();
                event.stopPropagation();
                suppressKeyboardNavHover();
                applyActiveZone("main", { activate: true });
                if (isActivate) {
                    const targetId = resolveListKeyboardAnchorId(navigationRegistration.getHighlightedId(), navigationRegistration.getSelectedId(), itemIds) ?? (itemIds.length > 0 ? itemIds[0] : null);
                    if (targetId && itemIds.includes(targetId)) {
                        navigationRegistration.onActivate(targetId);
                    }
                }
                return;
            }
            const highlightedId = navigationRegistration.getHighlightedId();
            const selectedId = navigationRegistration.getSelectedId();
            if (navigationRegistration.resolveNextItemId) {
                if (boardDirection && isBoardNav) {
                    const anchorId = resolveListKeyboardAnchorId(highlightedId, selectedId, itemIds);
                    const nextItemId = navigationRegistration.resolveNextItemId({
                        key: event.key,
                        currentId: anchorId,
                        itemIds,
                    });
                    if (!nextItemId) {
                        return;
                    }
                    if (nextItemId === highlightedId && anchorId === highlightedId) {
                        // Side effects (e.g. tree expand/collapse) may already have run in
                        // resolveNextItemId — still consume the key.
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    suppressKeyboardNavHover();
                    navigationRegistration.setHighlightedId(nextItemId);
                    scrollHighlightedItem(navigationRegistration, nextItemId);
                    return;
                }
            }
            else if (direction && isListNav) {
                // Hover modality tracks the row under the pointer; use it as the j/k
                // step origin when nothing is keyboard-highlighted yet (legacy pickup).
                const hoverAnchorId = highlightedId == null && !isKeyboardNavHoverSuppressed()
                    ? getLastHoveredKeyboardNavItemId()
                    : null;
                const nextItemId = resolveListKeyboardStepTarget({
                    direction,
                    highlightedId,
                    selectedId,
                    itemIds,
                    hoverAnchorId,
                });
                if (!nextItemId) {
                    return;
                }
                // Same target as current highlight: still enter keyboard mode when
                // re-anchoring from a hovered row so the next j/k can step further.
                const anchorId = resolveListKeyboardAnchorId(highlightedId, selectedId, itemIds);
                if (nextItemId === highlightedId && anchorId === highlightedId) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                suppressKeyboardNavHover();
                navigationRegistration.setHighlightedId(nextItemId);
                scrollHighlightedItem(navigationRegistration, nextItemId);
                return;
            }
            if (!shouldHandleListKeyboardActivate(event)) {
                return;
            }
            const activateItemIds = navigationRegistration.getItemIds();
            if (activateItemIds.length === 0) {
                return;
            }
            const targetId = resolveListKeyboardAnchorId(navigationRegistration.getHighlightedId(), navigationRegistration.getSelectedId(), activateItemIds);
            if (!targetId || !activateItemIds.includes(targetId)) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            navigationRegistration.onActivate(targetId);
        }
        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [
        activeZoneRef,
        applyActiveZone,
        commandPaletteOpenRef,
        escapeReturnsToSidepanelRef,
        pathnameRef,
        preferSidepanelForJkRef,
        registrationsRef,
    ]);
    return null;
}
export function useListKeyboardNavigation({ containerRef, itemIds, selectedId, onNavigate, zone, priority, enabled = true, resolveNextItemId, }) {
    const context = useListKeyboardNavigationContext();
    const { activeZone, register } = context;
    const mountGate = useListKeyboardNavMountGate();
    const resolvedEnabled = enabled && mountGate;
    const resolvedPriority = priority ??
        (zone === "sidepanel"
            ? LIST_KEYBOARD_NAV_SIDE_PANEL_PRIORITY
            : zone === "content"
                ? LIST_KEYBOARD_NAV_CONTENT_PRIORITY
                : LIST_KEYBOARD_NAV_MAIN_PRIORITY);
    const [manualHighlight, setManualHighlight] = useState(null);
    // Drop stale j/k highlight when the keep-alive pane hides so a return visit
    // starts at the top instead of the previous row.
    useEffect(() => {
        if (!mountGate) {
            setManualHighlight(null);
        }
    }, [mountGate]);
    const itemIdsRef = useLatestRef(itemIds);
    const selectedIdRef = useLatestRef(selectedId);
    const onNavigateRef = useLatestRef(onNavigate);
    const resolveNextItemIdRef = useLatestRef(resolveNextItemId);
    const registrationId = useId();
    const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
    if (selectedId !== prevSelectedId) {
        const previous = prevSelectedId;
        setPrevSelectedId(selectedId);
        if (selectedId == null &&
            previous != null &&
            itemIds.includes(previous)) {
            // Escape / clear selection — keep j/k anchored on the row that was open
            // instead of falling through to the top of the list.
            setManualHighlight(previous);
        }
        else if (manualHighlight !== null &&
            selectedId != null &&
            manualHighlight !== selectedId) {
            // Navigated to a different row — drop the stale keyboard ring.
            setManualHighlight(null);
        }
    }
    const resolvedHighlight = activeZone !== zone
        ? null
        : manualHighlight != null && itemIds.includes(manualHighlight)
            ? manualHighlight
            : null;
    const highlightedIdRef = useLatestRef(resolvedHighlight);
    // Opening a detail clears the orange j/k highlight but leaves DOM focus on
    // the row — which paints the browser's blue focus ring and looks "focused"
    // even when attention is in the detail pane. Blur the row; keep the list
    // container focused so j/k still works without a misleading ring.
    //
    // Skip when the highlight is already on the selected row (e.g. inbox claims
    // the side panel and lands j/k on the open item) — blurring would fight
    // activate() and leave no visible keyboard focus.
    useEffect(() => {
        if (selectedId == null || activeZone !== zone)
            return;
        if (manualHighlight != null && manualHighlight === selectedId)
            return;
        const container = containerRef.current;
        if (!container)
            return;
        const blurRowFocus = () => {
            const active = document.activeElement;
            if (!(active instanceof HTMLElement) ||
                !container.contains(active) ||
                !active.closest(`[${KEYBOARD_NAV_ITEM_ATTR}]`)) {
                return;
            }
            active.blur();
            if (document.activeElement === active || document.activeElement === document.body) {
                container.focus({ preventScroll: true });
            }
        };
        blurRowFocus();
        // j/k focus is scheduled in rAF; catch that too after Enter/open.
        const raf = requestAnimationFrame(blurRowFocus);
        return () => cancelAnimationFrame(raf);
    }, [activeZone, containerRef, manualHighlight, selectedId, zone]);
    useEffect(() => {
        if (!resolvedEnabled || itemIds.length === 0) {
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
                ? (params) => resolveNextItemIdRef.current(params)
                : undefined,
        });
    }, [
        containerRef,
        resolvedEnabled,
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
export function useListKeyboardNavigationZone() {
    const context = useListKeyboardNavigationContext();
    return {
        activeZone: context.activeZone,
        setActiveZone: context.setActiveZone,
        clearHighlights: context.clearHighlights,
    };
}
export function useListKeyboardNavigationContainerProps(zone) {
    const context = useListKeyboardNavigationContext();
    return {
        tabIndex: -1,
        "data-list-keyboard-nav-container": true,
        ...(zone
            ? { "data-list-keyboard-nav-zone": zone }
            : {}),
        onPointerDownCapture: (event) => {
            event.currentTarget.focus({ preventScroll: true });
            if (zone) {
                context.setActiveZone(zone, {
                    preferSidepanelForJk: zone === "sidepanel",
                });
            }
        },
    };
}
export function isKeyboardNavHighlighted(highlightedId, itemId) {
    return highlightedId === itemId;
}

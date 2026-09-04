"use client";
import { useEffect } from "react";
import { isSearchableDropdownMenuOpen, shouldHandleClearSelectionShortcut, } from "./list-clear-selection-shortcut.js";
import { requestCloseSearchableDropdowns } from "../dropdowns/searchable-dropdown-events.js";
import { isBlockingModalOpen } from "../shortcuts/shortcut-guards.js";
/** Present on entity title fields (overview rename + finance detail name inputs). */
export const ENTITY_TITLE_INPUT_ATTRIBUTE = "data-entity-title-input";
/**
 * Stack of active clear-selection handlers (most recent wins). Lets Escape
 * clear whichever multi-select list is mounted before escape-back / zone nav.
 */
const clearSelectionHandlers = [];
/**
 * Stack of open detail dismiss handlers (e.g. transaction side panel).
 * Runs after closing dropdowns and before clearing multi-select.
 */
const dismissDetailHandlers = [];
let windowListenersInstalled = false;
function runTopHandler(handlers) {
    const handler = handlers[handlers.length - 1];
    if (!handler)
        return false;
    void handler();
    return true;
}
/** True while an entity title rename/edit field is focused. */
export function isEntityTitleInputFocused(target = document.activeElement) {
    return (target instanceof HTMLElement &&
        Boolean(target.closest(`[${ENTITY_TITLE_INPUT_ATTRIBUTE}]`)));
}
/** @deprecated Prefer {@link isEntityTitleInputFocused}. */
export function isOverviewNameEditorInputFocused(target = document.activeElement) {
    return isEntityTitleInputFocused(target);
}
/**
 * True while Escape should close list detail / clear selection instead of
 * moving keyboard focus to the side panel. Zone Escape must yield when this
 * is true — both listeners sit on `window` capture, so registration order
 * alone is not enough.
 */
export function shouldYieldListKeyboardEscapeToShortcutStack() {
    return (dismissDetailHandlers.length > 0 || clearSelectionHandlers.length > 0);
}
/** True while a list detail pane (e.g. finance right panel) is open. */
export function isListDetailPanelOpen() {
    return dismissDetailHandlers.length > 0;
}
/** Escape closes an open list detail even when focus is inside the pane. */
function shouldHandleDismissDetailShortcut(event, enabled) {
    if (!enabled)
        return false;
    if (event.key !== "Escape" || event.repeat)
        return false;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return false;
    }
    if (isBlockingModalOpen())
        return false;
    if (isSearchableDropdownMenuOpen())
        return false;
    return true;
}
function onKeyDown(event) {
    if (event.key !== "Escape" || event.repeat)
        return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
    }
    if (isBlockingModalOpen())
        return;
    // Title rename / finance detail name: first Escape blurs/cancels only.
    if (isEntityTitleInputFocused(event.target) ||
        isEntityTitleInputFocused(document.activeElement)) {
        return;
    }
    // Open bulk/property menus: first Escape closes the menu only.
    if (isSearchableDropdownMenuOpen()) {
        requestCloseSearchableDropdowns();
        event.preventDefault();
        // Same-target capture listeners (zone Escape) still run after stopPropagation.
        event.stopImmediatePropagation();
        return;
    }
    // Multi-select: clear before zone / detail navigation.
    if (shouldHandleClearSelectionShortcut(event, clearSelectionHandlers.length > 0) &&
        runTopHandler(clearSelectionHandlers)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
    }
    // Open detail (transaction right panel): Escape closes it only and keeps
    // focus on the list so the user can keep j/k / Space-ing. Zone return to
    // the left nav runs on a later Escape when the detail is already closed.
    if (shouldHandleDismissDetailShortcut(event, dismissDetailHandlers.length > 0) &&
        runTopHandler(dismissDetailHandlers)) {
        event.preventDefault();
        event.stopImmediatePropagation();
    }
}
function ensureWindowListeners() {
    if (windowListenersInstalled || typeof window === "undefined")
        return;
    windowListenersInstalled = true;
    // Capture + early install (app shell): beat escape-back and list zone Escape.
    window.addEventListener("keydown", onKeyDown, true);
}
/** Install once from the app shell so Escape clears selection before nav. */
export function installClearSelectionShortcutListeners() {
    ensureWindowListeners();
}
function useEscapeHandlerStack({ enabled = true, onEscape, handlers, }) {
    useEffect(() => {
        ensureWindowListeners();
    }, []);
    useEffect(() => {
        if (!enabled || !onEscape)
            return;
        handlers.push(onEscape);
        return () => {
            const index = handlers.lastIndexOf(onEscape);
            if (index >= 0)
                handlers.splice(index, 1);
        };
    }, [enabled, handlers, onEscape]);
}
/**
 * Escape clears the active multi-select when at least one row is selected.
 * Window listeners are installed once for the app lifetime.
 */
export function useListClearSelectionShortcut({ enabled = true, onClear, }) {
    useEscapeHandlerStack({
        enabled,
        onEscape: onClear,
        handlers: clearSelectionHandlers,
    });
}
/**
 * Escape dismisses an open list detail pane (e.g. transaction on the right).
 * Runs after dropdown close and before multi-select clear / escape-back.
 */
export function useListDismissDetailShortcut({ enabled = true, onDismiss, }) {
    useEscapeHandlerStack({
        enabled,
        onEscape: onDismiss,
        handlers: dismissDetailHandlers,
    });
}

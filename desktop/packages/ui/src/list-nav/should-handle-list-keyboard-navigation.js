import { shouldHandleContentPreviewArrowScroll } from "../content/content-preview-scroll.js";
import { isAnyLeaderSequencePending } from "../shortcuts/leader-sequence-gate.js";
import { shouldHandleGlobalShortcut } from "../shortcuts/shortcut-guards.js";
function isListKeyboardNavigationKey(key) {
    return key === "j" || key === "k" || key === "ArrowDown" || key === "ArrowUp";
}
function listKeyboardNavDirection(key) {
    if (key === "j" || key === "ArrowDown") {
        return "down";
    }
    if (key === "k" || key === "ArrowUp") {
        return "up";
    }
    return null;
}
export function isSearchableDropdownPanelOpen() {
    return document.querySelector("[data-searchable-dropdown-panel]") !== null;
}
function shouldHandleListKeyboardShortcut(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) {
        return false;
    }
    if (!shouldHandleGlobalShortcut(event)) {
        return false;
    }
    if (isSearchableDropdownPanelOpen()) {
        return false;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
        return true;
    }
    if (target.closest(".cm-editor")) {
        return false;
    }
    // Agent Files tree owns j/k / arrows while a row is focused.
    if (target.closest('[data-agent-surface-focus="files-tree"]') ||
        target.closest(".agent-surface-files-tree")) {
        return false;
    }
    if (target.closest("[data-searchable-dropdown-panel]")) {
        return false;
    }
    if (target.closest(".command-dialog") || target.closest(".command-palette")) {
        return false;
    }
    if (target.closest("[data-compose-modal]")) {
        return false;
    }
    return true;
}
export function shouldHandleListKeyboardNavigation(event) {
    const key = event.key;
    if (!isListKeyboardNavigationKey(key)) {
        return false;
    }
    if ((key === "j" || key === "k") && isAnyLeaderSequencePending()) {
        return false;
    }
    // Yield ArrowUp/Down to content-preview scroll when that surface owns them.
    if ((key === "ArrowUp" || key === "ArrowDown") &&
        shouldHandleContentPreviewArrowScroll(event)) {
        return false;
    }
    return shouldHandleListKeyboardShortcut(event);
}
export function isListKeyboardActivateKey(event) {
    if (event.repeat) {
        return false;
    }
    return (event.key === "Enter" ||
        event.key === " " ||
        event.key === "Spacebar" ||
        event.code === "Space");
}
export function shouldHandleListKeyboardActivate(event) {
    if (!isListKeyboardActivateKey(event)) {
        return false;
    }
    // Shift+Space toggles row multi-select; plain Space / Enter open the item.
    if (event.shiftKey &&
        (event.key === " " || event.key === "Spacebar" || event.code === "Space")) {
        return false;
    }
    return shouldHandleListKeyboardShortcut(event);
}
function isBoardHorizontalNavigationKey(key) {
    return (key === "h" || key === "l" || key === "ArrowLeft" || key === "ArrowRight");
}
/** Horizontal board direction for h/l/arrow keys; used by opt-in resolveNextItemId. */
export function boardKeyboardNavDirection(key) {
    if (key === "h" || key === "ArrowLeft")
        return "left";
    if (key === "l" || key === "ArrowRight")
        return "right";
    return listKeyboardNavDirection(key);
}
export function shouldHandleBoardKeyboardNavigation(event) {
    const key = event.key;
    if (isBoardHorizontalNavigationKey(key)) {
        return shouldHandleListKeyboardShortcut(event);
    }
    return shouldHandleListKeyboardNavigation(event);
}
export { isListKeyboardNavigationKey, listKeyboardNavDirection };

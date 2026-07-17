import { isContentEditModeActive } from "@/lib/shortcuts/content-view-mode";
import {
  isBlockingModalOpen,
  isTargetInsideBlockingModal,
} from "@/lib/shortcuts/is-blocking-modal-open";

export function shouldHandleGlobalShortcut(event: KeyboardEvent): boolean {
  if (isContentEditModeActive()) {
    return false;
  }

  if (isBlockingModalOpen() && !isTargetInsideBlockingModal(event.target)) {
    return false;
  }

  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return true;
  }

  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return false;
  }

  if (target.isContentEditable) {
    return false;
  }

  return true;
}

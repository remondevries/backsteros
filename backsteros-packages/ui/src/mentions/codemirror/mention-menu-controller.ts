import type { MentionMenuTriggerState } from "../mention-menu-types.js";

export type MentionMenuKeyHandlers = {
  navigateNext: () => boolean;
  navigatePrev: () => boolean;
  confirmSelection: () => boolean;
  dismiss: () => boolean;
};

export class MentionMenuController {
  currentState: MentionMenuTriggerState | null = null;
  onStateChange: ((state: MentionMenuTriggerState | null) => void) | null =
    null;
  keyHandlers: MentionMenuKeyHandlers | null = null;

  bindUi(options: {
    onStateChange: (state: MentionMenuTriggerState | null) => void;
    keyHandlers: MentionMenuKeyHandlers;
  }) {
    this.onStateChange = options.onStateChange;
    this.keyHandlers = options.keyHandlers;
  }

  unbindUi() {
    this.onStateChange = null;
    this.keyHandlers = null;
  }

  setState(next: MentionMenuTriggerState | null) {
    if (
      this.currentState?.from === next?.from &&
      this.currentState?.to === next?.to &&
      this.currentState?.query === next?.query
    ) {
      return;
    }

    this.currentState = next;
    this.onStateChange?.(next);
  }
}

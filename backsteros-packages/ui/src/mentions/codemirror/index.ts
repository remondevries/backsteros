import type { Extension } from "@codemirror/state";

import type { MentionMenuController } from "./mention-menu-controller.js";
import {
  createMentionDomKeydownExtension,
  createMentionKeymap,
  createMentionTriggerPlugin,
} from "./mention-extensions.js";

export function createMentionExtensions(
  controller: MentionMenuController,
): Extension[] {
  return [
    createMentionDomKeydownExtension(controller),
    createMentionKeymap(controller),
    createMentionTriggerPlugin(controller),
  ];
}

export { MentionMenuController } from "./mention-menu-controller.js";
export type { MentionMenuKeyHandlers } from "./mention-menu-controller.js";
export { computeMentionTriggerState } from "./compute-mention-trigger.js";

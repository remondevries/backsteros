import type { Extension } from "@codemirror/state";

import type { MentionMenuController } from "./mention-menu-controller";
import {
  createMentionDomKeydownExtension,
  createMentionKeymap,
  createMentionTriggerPlugin,
} from "./mention-extensions";

export function createMentionExtensions(
  controller: MentionMenuController,
): Extension[] {
  return [
    createMentionDomKeydownExtension(controller),
    createMentionKeymap(controller),
    createMentionTriggerPlugin(controller),
  ];
}

export { MentionMenuController } from "./mention-menu-controller";

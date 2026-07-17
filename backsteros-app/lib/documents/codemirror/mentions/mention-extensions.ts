import { Prec, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, keymap } from "@codemirror/view";

import type { MentionMenuController } from "./mention-menu-controller";
import { computeMentionTriggerState } from "./compute-mention-trigger";

function handleMentionMenuEscape(
  view: EditorView,
  controller: MentionMenuController,
): boolean {
  if (!controller.currentState || !controller.keyHandlers) {
    return false;
  }

  const { from, to, query } = controller.currentState;
  if (controller.keyHandlers.dismiss()) {
    view.dispatch({
      changes: { from, to, insert: query },
      selection: { anchor: from + query.length },
    });
  }

  view.focus();
  return true;
}

function handleMentionMenuKey(
  event: KeyboardEvent,
  view: EditorView,
  controller: MentionMenuController,
): boolean {
  if (event.key === "Escape") {
    if (handleMentionMenuEscape(view, controller)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return true;
    }
    return false;
  }

  if (!controller.currentState || !controller.keyHandlers) {
    return false;
  }

  const handlers = controller.keyHandlers;

  if (event.key === "ArrowDown") {
    if (handlers.navigateNext()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return true;
    }
    return false;
  }

  if (event.key === "ArrowUp") {
    if (handlers.navigatePrev()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return true;
    }
    return false;
  }

  if (event.key === "Enter" || event.key === "Tab") {
    if (handlers.confirmSelection()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return true;
    }
    return false;
  }

  return false;
}

function runMentionKey(
  controller: MentionMenuController,
  key: string,
): boolean {
  if (!controller.currentState || !controller.keyHandlers) {
    return false;
  }

  const handlers = controller.keyHandlers;

  if (key === "ArrowDown") {
    return handlers.navigateNext();
  }

  if (key === "ArrowUp") {
    return handlers.navigatePrev();
  }

  if (key === "Enter" || key === "Tab") {
    return handlers.confirmSelection();
  }

  return false;
}

export function createMentionDomKeydownExtension(
  controller: MentionMenuController,
): Extension {
  return Prec.highest(
    EditorView.domEventHandlers({
      keydown(event, view) {
        return handleMentionMenuKey(event, view, controller);
      },
    }),
  );
}

export function createMentionKeymap(
  controller: MentionMenuController,
): Extension {
  return Prec.highest(
    keymap.of([
      {
        key: "ArrowDown",
        run: () => runMentionKey(controller, "ArrowDown"),
      },
      {
        key: "ArrowUp",
        run: () => runMentionKey(controller, "ArrowUp"),
      },
      { key: "Enter", run: () => runMentionKey(controller, "Enter") },
      { key: "Tab", run: () => runMentionKey(controller, "Tab") },
    ]),
  );
}

export function createMentionTriggerPlugin(controller: MentionMenuController) {
  return ViewPlugin.fromClass(
    class {
      constructor(view: EditorView) {
        controller.setState(computeMentionTriggerState(view));
      }

      update(update: {
        docChanged: boolean;
        selectionSet: boolean;
        view: EditorView;
      }) {
        if (update.docChanged || update.selectionSet) {
          controller.setState(computeMentionTriggerState(update.view));
        }
      }

      destroy() {
        controller.setState(null);
      }
    },
  );
}

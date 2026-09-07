import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";

import {
  buildBacksterosTaskKickoffPrompt,
  extractKickoffWorkingDirectory,
  isBacksterosManagedKickoffPrompt,
} from "./taskKickoffPrompt";
import { useBacksterosTaskKickoffGateStore } from "./taskKickoffGateStore";
import { backsterosTaskLogicalProjectKey, useBacksterosTaskChatStore } from "./taskChatStore";
import { getBacksterosTaskDisplayId } from "./types";

function resolveUnsentKickoffDraftId(taskId: string): DraftId | null {
  const byLogical = useComposerDraftStore
    .getState()
    .getDraftSessionByLogicalProjectKey(backsterosTaskLogicalProjectKey(taskId));
  if (byLogical && !byLogical.promotedTo) {
    return byLogical.draftId;
  }

  const binding = useBacksterosTaskChatStore.getState().getBinding(taskId);
  if (binding?.kind !== "draft") return null;
  const session = useComposerDraftStore.getState().getDraftSession(binding.draftId as DraftId);
  if (!session || session.promotedTo) return null;
  return binding.draftId as DraftId;
}

/**
 * Refresh the unsent auto-kickoff when task title/description change.
 * Updates the Start-working gate text; if Advanced is open, also rewrites the
 * composer while it still holds a managed kickoff.
 */
export function syncBacksterosTaskKickoffDraftPrompt(input: {
  readonly taskId: string;
  readonly number: number;
  readonly title: string;
  readonly description?: string | null;
  readonly projectKey?: string | null;
  readonly workingDirectory?: string | null;
}): boolean {
  const gateStore = useBacksterosTaskKickoffGateStore.getState();
  const gate = gateStore.getGate(input.taskId);
  const draftId = resolveUnsentKickoffDraftId(input.taskId);
  const binding = useBacksterosTaskChatStore.getState().getBinding(input.taskId);

  const composer =
    draftId != null ? useComposerDraftStore.getState().getComposerDraft(draftId) : null;

  const extractedCwd =
    (composer ? extractKickoffWorkingDirectory(composer.prompt) : null) ??
    (gate ? extractKickoffWorkingDirectory(gate.kickoffPrompt) : null);

  const workingDirectory =
    input.workingDirectory?.trim() || (extractedCwd && extractedCwd !== "~" ? extractedCwd : null);

  const projectKey =
    input.projectKey ??
    (binding?.displayId && binding.displayId.includes("-")
      ? binding.displayId.slice(0, binding.displayId.lastIndexOf("-"))
      : null);

  const nextPrompt = buildBacksterosTaskKickoffPrompt({
    id: input.taskId,
    number: input.number,
    title: input.title,
    description: input.description,
    projectKey,
    workingDirectory,
  });

  let changed = false;

  if (gate) {
    if (gate.kickoffPrompt !== nextPrompt) {
      gateStore.setKickoffPrompt(input.taskId, nextPrompt);
      changed = true;
    }
  }

  // Advanced (or legacy prefilled) composer: keep managed kickoff in sync.
  if (
    draftId &&
    composer &&
    (gate?.mode === "advanced" || gate?.mode === "pending-send" || !gate) &&
    isBacksterosManagedKickoffPrompt(composer.prompt) &&
    composer.prompt !== nextPrompt
  ) {
    useComposerDraftStore.getState().setPrompt(draftId, nextPrompt);
    changed = true;
  }

  if (binding && binding.title !== input.title) {
    const displayId =
      getBacksterosTaskDisplayId({ number: input.number }, projectKey) ?? binding.displayId;
    useBacksterosTaskChatStore.getState().setBinding(input.taskId, {
      ...binding,
      title: input.title,
      displayId,
    });
    changed = true;
  }

  return changed;
}

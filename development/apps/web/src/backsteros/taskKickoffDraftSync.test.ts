import { beforeEach, describe, expect, it } from "vite-plus/test";

import { DraftId, createEmptyThreadDraft, useComposerDraftStore } from "~/composerDraftStore";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";

import { syncBacksterosTaskKickoffDraftPrompt } from "./taskKickoffDraftSync";
import { useBacksterosTaskKickoffGateStore } from "./taskKickoffGateStore";
import {
  BACKSTEROS_TASK_KICKOFF_LEAD,
  buildBacksterosTaskKickoffPrompt,
  extractKickoffWorkingDirectory,
  isBacksterosManagedKickoffPrompt,
} from "./taskKickoffPrompt";
import { backsterosTaskLogicalProjectKey, useBacksterosTaskChatStore } from "./taskChatStore";

function seedUnsentKickoffDraft(input: {
  readonly taskId: string;
  readonly draftId: DraftId;
  readonly prompt: string;
  readonly gateMode?: "gate" | "advanced";
  readonly bindingKind?: "draft" | "thread";
}) {
  const logicalKey = backsterosTaskLogicalProjectKey(input.taskId);
  useBacksterosTaskChatStore.getState().setBinding(
    input.taskId,
    input.bindingKind === "thread"
      ? {
          kind: "thread",
          threadId: "thread-1",
          environmentId: "env-1",
          t3ProjectId: "project-1",
          backsterosProjectId: "bos-1",
          projectTitle: "DOT",
          title: "Old title",
          displayId: "DOT-1",
        }
      : {
          kind: "draft",
          draftId: input.draftId,
          threadId: "thread-1",
          environmentId: "env-1",
          t3ProjectId: "project-1",
          backsterosProjectId: "bos-1",
          projectTitle: "DOT",
          title: "Old title",
          displayId: "DOT-1",
        },
  );

  if (input.gateMode) {
    useBacksterosTaskKickoffGateStore.getState().setGate(input.taskId, {
      mode: input.gateMode,
      kickoffPrompt: input.prompt,
    });
  }

  useComposerDraftStore.setState((state) => ({
    ...state,
    logicalProjectDraftThreadKeyByLogicalProjectKey: {
      [logicalKey]: input.draftId,
    },
    draftThreadsByThreadKey: {
      [input.draftId]: {
        threadId: ThreadId.make("thread-1"),
        environmentId: EnvironmentId.make("env-1"),
        projectId: ProjectId.make("project-1"),
        logicalProjectKey: logicalKey,
        createdAt: new Date().toISOString(),
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        envMode: "local",
        startFromOrigin: false,
        promotedTo: null,
      },
    },
    draftsByThreadKey: {
      [input.draftId]: {
        ...createEmptyThreadDraft(),
        prompt: input.gateMode === "gate" ? "" : input.prompt,
      },
    },
  }));
}

describe("kickoff prompt helpers", () => {
  it("detects managed kickoff prompts", () => {
    expect(isBacksterosManagedKickoffPrompt(BACKSTEROS_TASK_KICKOFF_LEAD)).toBe(true);
    expect(isBacksterosManagedKickoffPrompt(`  ${BACKSTEROS_TASK_KICKOFF_LEAD}\nTitle: x`)).toBe(
      true,
    );
    expect(isBacksterosManagedKickoffPrompt("Please implement this differently")).toBe(false);
  });

  it("extracts working directory from kickoff text", () => {
    const prompt = buildBacksterosTaskKickoffPrompt({
      id: "t1",
      number: 1,
      title: "Task",
      description: "Body",
      projectKey: "DOT",
      workingDirectory: "/Users/me/code/dot",
    });
    expect(extractKickoffWorkingDirectory(prompt)).toBe("/Users/me/code/dot");
  });
});

describe("syncBacksterosTaskKickoffDraftPrompt", () => {
  const draftId = DraftId.make("draft-kickoff-1");

  beforeEach(() => {
    useBacksterosTaskChatStore.setState({ byTaskId: {}, retiredThreadKeys: [] });
    useBacksterosTaskKickoffGateStore.setState({ byTaskId: {} });
    useComposerDraftStore.setState({
      draftsByThreadKey: {},
      draftThreadsByThreadKey: {},
      logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    });
  });

  it("updates the gate kickoff text while Start working is showing", () => {
    const initial = buildBacksterosTaskKickoffPrompt({
      id: "task-1",
      number: 1,
      title: "Old title",
      description: "Old description",
      projectKey: "DOT",
      workingDirectory: "/tmp/dot",
    });
    seedUnsentKickoffDraft({
      taskId: "task-1",
      draftId,
      prompt: initial,
      gateMode: "gate",
    });

    const synced = syncBacksterosTaskKickoffDraftPrompt({
      taskId: "task-1",
      number: 1,
      title: "Old title",
      description: "New description from the panel",
      projectKey: "DOT",
    });

    expect(synced).toBe(true);
    expect(useBacksterosTaskKickoffGateStore.getState().getGate("task-1")?.kickoffPrompt).toContain(
      "New description from the panel",
    );
    expect(useComposerDraftStore.getState().getComposerDraft(draftId)?.prompt).toBe("");
  });

  it("rewrites advanced composer when description changes", () => {
    const initial = buildBacksterosTaskKickoffPrompt({
      id: "task-1",
      number: 1,
      title: "Old title",
      description: "Old description",
      projectKey: "DOT",
      workingDirectory: "/tmp/dot",
    });
    seedUnsentKickoffDraft({
      taskId: "task-1",
      draftId,
      prompt: initial,
      gateMode: "advanced",
    });

    const synced = syncBacksterosTaskKickoffDraftPrompt({
      taskId: "task-1",
      number: 1,
      title: "Old title",
      description: "Advanced description sync",
      projectKey: "DOT",
    });

    expect(synced).toBe(true);
    expect(useComposerDraftStore.getState().getComposerDraft(draftId)?.prompt).toContain(
      "Advanced description sync",
    );
  });

  it("does not overwrite a user-edited composer prompt", () => {
    seedUnsentKickoffDraft({
      taskId: "task-1",
      draftId,
      prompt: "Custom message the user typed instead",
      gateMode: "advanced",
    });

    const synced = syncBacksterosTaskKickoffDraftPrompt({
      taskId: "task-1",
      number: 1,
      title: "Old title",
      description: "Should not appear in composer",
    });

    expect(useComposerDraftStore.getState().getComposerDraft(draftId)?.prompt).toBe(
      "Custom message the user typed instead",
    );
    expect(useBacksterosTaskKickoffGateStore.getState().getGate("task-1")?.kickoffPrompt).toContain(
      "Should not appear in composer",
    );
    expect(synced).toBe(true);
  });
});

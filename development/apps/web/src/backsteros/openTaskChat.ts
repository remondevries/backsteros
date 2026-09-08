import {
  scopeProjectRef,
  scopeThreadRef,
  scopedThreadKey,
} from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ProjectId, ScopedProjectRef, ThreadId } from "@t3tools/contracts";

import { toastManager } from "~/components/ui/toast";
import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { newDraftId, newThreadId } from "~/lib/utils";
import { readThreadShell } from "~/state/entities";
import { buildThreadRouteParams } from "~/threadRoutes";
import type { Project } from "~/types";
import { fetchBacksterosTask } from "./client";
import { requestBacksterosComposerFocusSoon } from "./composerFocusStore";
import { resolveT3ProjectRefForBacksterosProject } from "./resolveT3Project";
import {
  backsterosTaskLogicalProjectKey,
  type BacksterosTaskChatBinding,
  useBacksterosTaskChatStore,
} from "./taskChatStore";
import { buildBacksterosTaskKickoffPrompt } from "./taskKickoffPrompt";
import { useBacksterosTaskKickoffGateStore } from "./taskKickoffGateStore";
import {
  getBacksterosTaskDisplayId,
  type BacksterosCodebaseProject,
  type BacksterosTask,
} from "./types";

type NavigateFn = (opts: {
  to: string;
  params?: Record<string, string>;
  replace?: boolean;
}) => Promise<unknown>;

function bindingIdentityKey(binding: BacksterosTaskChatBinding): string {
  if (binding.kind === "draft") {
    return `draft:${binding.draftId}:${binding.threadId}:${binding.environmentId}`;
  }
  return `thread:${binding.threadId}:${binding.environmentId}`;
}

/**
 * Promote/clear stale task→chat bindings.
 * Pass `{ persist: false }` from render-time resolvers — store writes are deferred
 * so React does not see a setState during render (BacksterosPanel / ChatView).
 */
function healBinding(
  taskId: string,
  binding: BacksterosTaskChatBinding,
  options?: { readonly persist?: boolean },
): BacksterosTaskChatBinding | null {
  const persist = options?.persist !== false;

  const commit = (next: BacksterosTaskChatBinding | null) => {
    const apply = () => {
      const store = useBacksterosTaskChatStore.getState();
      if (next == null) {
        store.clearBinding(taskId);
        return;
      }
      const current = store.getBinding(taskId);
      if (current && bindingIdentityKey(current) === bindingIdentityKey(next)) {
        return;
      }
      store.setBinding(taskId, next);
    };
    if (persist) {
      apply();
      return;
    }
    queueMicrotask(apply);
  };

  if (binding.kind === "draft") {
    const draft = useComposerDraftStore.getState().getDraftSession(binding.draftId as DraftId);
    if (!draft) {
      commit(null);
      return null;
    }
    if (draft.promotedTo) {
      const next: BacksterosTaskChatBinding = {
        kind: "thread",
        threadId: draft.promotedTo.threadId,
        environmentId: draft.promotedTo.environmentId,
        t3ProjectId: binding.t3ProjectId,
        backsterosProjectId: binding.backsterosProjectId,
        projectTitle: binding.projectTitle,
        title: binding.title,
        displayId: binding.displayId,
      };
      commit(next);
      return next;
    }
    const shell = readThreadShell(scopeThreadRef(draft.environmentId, draft.threadId));
    if (shell) {
      const next: BacksterosTaskChatBinding = {
        kind: "thread",
        threadId: draft.threadId,
        environmentId: draft.environmentId,
        t3ProjectId: binding.t3ProjectId,
        backsterosProjectId: binding.backsterosProjectId,
        projectTitle: binding.projectTitle,
        title: binding.title,
        displayId: binding.displayId,
      };
      commit(next);
      return next;
    }
    return binding;
  }

  const shell = readThreadShell(
    scopeThreadRef(binding.environmentId as EnvironmentId, binding.threadId as ThreadId),
  );
  if (!shell) {
    commit(null);
    return null;
  }
  return binding;
}

async function navigateToBinding(
  navigate: NavigateFn,
  binding: BacksterosTaskChatBinding,
): Promise<void> {
  if (binding.kind === "draft") {
    await navigate({
      to: "/draft/$draftId",
      params: { draftId: binding.draftId },
    });
    return;
  }
  const threadRef = scopeThreadRef(
    binding.environmentId as EnvironmentId,
    binding.threadId as ThreadId,
  );
  await navigate({
    to: "/$environmentId/$threadId",
    params: buildThreadRouteParams(threadRef),
  });
}

export function isBacksterosTaskChatActive(
  binding: BacksterosTaskChatBinding | null,
  route: { kind: "draft"; draftId: string } | { kind: "server"; threadKey: string } | null,
): boolean {
  if (!binding || !route) return false;
  if (binding.kind === "draft" && route.kind === "draft") {
    return binding.draftId === route.draftId;
  }
  if (binding.kind === "draft" && route.kind === "server") {
    const draft = useComposerDraftStore.getState().getDraftSession(binding.draftId as DraftId);
    const promoted = draft?.promotedTo;
    if (promoted) {
      return (
        route.threadKey ===
        scopedThreadKey(scopeThreadRef(promoted.environmentId, promoted.threadId))
      );
    }
    return (
      route.threadKey ===
      scopedThreadKey(
        scopeThreadRef(binding.environmentId as EnvironmentId, binding.threadId as ThreadId),
      )
    );
  }
  if (binding.kind === "thread" && route.kind === "server") {
    return (
      route.threadKey ===
      scopedThreadKey(
        scopeThreadRef(binding.environmentId as EnvironmentId, binding.threadId as ThreadId),
      )
    );
  }
  return false;
}

export async function openBacksterosTaskChat(input: {
  readonly task: BacksterosTask;
  readonly backsterosProject: BacksterosCodebaseProject;
  readonly projects: ReadonlyArray<Project>;
  readonly navigate: NavigateFn;
  /** Creates a T3 project for the BacksterOS working directory when none is linked yet. */
  readonly ensureT3Project?: (input: {
    readonly workspaceRoot: string;
    readonly title: string;
  }) => Promise<ScopedProjectRef | null>;
}): Promise<void> {
  let projectRef = resolveT3ProjectRefForBacksterosProject(input.projects, input.backsterosProject);
  if (!projectRef) {
    const workspaceRoot = input.backsterosProject.localWorkingDirectory?.trim() ?? "";
    if (workspaceRoot.length === 0) {
      toastManager.add({
        type: "warning",
        title: "Project not linked",
        description: `${input.backsterosProject.name} has no local working directory in BacksterOS.`,
      });
      return;
    }
    if (!input.ensureT3Project) {
      toastManager.add({
        type: "warning",
        title: "Project not linked",
        description: `Add ${workspaceRoot} as a T3 project to chat on its tasks.`,
      });
      return;
    }
    projectRef = await input.ensureT3Project({
      workspaceRoot,
      title: input.backsterosProject.name,
    });
    if (!projectRef) return;
  }

  const existing = useBacksterosTaskChatStore.getState().getBinding(input.task.id);
  const healed = existing ? healBinding(input.task.id, existing) : null;
  if (healed) {
    // Refresh display names when reopening from the sidebar.
    const next: BacksterosTaskChatBinding = {
      ...healed,
      projectTitle: input.backsterosProject.name,
      title: input.task.title,
      displayId: getBacksterosTaskDisplayId(input.task, input.backsterosProject.key),
    };
    useBacksterosTaskChatStore.getState().setBinding(input.task.id, next);
    await navigateToBinding(input.navigate, next);
    requestBacksterosComposerFocusSoon();
    return;
  }

  await createBacksterosTaskDraft({
    task: input.task,
    backsterosProject: input.backsterosProject,
    projectRef,
    navigate: input.navigate,
  });
  // Fresh drafts show the Start / Advanced kickoff gate — do not focus the
  // composer (that would skip the polished first-chat page).
}

async function createBacksterosTaskDraft(input: {
  readonly task: BacksterosTask;
  readonly backsterosProject: BacksterosCodebaseProject;
  readonly projectRef: ScopedProjectRef;
  readonly navigate: NavigateFn;
}): Promise<void> {
  const draftId = newDraftId();
  const threadId = newThreadId();
  const logicalKey = backsterosTaskLogicalProjectKey(input.task.id);
  const createdAt = new Date().toISOString();

  useComposerDraftStore
    .getState()
    .setLogicalProjectDraftThreadId(logicalKey, input.projectRef, draftId, {
      threadId,
      createdAt,
      branch: null,
      worktreePath: null,
    });
  useComposerDraftStore.getState().applyStickyState(draftId);

  const binding: BacksterosTaskChatBinding = {
    kind: "draft",
    draftId,
    threadId,
    environmentId: input.projectRef.environmentId,
    t3ProjectId: input.projectRef.projectId,
    backsterosProjectId: input.backsterosProject.id,
    projectTitle: input.backsterosProject.name,
    title: input.task.title,
    displayId: getBacksterosTaskDisplayId(input.task, input.backsterosProject.key),
  };
  useBacksterosTaskChatStore.getState().setBinding(input.task.id, binding);

  await prepareBacksterosTaskKickoffGate({
    taskId: input.task.id,
    task: input.task,
    backsterosProject: input.backsterosProject,
    draftId,
  });

  await input.navigate({
    to: "/draft/$draftId",
    params: { draftId },
  });
}

/**
 * Build the kickoff text and show the Start / Advanced gate. Composer stays
 * empty until the user starts working or opens Advanced to edit the message.
 */
async function prepareBacksterosTaskKickoffGate(input: {
  readonly taskId: string;
  readonly draftId: DraftId | string;
  readonly task: Pick<BacksterosTask, "id" | "number" | "title">;
  readonly backsterosProject: Pick<BacksterosCodebaseProject, "key" | "localWorkingDirectory">;
  readonly description?: string | null;
}): Promise<void> {
  let number = input.task.number;
  let title = input.task.title;
  let description = input.description ?? null;
  const projectKey = input.backsterosProject.key;
  const workingDirectory = input.backsterosProject.localWorkingDirectory;

  try {
    const detail = await fetchBacksterosTask(input.task.id);
    number = detail.number;
    title = detail.title;
    description = detail.description;
  } catch {
    // Keep callers' list fields when detail fetch fails.
  }

  const kickoffPrompt = buildBacksterosTaskKickoffPrompt({
    id: input.task.id,
    number,
    title,
    description,
    projectKey,
    workingDirectory,
  });

  useBacksterosTaskKickoffGateStore.getState().setGate(input.taskId, {
    mode: "gate",
    kickoffPrompt,
  });
  // Gate owns the prompt until Start / Advanced — keep the composer empty.
  useComposerDraftStore.getState().setPrompt(input.draftId as DraftId, "");
}

/** @deprecated Prefer prepareBacksterosTaskKickoffGate — kept for clear-session callers. */
async function prefillBacksterosTaskKickoffPrompt(input: {
  readonly draftId: DraftId | string;
  readonly task: Pick<BacksterosTask, "id" | "number" | "title">;
  readonly backsterosProject: Pick<BacksterosCodebaseProject, "key" | "localWorkingDirectory">;
  readonly description?: string | null;
  readonly taskId?: string;
}): Promise<void> {
  await prepareBacksterosTaskKickoffGate({
    taskId: input.taskId ?? input.task.id,
    draftId: input.draftId,
    task: input.task,
    backsterosProject: input.backsterosProject,
    description: input.description,
  });
}

/**
 * Cursor-style `/clear`: drop the task→thread binding and open a fresh draft
 * for the same task (no second task chat, no leave-to-project).
 */
export async function clearBacksterosTaskChatSession(input: {
  readonly taskId: string;
  readonly navigate: NavigateFn;
}): Promise<boolean> {
  const store = useBacksterosTaskChatStore.getState();
  const binding = store.getBinding(input.taskId);
  if (!binding) return false;

  const projectRef = scopeProjectRef(
    binding.environmentId as EnvironmentId,
    binding.t3ProjectId as ProjectId,
  );
  const draftId = newDraftId();
  const threadId = newThreadId();
  const logicalKey = backsterosTaskLogicalProjectKey(input.taskId);
  const createdAt = new Date().toISOString();

  store.clearBinding(input.taskId);
  useBacksterosTaskKickoffGateStore.getState().clear(input.taskId);

  useComposerDraftStore.getState().setLogicalProjectDraftThreadId(logicalKey, projectRef, draftId, {
    threadId,
    createdAt,
    branch: null,
    worktreePath: null,
  });
  useComposerDraftStore.getState().applyStickyState(draftId);

  store.setBinding(input.taskId, {
    kind: "draft",
    draftId,
    threadId,
    environmentId: binding.environmentId,
    t3ProjectId: binding.t3ProjectId,
    backsterosProjectId: binding.backsterosProjectId,
    projectTitle: binding.projectTitle,
    title: binding.title,
    displayId: binding.displayId,
  });

  const projectKey =
    binding.displayId && binding.displayId.includes("-")
      ? binding.displayId.slice(0, binding.displayId.lastIndexOf("-"))
      : null;
  const numberFromDisplay = binding.displayId
    ? Number(binding.displayId.slice(binding.displayId.lastIndexOf("-") + 1))
    : NaN;

  await prefillBacksterosTaskKickoffPrompt({
    draftId,
    taskId: input.taskId,
    task: {
      id: input.taskId,
      number: Number.isFinite(numberFromDisplay) ? numberFromDisplay : 0,
      title: binding.title,
    },
    backsterosProject: {
      key: projectKey,
      localWorkingDirectory: null,
    },
  });

  await input.navigate({
    to: "/draft/$draftId",
    params: { draftId },
    replace: true,
  });
  return true;
}

export function resolveActiveBacksterosTaskId(input: {
  readonly byTaskId: Record<string, BacksterosTaskChatBinding>;
  readonly route: { kind: "draft"; draftId: string } | { kind: "server"; threadKey: string } | null;
}): string | null {
  if (!input.route) return null;
  for (const [taskId, binding] of Object.entries(input.byTaskId)) {
    // Do not persist heals during render — callers often use this in useMemo.
    const healed = healBinding(taskId, binding, { persist: false }) ?? binding;
    if (isBacksterosTaskChatActive(healed, input.route)) return taskId;
  }
  return null;
}

export function resolveActiveBacksterosTaskChatBinding(input: {
  readonly byTaskId: Record<string, BacksterosTaskChatBinding>;
  readonly route: { kind: "draft"; draftId: string } | { kind: "server"; threadKey: string } | null;
}): BacksterosTaskChatBinding | null {
  if (!input.route) return null;
  for (const [taskId, binding] of Object.entries(input.byTaskId)) {
    const healed = healBinding(taskId, binding, { persist: false }) ?? binding;
    if (isBacksterosTaskChatActive(healed, input.route)) return healed;
  }
  return null;
}

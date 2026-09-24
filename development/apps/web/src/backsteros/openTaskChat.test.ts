import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Project } from "~/types";

vi.mock("./controlApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./controlApi")>();
  return {
    ...actual,
    fetchControlBindings: vi.fn(),
    pushControlBinding: vi.fn(async () => true),
  };
});

vi.mock("./composerFocusStore", () => ({
  requestBacksterosComposerFocusSoon: vi.fn(),
}));

import { fetchControlBindings } from "./controlApi";
import {
  clearBacksterosTaskChatSession,
  healBinding,
  isBacksterosTaskChatActive,
  openBacksterosTaskChat,
  resolveActiveBacksterosTaskChatBinding,
  resolveActiveBacksterosTaskId,
} from "./openTaskChat";
import {
  backsterosTaskLogicalProjectKey,
  useBacksterosTaskChatStore,
  type BacksterosTaskChatBinding,
} from "./taskChatStore";
import { useBacksterosTaskKickoffGateStore } from "./taskKickoffGateStore";
import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { BacksterosCodebaseProject, BacksterosTask } from "./types";

const fetchControlBindingsMock = vi.mocked(fetchControlBindings);

const draftBinding: BacksterosTaskChatBinding = {
  kind: "draft",
  draftId: "draft-1",
  threadId: "thread-1",
  environmentId: "env-1",
  t3ProjectId: "project-1",
  backsterosProjectId: "bos-1",
  projectTitle: "BacksterOS Desktop",
  title: "Ship it",
  displayId: "BOD-1",
};

const threadBinding: BacksterosTaskChatBinding = {
  kind: "thread",
  threadId: "thread-control",
  environmentId: "env-1",
  t3ProjectId: "project-1",
  backsterosProjectId: "bos-1",
  projectTitle: "BacksterDEV",
  title: "Control thread",
  displayId: "BDV-35",
};

const backsterosProject: BacksterosCodebaseProject = {
  id: "bos-1",
  key: "BDV",
  name: "BacksterDEV",
  summary: null,
  type: "codebase",
  status: "active",
  githubRepository: null,
  localWorkingDirectory: "/tmp/bdv",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

const task: BacksterosTask = {
  id: "task-control",
  projectId: "bos-1",
  number: 35,
  title: "Control thread",
  status: "in_progress",
  dueDate: null,
  updatedAt: "2026-09-20T00:00:00.000Z",
};

const t3Project = {
  id: "project-1",
  environmentId: "env-1",
  title: "BacksterDEV",
  workspaceRoot: "/tmp/bdv",
  cwd: "/tmp/bdv",
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
  worktree: false,
  git: null,
  scripts: [],
} as unknown as Project;

describe("openTaskChat helpers", () => {
  beforeEach(() => {
    useBacksterosTaskChatStore.setState({ byTaskId: {}, retiredThreadKeys: [] });
    useBacksterosTaskKickoffGateStore.setState({ byTaskId: {} });
    fetchControlBindingsMock.mockReset();
    fetchControlBindingsMock.mockResolvedValue({ ok: false, bindings: [] });
  });

  it("matches draft and server routes to task bindings", () => {
    expect(isBacksterosTaskChatActive(draftBinding, { kind: "draft", draftId: "draft-1" })).toBe(
      true,
    );
    expect(isBacksterosTaskChatActive(draftBinding, { kind: "draft", draftId: "draft-2" })).toBe(
      false,
    );

    expect(
      isBacksterosTaskChatActive(draftBinding, {
        kind: "server",
        threadKey: "env-1:thread-1",
      }),
    ).toBe(true);

    const binding: BacksterosTaskChatBinding = {
      ...draftBinding,
      kind: "thread",
      threadId: "thread-9",
    };
    expect(
      isBacksterosTaskChatActive(binding, {
        kind: "server",
        threadKey: "env-1:thread-9",
      }),
    ).toBe(true);
  });

  it("resolves the active task id from the route", () => {
    expect(
      resolveActiveBacksterosTaskId({
        byTaskId: { "task-a": draftBinding },
        route: { kind: "draft", draftId: "draft-1" },
      }),
    ).toBe("task-a");
  });

  it("resolves the active binding for breadcrumb labels", () => {
    expect(
      resolveActiveBacksterosTaskChatBinding({
        byTaskId: { "task-a": draftBinding },
        route: { kind: "draft", draftId: "draft-1" },
      }),
    ).toEqual(draftBinding);
  });

  it("healBinding keeps thread bindings when the shell is not hydrated", () => {
    useBacksterosTaskChatStore.getState().setBinding("task-a", threadBinding);

    const healed = healBinding("task-a", threadBinding);

    expect(healed).toEqual(threadBinding);
    expect(useBacksterosTaskChatStore.getState().getBinding("task-a")).toEqual(threadBinding);
  });

  it("open prefers a control/server thread binding over creating a kickoff draft", async () => {
    fetchControlBindingsMock.mockResolvedValue({
      ok: true,
      bindings: [
        {
          taskId: task.id,
          kind: "thread",
          threadId: "thread-control",
          environmentId: "env-1",
          t3ProjectId: "project-1",
          backsterosProjectId: "bos-1",
          projectTitle: "BacksterDEV",
          title: "Control thread",
          displayId: "BDV-35",
        },
      ],
    });

    const navigations: Array<{
      to: string;
      params?: Record<string, string>;
      replace?: boolean;
    }> = [];

    await openBacksterosTaskChat({
      task,
      backsterosProject,
      projects: [t3Project],
      navigate: async (opts) => {
        navigations.push(opts);
      },
    });

    const binding = useBacksterosTaskChatStore.getState().getBinding(task.id);
    expect(binding?.kind).toBe("thread");
    expect(binding?.threadId).toBe("thread-control");
    expect(navigations).toEqual([
      {
        to: "/$environmentId/$threadId",
        params: { environmentId: "env-1", threadId: "thread-control" },
      },
    ]);
  });

  it("open prefers a control thread over an existing local kickoff draft", async () => {
    useBacksterosTaskChatStore.getState().setBinding(task.id, {
      ...draftBinding,
      draftId: "draft-stale",
      threadId: "thread-draft",
      title: "Control thread",
      displayId: "BDV-35",
    });
    fetchControlBindingsMock.mockResolvedValue({
      ok: true,
      bindings: [
        {
          taskId: task.id,
          kind: "thread",
          threadId: "thread-control",
          environmentId: "env-1",
          t3ProjectId: "project-1",
          backsterosProjectId: "bos-1",
          projectTitle: "BacksterDEV",
          title: "Control thread",
          displayId: "BDV-35",
        },
      ],
    });

    const navigations: Array<{
      to: string;
      params?: Record<string, string>;
    }> = [];

    await openBacksterosTaskChat({
      task,
      backsterosProject,
      projects: [t3Project],
      navigate: async (opts) => {
        navigations.push(opts);
      },
    });

    expect(useBacksterosTaskChatStore.getState().getBinding(task.id)?.kind).toBe("thread");
    expect(navigations[0]?.to).toBe("/$environmentId/$threadId");
    expect(navigations[0]?.params?.threadId).toBe("thread-control");
  });

  it("clears a task chat into a fresh draft for the same task", async () => {
    useBacksterosTaskChatStore.getState().setBinding("task-a", draftBinding);
    const navigations: Array<{
      to: string;
      params?: Record<string, string>;
      replace?: boolean;
    }> = [];

    const ok = await clearBacksterosTaskChatSession({
      taskId: "task-a",
      navigate: async (opts) => {
        navigations.push(opts);
      },
    });

    expect(ok).toBe(true);
    const next = useBacksterosTaskChatStore.getState().getBinding("task-a");
    expect(next?.kind).toBe("draft");
    expect(next?.kind === "draft" ? next.draftId : null).not.toBe("draft-1");
    expect(next?.threadId).not.toBe("thread-1");
    expect(next?.title).toBe("Ship it");
    expect(next?.displayId).toBe("BOD-1");
    expect(next?.backsterosProjectId).toBe("bos-1");
    expect(navigations).toEqual([
      {
        to: "/draft/$draftId",
        params: { draftId: next?.kind === "draft" ? next.draftId : undefined },
        replace: true,
      },
    ]);
  });

  it("clears a stale draft bound to the wrong t3ProjectId and creates a fresh one", async () => {
    useBacksterosTaskChatStore.getState().setBinding(task.id, {
      ...draftBinding,
      t3ProjectId: "project-old-wordpress",
      draftId: "draft-stale",
      threadId: "thread-stale",
    });
    useBacksterosTaskKickoffGateStore.getState().setGate(task.id, {
      mode: "gate",
      kickoffPrompt:
        "Working directory: /Users/remondevries/code/quarrymill.com/wordpress\n\nstale",
    });

    const navigations: Array<{
      to: string;
      params?: Record<string, string>;
    }> = [];

    await openBacksterosTaskChat({
      task,
      backsterosProject,
      projects: [t3Project],
      navigate: async (opts) => {
        navigations.push(opts);
      },
    });

    const next = useBacksterosTaskChatStore.getState().getBinding(task.id);
    expect(next?.kind).toBe("draft");
    expect(next?.t3ProjectId).toBe("project-1");
    expect(next?.environmentId).toBe("env-1");
    expect(next?.kind === "draft" ? next.draftId : null).not.toBe("draft-stale");
    expect(next?.threadId).not.toBe("thread-stale");

    const gate = useBacksterosTaskKickoffGateStore.getState().getGate(task.id);
    expect(gate?.mode).toBe("gate");
    expect(gate?.kickoffPrompt).toContain("/tmp/bdv");
    expect(gate?.kickoffPrompt).not.toContain("quarrymill.com/wordpress");

    expect(navigations).toEqual([
      {
        to: "/draft/$draftId",
        params: { draftId: next?.kind === "draft" ? next.draftId : undefined },
      },
    ]);
  });

  it("reuses a matching draft binding without recreating", async () => {
    const matching: BacksterosTaskChatBinding = {
      ...draftBinding,
      t3ProjectId: "project-1",
      environmentId: "env-1",
    };
    useBacksterosTaskChatStore.getState().setBinding(task.id, matching);
    useComposerDraftStore
      .getState()
      .setLogicalProjectDraftThreadId(
        backsterosTaskLogicalProjectKey(task.id),
        scopeProjectRef("env-1" as never, "project-1" as never),
        DraftId.make("draft-1"),
        {
          threadId: "thread-1" as never,
          createdAt: "2026-09-20T00:00:00.000Z",
          branch: null,
          worktreePath: null,
        },
      );

    const navigations: Array<{
      to: string;
      params?: Record<string, string>;
    }> = [];

    await openBacksterosTaskChat({
      task,
      backsterosProject,
      projects: [t3Project],
      navigate: async (opts) => {
        navigations.push(opts);
      },
    });

    const next = useBacksterosTaskChatStore.getState().getBinding(task.id);
    expect(next?.kind).toBe("draft");
    expect(next?.kind === "draft" ? next.draftId : null).toBe("draft-1");
    expect(next?.t3ProjectId).toBe("project-1");
    expect(navigations).toEqual([
      {
        to: "/draft/$draftId",
        params: { draftId: "draft-1" },
      },
    ]);
  });
});

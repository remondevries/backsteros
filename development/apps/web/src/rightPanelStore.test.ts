import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  browserSurfaceId,
  migratePersistedRightPanelState,
  pullRequestSurfaceId,
  selectActiveRightPanel,
  selectActiveRightPanelSurface,
  selectComposedRightPanelState,
  terminalSurfaceId,
  useRightPanelStore,
} from "./rightPanelStore";

const refA = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-A"));
const refB = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-B"));
const projectRef = scopeProjectRef("env-1" as EnvironmentId, ProjectId.make("project-1"));
const otherProjectRef = scopeProjectRef("env-1" as EnvironmentId, ProjectId.make("project-2"));

function composed(ref = refA, project = projectRef) {
  const state = useRightPanelStore.getState();
  return selectComposedRightPanelState(state.byThreadKey, state.byProjectKey, ref, project);
}

beforeEach(() => {
  useRightPanelStore.setState({ byThreadKey: {}, byProjectKey: {}, activationClock: 0 });
});

describe("rightPanelStore", () => {
  it("drops the legacy singleton terminal surface during migration", () => {
    expect(
      migratePersistedRightPanelState({
        byThreadKey: {
          "env-1:thread-A": {
            activeSurfaceId: "terminal",
            surfaces: [
              { id: "browser:tab-a", kind: "preview", resourceId: "tab-a" },
              { id: "terminal", kind: "terminal" },
            ],
          },
        },
      }),
    ).toEqual({
      byProjectKey: {},
      activationClock: 0,
      byThreadKey: {
        "env-1:thread-A": {
          activeGeneration: 0,
          activeSurfaceId: null,
          isOpen: false,
          surfaces: [
            {
              id: browserSurfaceId("thread-A", "tab-a"),
              kind: "preview",
              ownerThreadId: "thread-A",
              resourceId: "tab-a",
            },
          ],
        },
      },
    });
  });

  it("upgrades saved single-session terminal surfaces to split-capable surfaces", () => {
    expect(
      migratePersistedRightPanelState({
        byThreadKey: {
          "env-1:thread-A": {
            isOpen: true,
            activeSurfaceId: "terminal:term-1",
            surfaces: [{ id: "terminal:term-1", kind: "terminal", resourceId: "term-1" }],
          },
        },
      }),
    ).toEqual({
      byProjectKey: {},
      activationClock: 0,
      byThreadKey: {
        "env-1:thread-A": {
          activeGeneration: 0,
          isOpen: true,
          activeSurfaceId: terminalSurfaceId("thread-A", "term-1"),
          surfaces: [
            {
              id: terminalSurfaceId("thread-A", "term-1"),
              kind: "terminal",
              resourceId: "term-1",
              terminalIds: ["term-1"],
              activeTerminalId: "term-1",
              ownerThreadId: "thread-A",
            },
          ],
        },
      },
    });
  });

  it("lifts browser and terminal tools onto the project bag", () => {
    useRightPanelStore.setState({
      byThreadKey: {
        "env-1:thread-A": {
          isOpen: true,
          activeGeneration: 1,
          activeSurfaceId: browserSurfaceId("thread-A", "tab-a"),
          surfaces: [
            {
              id: browserSurfaceId("thread-A", "tab-a"),
              kind: "preview",
              resourceId: "tab-a",
              ownerThreadId: "thread-A",
            },
            { id: "diff", kind: "diff" },
          ],
        },
      },
      byProjectKey: {},
    });

    useRightPanelStore.getState().liftProjectToolsFromThread(refA, projectRef);

    expect(composed().surfaces.map((surface) => surface.id)).toEqual([
      browserSurfaceId("thread-A", "tab-a"),
      "diff",
    ]);
    expect(useRightPanelStore.getState().byThreadKey["env-1:thread-A"]?.surfaces).toEqual([
      { id: "diff", kind: "diff" },
    ]);
  });

  it("shares browser and terminal tabs across conversations in the same project", () => {
    useRightPanelStore.getState().openBrowser(projectRef, refA, "tab-a");
    useRightPanelStore.getState().openTerminal(projectRef, refA, "term-1");
    useRightPanelStore.getState().open(refB, "diff");

    expect(composed(refA).surfaces.map((surface) => surface.id)).toEqual([
      browserSurfaceId("thread-A", "tab-a"),
      terminalSurfaceId("thread-A", "term-1"),
    ]);
    expect(composed(refB).surfaces.map((surface) => surface.id)).toEqual([
      browserSurfaceId("thread-A", "tab-a"),
      terminalSurfaceId("thread-A", "term-1"),
      "diff",
    ]);
    expect(
      selectActiveRightPanel(
        useRightPanelStore.getState().byThreadKey,
        refB,
        useRightPanelStore.getState().byProjectKey,
        projectRef,
      ),
    ).toBe("diff");
  });

  it("keeps separate tool groupings for different projects", () => {
    useRightPanelStore.getState().openBrowser(projectRef, refA, "tab-a");
    useRightPanelStore.getState().openBrowser(otherProjectRef, refB, "tab-b");

    expect(composed(refA, projectRef).surfaces.map((surface) => surface.id)).toEqual([
      browserSurfaceId("thread-A", "tab-a"),
    ]);
    expect(composed(refB, otherProjectRef).surfaces.map((surface) => surface.id)).toEqual([
      browserSurfaceId("thread-B", "tab-b"),
    ]);
  });

  it("opens and closes the empty right panel without surfaces", () => {
    expect(composed().isOpen).toBe(false);
    expect(composed().surfaces).toEqual([]);

    useRightPanelStore.getState().toggleVisibility(refA, projectRef);
    expect(composed().isOpen).toBe(true);
    expect(composed().surfaces).toEqual([]);

    useRightPanelStore.getState().toggleVisibility(refA, projectRef);
    expect(composed().isOpen).toBe(false);
  });

  it("keeps the panel closed when surfaces remain but both bags are closed", () => {
    useRightPanelStore.getState().open(refA, "files");
    useRightPanelStore.getState().close(refA, projectRef);
    expect(composed().surfaces).toEqual([{ id: "files", kind: "files" }]);
    expect(composed().isOpen).toBe(false);
    expect(composed().activeSurfaceId).toBe("files");
  });

  it("keeps files as a singleton thread surface", () => {
    useRightPanelStore.getState().open(refA, "files");
    useRightPanelStore.getState().open(refA, "files");
    expect(composed().surfaces).toEqual([{ id: "files", kind: "files" }]);
    expect(composed().activeSurfaceId).toBe("files");
    expect(composed().isOpen).toBe(true);
  });

  it("tracks one surface per browser session", () => {
    useRightPanelStore.getState().openBrowser(projectRef, refA, "tab-a");
    useRightPanelStore.getState().openBrowser(projectRef, refA, "tab-b");
    expect(composed().surfaces.map((surface) => surface.id)).toEqual([
      browserSurfaceId("thread-A", "tab-a"),
      browserSurfaceId("thread-A", "tab-b"),
    ]);
    expect(
      selectActiveRightPanelSurface(
        useRightPanelStore.getState().byThreadKey,
        refA,
        useRightPanelStore.getState().byProjectKey,
        projectRef,
      ),
    ).toEqual({
      id: browserSurfaceId("thread-A", "tab-b"),
      kind: "preview",
      resourceId: "tab-b",
      ownerThreadId: "thread-A",
    });
  });

  it("tracks split panes within a project-scoped terminal surface", () => {
    useRightPanelStore.getState().openTerminal(projectRef, refA, "term-1");
    useRightPanelStore
      .getState()
      .splitTerminal(projectRef, terminalSurfaceId("thread-A", "term-1"), "term-2");
    expect(
      selectActiveRightPanelSurface(
        useRightPanelStore.getState().byThreadKey,
        refA,
        useRightPanelStore.getState().byProjectKey,
        projectRef,
      ),
    ).toEqual({
      id: terminalSurfaceId("thread-A", "term-1"),
      kind: "terminal",
      resourceId: "term-1",
      terminalIds: ["term-1", "term-2"],
      activeTerminalId: "term-2",
      ownerThreadId: "thread-A",
    });
  });

  it("reconciles browser surfaces for one owner without dropping sibling owners", () => {
    useRightPanelStore.getState().openBrowser(projectRef, refA, "tab-a");
    useRightPanelStore.getState().openBrowser(projectRef, refB, "tab-b");
    useRightPanelStore
      .getState()
      .reconcileBrowserSurfaces(projectRef, refA, ["tab-c"]);

    expect(composed().surfaces.map((surface) => surface.id)).toEqual([
      browserSurfaceId("thread-B", "tab-b"),
      browserSurfaceId("thread-A", "tab-c"),
    ]);
  });

  it("removes an owner thread's project tools when the thread is removed", () => {
    useRightPanelStore.getState().openBrowser(projectRef, refA, "tab-a");
    useRightPanelStore.getState().openBrowser(projectRef, refB, "tab-b");
    useRightPanelStore.getState().removeThread(refA);

    expect(composed(refB).surfaces.map((surface) => surface.id)).toEqual([
      browserSurfaceId("thread-B", "tab-b"),
    ]);
  });

  it("closes other surfaces across both bags", () => {
    useRightPanelStore.getState().openBrowser(projectRef, refA, "tab-a");
    useRightPanelStore.getState().open(refA, "diff");
    useRightPanelStore.getState().closeOtherSurfaces(refA, "diff", projectRef);

    expect(composed().surfaces).toEqual([{ id: "diff", kind: "diff" }]);
    expect(composed().activeSurfaceId).toBe("diff");
  });

  it("opens pull requests with reference-keyed ids", () => {
    useRightPanelStore.getState().openPullRequest(refA, {
      projectId: "project-1",
      repository: "acme/app",
      number: 42,
    });
    expect(composed().activeSurfaceId).toBe(
      pullRequestSurfaceId({
        projectId: "project-1",
        repository: "acme/app",
        number: 42,
      }),
    );
  });
});

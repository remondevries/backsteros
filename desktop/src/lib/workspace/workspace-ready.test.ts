import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeWorkspaceGlobalReady,
  computeWorkspaceSurfaceReady,
  type WorkspaceReadyInput,
} from "./workspace-ready.ts";

function baseInput(
  overrides: Partial<WorkspaceReadyInput> = {},
): WorkspaceReadyInput {
  return {
    authenticated: true,
    restHydrateSettled: false,
    queriesGracePeriodExpired: false,
    powerSyncReady: true,
    powerSyncStatus: "ready",
    localLoaded: {
      tasks: false,
      inboxTasks: false,
      projects: false,
      documents: false,
      letters: false,
      contacts: false,
      organizations: false,
      habits: false,
      meetings: false,
      areas: false,
    },
    apiLoaded: {
      tasks: false,
      inboxTasks: false,
      projects: false,
      documents: false,
      letters: false,
      contacts: false,
      organizations: false,
      habits: false,
      meetings: false,
      areas: false,
    },
    ...overrides,
  };
}

test("inbox ready when inbox tasks local load without letters", () => {
  // Only inbox tasks are loaded: inbox becomes ready on its own, while the
  // letters surface (which also accepts `projects` as a readiness proxy) does
  // not — neither letters nor projects have landed yet.
  const ready = computeWorkspaceSurfaceReady(
    baseInput({
      localLoaded: {
        ...baseInput().localLoaded,
        inboxTasks: true,
      },
    }),
  );
  assert.equal(ready.inbox, true);
  assert.equal(ready.letters, false);
});

test("knowledge ready when only documents local", () => {
  const ready = computeWorkspaceSurfaceReady(
    baseInput({
      localLoaded: {
        ...baseInput().localLoaded,
        documents: true,
      },
    }),
  );
  assert.equal(ready.knowledge, true);
  assert.equal(ready.tasks, false);
});

test("global ready when any core surface ready", () => {
  const bySurface = computeWorkspaceSurfaceReady(
    baseInput({
      localLoaded: {
        ...baseInput().localLoaded,
        documents: true,
      },
    }),
  );
  assert.equal(computeWorkspaceGlobalReady(bySurface), true);
});

test("restHydrateSettled alone does not mark surfaces ready", () => {
  const ready = computeWorkspaceSurfaceReady(
    baseInput({
      restHydrateSettled: true,
      powerSyncReady: true,
    }),
  );
  assert.equal(ready.inbox, false);
  assert.equal(ready.tasks, false);
  assert.equal(ready.knowledge, false);
});

test("grace period unblocks when PowerSync ready but watches hung", () => {
  const ready = computeWorkspaceSurfaceReady(
    baseInput({
      powerSyncReady: true,
      queriesGracePeriodExpired: true,
    }),
  );
  assert.equal(ready.inbox, true);
  assert.equal(ready.tasks, true);
});

test("apiLoaded cold rescue unblocks without local watches", () => {
  const ready = computeWorkspaceSurfaceReady(
    baseInput({
      apiLoaded: {
        ...baseInput().apiLoaded,
        tasks: true,
        inboxTasks: true,
        projects: true,
      },
    }),
  );
  assert.equal(ready.inbox, true);
  assert.equal(ready.tasks, true);
});

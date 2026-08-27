import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  chromeHrefForWarmKeepAlive,
  getVisibleKeepAliveSurface,
  isWarmKeepAliveSectionFlip,
  keepAliveDestinationShowsSidePanel,
  keepAliveSidePanelSurface,
  markKeepAliveSurfaceMounted,
  rememberKeepAliveHref,
  resetKeepAliveForTests,
  resolveWarmKeepAliveHref,
  shouldApplyRouteKeepAliveSync,
  shouldKeepAliveSidePanelSurface,
  syncVisibleKeepAliveSurfaceFromRoute,
  tryWarmKeepAliveFlip,
} from "./shell-warm-keep-alive.ts";
import {
  ENABLE_ALL_KEEP_ALIVE,
} from "./journal-cpu-bisect.ts";

afterEach(() => {
  resetKeepAliveForTests();
});

test("first visit is not a warm flip", () => {
  assert.equal(isWarmKeepAliveSectionFlip("/tasks"), false);
  assert.equal(tryWarmKeepAliveFlip("/tasks"), false);
  assert.equal(tryWarmKeepAliveFlip("/journal-v2"), false);
  assert.equal(tryWarmKeepAliveFlip("/knowledge-v2"), false);
  assert.equal(tryWarmKeepAliveFlip("/letters-v2"), false);
  assert.equal(tryWarmKeepAliveFlip("/habits-v2"), false);
});

test("mounted journal, knowledge, letters, habits warm-flip like tasks", () => {
  markKeepAliveSurfaceMounted("journal-v2");
  markKeepAliveSurfaceMounted("knowledge-v2");
  markKeepAliveSurfaceMounted("letters-v2");
  markKeepAliveSurfaceMounted("habits-v2");
  markKeepAliveSurfaceMounted("tasks-list");
  syncVisibleKeepAliveSurfaceFromRoute("tasks-list");

  if (!ENABLE_ALL_KEEP_ALIVE) {
    assert.equal(tryWarmKeepAliveFlip("/journal-v2"), false);
    assert.equal(tryWarmKeepAliveFlip("/knowledge-v2"), false);
    assert.equal(tryWarmKeepAliveFlip("/letters-v2"), false);
    assert.equal(tryWarmKeepAliveFlip("/habits-v2"), false);
    return;
  }

  assert.equal(tryWarmKeepAliveFlip("/journal-v2"), true);
  assert.equal(getVisibleKeepAliveSurface(), "journal-v2");
  assert.equal(tryWarmKeepAliveFlip("/knowledge-v2"), true);
  assert.equal(getVisibleKeepAliveSurface(), "knowledge-v2");
  assert.equal(tryWarmKeepAliveFlip("/letters-v2"), true);
  assert.equal(getVisibleKeepAliveSurface(), "letters-v2");
  assert.equal(tryWarmKeepAliveFlip("/habits-v2"), true);
  assert.equal(getVisibleKeepAliveSurface(), "habits-v2");
});

test("same mounted surface is not a warm section flip", () => {
  markKeepAliveSurfaceMounted("tasks-list");
  syncVisibleKeepAliveSurfaceFromRoute("tasks-list");
  assert.equal(isWarmKeepAliveSectionFlip("/tasks"), false);
  assert.equal(tryWarmKeepAliveFlip("/tasks"), ENABLE_ALL_KEEP_ALIVE);
  assert.equal(
    tryWarmKeepAliveFlip("/tasks?due=overdue"),
    ENABLE_ALL_KEEP_ALIVE,
  );
});

test("mounted knowledge and letters warm-flip from tasks", () => {
  markKeepAliveSurfaceMounted("knowledge-v2");
  markKeepAliveSurfaceMounted("letters-v2");
  markKeepAliveSurfaceMounted("tasks-list");
  syncVisibleKeepAliveSurfaceFromRoute("tasks-list");
  if (!ENABLE_ALL_KEEP_ALIVE) {
    assert.equal(tryWarmKeepAliveFlip("/knowledge-v2"), false);
    assert.equal(tryWarmKeepAliveFlip("/letters-v2"), false);
    return;
  }
  assert.equal(tryWarmKeepAliveFlip("/knowledge-v2"), true);
  assert.equal(getVisibleKeepAliveSurface(), "knowledge-v2");
  assert.equal(tryWarmKeepAliveFlip("/letters-v2"), true);
  assert.equal(getVisibleKeepAliveSurface(), "letters-v2");
  assert.equal(tryWarmKeepAliveFlip("/knowledge-v2"), true);
  assert.equal(getVisibleKeepAliveSurface(), "knowledge-v2");
});

test("g+t / g+p / calendar flips a mounted pane and skips TanStack navigate", () => {
  markKeepAliveSurfaceMounted("calendar");
  markKeepAliveSurfaceMounted("tasks-list");
  markKeepAliveSurfaceMounted("projects");
  rememberKeepAliveHref("tasks-list", "/tasks", "?due=today");
  syncVisibleKeepAliveSurfaceFromRoute("calendar");

  if (!ENABLE_ALL_KEEP_ALIVE) {
    assert.equal(tryWarmKeepAliveFlip("/tasks"), false);
    assert.equal(tryWarmKeepAliveFlip("/projects"), false);
    assert.equal(tryWarmKeepAliveFlip("/calendar"), false);
    return;
  }
  assert.equal(tryWarmKeepAliveFlip("/tasks"), true);
  assert.equal(getVisibleKeepAliveSurface(), "tasks-list");
  assert.equal(tryWarmKeepAliveFlip("/projects"), true);
  assert.equal(getVisibleKeepAliveSurface(), "projects");
  assert.equal(tryWarmKeepAliveFlip("/calendar"), true);
  assert.equal(getVisibleKeepAliveSurface(), "calendar");
});

test("section-root go targets restore the last href on that pane", () => {
  rememberKeepAliveHref("tasks-list", "/tasks", "?due=today");
  assert.equal(resolveWarmKeepAliveHref("/tasks"), "/tasks?due=today");
  assert.equal(
    resolveWarmKeepAliveHref("/tasks?due=overdue"),
    "/tasks?due=overdue",
  );
});

test("route sync does not overwrite a warm flip while the router is stale", () => {
  markKeepAliveSurfaceMounted("tasks-list");
  rememberKeepAliveHref("tasks-list", "/tasks", "");
  syncVisibleKeepAliveSurfaceFromRoute("calendar");
  if (!ENABLE_ALL_KEEP_ALIVE) {
    assert.equal(tryWarmKeepAliveFlip("/tasks"), false);
    return;
  }
  assert.equal(tryWarmKeepAliveFlip("/tasks"), true);
  assert.equal(shouldApplyRouteKeepAliveSync("/calendar"), false);
});

test("chrome href follows the keep-alive store while the router is stale", () => {
  markKeepAliveSurfaceMounted("calendar");
  markKeepAliveSurfaceMounted("tasks-list");
  rememberKeepAliveHref("calendar", "/calendar", "");
  rememberKeepAliveHref("tasks-list", "/tasks", "?due=today");
  syncVisibleKeepAliveSurfaceFromRoute("calendar");
  assert.equal(chromeHrefForWarmKeepAlive("/calendar"), "/calendar");

  if (!ENABLE_ALL_KEEP_ALIVE) {
    assert.equal(tryWarmKeepAliveFlip("/tasks"), false);
    return;
  }
  assert.equal(tryWarmKeepAliveFlip("/tasks"), true);
  assert.equal(chromeHrefForWarmKeepAlive("/calendar"), "/tasks?due=today");
  assert.equal(chromeHrefForWarmKeepAlive("/tasks"), "/tasks?due=today");
});

test("same-pane query flip does not let a stale router overwrite lastHref", () => {
  markKeepAliveSurfaceMounted("tasks-list");
  rememberKeepAliveHref("tasks-list", "/tasks", "?due=today");
  syncVisibleKeepAliveSurfaceFromRoute("tasks-list");
  if (!ENABLE_ALL_KEEP_ALIVE) {
    assert.equal(tryWarmKeepAliveFlip("/tasks?due=overdue"), false);
    return;
  }
  assert.equal(tryWarmKeepAliveFlip("/tasks?due=overdue"), true);
  assert.equal(
    shouldApplyRouteKeepAliveSync("/tasks", "?due=today"),
    false,
  );
  assert.equal(
    shouldApplyRouteKeepAliveSync("/tasks", "?due=overdue"),
    true,
  );
});

test("tasks-list and standalone /projects stay in the keep-alive side-panel set", () => {
  assert.equal(
    shouldKeepAliveSidePanelSurface("tasks-list", "/tasks"),
    ENABLE_ALL_KEEP_ALIVE,
  );
  assert.equal(
    shouldKeepAliveSidePanelSurface("projects", "/projects"),
    ENABLE_ALL_KEEP_ALIVE,
  );
  assert.equal(
    keepAliveSidePanelSurface("/tasks"),
    ENABLE_ALL_KEEP_ALIVE ? "tasks-list" : null,
  );
  assert.equal(
    keepAliveSidePanelSurface("/projects"),
    ENABLE_ALL_KEEP_ALIVE ? "projects" : null,
  );
  assert.equal(
    keepAliveSidePanelSurface("/projects/CA"),
    ENABLE_ALL_KEEP_ALIVE ? "projects" : null,
  );
  assert.equal(
    keepAliveSidePanelSurface("/organizations/1/projects/CA"),
    null,
  );
  assert.equal(keepAliveDestinationShowsSidePanel("/tasks"), false);
  assert.equal(keepAliveDestinationShowsSidePanel("/projects"), false);
  assert.equal(
    keepAliveDestinationShowsSidePanel("/projects/CA"),
    ENABLE_ALL_KEEP_ALIVE,
  );
  assert.equal(
    keepAliveDestinationShowsSidePanel("/letters-v2"),
    ENABLE_ALL_KEEP_ALIVE,
  );
});

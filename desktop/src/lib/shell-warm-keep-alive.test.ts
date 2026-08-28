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

  assert.equal(tryWarmKeepAliveFlip("/journal-v2"), true);
  assert.equal(getVisibleKeepAliveSurface(), "journal-v2");
  assert.equal(tryWarmKeepAliveFlip("/knowledge-v2"), true);
  assert.equal(getVisibleKeepAliveSurface(), "knowledge-v2");
  assert.equal(tryWarmKeepAliveFlip("/letters-v2"), true);
  assert.equal(getVisibleKeepAliveSurface(), "letters-v2");
  assert.equal(tryWarmKeepAliveFlip("/habits-v2"), true);
  assert.equal(getVisibleKeepAliveSurface(), "habits-v2");
});

test("legacy journal/knowledge/letters hrefs warm-flip onto v2 surfaces", () => {
  markKeepAliveSurfaceMounted("journal-v2");
  markKeepAliveSurfaceMounted("knowledge-v2");
  markKeepAliveSurfaceMounted("letters-v2");
  markKeepAliveSurfaceMounted("habits-v2");
  markKeepAliveSurfaceMounted("tasks-list");
  syncVisibleKeepAliveSurfaceFromRoute("tasks-list");

  assert.equal(tryWarmKeepAliveFlip("/journal"), true);
  assert.equal(getVisibleKeepAliveSurface(), "journal-v2");
  assert.equal(tryWarmKeepAliveFlip("/journal/habits"), true);
  assert.equal(getVisibleKeepAliveSurface(), "habits-v2");
  assert.equal(tryWarmKeepAliveFlip("/knowledge"), true);
  assert.equal(getVisibleKeepAliveSurface(), "knowledge-v2");
  assert.equal(tryWarmKeepAliveFlip("/letters"), true);
  assert.equal(getVisibleKeepAliveSurface(), "letters-v2");
});

test("same mounted surface is not a warm section flip", () => {
  markKeepAliveSurfaceMounted("tasks-list");
  syncVisibleKeepAliveSurfaceFromRoute("tasks-list");
  assert.equal(isWarmKeepAliveSectionFlip("/tasks"), false);
  assert.equal(tryWarmKeepAliveFlip("/tasks"), true);
  assert.equal(tryWarmKeepAliveFlip("/tasks?due=overdue"), true);
});

test("mounted knowledge and letters warm-flip from tasks", () => {
  markKeepAliveSurfaceMounted("knowledge-v2");
  markKeepAliveSurfaceMounted("letters-v2");
  markKeepAliveSurfaceMounted("tasks-list");
  syncVisibleKeepAliveSurfaceFromRoute("tasks-list");
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

  assert.equal(tryWarmKeepAliveFlip("/tasks"), true);
  assert.equal(chromeHrefForWarmKeepAlive("/calendar"), "/tasks?due=today");
  assert.equal(chromeHrefForWarmKeepAlive("/tasks"), "/tasks?due=today");
});

test("same-pane query flip does not let a stale router overwrite lastHref", () => {
  markKeepAliveSurfaceMounted("tasks-list");
  rememberKeepAliveHref("tasks-list", "/tasks", "?due=today");
  syncVisibleKeepAliveSurfaceFromRoute("tasks-list");
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
    true,
  );
  assert.equal(
    shouldKeepAliveSidePanelSurface("projects", "/projects"),
    true,
  );
  assert.equal(keepAliveSidePanelSurface("/tasks"), "tasks-list");
  assert.equal(keepAliveSidePanelSurface("/projects"), "projects");
  assert.equal(keepAliveSidePanelSurface("/projects/CA"), "projects");
  assert.equal(
    keepAliveSidePanelSurface("/organizations/1/projects/CA"),
    null,
  );
  assert.equal(keepAliveDestinationShowsSidePanel("/tasks"), false);
  assert.equal(keepAliveDestinationShowsSidePanel("/projects"), false);
  assert.equal(keepAliveDestinationShowsSidePanel("/projects/CA"), true);
  assert.equal(keepAliveDestinationShowsSidePanel("/letters-v2"), true);
});

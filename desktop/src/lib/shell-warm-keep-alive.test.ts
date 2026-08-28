import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  dismissKeepAliveForOutletNavigation,
  getVisibleKeepAliveSurface,
  isWarmKeepAliveSectionFlip,
  keepAliveDestinationShowsSidePanel,
  keepAliveSidePanelSurface,
  lastHrefForKeepAliveSurface,
  markKeepAliveSurfaceMounted,
  rememberInboxPanelSelectionHref,
  rememberKeepAliveHref,
  resetKeepAliveForTests,
  resolveWarmKeepAliveHref,
  routerAgreesWithWindow,
  shouldKeepAliveSidePanelSurface,
  syncVisibleKeepAliveSurfaceFromRoute,
  tryWarmKeepAliveFlip,
  visibleKeepAliveHref,
} from "./shell-warm-keep-alive.ts";
import { rememberSectionEntryHrefs } from "./section-entry-store.ts";

afterEach(() => {
  resetKeepAliveForTests();
  rememberSectionEntryHrefs({
    inbox: null,
    contacts: null,
    organizations: null,
    letters: null,
    knowledge: null,
  });
});

test("first visit is not a warm flip", () => {
  assert.equal(isWarmKeepAliveSectionFlip("/tasks"), false);
  assert.equal(tryWarmKeepAliveFlip("/tasks"), false);
  assert.equal(tryWarmKeepAliveFlip("/journal"), false);
  assert.equal(tryWarmKeepAliveFlip("/knowledge"), false);
  assert.equal(tryWarmKeepAliveFlip("/letters"), false);
  assert.equal(tryWarmKeepAliveFlip("/journal/habits"), false);
});

test("mounted journal, knowledge, letters, habits warm-flip like tasks", () => {
  markKeepAliveSurfaceMounted("journal-day");
  markKeepAliveSurfaceMounted("knowledge");
  markKeepAliveSurfaceMounted("letters");
  markKeepAliveSurfaceMounted("journal-habits");
  markKeepAliveSurfaceMounted("tasks-list");
  syncVisibleKeepAliveSurfaceFromRoute("tasks-list");

  assert.equal(tryWarmKeepAliveFlip("/journal"), true);
  assert.equal(getVisibleKeepAliveSurface(), "journal-day");
  assert.equal(tryWarmKeepAliveFlip("/knowledge"), true);
  assert.equal(getVisibleKeepAliveSurface(), "knowledge");
  assert.equal(tryWarmKeepAliveFlip("/letters"), true);
  assert.equal(getVisibleKeepAliveSurface(), "letters");
  assert.equal(tryWarmKeepAliveFlip("/journal/habits"), true);
  assert.equal(getVisibleKeepAliveSurface(), "journal-habits");
});

test("same mounted surface is not a warm section flip", () => {
  markKeepAliveSurfaceMounted("tasks-list");
  syncVisibleKeepAliveSurfaceFromRoute("tasks-list");
  assert.equal(isWarmKeepAliveSectionFlip("/tasks"), false);
  assert.equal(tryWarmKeepAliveFlip("/tasks"), true);
  assert.equal(tryWarmKeepAliveFlip("/tasks?due=overdue"), true);
});

test("mounted knowledge and letters warm-flip from tasks", () => {
  markKeepAliveSurfaceMounted("knowledge");
  markKeepAliveSurfaceMounted("letters");
  markKeepAliveSurfaceMounted("tasks-list");
  syncVisibleKeepAliveSurfaceFromRoute("tasks-list");
  assert.equal(tryWarmKeepAliveFlip("/knowledge"), true);
  assert.equal(getVisibleKeepAliveSurface(), "knowledge");
  assert.equal(tryWarmKeepAliveFlip("/letters"), true);
  assert.equal(getVisibleKeepAliveSurface(), "letters");
  assert.equal(tryWarmKeepAliveFlip("/knowledge"), true);
  assert.equal(getVisibleKeepAliveSurface(), "knowledge");
});

test("same-pane list to detail warm-flips without TanStack navigate", () => {
  markKeepAliveSurfaceMounted("tasks-list");
  rememberKeepAliveHref("tasks-list", "/tasks", "?due=today");
  syncVisibleKeepAliveSurfaceFromRoute("tasks-list");
  assert.equal(tryWarmKeepAliveFlip("/tasks/today/BSH-1"), true);
});

test("same-pane inbox item warm-flips without TanStack navigate", () => {
  markKeepAliveSurfaceMounted("inbox");
  rememberKeepAliveHref("inbox", "/inbox", "");
  syncVisibleKeepAliveSurfaceFromRoute("inbox");
  assert.equal(tryWarmKeepAliveFlip("/inbox/in-1"), true);
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

test("section-root tasks sidebar always opens Today", () => {
  rememberKeepAliveHref("tasks-list", "/tasks", "?due=overdue");
  assert.equal(resolveWarmKeepAliveHref("/tasks"), "/tasks?due=today");
  assert.equal(
    resolveWarmKeepAliveHref("/tasks?due=overdue"),
    "/tasks?due=overdue",
  );
});

test("explicit today due query is not remapped", () => {
  rememberKeepAliveHref("tasks-list", "/tasks", "?due=overdue");
  assert.equal(resolveWarmKeepAliveHref("/tasks?due=today"), "/tasks?due=today");
});

test("tasks sidebar opens Today after viewing a task", () => {
  rememberKeepAliveHref("tasks-list", "/tasks/overdue/BSH-1", "");
  assert.equal(resolveWarmKeepAliveHref("/tasks"), "/tasks?due=today");
});

test("projects sidebar opens the overview after viewing a project", () => {
  rememberKeepAliveHref("projects", "/projects/BOS", "");
  assert.equal(resolveWarmKeepAliveHref("/projects"), "/projects");
  rememberKeepAliveHref("inbox", "/inbox/item-1", "");
  assert.equal(resolveWarmKeepAliveHref("/inbox"), "/inbox");
});

test("outlet nav dismisses a visible keep-alive pane", () => {
  markKeepAliveSurfaceMounted("projects");
  rememberKeepAliveHref("projects", "/projects/BOS", "");
  syncVisibleKeepAliveSurfaceFromRoute("projects");
  assert.equal(
    dismissKeepAliveForOutletNavigation("/development"),
    true,
  );
  assert.equal(getVisibleKeepAliveSurface(), null);
});

test("first-visit keep-alive nav clears stale visible so activeProp can win", () => {
  markKeepAliveSurfaceMounted("projects");
  rememberKeepAliveHref("projects", "/projects/BOS", "");
  syncVisibleKeepAliveSurfaceFromRoute("projects");
  // g+t / sidebar while Tasks is not mounted yet — warm flip returns false.
  assert.equal(tryWarmKeepAliveFlip("/tasks"), false);
  assert.equal(dismissKeepAliveForOutletNavigation("/tasks"), true);
  assert.equal(getVisibleKeepAliveSurface(), null);

  syncVisibleKeepAliveSurfaceFromRoute("projects");
  assert.equal(dismissKeepAliveForOutletNavigation("/inbox"), true);
  assert.equal(getVisibleKeepAliveSurface(), null);

  syncVisibleKeepAliveSurfaceFromRoute("projects");
  assert.equal(dismissKeepAliveForOutletNavigation("/calendar"), true);
  assert.equal(getVisibleKeepAliveSurface(), null);
});

test("same-surface dismiss is a no-op", () => {
  markKeepAliveSurfaceMounted("tasks-list");
  rememberKeepAliveHref("tasks-list", "/tasks", "?due=today");
  syncVisibleKeepAliveSurfaceFromRoute("tasks-list");
  assert.equal(dismissKeepAliveForOutletNavigation("/tasks"), false);
  assert.equal(getVisibleKeepAliveSurface(), "tasks-list");
});

test("warm flip leaves the store as truth while the router is stale", () => {
  markKeepAliveSurfaceMounted("tasks-list");
  rememberKeepAliveHref("tasks-list", "/tasks", "");
  syncVisibleKeepAliveSurfaceFromRoute("calendar");
  assert.equal(tryWarmKeepAliveFlip("/tasks"), true);
  assert.equal(getVisibleKeepAliveSurface(), "tasks-list");
  assert.equal(lastHrefForKeepAliveSurface("tasks-list"), "/tasks?due=today");
  assert.equal(visibleKeepAliveHref(), "/tasks?due=today");
  assert.equal(getVisibleKeepAliveSurface(), "tasks-list");
});

test("visible href follows the keep-alive store", () => {
  markKeepAliveSurfaceMounted("calendar");
  markKeepAliveSurfaceMounted("tasks-list");
  rememberKeepAliveHref("calendar", "/calendar", "");
  rememberKeepAliveHref("tasks-list", "/tasks", "?due=today");
  syncVisibleKeepAliveSurfaceFromRoute("calendar");
  assert.equal(visibleKeepAliveHref(), "/calendar");

  assert.equal(tryWarmKeepAliveFlip("/tasks"), true);
  assert.equal(visibleKeepAliveHref(), "/tasks?due=today");
});

test("same-pane query flip updates lastHref in the store", () => {
  markKeepAliveSurfaceMounted("tasks-list");
  rememberKeepAliveHref("tasks-list", "/tasks", "?due=today");
  syncVisibleKeepAliveSurfaceFromRoute("tasks-list");
  assert.equal(tryWarmKeepAliveFlip("/tasks?due=overdue"), true);
  assert.equal(lastHrefForKeepAliveSurface("tasks-list"), "/tasks?due=overdue");
  assert.equal(visibleKeepAliveHref(), "/tasks?due=overdue");
});

test("routerAgreesWithWindow is true without a window (SSR / node)", () => {
  assert.equal(routerAgreesWithWindow("/tasks", "?due=today"), true);
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
  assert.equal(keepAliveDestinationShowsSidePanel("/letters"), true);
});

test("inbox-sourced email hrefs update the warm inbox selection", () => {
  markKeepAliveSurfaceMounted("inbox");
  rememberKeepAliveHref("inbox", "/inbox/in-1", "");
  assert.equal(
    rememberInboxPanelSelectionHref("/email/box/msg?list=inbox"),
    true,
  );
  assert.equal(
    lastHrefForKeepAliveSurface("inbox"),
    "/email/box/msg?list=inbox",
  );
  assert.equal(
    rememberInboxPanelSelectionHref("/email/box/msg?list=inbox"),
    false,
  );
  assert.equal(rememberInboxPanelSelectionHref("/email/box/msg"), false);
  assert.equal(rememberInboxPanelSelectionHref("/inbox/in-2"), false);
});

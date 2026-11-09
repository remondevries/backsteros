import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { clearPrimedTabTitles, primeTabTitle } from "./primed-tab-title.js";
import {
  activateProductTab,
  closeProductTab,
  createDefaultTabsState,
  createProductTab,
  cycleProductTab,
  getTabTitleForHref,
  isMeetingRoomPath,
  parseMeetingRoomMeetingId,
  refreshOpenTabTaskStatuses,
  syncActiveTabTaskMeta,
  syncActiveTabToPath,
  buildProductTabHref,
} from "./tabs.js";

describe("activateProductTab", () => {
  test("switches activeTabId without rewriting any tab href", () => {
    const inbox = createProductTab("/inbox", "Inbox");
    const calendar = createProductTab("/calendar", "Calendar");
    const state = {
      tabs: [inbox, calendar],
      activeTabId: inbox.id,
    };
    const next = activateProductTab(state, calendar.id);
    assert.equal(next.activeTabId, calendar.id);
    assert.equal(next.tabs[0]?.href, "/inbox");
    assert.equal(next.tabs[1]?.href, "/calendar");
  });

  test("is a no-op when the tab is already active or missing", () => {
    const state = createDefaultTabsState("/inbox");
    assert.equal(activateProductTab(state, state.activeTabId), state);
    assert.equal(activateProductTab(state, "missing"), state);
  });
});

describe("cycleProductTab", () => {
  test("moves activeTabId and reports the target href without clobbering others", () => {
    const a = createProductTab("/inbox", "Inbox");
    const b = createProductTab("/calendar", "Calendar");
    const c = createProductTab("/journal", "Journal");
    const state = { tabs: [a, b, c], activeTabId: a.id };

    const next = cycleProductTab(state, 1);
    assert.equal(next.state.activeTabId, b.id);
    assert.equal(next.navigateHref, "/calendar");
    assert.equal(next.state.tabs[0]?.href, "/inbox");
    assert.equal(next.state.tabs[2]?.href, "/journal");

    const prev = cycleProductTab(next.state, -1);
    assert.equal(prev.state.activeTabId, a.id);
    assert.equal(prev.navigateHref, "/inbox");
  });
});

describe("closeProductTab", () => {
  test("replaces the last tab with a fresh Inbox tab", () => {
    const only = createProductTab("/calendar", "Calendar");
    const { state, navigateHref } = closeProductTab(
      { tabs: [only], activeTabId: only.id },
      only.id,
    );
    assert.equal(state.tabs.length, 1);
    assert.equal(state.tabs[0]?.href, "/inbox");
    assert.equal(state.activeTabId, state.tabs[0]?.id);
    assert.notEqual(state.tabs[0]?.id, only.id);
    assert.equal(navigateHref, "/inbox");
  });

  test("replacing a sole Inbox tab still yields a fresh Inbox tab", () => {
    const only = createProductTab("/inbox", "Inbox");
    const { state, navigateHref } = closeProductTab(
      { tabs: [only], activeTabId: only.id },
      only.id,
    );
    assert.equal(state.tabs[0]?.href, "/inbox");
    assert.notEqual(state.tabs[0]?.id, only.id);
    assert.equal(navigateHref, "/inbox");
  });

  test("closing a non-active tab does not navigate", () => {
    const a = createProductTab("/inbox", "Inbox");
    const b = createProductTab("/calendar", "Calendar");
    const { state, navigateHref } = closeProductTab(
      { tabs: [a, b], activeTabId: a.id },
      b.id,
    );
    assert.equal(state.tabs.length, 1);
    assert.equal(state.activeTabId, a.id);
    assert.equal(navigateHref, null);
  });

  test("closing the active tab activates a neighbor and navigates", () => {
    const a = createProductTab("/inbox", "Inbox");
    const b = createProductTab("/calendar", "Calendar");
    const { state, navigateHref } = closeProductTab(
      { tabs: [a, b], activeTabId: b.id },
      b.id,
    );
    assert.equal(state.tabs.length, 1);
    assert.equal(state.activeTabId, a.id);
    assert.equal(navigateHref, "/inbox");
  });
});

describe("syncActiveTabToPath", () => {
  test("does not rewrite inactive tabs when the active tab navigates", () => {
    const inbox = createProductTab("/inbox", "Inbox");
    const calendar = createProductTab("/calendar", "Calendar");
    const state = {
      tabs: [inbox, calendar],
      activeTabId: calendar.id,
    };
    const next = syncActiveTabToPath(state, "/projects");
    assert.equal(next.tabs[0]?.href, "/inbox");
    assert.equal(next.tabs[1]?.href, "/projects");
    assert.equal(next.activeTabId, calendar.id);
  });

  test("preserves sibling hrefs across an activate-then-sync sequence", () => {
    // Simulates the fixed shell path: set activeTabId first, then sync the
    // new location onto that tab only (never the previous one).
    const inbox = createProductTab("/inbox", "Inbox");
    const calendar = createProductTab("/calendar", "Calendar");
    let state = { tabs: [inbox, calendar], activeTabId: inbox.id };
    state = activateProductTab(state, calendar.id);
    state = syncActiveTabToPath(state, "/calendar");
    assert.equal(state.activeTabId, calendar.id);
    assert.equal(state.tabs[0]?.href, "/inbox");
    assert.equal(state.tabs[1]?.href, "/calendar");
  });

  test("clears task meta when the active tab navigates", () => {
    clearPrimedTabTitles();
    const first = createProductTab("/projects/bos/tasks/bos-1", "One");
    first.taskId = "t1";
    first.taskStatus = "in_progress";
    const state = { tabs: [first], activeTabId: first.id };
    const next = syncActiveTabToPath(state, "/inbox");
    assert.equal(next.tabs[0]?.href, "/inbox");
    assert.equal(next.tabs[0]?.taskId, undefined);
    assert.equal(next.tabs[0]?.taskStatus, undefined);
  });

  test("keeps a primed project name instead of Projects/Project", () => {
    clearPrimedTabTitles();
    primeTabTitle("/projects/bos", "Backsteros");
    const state = createDefaultTabsState("/projects");
    const next = syncActiveTabToPath(state, "/projects/bos");
    assert.equal(next.tabs[0]?.title, "Backsteros");
  });

  test("preserves calendar mode, view, and meeting overlay on the active tab href", () => {
    clearPrimedTabTitles();
    const state = createDefaultTabsState("/calendar");
    const next = syncActiveTabToPath(
      state,
      "/calendar",
      "?mode=timetracking&view=week&meeting=m-1&meetingLayout=page&task=abc",
    );
    assert.equal(
      next.tabs[0]?.href,
      "/calendar?mode=timetracking&view=week&meeting=m-1&meetingLayout=page",
    );
  });

  test("updates calendar query in place without changing title", () => {
    clearPrimedTabTitles();
    const state = createDefaultTabsState("/calendar?mode=timetracking");
    assert.equal(state.tabs[0]?.href, "/calendar?mode=timetracking");
    const next = syncActiveTabToPath(
      state,
      "/calendar",
      "?mode=availability&view=month",
    );
    assert.equal(
      next.tabs[0]?.href,
      "/calendar?mode=availability&view=month",
    );
    assert.equal(next.tabs[0]?.title, "Calendar");
  });
});

describe("buildProductTabHref", () => {
  test("keeps contact and organization overlay layout on tab hrefs", () => {
    assert.equal(
      buildProductTabHref("/contacts/39", "?contactLayout=page&x=1"),
      "/contacts/39?contactLayout=page",
    );
    assert.equal(
      buildProductTabHref(
        "/organizations/12",
        "?orgLayout=page&crmGroup=g1&x=1",
      ),
      "/organizations/12?orgLayout=page&crmGroup=g1",
    );
  });

  test("keeps calendar chrome params and meeting overlay", () => {
    assert.equal(buildProductTabHref("/inbox", "?foo=1"), "/inbox");
    assert.equal(
      buildProductTabHref(
        "/calendar",
        "?mode=timetracking&meeting=x&meetingLayout=page&date=2026-03-25&task=abc",
      ),
      "/calendar?mode=timetracking&date=2026-03-25&meeting=x&meetingLayout=page",
    );
  });

  test("keeps the owning list on email detail so the side panel restores", () => {
    assert.equal(
      buildProductTabHref("/email/box/msg-1", "?list=inbox&x=1"),
      "/email/box/msg-1?list=inbox",
    );
    assert.equal(
      buildProductTabHref("/drafts/d-1", "?list=communication"),
      "/drafts/d-1?list=communication",
    );
    assert.equal(buildProductTabHref("/email/box/msg-1", ""), "/email/box/msg-1");
  });
});

describe("syncActiveTabTaskMeta", () => {
  test("writes task id and status onto the active tab", () => {
    const state = createDefaultTabsState("/projects/bos/tasks/bos-1");
    const next = syncActiveTabTaskMeta(state, {
      taskId: "t1",
      taskStatus: "in_review",
    });
    assert.equal(next.tabs[0]?.taskId, "t1");
    assert.equal(next.tabs[0]?.taskStatus, "in_review");
    assert.equal(
      syncActiveTabTaskMeta(next, { taskId: "t1", taskStatus: "in_review" }),
      next,
    );
  });
});

describe("refreshOpenTabTaskStatuses", () => {
  test("updates background tabs from the status map", () => {
    const a = createProductTab("/tasks/a", "A");
    a.taskId = "ta";
    a.taskStatus = "backlog";
    const b = createProductTab("/tasks/b", "B");
    b.taskId = "tb";
    b.taskStatus = "in_progress";
    const state = { tabs: [a, b], activeTabId: a.id };
    const next = refreshOpenTabTaskStatuses(
      state,
      new Map([
        ["ta", "completed"],
        ["tb", "in_progress"],
      ]),
    );
    assert.equal(next.tabs[0]?.taskStatus, "completed");
    assert.equal(next.tabs[1]?.taskStatus, "in_progress");
  });
});

describe("getTabTitleForHref", () => {
  test("labels the meeting Director room route", () => {
    assert.equal(
      getTabTitleForHref("/calendar/meetings/abc-uuid/room"),
      "Meeting",
    );
  });
});

describe("isMeetingRoomPath", () => {
  test("detects Director room routes only", () => {
    assert.equal(
      isMeetingRoomPath("/calendar/meetings/abc-uuid/room"),
      true,
    );
    assert.equal(
      isMeetingRoomPath("/calendar/meetings/abc-uuid"),
      false,
    );
    assert.equal(
      parseMeetingRoomMeetingId("/calendar/meetings/abc%2Fid/room"),
      "abc/id",
    );
  });
});

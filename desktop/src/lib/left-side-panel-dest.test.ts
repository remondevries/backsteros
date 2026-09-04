import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveLeftSidePanelDest } from "./left-side-panel-dest.ts";

test("warm dests resolve to keep-alive surfaces", () => {
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/inbox",
      inInboxPanel: true,
      financeSection: false,
      showSidePanel: true,
    }),
    "inbox",
  );
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/knowledge/note",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: true,
    }),
    "knowledge",
  );
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/letters/l-1",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: true,
    }),
    "letters",
  );
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/journal/2026-08-26",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: true,
    }),
    "journal-day",
  );
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/journal/habits",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: true,
    }),
    "journal-habits",
  );
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/calendar",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: true,
    }),
    "calendar",
  );
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/contacts",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: true,
    }),
    "contacts",
  );
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/contacts/1",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: true,
    }),
    "contacts",
  );
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/contacts/1/tasks/c-3",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: true,
    }),
    "contacts",
  );
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/contacts/1/meetings/abc",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: true,
    }),
    "contacts",
  );
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/contacts/1/letters/l-1",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: true,
    }),
    "contacts",
  );
});

test("finance remounts live; settings/tasks have no left list dest", () => {
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/finance/dashboard",
      inInboxPanel: false,
      financeSection: true,
      showSidePanel: true,
    }),
    "finance",
  );
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/settings/general",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: false,
    }),
    null,
  );
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/tasks",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: false,
    }),
    null,
  );
});

test("inbox on email keeps the warm inbox dest", () => {
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/email/box/msg",
      search: "?list=inbox",
      inInboxPanel: true,
      financeSection: false,
      showSidePanel: true,
    }),
    "inbox",
  );
});

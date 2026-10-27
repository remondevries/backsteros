import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { resolveLeftSidePanelDest } from "./left-side-panel-dest.ts";
import {
  markKeepAliveSurfaceMounted,
  rememberKeepAliveHref,
  resetKeepAliveForTests,
} from "./shell-warm-keep-alive.ts";

afterEach(() => {
  resetKeepAliveForTests();
});

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
      pathname: "/spaces/note",
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
      pathname: "/settings/account",
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

test("stale /inbox router match during dismiss does not force inbox dest", () => {
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/inbox",
      inInboxPanel: true,
      financeSection: false,
      showSidePanel: false,
      visibleSurface: null,
    }),
    null,
  );
});

test("plain /inbox with showSidePanel still resolves via pathname", () => {
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/inbox",
      inInboxPanel: true,
      financeSection: false,
      showSidePanel: true,
      visibleSurface: null,
    }),
    "inbox",
  );
});

test("communication has no shell left panel (embedded chat list)", () => {
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/email/box/msg",
      search: "?list=communication",
      inInboxPanel: false,
      inCommunicationPanel: true,
      financeSection: false,
      showSidePanel: true,
    }),
    null,
  );
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/communication/sup-1",
      inInboxPanel: false,
      inCommunicationPanel: true,
      financeSection: false,
      showSidePanel: true,
    }),
    null,
  );
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/communication",
      inInboxPanel: false,
      inCommunicationPanel: true,
      financeSection: false,
      showSidePanel: false,
    }),
    null,
  );
});

test("visible warm surface wins over stale chrome pathname", () => {
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/communication",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: false,
      visibleSurface: "inbox",
    }),
    "inbox",
  );
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/communication",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: false,
      visibleSurface: "calendar",
    }),
    "calendar",
  );
  // Communication is showing — do not reopen Inbox from a lagging pathname.
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/inbox",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: true,
      visibleSurface: "communication",
    }),
    null,
  );
});

test("outlet transition pending blocks stale pathname list dest", () => {
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/inbox",
      inInboxPanel: true,
      financeSection: false,
      showSidePanel: true,
      visibleSurface: null,
      outletTransitionPending: true,
    }),
    null,
  );
});

test("outlet transition pending keeps inbox while address bar is still email", () => {
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/inbox",
      inInboxPanel: true,
      financeSection: false,
      showSidePanel: true,
      visibleSurface: null,
      outletTransitionPending: true,
      windowHref: "/email/box/msg?list=inbox",
    }),
    "inbox",
  );
});

test("outlet transition pending does not revive inbox from stale email lastHref on calendar", () => {
  markKeepAliveSurfaceMounted("inbox");
  rememberKeepAliveHref("inbox", "/email/box/msg", "?list=inbox");
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/calendar",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: true,
      visibleSurface: null,
      outletTransitionPending: true,
    }),
    null,
  );
});

test("outlet transition pending does not revive inbox from email lastHref on plain /inbox", () => {
  markKeepAliveSurfaceMounted("inbox");
  rememberKeepAliveHref("inbox", "/email/box/msg", "?list=inbox");
  // First-visit leave Inbox → Calendar: window still /inbox until TanStack
  // navigates; do not keep the column open from a mirrored email lastHref.
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/inbox",
      inInboxPanel: true,
      financeSection: false,
      showSidePanel: true,
      visibleSurface: null,
      outletTransitionPending: true,
    }),
    null,
  );
});

test("stale TanStack email after warm dismiss does not revive inbox", () => {
  markKeepAliveSurfaceMounted("inbox");
  rememberKeepAliveHref("inbox", "/email/box/msg", "?list=inbox");
  // Host falls back to TanStack `/email?list=inbox` once visible is cleared,
  // but the address bar already moved to Settings via warm pushState.
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/email/box/msg",
      search: "?list=inbox",
      inInboxPanel: true,
      financeSection: false,
      showSidePanel: true,
      visibleSurface: null,
      outletTransitionPending: true,
      windowHref: "/settings/account",
    }),
    null,
  );
});

test("outlet transition pending keeps finance from trusted chrome", () => {
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/calendar",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: false,
      visibleSurface: null,
      outletTransitionPending: true,
      windowHref: "/finance/dashboard",
    }),
    "finance",
  );
});

test("chrome ahead of TanStack without pending resolves dest from address bar", () => {
  // Popstate onto Finance while the router still reports Calendar.
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/calendar",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: true,
      visibleSurface: null,
      outletTransitionPending: false,
      windowHref: "/finance/dashboard",
    }),
    "finance",
  );
  // Popstate onto Settings must not revive Calendar from a stale router match.
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/calendar",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: true,
      visibleSurface: null,
      outletTransitionPending: false,
      windowHref: "/settings/account",
    }),
    null,
  );
  // Do not open Calendar list over a lagging Settings outlet match.
  assert.equal(
    resolveLeftSidePanelDest({
      pathname: "/settings/account",
      inInboxPanel: false,
      financeSection: false,
      showSidePanel: false,
      visibleSurface: null,
      outletTransitionPending: false,
      windowHref: "/calendar",
    }),
    null,
  );
});

test("tab-flip matrix: showSidePanel follows dest only", () => {
  const cases: Array<{
    name: string;
    input: Parameters<typeof resolveLeftSidePanelDest>[0];
    dest: ReturnType<typeof resolveLeftSidePanelDest>;
  }> = [
    {
      name: "Inbox warm",
      input: {
        pathname: "/inbox/in-1",
        inInboxPanel: false,
        financeSection: false,
        showSidePanel: false,
        visibleSurface: "inbox",
      },
      dest: "inbox",
    },
    {
      name: "Communication warm",
      input: {
        pathname: "/communication",
        inInboxPanel: false,
        financeSection: false,
        showSidePanel: false,
        visibleSurface: "communication",
      },
      dest: null,
    },
    {
      name: "Tasks warm (no shell list)",
      input: {
        pathname: "/tasks",
        inInboxPanel: false,
        financeSection: false,
        showSidePanel: false,
        visibleSurface: "tasks-list",
      },
      dest: null,
    },
    {
      name: "Email Outlet from Inbox",
      input: {
        pathname: "/email/box/msg",
        search: "?list=inbox",
        inInboxPanel: true,
        financeSection: false,
        showSidePanel: true,
        visibleSurface: null,
      },
      dest: "inbox",
    },
    {
      name: "Finance outlet",
      input: {
        pathname: "/finance/dashboard",
        inInboxPanel: false,
        financeSection: true,
        showSidePanel: true,
        visibleSurface: null,
      },
      dest: "finance",
    },
    {
      name: "Settings outlet",
      input: {
        pathname: "/settings/account",
        inInboxPanel: false,
        financeSection: false,
        showSidePanel: false,
        visibleSurface: null,
      },
      dest: null,
    },
  ];

  for (const entry of cases) {
    const dest = resolveLeftSidePanelDest(entry.input);
    assert.equal(dest, entry.dest, entry.name);
    // Host rule: column open iff dest != null.
    assert.equal(dest != null, entry.dest != null, `${entry.name} show`);
  }
});

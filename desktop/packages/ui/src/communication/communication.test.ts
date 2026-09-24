import assert from "node:assert/strict";
import { test } from "node:test";

import {
  filterCommunicationListItems,
  getCommunicationChannelHref,
  getCommunicationItemHref,
  parseCommunicationChannelFromSearch,
  parseCommunicationInboxIdFromSearch,
  parseCommunicationStatusFromSearch,
  parseCommunicationListFilter,
  communicationListFilterEmptyLabel,
  resolveActiveCommunicationChannel,
  resolveActiveCommunicationInboxId,
  resolveActiveCommunicationStatus,
} from "./communication.js";
import type { InboxListItem } from "../inbox/inbox-items.js";

test("parseCommunicationListFilter accepts known values", () => {
  assert.equal(parseCommunicationListFilter("email"), "email");
  assert.equal(parseCommunicationListFilter("Support"), "support");
  assert.equal(parseCommunicationListFilter("nope"), "all");
});

test("parseCommunicationChannelFromSearch reads ?channel=", () => {
  assert.equal(parseCommunicationChannelFromSearch(""), "all");
  assert.equal(parseCommunicationChannelFromSearch("?channel=email"), "email");
  assert.equal(
    parseCommunicationChannelFromSearch("channel=support"),
    "support",
  );
});

test("getCommunicationChannelHref uses explicit channel query", () => {
  assert.equal(
    getCommunicationChannelHref("all"),
    "/communication?channel=all",
  );
  assert.equal(
    getCommunicationChannelHref("email"),
    "/communication?channel=email",
  );
  assert.equal(
    getCommunicationChannelHref("email", { inboxId: "box-1" }),
    "/communication?channel=email&inbox=box-1",
  );
  assert.equal(
    getCommunicationChannelHref("email", {
      inboxId: "box-1",
      status: "in_progress",
    }),
    "/communication?channel=email&inbox=box-1&status=in_progress",
  );
});

test("parseCommunicationInboxIdFromSearch reads ?inbox=", () => {
  assert.equal(parseCommunicationInboxIdFromSearch(""), null);
  assert.equal(
    parseCommunicationInboxIdFromSearch("?channel=email&inbox=box-1"),
    "box-1",
  );
});

test("parseCommunicationStatusFromSearch reads ?status=", () => {
  assert.equal(parseCommunicationStatusFromSearch(""), null);
  assert.equal(
    parseCommunicationStatusFromSearch(
      "?channel=email&inbox=box-1&status=in_progress",
    ),
    "in_progress",
  );
  assert.equal(
    parseCommunicationStatusFromSearch(
      "?channel=email&inbox=box-1&status=nope",
    ),
    null,
  );
});

test("resolveActiveCommunicationInboxId from list and email detail", () => {
  assert.equal(
    resolveActiveCommunicationInboxId({
      pathname: "/communication",
      search: "?channel=email&inbox=box-1",
    }),
    "box-1",
  );
  assert.equal(
    resolveActiveCommunicationInboxId({
      pathname: "/email/box-1/msg-9",
      search: "?list=communication",
    }),
    "box-1",
  );
  assert.equal(
    resolveActiveCommunicationInboxId({
      pathname: "/communication",
      search: "?channel=email",
    }),
    null,
  );
});

test("resolveActiveCommunicationStatus from list query", () => {
  assert.equal(
    resolveActiveCommunicationStatus({
      pathname: "/communication",
      search: "?channel=email&inbox=box-1&status=completed",
    }),
    "completed",
  );
  assert.equal(
    resolveActiveCommunicationStatus({
      pathname: "/communication",
      search: "?channel=email&inbox=box-1",
    }),
    null,
  );
});

test("filterCommunicationListItems can scope to one mailbox", () => {
  const items = [
    { kind: "email", id: "e1", inboxId: "box-a", messageId: "m1" },
    { kind: "email", id: "e2", inboxId: "box-b", messageId: "m2" },
    { kind: "task", id: "t1", support: true },
  ] as InboxListItem[];
  assert.deepEqual(
    filterCommunicationListItems(items, "email", "box-a").map((item) => item.id),
    ["e1"],
  );
});

test("filterCommunicationListItems can scope to mailbox status folder", () => {
  const items = [
    {
      kind: "email",
      id: "e1",
      inboxId: "box-a",
      messageId: "m1",
      status: "triage",
    },
    {
      kind: "email",
      id: "e2",
      inboxId: "box-a",
      messageId: "m2",
      status: "in_progress",
    },
    {
      kind: "email",
      id: "e3",
      inboxId: "box-b",
      messageId: "m3",
      status: "in_progress",
    },
  ] as InboxListItem[];
  assert.deepEqual(
    filterCommunicationListItems(
      items,
      "email",
      "box-a",
      "in_progress",
    ).map((item) => item.id),
    ["e2"],
  );
});

test("resolveActiveCommunicationChannel prefers email/support detail", () => {
  assert.equal(
    resolveActiveCommunicationChannel({
      pathname: "/email/box/msg",
      search: "?list=communication",
    }),
    "email",
  );
  assert.equal(
    resolveActiveCommunicationChannel({
      pathname: "/email/box/msg",
      search: "?list=communication&channel=all",
    }),
    "all",
  );
  assert.equal(
    resolveActiveCommunicationChannel({
      pathname: "/communication/sup-1",
      search: "",
    }),
    "support",
  );
  assert.equal(
    resolveActiveCommunicationChannel({
      pathname: "/communication/sup-1",
      search: "?channel=all",
    }),
    "all",
  );
  assert.equal(
    resolveActiveCommunicationChannel({
      pathname: "/communication",
      search: "?channel=email",
    }),
    "email",
  );
});

test("getCommunicationItemHref keeps channel for breadcrumbs", () => {
  const emailItem = {
    kind: "email",
    id: "e1",
    inboxId: "box-a",
    messageId: "m1",
  } as InboxListItem;
  assert.equal(
    getCommunicationItemHref(emailItem, [], { channel: "all" }),
    "/email/box-a/m1?list=communication&channel=all",
  );
  assert.equal(
    getCommunicationItemHref(emailItem, [], {
      channel: "email",
      inboxId: "box-a",
    }),
    "/email/box-a/m1?list=communication&channel=email&inbox=box-a",
  );
  assert.equal(
    getCommunicationItemHref(emailItem, [], {
      channel: "email",
      inboxId: "box-a",
      status: "triage",
    }),
    "/email/box-a/m1?list=communication&channel=email&inbox=box-a&status=triage",
  );
});

test("filterCommunicationListItems splits email and support", () => {
  const items = [
    { kind: "email", id: "e1" },
    { kind: "task", id: "t1", support: true },
    { kind: "letter", id: "l1" },
  ] as InboxListItem[];
  assert.deepEqual(
    filterCommunicationListItems(items, "email").map((item) => item.id),
    ["e1"],
  );
  assert.deepEqual(
    filterCommunicationListItems(items, "support").map((item) => item.id),
    ["t1"],
  );
  assert.equal(filterCommunicationListItems(items, "all").length, 3);
});

test("communicationListFilterEmptyLabel matches filter", () => {
  assert.match(communicationListFilterEmptyLabel("email"), /email/i);
  assert.match(communicationListFilterEmptyLabel("whatsapp"), /WhatsApp/i);
  assert.match(communicationListFilterEmptyLabel("chat"), /chat/i);
  assert.match(communicationListFilterEmptyLabel("support"), /support/i);
  assert.match(communicationListFilterEmptyLabel("all"), /email/i);
});

test("filterCommunicationListItems leaves whatsapp and chat empty for now", () => {
  const items = [
    { kind: "email", id: "e1" },
    { kind: "task", id: "t1", support: true },
  ] as InboxListItem[];
  assert.deepEqual(filterCommunicationListItems(items, "whatsapp"), []);
  assert.deepEqual(filterCommunicationListItems(items, "chat"), []);
});

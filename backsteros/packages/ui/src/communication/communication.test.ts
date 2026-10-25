import assert from "node:assert/strict";
import { test } from "node:test";

import {
  filterCommunicationListItems,
  getCommunicationChannelHref,
  getCommunicationHref,
  getCommunicationHrefAfterRemovingRow,
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
  assert.equal(parseCommunicationListFilter("nope"), "chat");
});

test("parseCommunicationChannelFromSearch reads ?channel=", () => {
  assert.equal(parseCommunicationChannelFromSearch(""), "chat");
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

test("getCommunicationHrefAfterRemovingRow prefers the row above", () => {
  const items = [
    {
      kind: "email",
      id: "email:box:a",
      inboxId: "box",
      messageId: "a",
    },
    {
      kind: "email",
      id: "email:box:b",
      inboxId: "box",
      messageId: "b",
    },
    {
      kind: "email",
      id: "email:box:c",
      inboxId: "box",
      messageId: "c",
    },
  ] as InboxListItem[];
  assert.equal(
    getCommunicationHrefAfterRemovingRow({ items, removedId: "email:box:b" }),
    getCommunicationHref("email:box:a", "chat"),
  );
  assert.equal(
    getCommunicationHrefAfterRemovingRow({ items, removedId: "email:box:a" }),
    getCommunicationHref("email:box:b", "chat"),
  );
  assert.equal(
    getCommunicationHrefAfterRemovingRow({
      items: [items[0]!],
      removedId: "email:box:a",
    }),
    null,
  );
});

test("getCommunicationHrefAfterRemovingRow follows on-screen order", () => {
  const items = [
    { kind: "email", id: "email:box:a", inboxId: "box", messageId: "a" },
    {
      kind: "email",
      id: "email:box:draft",
      inboxId: "box",
      messageId: "draft-msg",
      draftId: "d1",
    },
    { kind: "email", id: "email:box:c", inboxId: "box", messageId: "c" },
  ] as InboxListItem[];
  const visibleRowIds = [
    "email:box:draft",
    "chat-uuid",
    "email:box:c",
    "email:box:a",
  ];
  // Resolved by draft id; first row so it falls through to the next one.
  assert.equal(
    getCommunicationHrefAfterRemovingRow({
      items,
      removedId: "d1",
      visibleRowIds,
    }),
    getCommunicationHref("chat-uuid", "chat"),
  );
  // Resolved by message id; row above is a chat conversation.
  assert.equal(
    getCommunicationHrefAfterRemovingRow({
      items,
      removedId: "c",
      visibleRowIds,
    }),
    getCommunicationHref("chat-uuid", "chat"),
  );
  assert.equal(
    getCommunicationHrefAfterRemovingRow({
      items,
      removedId: "email:box:a",
      visibleRowIds,
    }),
    getCommunicationHref("email:box:c", "chat"),
  );
});

test("getCommunicationItemHref embeds email under /communication", () => {
  const emailItem = {
    kind: "email",
    id: "email:box-a:m1",
    inboxId: "box-a",
    messageId: "m1",
  } as InboxListItem;
  assert.equal(
    getCommunicationItemHref(emailItem, [], { channel: "all" }),
    "/communication/email%3Abox-a%3Am1?channel=chat",
  );
  assert.equal(
    getCommunicationItemHref(emailItem, [], {
      channel: "email",
      inboxId: "box-a",
    }),
    "/communication/email%3Abox-a%3Am1?channel=chat",
  );
  assert.equal(
    getCommunicationItemHref(emailItem, [], { channel: "chat" }),
    "/communication/email%3Abox-a%3Am1?channel=chat",
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

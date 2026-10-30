import assert from "node:assert/strict";
import { test } from "node:test";

import { EMPTY_MENTION_CATALOG } from "./empty-catalog.js";
import {
  mentionTokenLabel,
  parseMentionToken,
} from "./mention-tokens.js";
import type { MentionCatalog } from "./mention-menu-types.js";
import { buildMentionSections } from "./search-catalog.js";
import { buildMentionToken, resolveMentionHref } from "./tokens.js";

const HABIT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const MESSAGE_ID = "11111111-2222-4333-8444-555555555555";
const POST_ID = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const TX_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const MEETING_ID = "99999999-aaaa-4bbb-8ccc-dddddddddddd";

const catalog: MentionCatalog = {
  ...EMPTY_MENTION_CATALOG,
  meetings: [
    {
      id: MEETING_ID,
      displayId: "M-14",
      title: "Design sync",
      startAt: Date.parse("2026-10-31T10:00:00.000Z"),
      endAt: Date.parse("2026-10-31T10:45:00.000Z"),
      status: "scheduled",
      summary: "Cards",
      location: null,
      projectId: null,
      projectKey: null,
      projectName: "BacksterOS",
      projectIcon: null,
      organizationName: null,
    },
  ],
  journals: [
    {
      id: "j1",
      date: "2026-10-30",
      title: "Thursday notes",
      snippet: "Shipped cards",
      updatedAt: null,
    },
  ],
  habits: [
    {
      id: HABIT_ID,
      title: "Write daily notes",
      icon: null,
      cadence: "daily",
      date: "2026-10-30",
      completed: true,
      taskDisplayId: null,
    },
  ],
  messages: [
    {
      id: MESSAGE_ID,
      channelType: "whatsapp",
      title: "Ada · WhatsApp",
      contactName: "Ada Lovelace",
      preview: "Hello",
      status: "open",
      lastActivityAt: null,
    },
  ],
  posts: [
    {
      id: POST_ID,
      platform: "linkedin",
      title: "Shipping chat UI",
      body: "Expandable cards",
      authorHandle: "@backsteros",
      status: "scheduled",
      postedAt: null,
      scheduledAt: null,
    },
  ],
  transactions: [
    {
      id: TX_ID,
      title: "Cursor Pro",
      amountCents: -2000,
      currency: "EUR",
      bookedOn: "2026-10-28",
      accountName: "Business",
      categoryName: "Software",
      counterparty: null,
      notes: null,
    },
  ],
};

test("parseMentionToken accepts meeting / journal / habit / message / post / transaction / invoice / estimate", () => {
  assert.deepEqual(parseMentionToken("[@meeting:M-14]"), {
    kind: "meeting",
    displayId: "M-14",
    raw: "[@meeting:M-14]",
  });
  assert.deepEqual(parseMentionToken("[@journal:2026-10-30]"), {
    kind: "journal",
    date: "2026-10-30",
    raw: "[@journal:2026-10-30]",
  });
  assert.deepEqual(parseMentionToken(`[@habit:${HABIT_ID}]`), {
    kind: "habit",
    habitId: HABIT_ID,
    date: null,
    raw: `[@habit:${HABIT_ID}]`,
  });
  assert.deepEqual(parseMentionToken(`[@habit:${HABIT_ID}/2026-10-30]`), {
    kind: "habit",
    habitId: HABIT_ID,
    date: "2026-10-30",
    raw: `[@habit:${HABIT_ID}/2026-10-30]`,
  });
  assert.deepEqual(parseMentionToken(`[@message:${MESSAGE_ID}]`), {
    kind: "message",
    id: MESSAGE_ID,
    raw: `[@message:${MESSAGE_ID}]`,
  });
  assert.deepEqual(parseMentionToken(`[@post:${POST_ID}]`), {
    kind: "post",
    id: POST_ID,
    raw: `[@post:${POST_ID}]`,
  });
  assert.deepEqual(parseMentionToken(`[@transaction:${TX_ID}]`), {
    kind: "transaction",
    id: TX_ID,
    raw: `[@transaction:${TX_ID}]`,
  });
  assert.deepEqual(parseMentionToken(`[@invoice:${TX_ID}]`), {
    kind: "invoice",
    id: TX_ID,
    raw: `[@invoice:${TX_ID}]`,
  });
  assert.deepEqual(parseMentionToken(`[@estimate:${TX_ID}]`), {
    kind: "estimate",
    id: TX_ID,
    raw: `[@estimate:${TX_ID}]`,
  });
});

test("parseMentionToken rejects invalid journal and habit values", () => {
  assert.equal(parseMentionToken("[@journal:not-a-date]"), null);
  assert.equal(parseMentionToken(`[@habit:${HABIT_ID}/10-30]`), null);
});

test("mentionTokenLabel and buildMentionToken round-trip new kinds", () => {
  assert.equal(mentionTokenLabel(parseMentionToken("[@meeting:M-14]")!), "M-14");
  assert.equal(
    mentionTokenLabel(parseMentionToken("[@journal:2026-10-30]")!),
    "2026-10-30",
  );
  assert.equal(
    buildMentionToken({
      kind: "meeting",
      id: MEETING_ID,
      displayId: "M-14",
      title: "Design sync",
      startAt: null,
      projectName: null,
    }),
    "[@meeting:M-14]",
  );
  assert.equal(
    buildMentionToken({
      kind: "journal",
      id: "j1",
      date: "2026-10-30",
      title: "Thursday notes",
    }),
    "[@journal:2026-10-30]",
  );
  assert.equal(
    buildMentionToken({
      kind: "habit",
      id: HABIT_ID,
      title: "Write daily notes",
      icon: null,
      date: "2026-10-30",
    }),
    `[@habit:${HABIT_ID}/2026-10-30]`,
  );
  assert.equal(
    buildMentionToken({
      kind: "message",
      id: MESSAGE_ID,
      channelType: "whatsapp",
      title: "Ada",
      contactName: null,
    }),
    `[@message:${MESSAGE_ID}]`,
  );
});

test("resolveMentionHref maps new kinds to routes", () => {
  assert.equal(
    resolveMentionHref(parseMentionToken("[@meeting:M-14]")!, catalog),
    `/calendar/meetings/${MEETING_ID}`,
  );
  assert.equal(
    resolveMentionHref(parseMentionToken("[@journal:2026-10-30]")!, catalog),
    "/journal/2026-10-30",
  );
  assert.equal(
    resolveMentionHref(
      parseMentionToken(`[@habit:${HABIT_ID}/2026-10-30]`)!,
      catalog,
    ),
    `/journal/habits/${HABIT_ID}?date=2026-10-30`,
  );
  assert.equal(
    resolveMentionHref(parseMentionToken(`[@message:${MESSAGE_ID}]`)!, catalog),
    `/communication/${MESSAGE_ID}`,
  );
  assert.equal(
    resolveMentionHref(parseMentionToken(`[@post:${POST_ID}]`)!, catalog),
    `/social/post/${POST_ID}`,
  );
  assert.equal(
    resolveMentionHref(parseMentionToken(`[@transaction:${TX_ID}]`)!, catalog),
    `/finance/transactions?tx=${TX_ID}`,
  );
});

test("buildMentionSections finds new kinds by query", () => {
  const byMeeting = buildMentionSections(catalog, "M-14");
  assert.ok(byMeeting.some((section) => section.kind === "meeting"));

  const byJournal = buildMentionSections(catalog, "2026-10-30");
  assert.ok(byJournal.some((section) => section.kind === "journal"));

  const byHabit = buildMentionSections(catalog, "Write daily");
  assert.ok(byHabit.some((section) => section.kind === "habit"));

  const byMessage = buildMentionSections(catalog, "WhatsApp");
  assert.ok(byMessage.some((section) => section.kind === "message"));

  const byPost = buildMentionSections(catalog, "linkedin");
  assert.ok(byPost.some((section) => section.kind === "post"));

  const byTx = buildMentionSections(catalog, "Cursor");
  assert.ok(byTx.some((section) => section.kind === "transaction"));
});

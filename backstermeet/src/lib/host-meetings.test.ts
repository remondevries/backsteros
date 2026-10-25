import assert from "node:assert/strict";
import test from "node:test";

import {
  createQuickCallMeeting,
  fetchHostMeetings,
  filterHostMeetings,
  formatHostMeetingWhen,
  type HostMeeting,
  mapHostMeeting,
  markHostMeetingRoomClosed,
  markHostMeetingRoomOpened,
} from "./host-meetings";

const NOW = new Date("2026-10-25T12:00:00.000Z");

function meeting(overrides: Partial<HostMeeting>): HostMeeting {
  return {
    id: "m",
    number: 1,
    title: "Meeting",
    status: "ready_to_start",
    format: "video_call",
    startAt: null,
    endAt: null,
    createdAt: null,
    ...overrides,
  };
}

type FetchCall = { url: string; init?: RequestInit };

function stubFetch(status: number, body: unknown): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return calls;
}

const realFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test("mapHostMeeting requires id, title and a finite number", () => {
  assert.deepEqual(
    mapHostMeeting({ id: " m1 ", title: " Kickoff ", number: 7, startAt: "2026-10-25T10:00:00Z" }),
    {
      id: "m1",
      number: 7,
      title: "Kickoff",
      status: "ready_to_start",
      format: null,
      startAt: "2026-10-25T10:00:00Z",
      endAt: null,
      createdAt: null,
    },
  );
  assert.equal(mapHostMeeting({ id: "m1", title: "", number: 1 }), null);
  assert.equal(mapHostMeeting({ id: "", title: "x", number: 1 }), null);
  assert.equal(mapHostMeeting({ id: "m1", title: "x", number: Number.NaN }), null);
  assert.equal(mapHostMeeting({ id: "m1", title: "x", number: "1" }), null);
});

test("filterHostMeetings drops closed statuses and ended meetings (except unstarted backlog), sorts by start then number", () => {
  const rows = [
    meeting({ id: "canceled", status: "Canceled", startAt: "2026-10-25T13:00:00Z" }),
    meeting({ id: "ended-long-ago", startAt: "2026-10-25T09:00:00Z", endAt: "2026-10-25T10:30:00Z" }),
    meeting({ id: "ended-recently", number: 3, startAt: "2026-10-25T10:00:00Z", endAt: "2026-10-25T11:30:00Z" }),
    meeting({ id: "open-ended", number: 2, startAt: "2026-10-25T08:00:00Z" }),
    meeting({ id: "unscheduled-b", number: 9 }),
    meeting({ id: "unscheduled-a", number: 4 }),
    meeting({ id: "end-only-past", number: 5, status: "backlog", endAt: "2026-10-20T10:00:00Z" }),
    meeting({ id: "end-only-future", number: 6, endAt: "2026-10-25T14:00:00Z" }),
    meeting({ id: "end-only-past-ready", number: 7, endAt: "2026-10-20T10:00:00Z" }),
  ];
  assert.deepEqual(
    filterHostMeetings(rows, NOW).map((row) => row.id),
    ["open-ended", "ended-recently", "unscheduled-a", "end-only-past", "end-only-future", "unscheduled-b"],
  );
});

test("formatHostMeetingWhen labels unscheduled, open-ended and live meetings", () => {
  assert.equal(formatHostMeetingWhen(null, null, NOW), "All day · not started");
  assert.equal(formatHostMeetingWhen(null, "2026-10-25T13:00:00Z", NOW), "");
  assert.equal(formatHostMeetingWhen("2026-10-25T11:00:00Z", null, NOW), "In progress · open-ended");
  assert.equal(formatHostMeetingWhen("2026-10-25T13:00:00Z", null, NOW), "Scheduled");
  assert.equal(formatHostMeetingWhen("2026-10-25T11:00:00Z", "2026-10-25T13:00:00Z", NOW), "In progress");
  assert.match(formatHostMeetingWhen("2026-10-26T09:00:00Z", "2026-10-26T10:00:00Z", NOW), / · .+ – .+/);
});

test("markHostMeetingRoomOpened stamps start only for unscheduled meetings", async () => {
  const scheduled = meeting({ startAt: "2026-10-25T11:00:00Z" });
  const untouched = stubFetch(200, {});
  assert.equal(await markHostMeetingRoomOpened(scheduled), scheduled);
  assert.equal(untouched.length, 0);

  const calls = stubFetch(200, { id: "m", number: 1, title: "Meeting", status: "in_progress", startAt: "x" });
  const opened = await markHostMeetingRoomOpened(meeting({ id: "m 1" }));
  assert.equal(opened.status, "in_progress");
  assert.equal(calls[0].url, "/api/backsteros/meetings/m%201");
  assert.equal(calls[0].init?.method, "PATCH");
  const body = JSON.parse(String(calls[0].init?.body)) as { startAt: string; status: string };
  assert.equal(body.status, "in_progress");
  assert.ok(!Number.isNaN(Date.parse(body.startAt)));
});

test("markHostMeetingRoomClosed stamps end after start, bumping a sub-second room by a minute", async () => {
  const notStarted = meeting({});
  const closedAlready = meeting({ startAt: "2026-10-25T11:00:00Z", endAt: "2026-10-25T11:30:00Z" });
  const none = stubFetch(200, {});
  assert.equal(await markHostMeetingRoomClosed(notStarted), notStarted);
  assert.equal(await markHostMeetingRoomClosed(closedAlready), closedAlready);
  assert.equal(none.length, 0);

  const future = new Date(Date.now() + 10 * 60_000).toISOString();
  const calls = stubFetch(200, { id: "m", number: 1, title: "Meeting", endAt: "x" });
  await markHostMeetingRoomClosed(meeting({ startAt: future }));
  const body = JSON.parse(String(calls[0].init?.body)) as { endAt: string };
  assert.equal(Date.parse(body.endAt), Date.parse(future) + 60_000);

  const past = "2026-01-01T00:00:00.000Z";
  const pastCalls = stubFetch(200, { id: "m", number: 1, title: "Meeting", endAt: "x" });
  const before = Date.now();
  await markHostMeetingRoomClosed(meeting({ startAt: past }));
  const pastEnd = Date.parse((JSON.parse(String(pastCalls[0].init?.body)) as { endAt: string }).endAt);
  assert.ok(pastEnd >= before && pastEnd <= Date.now());
});

test("createQuickCallMeeting posts an open-ended in-progress video call", async () => {
  const calls = stubFetch(201, { id: "q", number: 2, title: "Quick call", status: "in_progress" });
  const created = await createQuickCallMeeting("   ");
  assert.equal(created.id, "q");
  const body = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
  assert.equal(body.title, "Quick call");
  assert.equal(body.endAt, null);
  assert.equal(body.format, "video_call");
  assert.equal(body.status, "in_progress");

  stubFetch(201, { id: "q", number: 2, title: "x" });
  await createQuickCallMeeting("x".repeat(600));
});

test("API errors surface the server message", async () => {
  stubFetch(200, { meetings: [{ id: "a", title: "A", number: 1 }, { id: "", title: "bad", number: 2 }] });
  assert.deepEqual((await fetchHostMeetings()).map((row) => row.id), ["a"]);

  stubFetch(502, { error: "upstream down" });
  await assert.rejects(fetchHostMeetings(), /upstream down/);

  stubFetch(400, { error: { message: "endAt must be after startAt" } });
  await assert.rejects(markHostMeetingRoomClosed(meeting({ startAt: "2026-01-01T00:00:00Z" })), /endAt must be after startAt/);

  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  await assert.rejects(fetchHostMeetings(), /Could not reach the meetings API/);
});

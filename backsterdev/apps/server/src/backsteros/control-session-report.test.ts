import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildControlSessionReportCommentBody,
  buildControlSessionReportSummary,
  controlSessionReportState,
  maybeReportControlSessionOutcome,
  noteControlSessionReportWorking,
  postControlSessionWebhook,
  resetControlSessionReportStateForTests,
  resolveControlReportWebhookConfig,
  type ControlSessionReportPayload,
} from "./control-session-report.ts";

describe("controlSessionReportState", () => {
  it("maps failed turns to error, blocked to blocked, and in_review promotions to completed", () => {
    expect(controlSessionReportState("idle", { failedToComplete: true })).toBe("error");
    expect(controlSessionReportState("blocked")).toBe("blocked");
    expect(controlSessionReportState("done")).toBe("completed");
    expect(controlSessionReportState("idle", { promotingToInReview: true })).toBe("completed");
    expect(controlSessionReportState("working")).toBeNull();
    expect(controlSessionReportState("idle")).toBeNull();
  });
});

describe("control session report copy", () => {
  it("builds a short comment with state, summary, commits, and lastError", () => {
    const payload: ControlSessionReportPayload = {
      taskRef: "BDV-64",
      threadId: "thread-1",
      state: "completed",
      summary: "Control session completed · Ship the reporter.",
      commits: ["abc1234", "def5678"],
      lastError: null,
      at: "2026-10-24T12:00:00.000Z",
    };
    const body = buildControlSessionReportCommentBody(payload);
    expect(body).toContain("**completed**");
    expect(body).toContain("Ship the reporter");
    expect(body).toContain("`abc1234`");
    expect(body).not.toContain("transcript");
  });

  it("includes lastError for error summaries without dumping a transcript", () => {
    expect(
      buildControlSessionReportSummary({
        state: "error",
        title: "Fix promote",
        lastError: "driver mismatch",
      }),
    ).toContain("driver mismatch");
    expect(buildControlSessionReportSummary({ state: "blocked" })).toContain("pending approval");
  });
});

describe("resolveControlReportWebhookConfig", () => {
  it("is off when the URL is unset", () => {
    expect(resolveControlReportWebhookConfig({})).toEqual({ url: null, secret: null });
  });

  it("reads URL and secret from env", () => {
    expect(
      resolveControlReportWebhookConfig({
        BACKSTEROS_CONTROL_REPORT_WEBHOOK_URL: "https://hooks.example/control",
        BACKSTEROS_CONTROL_REPORT_WEBHOOK_SECRET: "sekrit",
      }),
    ).toEqual({
      url: "https://hooks.example/control",
      secret: "sekrit",
    });
  });
});

describe("postControlSessionWebhook", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("no-ops when the webhook URL is unset", async () => {
    const fetchImpl = vi.fn();
    await expect(
      postControlSessionWebhook(
        {
          taskRef: "BDV-64",
          threadId: "t1",
          state: "completed",
          summary: "done",
          commits: [],
          lastError: null,
          at: "2026-10-24T12:00:00.000Z",
        },
        {},
        fetchImpl as unknown as typeof fetch,
      ),
    ).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts JSON with Authorization and retries on failure", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const payload: ControlSessionReportPayload = {
      taskRef: "BDV-64",
      threadId: "thread-1",
      state: "blocked",
      summary: "waiting",
      commits: ["abc"],
      lastError: null,
      at: "2026-10-24T12:00:00.000Z",
    };

    const pending = postControlSessionWebhook(
      payload,
      {
        BACKSTEROS_CONTROL_REPORT_WEBHOOK_URL: "https://hooks.example/control",
        BACKSTEROS_CONTROL_REPORT_WEBHOOK_SECRET: "sekrit",
      },
      fetchImpl as unknown as typeof fetch,
    );
    await vi.advanceTimersByTimeAsync(300);
    await expect(pending).resolves.toBe(true);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hooks.example/control");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sekrit");
    expect(JSON.parse(String(init.body))).toMatchObject({
      taskRef: "BDV-64",
      state: "blocked",
      commits: ["abc"],
    });
    expect(String(init.body)).not.toContain("sekrit");
  });
});

describe("maybeReportControlSessionOutcome dedupe", () => {
  afterEach(() => {
    resetControlSessionReportStateForTests();
  });

  it("dedupes the same state until a new working turn clears it", () => {
    expect(maybeReportControlSessionOutcome("task-1", "done", { taskRef: "BDV-64" })).toBe(true);
    expect(maybeReportControlSessionOutcome("task-1", "done", { taskRef: "BDV-64" })).toBe(false);

    noteControlSessionReportWorking("task-1");
    expect(maybeReportControlSessionOutcome("task-1", "done", { taskRef: "BDV-64" })).toBe(true);
  });
});

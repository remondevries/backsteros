import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { patchBacksterosControlTaskStatus } from "./control-backsteros.ts";

describe("patchBacksterosControlTaskStatus", () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.BACKSTEROS_API_KEY;
  const originalApiUrl = process.env.BACKSTEROS_API_URL;

  beforeEach(() => {
    process.env.BACKSTEROS_API_KEY = "test-key";
    process.env.BACKSTEROS_API_URL = "https://api.test.backsteros.com";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.BACKSTEROS_API_KEY;
    } else {
      process.env.BACKSTEROS_API_KEY = originalApiKey;
    }
    if (originalApiUrl === undefined) {
      delete process.env.BACKSTEROS_API_URL;
    } else {
      process.env.BACKSTEROS_API_URL = originalApiUrl;
    }
    vi.restoreAllMocks();
  });

  it("does not PATCH when status GET finds a completed task (control status poll)", async () => {
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      expect(url).toBe("https://api.test.backsteros.com/api/v1/tasks/task-1");
      expect(init?.method ?? "GET").toBe("GET");
      return new Response(JSON.stringify({ id: "task-1", status: "completed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(patchBacksterosControlTaskStatus("task-1", "in_review")).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not PATCH when status GET finds a completed task (session start in_progress)", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "task-1", status: "completed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(patchBacksterosControlTaskStatus("task-1", "in_progress")).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.method ?? "GET").toBe("GET");
  });

  it("skips canceled and duplicated tasks on status GET", async () => {
    for (const status of ["canceled", "duplicated"] as const) {
      const fetchMock = vi.fn(async () => {
        return new Response(JSON.stringify({ id: "task-1", status }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });
      globalThis.fetch = fetchMock as typeof fetch;

      await expect(patchBacksterosControlTaskStatus("task-1", "in_review")).resolves.toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("PATCHes in_review when the live task is still open", async () => {
    const fetchMock = vi.fn(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") {
        return new Response(JSON.stringify({ id: "task-1", status: "in_progress" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toEqual({
        status: "in_review",
        activityActor: "agent",
      });
      return new Response(JSON.stringify({ id: "task-1", status: "in_review" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(patchBacksterosControlTaskStatus("task-1", "in_review")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

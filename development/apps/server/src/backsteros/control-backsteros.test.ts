// @effect-diagnostics nodeBuiltinImport:off globalFetch:off globalFetchInEffect:off globalDate:off preferSchemaOverJson:off globalTimers:off unknownInEffectCatch:off anyUnknownInErrorContext:off catchToOrElseSucceed:off
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BACKSTEROS_FETCH_TIMEOUT_MS,
  BacksterosTimeoutError,
  fetchBacksterosControlProject,
  patchBacksterosControlTaskStatus,
  resolveBacksterosControlTask,
} from "./control-backsteros.ts";

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
      expect(init?.signal).toBeInstanceOf(AbortSignal);
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
    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit?]>;
    expect(calls[0]?.[1]?.method ?? "GET").toBe("GET");
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
      expect(init?.signal).toBeInstanceOf(AbortSignal);
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

  it("PATCHes in_progress with the OS-96 coding-agent working marker from related contacts", async () => {
    const fetchMock = vi.fn(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") {
        return new Response(
          JSON.stringify({
            id: "task-1",
            status: "ready_to_start",
            relatedContactIds: ["sander-contact"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toEqual({
        status: "in_progress",
        activityActor: "agent",
        agentWorkingContactId: "sander-contact",
        agentWorkingKind: "working",
        agentWorkingLabel: "Coding agent running",
      });
      return new Response(JSON.stringify({ id: "task-1", status: "in_progress" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(patchBacksterosControlTaskStatus("task-1", "in_progress")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to Sander by name when the task has no related contacts", async () => {
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      if ((init?.method ?? "GET") === "GET" && url.includes("/api/v1/tasks/")) {
        return new Response(
          JSON.stringify({ id: "task-1", status: "in_review", relatedContactIds: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if ((init?.method ?? "GET") === "GET" && url.includes("/api/v1/contacts")) {
        expect(url).toContain("q=Sander");
        return new Response(
          JSON.stringify({ contacts: [{ id: "sander-id", name: "Sander", firstName: "Sander" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toEqual({
        status: "in_progress",
        activityActor: "agent",
        agentWorkingContactId: "sander-id",
        agentWorkingKind: "working",
        agentWorkingLabel: "Coding agent running",
      });
      return new Response(JSON.stringify({ id: "task-1", status: "in_progress" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(patchBacksterosControlTaskStatus("task-1", "in_progress")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not PATCH in_review when the live task is backlog / ready_to_start", async () => {
    for (const status of ["backlog", "ready_to_start", "on_hold", "in_review"] as const) {
      const fetchMock = vi.fn(async () => {
        return new Response(JSON.stringify({ id: "task-1", status }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });
      globalThis.fetch = fetchMock as typeof fetch;

      await expect(patchBacksterosControlTaskStatus("task-1", "in_review")).resolves.toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit?]>;
      expect(calls[0]?.[1]?.method ?? "GET").toBe("GET");
    }
  });
});

describe("backsterosFetch timeout + project detail fallback", () => {
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

  it(`uses a ${BACKSTEROS_FETCH_TIMEOUT_MS}ms AbortSignal.timeout on local-core fetches`, async () => {
    expect(BACKSTEROS_FETCH_TIMEOUT_MS).toBe(10_000);

    const fetchMock = vi.fn(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(
        JSON.stringify({
          id: "proj-1",
          key: "OS",
          name: "OS",
          localWorkingDirectory: "/tmp/os",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(fetchBacksterosControlProject("proj-1")).resolves.toMatchObject({
      id: "proj-1",
      key: "OS",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws BacksterosTimeoutError naming the path when the fetch aborts", async () => {
    const fetchMock = vi.fn(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(_input);
      if (url.includes("/projects?type=codebase")) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      const abortError = new Error("The operation was aborted due to timeout");
      abortError.name = "TimeoutError";
      // Honour the signal so real AbortSignal.timeout behaviour is represented.
      if (init?.signal?.aborted) {
        throw abortError;
      }
      throw abortError;
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(fetchBacksterosControlProject("hung-proj")).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(BacksterosTimeoutError);
      expect(error).toMatchObject({
        code: "backsteros_timeout",
        pathname: "/api/v1/projects/hung-proj",
      });
      expect(String(error)).toContain("/api/v1/projects/hung-proj");
      expect(String(error)).toContain(String(BACKSTEROS_FETCH_TIMEOUT_MS));
      return true;
    });
  });

  it("falls back to /projects?type=codebase when GET /projects/{id} times out", async () => {
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.endsWith("/api/v1/projects/proj-hang")) {
        const abortError = new Error("The operation was aborted due to timeout");
        abortError.name = "TimeoutError";
        throw abortError;
      }
      if (url.includes("/projects?type=codebase")) {
        return new Response(
          JSON.stringify({
            projects: [
              {
                id: "proj-hang",
                key: "OS",
                name: "BacksterOS",
                localWorkingDirectory: "/Users/me/Codebase",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(fetchBacksterosControlProject("proj-hang")).resolves.toEqual({
      id: "proj-hang",
      key: "OS",
      name: "BacksterOS",
      localWorkingDirectory: "/Users/me/Codebase",
      developmentLocation: null,
      productionLocation: null,
      localLocation: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the codebase list when resolving a task by id and detail hangs", async () => {
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.endsWith("/api/v1/tasks/task-1")) {
        return new Response(
          JSON.stringify({
            id: "task-1",
            number: 68,
            title: "Hang fix",
            status: "in_progress",
            projectId: "proj-hang",
            description: "desc",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/v1/projects/proj-hang")) {
        const abortError = new Error("The operation was aborted due to timeout");
        abortError.name = "TimeoutError";
        throw abortError;
      }
      if (url.includes("/projects?type=codebase")) {
        return new Response(
          JSON.stringify({
            projects: [
              {
                id: "proj-hang",
                key: "OS",
                name: "BacksterOS",
                localWorkingDirectory: "/tmp/os",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const resolved = await resolveBacksterosControlTask("task-1");
    expect(resolved.task.id).toBe("task-1");
    expect(resolved.project).toEqual({
      id: "proj-hang",
      key: "OS",
      name: "BacksterOS",
      localWorkingDirectory: "/tmp/os",
      developmentLocation: null,
      productionLocation: null,
      localLocation: null,
    });
    expect(resolved.task.executionLocation).toBeNull();
  });
});

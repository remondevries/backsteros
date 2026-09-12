import { describe, expect, it, vi } from "vite-plus/test";

import {
  backsterosEntityListFingerprint,
  backsterosTaskDetailRevisionFingerprint,
} from "./backsterosEntityFingerprint";
import { createBacksterosSharedQuery } from "./backsterosQueryStore";

describe("backsterosEntityListFingerprint", () => {
  it("matches equal id+updatedAt lists", () => {
    const a = [
      { id: "1", updatedAt: "t1" },
      { id: "2", updatedAt: "t2" },
    ];
    const b = [
      { id: "1", updatedAt: "t1" },
      { id: "2", updatedAt: "t2" },
    ];
    expect(backsterosEntityListFingerprint(a)).toBe(backsterosEntityListFingerprint(b));
  });

  it("changes when updatedAt changes", () => {
    expect(backsterosEntityListFingerprint([{ id: "1", updatedAt: "t1" }])).not.toBe(
      backsterosEntityListFingerprint([{ id: "1", updatedAt: "t2" }]),
    );
  });

  it("ignores non-status payload fields", () => {
    expect(
      backsterosEntityListFingerprint([{ id: "1", updatedAt: "t1", title: "a" } as never]),
    ).toBe(backsterosEntityListFingerprint([{ id: "1", updatedAt: "t1", title: "b" } as never]));
  });

  it("changes when status changes", () => {
    expect(
      backsterosEntityListFingerprint([{ id: "1", updatedAt: "t1", status: "in_review" }]),
    ).not.toBe(
      backsterosEntityListFingerprint([{ id: "1", updatedAt: "t1", status: "in_progress" }]),
    );
  });
});

describe("backsterosTaskDetailRevisionFingerprint", () => {
  it("changes when a comment updates", () => {
    const base = {
      taskId: "t",
      taskUpdatedAt: "u1",
      assigneeId: null as string | null,
      title: "Title",
      description: null as string | null,
      status: "ready_to_start",
      priority: 0,
      dueDate: null as string | null,
      dueEndDate: null as string | null,
      contactId: null as string | null,
      relatedContactIds: [] as string[],
      relatedOrganizationIds: [] as string[],
      comments: [{ id: "c1", updatedAt: "c1" }],
      activities: [{ id: "a1", createdAt: "a1" }],
    };
    expect(backsterosTaskDetailRevisionFingerprint(base)).not.toBe(
      backsterosTaskDetailRevisionFingerprint({
        ...base,
        comments: [{ id: "c1", updatedAt: "c2" }],
      }),
    );
  });
});

describe("createBacksterosSharedQuery", () => {
  it("shares one fetch across subscribers and stops soft-poll when empty", async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(async () => [{ id: "1", updatedAt: "t1" }]);
    const query = createBacksterosSharedQuery({
      fetch: fetchFn,
      fingerprint: backsterosEntityListFingerprint,
      errorMessage: "fail",
      softPollIntervalMs: 3_000,
    });

    const unsub1 = query.subscribe(() => {});
    const unsub2 = query.subscribe(() => {});

    await vi.waitFor(() => {
      expect(query.getSnapshot().status).toBe("ready");
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(query.getDebugStats()).toEqual({ subscriberCount: 2, softPollActive: true });

    unsub1();
    expect(query.getDebugStats().subscriberCount).toBe(1);
    expect(query.getDebugStats().softPollActive).toBe(true);

    unsub2();
    expect(query.getDebugStats()).toEqual({ subscriberCount: 0, softPollActive: false });

    vi.useRealTimers();
  });

  it("resets aborted initial loads to idle so the next mount is not stuck loading", async () => {
    const fetchFn = vi.fn(() => new Promise<{ id: string; updatedAt: string }[]>(() => {}));
    const query = createBacksterosSharedQuery({
      fetch: fetchFn,
      fingerprint: backsterosEntityListFingerprint,
      errorMessage: "fail",
      softPollIntervalMs: 60_000,
    });

    const unsub = query.subscribe(() => {});
    await vi.waitFor(() => {
      expect(query.getSnapshot().status).toBe("loading");
    });

    unsub();
    expect(query.getSnapshot().status).toBe("idle");

    let resolveFetch: ((value: { id: string; updatedAt: string }[]) => void) | undefined;
    fetchFn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const unsub2 = query.subscribe(() => {});
    resolveFetch?.([{ id: "1", updatedAt: "t1" }]);
    await vi.waitFor(() => {
      expect(query.getSnapshot().status).toBe("ready");
    });
    unsub2();
  });
});

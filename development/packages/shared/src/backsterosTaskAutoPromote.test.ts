import { describe, expect, it } from "vite-plus/test";

import {
  backsterosStatusForControlSession,
  canAutoPromoteBacksterosTaskStatus,
} from "./backsterosTaskAutoPromote.ts";

describe("backsterosStatusForControlSession", () => {
  it("promotes to in_review only when the session is done", () => {
    expect(backsterosStatusForControlSession("done")).toBe("in_review");
    expect(backsterosStatusForControlSession("idle")).toBeNull();
    expect(backsterosStatusForControlSession("working")).toBe("in_progress");
    expect(backsterosStatusForControlSession("blocked")).toBe("in_progress");
  });
});

describe("canAutoPromoteBacksterosTaskStatus", () => {
  it("refuses completed, canceled, and duplicated tasks", () => {
    expect(canAutoPromoteBacksterosTaskStatus("completed")).toBe(false);
    expect(canAutoPromoteBacksterosTaskStatus("canceled")).toBe(false);
    expect(canAutoPromoteBacksterosTaskStatus("duplicated")).toBe(false);
    expect(canAutoPromoteBacksterosTaskStatus("done")).toBe(false);
  });

  it("allows open statuses including in_progress", () => {
    expect(canAutoPromoteBacksterosTaskStatus("in_progress")).toBe(true);
    expect(canAutoPromoteBacksterosTaskStatus("in_review")).toBe(true);
    expect(canAutoPromoteBacksterosTaskStatus("ready_to_start")).toBe(true);
  });
});

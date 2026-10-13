import { describe, expect, it } from "vite-plus/test";

import {
  BACKSTEROS_CODING_AGENT_WORKING_LABEL,
  backsterosStatusForControlSession,
  canAutoPromoteBacksterosTaskStatus,
  codingAgentWorkingMarkerPatch,
  pickDefaultCodingAgentContactId,
  resolveCodingAgentWorkingContactId,
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

describe("coding agent working marker (BDV-53)", () => {
  it("prefers related contact ids over the default persona", () => {
    expect(
      resolveCodingAgentWorkingContactId({
        relatedContactIds: ["  related-1  ", "related-2"],
        defaultContactId: "sander",
      }),
    ).toBe("related-1");
  });

  it("falls back to the default persona when related is empty", () => {
    expect(
      resolveCodingAgentWorkingContactId({
        relatedContactIds: ["", null, undefined],
        defaultContactId: "sander-id",
      }),
    ).toBe("sander-id");
    expect(resolveCodingAgentWorkingContactId({})).toBeNull();
  });

  it("builds the working marker patch with the coding-session label", () => {
    expect(codingAgentWorkingMarkerPatch("contact-1")).toEqual({
      agentWorkingContactId: "contact-1",
      agentWorkingKind: "working",
      agentWorkingLabel: BACKSTEROS_CODING_AGENT_WORKING_LABEL,
    });
  });

  it("picks Sander from a contacts list by name or firstName", () => {
    expect(
      pickDefaultCodingAgentContactId([
        { id: "1", name: "Ralph" },
        { id: "2", name: "Sander", firstName: "Sander" },
      ]),
    ).toBe("2");
    expect(pickDefaultCodingAgentContactId([{ id: "1", firstName: "Sander" }])).toBe("1");
    expect(pickDefaultCodingAgentContactId([{ id: "1", name: "Ralph" }])).toBeNull();
  });
});

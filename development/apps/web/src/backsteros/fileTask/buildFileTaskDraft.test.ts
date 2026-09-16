import { describe, expect, it } from "vite-plus/test";

import type { BacksterosCodebaseProject, BacksterosContact } from "../types";
import {
  buildFileTaskDraft,
  fileTaskDraftToCreateInput,
  looksLikeNonCodingBrief,
  resolveFileTaskAssigneeId,
  titleFromBrief,
} from "./buildFileTaskDraft";

const project: BacksterosCodebaseProject = {
  id: "proj-1",
  key: "BDV",
  name: "BacksterDEV",
  summary: "T3 Code fork",
  type: "codebase",
  status: "active",
  githubRepository: "backsteros/development",
  localWorkingDirectory: "/Users/remon/code/backsteros/development",
  updatedAt: "2026-09-15T00:00:00.000Z",
};

const contacts: readonly BacksterosContact[] = [
  { id: "sander", name: "Sander", email: null },
  { id: "remon", name: "Remon de Vries", email: "remon@example.com" },
];

describe("buildFileTaskDraft", () => {
  it("applies house rules for codebase projects", () => {
    const draft = buildFileTaskDraft({
      brief: "Wire file-task orb next to compose.\nKeep user in BDV.",
      project,
      contacts,
      agentContactId: "sander",
      now: new Date("2026-09-15T10:00:00.000Z"),
    });

    expect(draft.title).toBe("Wire file-task orb next to compose.");
    expect(draft.status).toBe("backlog");
    expect(draft.priority).toBe(3);
    expect(draft.dueDate).toBe("2026-09-15T21:59:59.000Z");
    expect(draft.assigneeId).toBe("remon");
    expect(draft.relatedContactIds).toEqual(["sander"]);
    expect(draft.description).toContain("## Goal");
    expect(draft.description).toContain("## Agent prompt");
    expect(draft.nonCodingWarning).toBe(false);

    const payload = fileTaskDraftToCreateInput(draft);
    expect(payload.assigneeId).toBe("remon");
    expect(payload.status).toBe("backlog");
  });

  it("warns on non-coding briefs for codebase projects", () => {
    expect(looksLikeNonCodingBrief("Update the invoice template")).toBe(true);
    const draft = buildFileTaskDraft({
      brief: "Pay the Q3 invoice for hosting",
      project,
      contacts,
      agentContactId: "sander",
      now: new Date("2026-09-15T10:00:00.000Z"),
    });
    expect(draft.nonCodingWarning).toBe(true);
  });

  it("honors default assignee override", () => {
    const draft = buildFileTaskDraft({
      brief: "Ship it",
      project,
      contacts,
      agentContactId: "sander",
      defaultAssigneeId: "sander",
      now: new Date("2026-09-15T10:00:00.000Z"),
    });
    expect(draft.status).toBe("backlog");
    expect(draft.assigneeId).toBe("sander");
  });

  it("resolves Remon as the default assignee", () => {
    expect(resolveFileTaskAssigneeId({ contacts })).toBe("remon");
    expect(titleFromBrief("Short")).toBe("Short");
  });
});

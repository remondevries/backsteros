import { describe, expect, it } from "vite-plus/test";

import {
  BACKSTEROS_TASK_KICKOFF_LEAD,
  buildBacksterosTaskDonePrompt,
  buildBacksterosTaskKickoffPrompt,
} from "./taskKickoffPrompt";

describe("buildBacksterosTaskKickoffPrompt", () => {
  it("includes lead line, display id, description, and CLI workflow", () => {
    const prompt = buildBacksterosTaskKickoffPrompt({
      id: "task-uuid",
      number: 1,
      title: "Always on command",
      description: "Fix caffeinate flags.",
      projectKey: "DOT",
      workingDirectory: "/Users/remon/BacksterOS/Projects/DOT",
    });

    expect(prompt.startsWith(BACKSTEROS_TASK_KICKOFF_LEAD)).toBe(true);
    expect(prompt).toContain("Task ID: DOT-1");
    expect(prompt).toContain("Title: Always on command");
    expect(prompt).toContain("Working directory: /Users/remon/BacksterOS/Projects/DOT");
    expect(prompt).toContain("Fix caffeinate flags.");
    expect(prompt).toContain("backsteros comment create");
    expect(prompt).toContain("In Review");
    expect(prompt).toContain("/done");
  });

  it("falls back when description and project folder are missing", () => {
    const prompt = buildBacksterosTaskKickoffPrompt({
      id: "task-uuid",
      number: 2,
      title: "Untitled-ish",
      projectKey: null,
      workingDirectory: null,
    });

    expect(prompt).toContain("Task ID: IN-2");
    expect(prompt).toContain("Description:\n(none)");
    expect(prompt).toContain("Working directory: ~");
  });
});

describe("buildBacksterosTaskDonePrompt", () => {
  it("includes task id and finish steps for commit push link complete", () => {
    const prompt = buildBacksterosTaskDonePrompt({
      displayId: "BDV-19",
      title: "Auto finish feature",
    });

    expect(prompt).toContain("Task ID: BDV-19");
    expect(prompt).toContain("Title: Auto finish feature");
    expect(prompt).toContain("linkedCommitShas");
    expect(prompt).toContain("backsteros task update BDV-19 --status completed");
    expect(prompt).toContain("backsteros comment create BDV-19");
    expect(prompt).toContain("/done");
  });
});

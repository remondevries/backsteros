import { describe, expect, it } from "vite-plus/test";

import {
  BACKSTEROS_TASK_KICKOFF_LEAD,
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

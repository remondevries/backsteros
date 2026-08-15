import { describe, expect, it } from "vitest";

import {
  applyCursorCreatePlanToTurn,
  applyCursorUpdateTodosToTurn,
  emptyAgentChatTurnUiState,
} from "./agent-acp-activity";
import {
  extractTodosAsPlan,
  mergePlanSteps,
  planStepsWorkingSummary,
  preferPlanSteps,
} from "./t3-port/cursor-todos";

describe("cursor todos (t3 port)", () => {
  it("extractTodosAsPlan maps statuses", () => {
    const { plan } = extractTodosAsPlan({
      todos: [
        { content: "First", status: "completed" },
        { title: "Second", status: "in_progress" },
        { content: "Third", status: "pending" },
      ],
    });
    expect(plan).toHaveLength(3);
    expect(plan[0]?.status).toBe("completed");
    expect(plan[1]?.status).toBe("inProgress");
    expect(plan[1]?.step).toBe("Second");
    expect(plan[2]?.status).toBe("pending");
  });

  it("mergePlanSteps replaces by step text when merge=true", () => {
    const merged = mergePlanSteps(
      [{ step: "A", status: "pending" }],
      [
        { step: "A", status: "completed" },
        { step: "B", status: "inProgress" },
      ],
      true,
    );
    expect(merged).toEqual([
      { step: "A", status: "completed" },
      { step: "B", status: "inProgress" },
    ]);
  });

  it("preferPlanSteps keeps same-length status updates", () => {
    const preferred = preferPlanSteps(
      [
        { step: "A", status: "inProgress" },
        { step: "B", status: "pending" },
      ],
      [
        { step: "A", status: "completed" },
        { step: "B", status: "completed" },
      ],
    );
    expect(preferred).toEqual([
      { step: "A", status: "completed" },
      { step: "B", status: "completed" },
    ]);
  });

  it("preferPlanSteps rejects a shorter stale snapshot", () => {
    const preferred = preferPlanSteps(
      [
        { step: "A", status: "completed" },
        { step: "B", status: "completed" },
        { step: "C", status: "pending" },
      ],
      [{ step: "A", status: "inProgress" }],
    );
    expect(preferred).toHaveLength(3);
    expect(preferred?.[0]?.status).toBe("completed");
  });

  it("planStepsWorkingSummary only says Working on while active", () => {
    const steps = [
      { step: "A", status: "completed" as const },
      { step: "B", status: "inProgress" as const },
    ];
    expect(planStepsWorkingSummary(steps, { active: true })).toBe(
      "Working on 1 to-do",
    );
    expect(planStepsWorkingSummary(steps, { active: false })).toBe(
      "In progress · 1 to-do",
    );
  });

  it("applyCursorUpdateTodosToTurn stores checklist on turn state", () => {
    const next = applyCursorUpdateTodosToTurn(emptyAgentChatTurnUiState(), {
      todos: [{ content: "Ship it", status: "inProgress" }],
    });
    expect(next.planSteps).toHaveLength(1);
    expect(next.planSteps[0]?.step).toBe("Ship it");
    expect(next.phase).toBe("tooling");
  });

  it("applyCursorCreatePlanToTurn stores markdown", () => {
    const next = applyCursorCreatePlanToTurn(emptyAgentChatTurnUiState(), {
      plan: "# Ship\n\nDo the thing.",
      todos: [{ content: "Do the thing", status: "pending" }],
    });
    expect(next.proposedPlanMarkdown).toMatch(/# Ship/);
    expect(next.planSteps[0]?.step).toBe("Do the thing");
  });
});

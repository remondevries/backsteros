import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { emailAgentCallbackResultSchema } from "@backsteros/contracts";

import { resolveEmailAgentSuccessIntent } from "./email-agent-callback-dispatch.js";

describe("emailAgentCallbackResultSchema", () => {
  it("accepts legacy body-only success as valid", () => {
    const parsed = emailAgentCallbackResultSchema.parse({
      ok: true,
      requestId: "req-1",
      body: "Thanks, we'll look into it.",
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(resolveEmailAgentSuccessIntent(parsed), "reply_draft");
    }
  });

  it("accepts task / calendar / note intents", () => {
    assert.equal(
      resolveEmailAgentSuccessIntent(
        emailAgentCallbackResultSchema.parse({
          ok: true,
          requestId: "r",
          intent: "task",
          task: { title: "Check store locator" },
        }) as Extract<
          ReturnType<typeof emailAgentCallbackResultSchema.parse>,
          { ok: true }
        >,
      ),
      "task",
    );
    assert.equal(
      resolveEmailAgentSuccessIntent(
        emailAgentCallbackResultSchema.parse({
          ok: true,
          requestId: "r",
          intent: "calendar",
          event: {
            title: "Review",
            start: "2026-09-24T08:00:00.000Z",
            end: "2026-09-24T08:30:00.000Z",
          },
        }) as Extract<
          ReturnType<typeof emailAgentCallbackResultSchema.parse>,
          { ok: true }
        >,
      ),
      "calendar",
    );
    assert.equal(
      resolveEmailAgentSuccessIntent(
        emailAgentCallbackResultSchema.parse({
          ok: true,
          requestId: "r",
          intent: "note",
          message: "File under project X",
        }) as Extract<
          ReturnType<typeof emailAgentCallbackResultSchema.parse>,
          { ok: true }
        >,
      ),
      "note",
    );
  });

  it("rejects task without title", () => {
    const result = emailAgentCallbackResultSchema.safeParse({
      ok: true,
      requestId: "r",
      intent: "task",
      task: { title: "" },
    });
    assert.equal(result.success, false);
  });
});

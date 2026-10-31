import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CrmActivity } from "@backsteros/contracts";

import { mergeCrmActivityBodiesFromRest } from "./crm-activity-body-merge";

function note(
  id: string,
  body: string | null,
  bodyPreview: string | null = body,
): CrmActivity {
  return {
    id,
    workspaceId: "ws",
    subjectType: "contact",
    subjectId: "c1",
    kind: "note",
    body,
    bodyPreview,
    meetingId: null,
    occurredAt: "2026-10-31T00:00:00.000Z",
    createdBy: null,
    createdAt: "2026-10-31T00:00:00.000Z",
    updatedAt: "2026-10-31T00:00:00.000Z",
    deletedAt: null,
  };
}

describe("mergeCrmActivityBodiesFromRest (OS-163 review)", () => {
  it("fills empty local body from REST", () => {
    const merged = mergeCrmActivityBodiesFromRest(
      [note("a1", null, "hello…")],
      [note("a1", "hello full note body")],
    );
    assert.equal(merged[0]?.body, "hello full note body");
  });

  it("does not overwrite a longer local edit", () => {
    const merged = mergeCrmActivityBodiesFromRest(
      [note("a1", "local edit that is complete")],
      [note("a1", "server body")],
    );
    assert.equal(merged[0]?.body, "local edit that is complete");
  });

  it("replaces truncated preview-equal body with longer REST body", () => {
    const preview = "x".repeat(240);
    const full = `${preview} and more`;
    const merged = mergeCrmActivityBodiesFromRest(
      [note("a1", preview, preview)],
      [note("a1", full, preview)],
    );
    assert.equal(merged[0]?.body, full);
  });
});

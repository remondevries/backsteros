import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildComposeOverlayContext,
  composeOverlayContextFromSnapshot,
  composeOverlayContextToSnapshot,
} from "./compose-overlay-context.js";

describe("buildComposeOverlayContext", () => {
  it("builds projects, contacts, and folder targets from workspace rows", () => {
    const context = buildComposeOverlayContext({
      projects: [
        {
          id: "p1",
          key: "BSH",
          name: "BacksterOS",
          icon: "folder",
          type: "software",
          dueDate: "2026-09-01T00:00:00.000Z",
        },
      ],
      contacts: [
        {
          id: "c1",
          name: "Ada",
          email: "ada@example.com",
          emails: ["ada@example.com"],
        },
      ],
      documents: [
        {
          path: "docs",
          title: "Docs",
          kind: "folder",
          type: "project",
          projectId: "p1",
        },
        {
          path: "knowledge-base",
          title: "Knowledge",
          kind: "folder",
          type: "knowledge",
          projectId: null,
        },
      ],
      defaultAssigneeId: "c1",
    });

    assert.equal(context.projects.length, 1);
    assert.equal(context.projects[0]?.key, "BSH");
    assert.ok(context.projects[0]?.dueDate instanceof Date);
    assert.equal(context.contacts[0]?.name, "Ada");
    assert.equal(context.defaultAssigneeId, "c1");
    assert.equal(context.projectsById.get("p1")?.key, "BSH");
    assert.ok(Object.keys(context.documentFoldersByTarget).length > 0);
  });

  it("round-trips through an IPC snapshot", () => {
    const context = buildComposeOverlayContext({
      projects: [{ id: "p1", key: "BSH", name: "BacksterOS" }],
      contacts: [{ id: "c1", name: "Ada" }],
      documents: [],
      defaultAssigneeId: null,
    });
    const restored = composeOverlayContextFromSnapshot(
      composeOverlayContextToSnapshot(context),
    );
    assert.equal(restored.projects[0]?.id, "p1");
    assert.equal(restored.contacts[0]?.id, "c1");
    assert.equal(restored.projectsById.get("p1")?.name, "BacksterOS");
    assert.equal(restored.defaultAssigneeId, null);
  });
});

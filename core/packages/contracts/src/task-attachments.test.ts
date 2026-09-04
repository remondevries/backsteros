import assert from "node:assert/strict";
import test from "node:test";

import {
  reorderTaskAttachmentsSchema,
  taskAttachmentSchema,
  updateTaskAttachmentSchema,
} from "./schemas.ts";

test("taskAttachmentSchema accepts file attachment rows", () => {
  const parsed = taskAttachmentSchema.parse({
    id: "att_1",
    workspaceId: "ws_1",
    taskId: "task_1",
    storageKey: ".backsteros/attachments/tasks/task_1/brief-att_1.pdf",
    originalFilename: "brief.pdf",
    contentType: "application/pdf",
    byteSize: 1200,
    checksum: "abc",
    contentEtag: null,
    sortOrder: 1,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    deletedAt: null,
  });
  assert.equal(parsed.originalFilename, "brief.pdf");
  assert.equal(parsed.contentType, "application/pdf");

  const image = taskAttachmentSchema.parse({
    ...parsed,
    id: "att_2",
    storageKey: ".backsteros/attachments/tasks/task_1/photo-att_2.png",
    originalFilename: "photo.png",
    contentType: "image/png",
  });
  assert.equal(image.contentType, "image/png");
});

test("update and reorder task attachment schemas", () => {
  assert.equal(
    updateTaskAttachmentSchema.parse({ originalFilename: " renamed.pdf " })
      .originalFilename,
    "renamed.pdf",
  );
  assert.deepEqual(
    reorderTaskAttachmentsSchema.parse({ orderedIds: ["a", "b"] }).orderedIds,
    ["a", "b"],
  );
});

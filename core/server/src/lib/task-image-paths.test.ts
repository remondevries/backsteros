import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTaskImageContentPath,
  taskImageContentPath,
} from "@backsteros/contracts";

import { buildTaskImageStorageKey } from "./storage.js";

test("task image content paths round-trip", () => {
  const path = taskImageContentPath("task_1", "img_2");
  assert.equal(path, "/api/v1/tasks/task_1/images/img_2");
  assert.deepEqual(parseTaskImageContentPath(path), {
    taskId: "task_1",
    imageId: "img_2",
  });
  assert.deepEqual(
    parseTaskImageContentPath(`https://api.example${path}`),
    { taskId: "task_1", imageId: "img_2" },
  );
  assert.equal(parseTaskImageContentPath("/other"), null);
});

test("buildTaskImageStorageKey nests under .backsteros/attachments/tasks", () => {
  assert.equal(
    buildTaskImageStorageKey("task_1", "img_abc", "png"),
    ".backsteros/attachments/tasks/task_1/img_abc.png",
  );
});

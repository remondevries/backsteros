import assert from "node:assert/strict";
import test from "node:test";

import { isRouteAllowed } from "./allowlist.js";

test("allows task and document agent routes", () => {
  assert.equal(isRouteAllowed("GET", "/api/v1/tasks"), true);
  assert.equal(isRouteAllowed("PATCH", "/api/v1/tasks/task_1"), true);
  assert.equal(isRouteAllowed("GET", "/api/v1/documents/doc_1/content"), true);
  assert.equal(isRouteAllowed("PATCH", "/api/v1/documents/doc_1/content"), true);
});

test("allows letter metadata and extracted text without PDF or attachments", () => {
  assert.equal(isRouteAllowed("GET", "/api/v1/letters"), true);
  assert.equal(isRouteAllowed("GET", "/api/v1/letters/letter_1"), true);
  assert.equal(isRouteAllowed("GET", "/api/v1/letters/letter_1/relations"), true);
  assert.equal(isRouteAllowed("GET", "/api/v1/letters/letter_1/pdf"), false);
  assert.equal(isRouteAllowed("PUT", "/api/v1/letters/letter_1/pdf"), false);
  assert.equal(isRouteAllowed("GET", "/api/v1/letters/letter_1/attachments"), false);
  assert.equal(
    isRouteAllowed("GET", "/api/v1/letters/letter_1/attachments/att_1"),
    false,
  );
});

test("blocks sync, powersync, ops, PTY, finance, and settings", () => {
  assert.equal(isRouteAllowed("POST", "/api/v1/sync/bootstrap"), false);
  assert.equal(isRouteAllowed("GET", "/api/v1/powersync/token"), false);
  assert.equal(isRouteAllowed("GET", "/api/v1/ops/logs"), false);
  assert.equal(isRouteAllowed("GET", "/api/v1/agent-pty/connection"), false);
  assert.equal(isRouteAllowed("GET", "/api/v1/bank-accounts"), false);
  assert.equal(isRouteAllowed("GET", "/api/v1/settings"), false);
});

test("blocks task images and project filesystem", () => {
  assert.equal(isRouteAllowed("POST", "/api/v1/tasks/task_1/images"), false);
  assert.equal(isRouteAllowed("GET", "/api/v1/tasks/task_1/images/img_1"), false);
  assert.equal(isRouteAllowed("GET", "/api/v1/projects/proj_1/fs/entries"), false);
  assert.equal(isRouteAllowed("GET", "/api/v1/projects/proj_1/github/pulls"), false);
});

test("allows OpenAPI and search", () => {
  assert.equal(isRouteAllowed("GET", "/api/v1/openapi.json"), true);
  assert.equal(isRouteAllowed("GET", "/api/v1/search"), true);
  assert.equal(isRouteAllowed("GET", "/api/v1/global-search"), true);
});

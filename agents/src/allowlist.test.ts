import assert from "node:assert/strict";
import test from "node:test";

import { isRouteAllowed } from "./allowlist.js";

test("allows product writes including task create", () => {
  assert.equal(isRouteAllowed("GET", "/api/v1/tasks"), true);
  assert.equal(isRouteAllowed("POST", "/api/v1/tasks"), true);
  assert.equal(isRouteAllowed("PATCH", "/api/v1/tasks/task_1"), true);
  assert.equal(isRouteAllowed("POST", "/api/v1/tasks/task_1/comments"), true);
  assert.equal(isRouteAllowed("GET", "/api/v1/documents/doc_1/content"), true);
  assert.equal(isRouteAllowed("PATCH", "/api/v1/documents/doc_1/content"), true);
  assert.equal(isRouteAllowed("POST", "/api/v1/letters"), true);
  assert.equal(isRouteAllowed("PATCH", "/api/v1/projects/proj_1"), true);
  assert.equal(isRouteAllowed("GET", "/api/v1/search"), true);
});

test("blocks sync, PTY, ops, and API key admin", () => {
  assert.equal(isRouteAllowed("POST", "/api/v1/sync/bootstrap"), false);
  assert.equal(isRouteAllowed("GET", "/api/v1/powersync/token"), false);
  assert.equal(isRouteAllowed("GET", "/api/v1/ops/logs"), false);
  assert.equal(isRouteAllowed("GET", "/api/v1/agent-pty/connection"), false);
  assert.equal(isRouteAllowed("GET", "/api/v1/api-keys"), false);
  assert.equal(isRouteAllowed("POST", "/api/v1/api-keys"), false);
});

test("does not proxy non-v1 paths", () => {
  assert.equal(isRouteAllowed("GET", "/health"), false);
  assert.equal(isRouteAllowed("GET", "/openapi.json"), false);
});

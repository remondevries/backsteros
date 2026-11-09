import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { shouldShowDevCoreBadge } from "./dev-core-badge.js";

describe("shouldShowDevCoreBadge", () => {
  test("hidden in production builds", () => {
    assert.deepEqual(
      shouldShowDevCoreBadge({
        viteDev: false,
        apiUrl: "http://127.0.0.1:8800",
      }),
      { show: false, port: null },
    );
  });

  test("hidden on canonical local-core :8788", () => {
    assert.deepEqual(
      shouldShowDevCoreBadge({
        viteDev: true,
        apiUrl: "http://127.0.0.1:8788",
      }),
      { show: false, port: null },
    );
  });

  test("shown for isolated DEV :8800", () => {
    assert.deepEqual(
      shouldShowDevCoreBadge({
        viteDev: true,
        apiUrl: "http://127.0.0.1:8800",
      }),
      { show: true, port: "8800" },
    );
  });

  test("hidden for non-local API", () => {
    assert.deepEqual(
      shouldShowDevCoreBadge({
        viteDev: true,
        apiUrl: "https://api.local.backsteros.com",
      }),
      { show: false, port: null },
    );
  });
});

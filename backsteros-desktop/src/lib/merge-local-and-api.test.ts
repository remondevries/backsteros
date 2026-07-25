import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fillMissingLinksFromApi,
  fillMissingTypeFromApi,
  mergeLocalAndApiByUpdatedAt,
} from "./merge-local-and-api.ts";

test("mergeLocalAndApiByUpdatedAt prefers newer API row", () => {
  const merged = mergeLocalAndApiByUpdatedAt(
    [{ id: "1", updatedAt: "2026-01-01T00:00:00.000Z", title: "local" }],
    [{ id: "1", updatedAt: "2026-01-02T00:00:00.000Z", title: "api" }],
  );
  assert.equal(merged[0]?.title, "api");
});

test("fillMissingLinksFromApi copies API links when local is empty", () => {
  const filled = fillMissingLinksFromApi(
    [
      {
        id: "1",
        links: [],
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    [
      {
        id: "1",
        links: [{ id: "l1", url: "https://example.com", createdAt: "2026-01-01" }],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  );
  assert.equal(filled[0]?.links?.length, 1);
  assert.equal(
    (filled[0]?.links as Array<{ url: string }>)[0]?.url,
    "https://example.com",
  );
});

test("fillMissingLinksFromApi keeps local links when present", () => {
  const filled = fillMissingLinksFromApi(
    [
      {
        id: "1",
        links: [{ id: "l1", url: "https://local.test", createdAt: "2026-01-02" }],
      },
    ],
    [
      {
        id: "1",
        links: [{ id: "l2", url: "https://api.test", createdAt: "2026-01-01" }],
      },
    ],
  );
  assert.equal(
    (filled[0]?.links as Array<{ url: string }>)[0]?.url,
    "https://local.test",
  );
});

test("fillMissingTypeFromApi copies API type when local is empty", () => {
  const filled = fillMissingTypeFromApi(
    [{ id: "1", type: null, updatedAt: "2026-01-02T00:00:00.000Z" }],
    [{ id: "1", type: "codebase", updatedAt: "2026-01-01T00:00:00.000Z" }],
  );
  assert.equal(filled[0]?.type, "codebase");
});

test("fillMissingTypeFromApi keeps local type when present", () => {
  const filled = fillMissingTypeFromApi(
    [{ id: "1", type: "webhosting" }],
    [{ id: "1", type: "codebase" }],
  );
  assert.equal(filled[0]?.type, "webhosting");
});

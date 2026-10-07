import assert from "node:assert/strict";
import { test } from "node:test";

import { emailComposeDraftInputSchema } from "./schemas.js";

test("emailComposeDraftInputSchema accepts comma-joined string To", () => {
  const parsed = emailComposeDraftInputSchema.safeParse({
    to: "ada@example.com, bob@example.com",
    subject: "Hello",
    body: "Body",
  });
  assert.equal(parsed.success, true);
});

test("emailComposeDraftInputSchema accepts To as a string array", () => {
  const parsed = emailComposeDraftInputSchema.safeParse({
    to: ["ada@example.com", "bob@example.com"],
    cc: ["cc@example.com"],
    subject: "Hello",
    body: "Body",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(parsed.data.to, ["ada@example.com", "bob@example.com"]);
  }
});

test("emailComposeDraftInputSchema rejects empty To array", () => {
  const parsed = emailComposeDraftInputSchema.safeParse({
    to: [],
    subject: "Hello",
    body: "Body",
  });
  assert.equal(parsed.success, false);
});

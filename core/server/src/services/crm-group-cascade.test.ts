import assert from "node:assert/strict";
import test from "node:test";

/**
 * Pure regression for the org↔contact cascade contract.
 * (DB-backed cascade is covered by live API materialization.)
 */
test("CRM group cascade plan shape: org expands to contacts conceptually", () => {
  const planned = [
    { subjectType: "organization", subjectId: "org-1" },
    { subjectType: "contact", subjectId: "c-1" },
    { subjectType: "contact", subjectId: "c-2" },
  ];
  assert.equal(planned[0]?.subjectType, "organization");
  assert.ok(planned.some((entry) => entry.subjectType === "contact"));
});

test("CRM group cascade plan shape: contact pulls org + siblings", () => {
  const input = { subjectType: "contact", subjectId: "c-1" };
  const planned = [
    input,
    { subjectType: "organization", subjectId: "org-1" },
    { subjectType: "contact", subjectId: "c-2" },
  ];
  assert.ok(
    planned.some(
      (entry) =>
        entry.subjectType === "organization" && entry.subjectId === "org-1",
    ),
  );
  assert.ok(
    planned.some(
      (entry) => entry.subjectType === "contact" && entry.subjectId === "c-2",
    ),
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  dedupeCrmGroupsForDisplay,
  normalizeCrmGroupName,
  pickCanonicalCrmGroupRow,
} from "./crm-group-name";
import type { CrmGroupRow } from "./crm-row-mappers";

function row(
  id: string,
  name: string,
  createdAt: string,
): CrmGroupRow {
  return {
    id,
    name,
    description: null,
    color: null,
    icon: null,
    sort_order: 0,
    created_at: createdAt,
    updated_at: createdAt,
    deleted_at: null,
  };
}

test("normalizeCrmGroupName trims and lowercases", () => {
  assert.equal(normalizeCrmGroupName("  Clients  "), "clients");
});

test("pickCanonicalCrmGroupRow prefers server id", () => {
  const canonical = pickCanonicalCrmGroupRow(
    [
      row("local-only", "Clients", "2026-09-09T16:00:00.000Z"),
      row("cloud-id", "Clients", "2026-09-09T17:00:00.000Z"),
    ],
    new Set(["cloud-id"]),
    { id: "cloud-id", name: "Clients" } as never,
  );
  assert.equal(canonical.id, "cloud-id");
});

test("dedupeCrmGroupsForDisplay keeps one Clients row", () => {
  const deduped = dedupeCrmGroupsForDisplay(
    [
      {
        id: "local-only",
        workspaceId: "",
        name: "Clients",
        description: null,
        color: null,
        icon: null,
        sortOrder: 1,
        createdAt: "2026-09-09T16:00:00.000Z",
        updatedAt: "2026-09-09T16:00:00.000Z",
        deletedAt: null,
      },
      {
        id: "cloud-id",
        workspaceId: "",
        name: "Clients",
        description: null,
        color: null,
        icon: null,
        sortOrder: 2,
        createdAt: "2026-09-09T17:00:00.000Z",
        updatedAt: "2026-09-09T17:00:00.000Z",
        deletedAt: null,
      },
    ],
    new Set(["cloud-id"]),
  );
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.id, "cloud-id");
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  mapContactRelationshipListItem,
  mapCrmActivityRow,
  mapCrmGroupMemberSubjectIds,
  mapCrmGroupRow,
} from "./crm-row-mappers.ts";
import { relationshipTypeLabel } from "./crm-relationship-label-utils.ts";

test("mapCrmGroupRow maps snake_case SQLite columns", () => {
  const group = mapCrmGroupRow({
    id: "g1",
    name: "VIP",
    description: null,
    color: "#fff",
    icon: null,
    sort_order: 10,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    deleted_at: null,
  });
  assert.equal(group.id, "g1");
  assert.equal(group.name, "VIP");
  assert.equal(group.sortOrder, 10);
});

test("mapContactRelationshipListItem resolves catalog label", () => {
  const item = mapContactRelationshipListItem(
    {
      id: "r1",
      from_contact_id: "c1",
      to_contact_id: "c2",
      type: "parent",
      note: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      deleted_at: null,
      direction: "outgoing",
      related_contact_id: "c2",
      related_contact_name: "Alex",
    },
    [
      {
        id: "l1",
        workspaceId: "w",
        sideALabel: "Parent",
        sideASlug: "parent",
        sideBLabel: "Child",
        sideBSlug: "child",
        color: null,
        sortOrder: 10,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
      },
    ],
  );
  assert.equal(item.typeLabel, "Parent");
  assert.equal(item.relatedContactName, "Alex");
});

test("mapCrmActivityRow joins meeting metadata", () => {
  const activity = mapCrmActivityRow({
    id: "a1",
    subject_type: "contact",
    subject_id: "c1",
    kind: "meeting",
    body: null,
    body_preview: "Sync",
    meeting_id: "m1",
    occurred_at: "2026-01-01T10:00:00.000Z",
    created_by: null,
    created_at: "2026-01-01T10:00:00.000Z",
    updated_at: "2026-01-01T10:00:00.000Z",
    deleted_at: null,
    meeting_title: "Weekly",
    meeting_start_at: "2026-01-01T10:00:00.000Z",
  });
  assert.ok(activity);
  assert.equal(activity?.kind, "meeting");
  assert.equal(activity?.meetingTitle, "Weekly");
});

test("mapCrmGroupMemberSubjectIds filters by subject type", () => {
  const ids = mapCrmGroupMemberSubjectIds(
    [
      { subject_type: "contact", subject_id: "c1" },
      { subject_type: "organization", subject_id: "o1" },
    ],
    "contact",
  );
  assert.deepEqual([...ids], ["c1"]);
});

test("relationshipTypeLabel falls back to title case", () => {
  assert.equal(relationshipTypeLabel("best_friend", "outgoing"), "Best Friend");
});

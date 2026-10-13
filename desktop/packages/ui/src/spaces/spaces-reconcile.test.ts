import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { KnowledgeListItem } from "../navigation/entity-routes.ts";
import {
  findDuplicateSpaceOverviewIdsToDelete,
  findLocalOnlySpacesToPublish,
  preferSpaceOverviewSibling,
} from "./spaces-reconcile.ts";

const docs: KnowledgeListItem[] = [
  {
    id: "sup",
    title: "Support",
    path: "support",
    kind: "folder",
    parentId: null,
  },
  {
    id: "portal-api",
    title: "Portal",
    path: "support/portal",
    kind: "folder",
    parentId: "sup",
    updatedAt: 2_000,
  },
  {
    id: "portal-local",
    title: "Portal",
    path: "portal-local",
    kind: "folder",
    parentId: "sup",
    updatedAt: 1_000,
  },
  {
    id: "art",
    title: "Welcome",
    path: "support/portal/welcome.md",
    kind: "document",
    parentId: "portal-api",
    updatedAt: 2_000,
  },
];

describe("spaces-reconcile", () => {
  it("prefers nested path / higher article count", () => {
    const preferred = preferSpaceOverviewSibling(docs[1]!, docs[2]!, docs);
    assert.equal(preferred.id, "portal-api");
  });

  it("flags local duplicate space cards for delete", () => {
    assert.deepEqual(findDuplicateSpaceOverviewIdsToDelete(docs), [
      "portal-local",
    ]);
  });

  it("finds local-only spaces to publish", () => {
    const local: KnowledgeListItem[] = [
      {
        id: "kb",
        title: "Knowledge Base",
        path: "knowledge-base",
        kind: "folder",
        parentId: null,
      },
      {
        id: "ideas",
        title: "Idea's",
        path: "knowledge-base/idea-s",
        kind: "folder",
        parentId: "kb",
        icon: "light-bulb",
      },
    ];
    const api: KnowledgeListItem[] = [
      {
        id: "kb",
        title: "Knowledge Base",
        path: "knowledge-base",
        kind: "folder",
        parentId: null,
      },
    ];
    assert.deepEqual(findLocalOnlySpacesToPublish(local, api), [
      {
        categoryRootPath: "knowledge-base",
        parentFolderId: "kb",
        title: "Idea's",
        icon: "light-bulb",
        path: "knowledge-base/idea-s",
      },
    ]);
  });
});

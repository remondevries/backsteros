import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countArticlesInFolder,
  filterDocumentsForSpaceRoot,
  formatSpaceUpdatedLabel,
  getSelectedSpaceRootFromPathname,
  isSpacesOverviewPath,
  isSupportCenterDocumentPath,
  isWebsiteDocumentPath,
  knowledgePathShowsSidePanel,
  latestUpdatedAtInFolder,
  listSpaceChildFolders,
  normalizeSpacesDocumentPath,
  resolveSpaceOverviewDescription,
  resolveSpaceOverviewIconKey,
  resolveSpacesCategoryId,
  resolveSpaceUpdatedFreshness,
  SPACES_CATEGORY_KNOWLEDGE_BASE,
  SPACES_SECOND_BRAIN_RELATIVE,
} from "./spaces-categories.ts";
import type { KnowledgeListItem } from "../navigation/entity-routes.ts";

const docs: KnowledgeListItem[] = [
  {
    id: "kb",
    title: "Knowledge Base",
    path: SPACES_CATEGORY_KNOWLEDGE_BASE,
    kind: "folder",
    parentId: null,
  },
  {
    id: "sb",
    title: "Second brain",
    path: SPACES_SECOND_BRAIN_RELATIVE,
    kind: "folder",
    parentId: "kb",
  },
  {
    id: "sup",
    title: "Support",
    path: "support",
    kind: "folder",
    parentId: null,
  },
  {
    id: "cat",
    title: "Getting started",
    path: "support/getting-started",
    kind: "folder",
    parentId: "sup",
  },
  {
    id: "note",
    title: "Note",
    path: "knowledge-base/second-brain/note.md",
    kind: "document",
    parentId: "sb",
    updatedAt: 1_700_000_100_000,
  },
  {
    id: "nested",
    title: "Nested",
    path: "support/getting-started/nested",
    kind: "folder",
    parentId: "cat",
    updatedAt: 1_700_000_000_000,
  },
  {
    id: "support-doc",
    title: "Welcome",
    path: "support/getting-started/welcome.md",
    kind: "document",
    parentId: "cat",
    updatedAt: 1_700_000_200_000,
  },
  {
    id: "nested-doc",
    title: "Deep",
    path: "support/getting-started/nested/deep.md",
    kind: "document",
    parentId: "nested",
    updatedAt: 1_700_000_050_000,
  },
];

describe("spaces-categories", () => {
  it("detects overview vs drill-in paths", () => {
    assert.equal(isSpacesOverviewPath("/spaces"), true);
    assert.equal(isSpacesOverviewPath("/spaces/"), true);
    assert.equal(isSpacesOverviewPath("/knowledge"), true);
    assert.equal(isSpacesOverviewPath("/spaces/note"), false);
    assert.equal(knowledgePathShowsSidePanel("/spaces"), false);
    assert.equal(knowledgePathShowsSidePanel("/spaces/note"), true);
    assert.equal(knowledgePathShowsSidePanel("/knowledge/note"), true);
  });

  it("detects support center document paths", () => {
    assert.equal(isSupportCenterDocumentPath("support"), true);
    assert.equal(isSupportCenterDocumentPath("support/getting-started"), true);
    assert.equal(
      isSupportCenterDocumentPath("support/getting-started/welcome.md"),
      true,
    );
    assert.equal(isSupportCenterDocumentPath("/support/welcome.md"), true);
    assert.equal(
      isSupportCenterDocumentPath(SPACES_SECOND_BRAIN_RELATIVE),
      false,
    );
    assert.equal(isSupportCenterDocumentPath("knowledge-base"), false);
    assert.equal(isSupportCenterDocumentPath(null), false);
    assert.equal(normalizeSpacesDocumentPath("/support/a/"), "support/a");
  });

  it("detects website document paths", () => {
    assert.equal(isWebsiteDocumentPath("websites"), true);
    assert.equal(isWebsiteDocumentPath("websites/ldp"), true);
    assert.equal(isWebsiteDocumentPath("websites/ldp/home.md"), true);
    assert.equal(isWebsiteDocumentPath("/websites/ldp/about"), true);
    assert.equal(isWebsiteDocumentPath("support/acme"), false);
    assert.equal(isWebsiteDocumentPath("knowledge-base"), false);
    assert.equal(isWebsiteDocumentPath(null), false);
  });

  it("resolves spaces category via path or parent walk", () => {
    const docs = [
      {
        id: "websites-root",
        title: "Websites",
        path: "websites",
        kind: "folder" as const,
        parentId: null,
      },
      {
        id: "wp",
        title: "WordPress",
        path: "wordpress-local",
        kind: "folder" as const,
        parentId: "websites-root",
      },
      {
        id: "page",
        title: "Home",
        path: null,
        kind: "document" as const,
        parentId: "wp",
      },
    ];
    assert.equal(resolveSpacesCategoryId(docs[1], docs), "websites");
    assert.equal(resolveSpacesCategoryId(docs[2], docs), "websites");
    assert.equal(
      resolveSpacesCategoryId(
        { id: "x", title: "X", path: "support/acme", kind: "folder" },
        docs,
      ),
      "support",
    );
    assert.equal(resolveSpacesCategoryId(null, docs), null);
  });

  it("lists child folders under each category root", () => {
    assert.deepEqual(
      listSpaceChildFolders(docs, SPACES_CATEGORY_KNOWLEDGE_BASE).map(
        (d) => d.id,
      ),
      ["sb"],
    );
    assert.deepEqual(
      listSpaceChildFolders(docs, "support").map((d) => d.id),
      ["cat"],
    );
  });

  it("counts articles under a space including nested folders", () => {
    assert.equal(countArticlesInFolder(docs, "sb"), 1);
    assert.equal(countArticlesInFolder(docs, "cat"), 2);
    assert.equal(countArticlesInFolder(docs, "nested"), 1);
    assert.equal(countArticlesInFolder(docs, "missing"), 0);
  });

  it("picks the newest updatedAt under a space folder", () => {
    assert.equal(latestUpdatedAtInFolder(docs, "sb"), 1_700_000_100_000);
    assert.equal(latestUpdatedAtInFolder(docs, "cat"), 1_700_000_200_000);
    assert.equal(latestUpdatedAtInFolder(docs, "nested"), 1_700_000_050_000);
    assert.equal(latestUpdatedAtInFolder(docs, "missing"), null);
  });

  it("formats relative updated labels", () => {
    const now = 1_700_000_200_000;
    assert.equal(formatSpaceUpdatedLabel(now - 10_000, now), "just now");
    assert.equal(formatSpaceUpdatedLabel(now - 120_000, now), "2m ago");
    assert.equal(formatSpaceUpdatedLabel(now - 7_200_000, now), "2h ago");
    assert.equal(formatSpaceUpdatedLabel(null, now), null);
  });

  it("resolves last-updated freshness for the calendar icon", () => {
    const now = 1_700_000_200_000;
    const day = 86_400_000;
    assert.equal(resolveSpaceUpdatedFreshness(now - 3 * day, now), "fresh");
    assert.equal(resolveSpaceUpdatedFreshness(now - 8 * day, now), "stale");
    assert.equal(
      resolveSpaceUpdatedFreshness(now - 15 * day, now),
      "stale_long",
    );
    assert.equal(resolveSpaceUpdatedFreshness(null, now), null);
  });

  it("resolves space overview descriptions by stored, path, then category", () => {
    assert.equal(
      resolveSpaceOverviewDescription({
        path: SPACES_SECOND_BRAIN_RELATIVE,
        description: "Custom blurb",
        categoryId: "knowledge-base",
      }),
      "Custom blurb",
    );
    assert.equal(
      resolveSpaceOverviewDescription({
        path: SPACES_SECOND_BRAIN_RELATIVE,
        categoryId: "knowledge-base",
      }),
      "Personal notes, ideas, and lasting knowledge.",
    );
    assert.equal(
      resolveSpaceOverviewDescription({
        path: "websites/ldp",
        categoryId: "websites",
      }),
      "Pages and content for this website.",
    );
  });

  it("resolves space overview icons by path, stored icon, then category", () => {
    assert.equal(
      resolveSpaceOverviewIconKey({
        path: SPACES_SECOND_BRAIN_RELATIVE,
        categoryId: "knowledge-base",
      }),
      "second-brain",
    );
    assert.equal(
      resolveSpaceOverviewIconKey({
        path: "knowledge-base/custom-room",
        categoryId: "knowledge-base",
      }),
      "book",
    );
    assert.equal(
      resolveSpaceOverviewIconKey({
        path: "support/getting-started",
        categoryId: "support",
      }),
      "comment-discussion",
    );
    assert.equal(
      resolveSpaceOverviewIconKey({
        path: "websites/ldp",
        categoryId: "websites",
      }),
      "globe",
    );
    assert.equal(
      resolveSpaceOverviewIconKey({
        path: SPACES_SECOND_BRAIN_RELATIVE,
        icon: "cpu",
        categoryId: "knowledge-base",
      }),
      "cpu",
    );
  });

  it("scopes the tree to a space root and re-parents children", () => {
    const scoped = filterDocumentsForSpaceRoot(docs, "sb");
    assert.deepEqual(
      scoped.map((d) => d.id).sort(),
      ["note"],
    );
    assert.equal(scoped[0]?.parentId, null);

    const supportScoped = filterDocumentsForSpaceRoot(docs, "cat");
    assert.deepEqual(
      supportScoped.map((d) => d.id).sort(),
      ["nested", "nested-doc", "support-doc"],
    );
  });

  it("resolves the selected space root from pathname", () => {
    assert.equal(
      getSelectedSpaceRootFromPathname("/spaces", docs),
      null,
    );
    assert.equal(
      getSelectedSpaceRootFromPathname(
        `/spaces/${SPACES_SECOND_BRAIN_RELATIVE}`,
        docs,
      )?.id,
      "sb",
    );
    assert.equal(
      getSelectedSpaceRootFromPathname(
        "/spaces/knowledge-base/second-brain/note.md",
        docs,
      )?.id,
      "sb",
    );
    assert.equal(
      getSelectedSpaceRootFromPathname("/spaces/support/getting-started", docs)
        ?.id,
      "cat",
    );
    assert.equal(
      getSelectedSpaceRootFromPathname(
        `/knowledge/${SPACES_SECOND_BRAIN_RELATIVE}`,
        docs,
      )?.id,
      "sb",
    );
  });
});

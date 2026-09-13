import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createDefaultHelpArticleProperties,
  getHelpArticleAudienceLabel,
  HELP_ARTICLE_AUDIENCE_GROUP,
  HELP_ARTICLE_AUDIENCE_INDIVIDUAL,
  normalizeHelpArticleProperties,
} from "./help-article-properties.ts";
import { filterDocumentsForHelpArticleScope } from "./help-article-scope-storage.ts";
import {
  HELP_ARTICLE_INDIVIDUAL_FOLDER_SLUG,
  findHelpArticleIndividualRoot,
  helpArticleIndividualRootPath,
  isHelpArticleIndividualRootFolder,
} from "./help-article-individual-folder.ts";
import type { KnowledgeListItem } from "../navigation/entity-routes.ts";

describe("help-article-properties", () => {
  it("defaults to group with no contacts", () => {
    assert.deepEqual(createDefaultHelpArticleProperties("doc-1"), {
      id: "doc-1",
      audience: HELP_ARTICLE_AUDIENCE_GROUP,
      status: "concept",
      seoTitle: "",
      seoDescription: "",
      slug: "",
      contactIds: [],
      placementFolderId: null,
      placementFolderTitle: null,
      placementFolderPath: null,
    });
  });

  it("clears contacts and placement when audience is group", () => {
    const normalized = normalizeHelpArticleProperties({
      id: "doc-2",
      audience: HELP_ARTICLE_AUDIENCE_GROUP,
      contactIds: ["c-1", "c-2"],
      placementFolderId: "folder-1",
      placementFolderTitle: "Email setup",
      placementFolderPath: "support/email-setup",
    });
    assert.deepEqual(normalized.contactIds, []);
    assert.equal(normalized.placementFolderId, null);
    assert.equal(normalized.placementFolderTitle, null);
    assert.equal(normalized.placementFolderPath, null);
  });

  it("keeps contacts and placement when audience is individual", () => {
    const normalized = normalizeHelpArticleProperties({
      id: "doc-3",
      audience: HELP_ARTICLE_AUDIENCE_INDIVIDUAL,
      contactIds: ["c-1", "c-1", " c-2 ", ""],
      placementFolderId: "folder-1",
      placementFolderTitle: "Email setup",
      placementFolderPath: "support/email-setup",
    });
    assert.equal(normalized.audience, HELP_ARTICLE_AUDIENCE_INDIVIDUAL);
    assert.deepEqual(normalized.contactIds, ["c-1", "c-2"]);
    assert.equal(normalized.placementFolderId, "folder-1");
    assert.equal(normalized.placementFolderTitle, "Email setup");
    assert.equal(normalized.placementFolderPath, "support/email-setup");
  });

  it("labels audiences as Group / Individual", () => {
    assert.equal(
      getHelpArticleAudienceLabel(HELP_ARTICLE_AUDIENCE_GROUP),
      "Group",
    );
    assert.equal(
      getHelpArticleAudienceLabel(HELP_ARTICLE_AUDIENCE_INDIVIDUAL),
      "Individual",
    );
  });

  it("normalizes publish status for both audiences", () => {
    assert.equal(
      normalizeHelpArticleProperties({
        id: "doc-4",
        audience: HELP_ARTICLE_AUDIENCE_GROUP,
        status: "published",
      }).status,
      "published",
    );
    assert.equal(
      normalizeHelpArticleProperties({
        id: "doc-5",
        audience: HELP_ARTICLE_AUDIENCE_INDIVIDUAL,
        status: "nope" as never,
      }).status,
      "concept",
    );
    assert.equal(
      normalizeHelpArticleProperties({
        id: "doc-6",
        status: "draft" as never,
      }).status,
      "concept",
    );
    assert.equal(
      normalizeHelpArticleProperties({
        id: "doc-7",
        status: "archived" as never,
      }).status,
      "offline",
    );
  });

  it("keeps SEO details for publishing", async () => {
    const {
      composeHelpArticleSlug,
      helpArticleSlugLeaf,
      normalizeHelpArticleSlug,
      resolveHelpArticleSlugPrefix,
      rewriteHelpArticleSlugPrefix,
    } = await import("./help-article-properties.ts");
    const normalized = normalizeHelpArticleProperties({
      id: "doc-seo",
      seoTitle: "  Setup email  ",
      seoDescription: " How to connect your inbox. ",
      slug: " Setup Email! ",
    });
    assert.equal(normalized.seoTitle, "Setup email");
    assert.equal(normalized.seoDescription, "How to connect your inbox.");
    assert.equal(normalized.slug, "setup-email");
    assert.equal(normalizeHelpArticleSlug(" Setup Email! "), "setup-email");
    assert.equal(
      resolveHelpArticleSlugPrefix({
        folderPath: "support/email-setup",
        spaceRootPath: "support",
      }),
      "email-setup/",
    );
    assert.equal(
      resolveHelpArticleSlugPrefix({
        folderPath: "support/_individual/acme-emails",
        spaceRootPath: "support",
      }),
      "acme-emails/",
    );
    assert.equal(
      resolveHelpArticleSlugPrefix({
        folderPath: "support",
        spaceRootPath: "support",
      }),
      "",
    );
    assert.equal(
      composeHelpArticleSlug("email-setup/", "Setup Inbox"),
      "email-setup/setup-inbox",
    );
    assert.equal(
      helpArticleSlugLeaf("email-setup/setup-inbox", "email-setup/"),
      "setup-inbox",
    );
    assert.equal(
      rewriteHelpArticleSlugPrefix("email-setup/setup-inbox", "billing/"),
      "billing/setup-inbox",
    );
  });
});

describe("help-article-individual-folder", () => {
  it("detects the reserved root by path or title", () => {
    assert.equal(
      helpArticleIndividualRootPath("support"),
      `support/${HELP_ARTICLE_INDIVIDUAL_FOLDER_SLUG}`,
    );
    assert.equal(
      isHelpArticleIndividualRootFolder({
        kind: "folder",
        title: HELP_ARTICLE_INDIVIDUAL_FOLDER_SLUG,
        path: "support/_individual",
      }),
      true,
    );
    assert.equal(
      isHelpArticleIndividualRootFolder({
        kind: "folder",
        title: "Email setup",
        path: "support/email-setup",
      }),
      false,
    );
  });
});

describe("filterDocumentsForHelpArticleScope", () => {
  const docs: KnowledgeListItem[] = [
    {
      id: "ind-root",
      title: HELP_ARTICLE_INDIVIDUAL_FOLDER_SLUG,
      path: "support/_individual",
      kind: "folder",
      parentId: null,
    },
    {
      id: "ind-section",
      title: "Acme emails",
      path: "support/_individual/acme-emails",
      kind: "folder",
      parentId: "ind-root",
    },
    {
      id: "folder",
      title: "Getting started",
      path: "support/getting-started",
      kind: "folder",
      parentId: null,
    },
    {
      id: "group-doc",
      title: "Shared",
      path: "support/getting-started/shared.md",
      kind: "document",
      parentId: "folder",
    },
    {
      id: "client-doc",
      title: "Acme only",
      path: "support/_individual/acme-emails/acme.md",
      kind: "document",
      parentId: "ind-section",
    },
  ];

  it("keeps group folders and docs; hides the individual tree", () => {
    const group = filterDocumentsForHelpArticleScope(docs, "group", {
      "client-doc": "individual",
    });
    assert.deepEqual(
      group.map((d) => d.id).sort(),
      ["folder", "group-doc"].sort(),
    );
  });

  it("shows only the individual subtree (root omitted)", () => {
    assert.equal(findHelpArticleIndividualRoot(docs)?.id, "ind-root");
    const individual = filterDocumentsForHelpArticleScope(docs, "individual", {
      "client-doc": "individual",
    });
    assert.deepEqual(
      individual.map((d) => d.id).sort(),
      ["client-doc", "ind-section"].sort(),
    );
    assert.equal(
      individual.find((d) => d.id === "ind-section")?.parentId,
      null,
    );
  });
});

describe("listHelpArticlePlacementFolders", () => {
  it("lists support folders for Appears in placement", async () => {
    const { listHelpArticlePlacementFolders } = await import(
      "./help-article-placement.ts"
    );
    const docs: KnowledgeListItem[] = [
      {
        id: "ind-root",
        title: HELP_ARTICLE_INDIVIDUAL_FOLDER_SLUG,
        path: "support/_individual",
        kind: "folder",
      },
      {
        id: "email",
        title: "Email setup",
        path: "support/email-setup",
        kind: "folder",
      },
      {
        id: "billing",
        title: "Billing",
        path: "support/billing",
        kind: "folder",
      },
      {
        id: "group-doc",
        title: "Shared email",
        path: "support/email-setup/shared.md",
        kind: "document",
        parentId: "email",
      },
      {
        id: "solo",
        title: "Solo",
        path: "support/_individual/solo.md",
        kind: "document",
        parentId: "ind-root",
      },
    ];
    const folders = listHelpArticlePlacementFolders(docs, {
      solo: "individual",
    });
    assert.deepEqual(
      folders.map((f) => f.id),
      ["email", "billing"],
    );
  });
});

describe("listHelpArticleMoveFolders", () => {
  const docs: KnowledgeListItem[] = [
    {
      id: "space",
      title: "Support",
      path: "support",
      kind: "folder",
      parentId: null,
    },
    {
      id: "ind-root",
      title: HELP_ARTICLE_INDIVIDUAL_FOLDER_SLUG,
      path: "support/_individual",
      kind: "folder",
      parentId: "space",
    },
    {
      id: "ind-section",
      title: "Acme emails",
      path: "support/_individual/acme-emails",
      kind: "folder",
      parentId: "ind-root",
    },
    {
      id: "email",
      title: "Email setup",
      path: "support/email-setup",
      kind: "folder",
      parentId: "space",
    },
    {
      id: "billing",
      title: "Billing",
      path: "support/billing",
      kind: "folder",
      parentId: "space",
    },
  ];

  it("lists Group folders for moving articles", async () => {
    const { listHelpArticleMoveFolders } = await import(
      "./help-article-placement.ts"
    );
    assert.deepEqual(
      listHelpArticleMoveFolders(docs, "group", "space").map((f) => f.id),
      ["billing", "email"],
    );
  });

  it("lists Individual folders for moving articles", async () => {
    const { listHelpArticleMoveFolders } = await import(
      "./help-article-placement.ts"
    );
    assert.deepEqual(
      listHelpArticleMoveFolders(docs, "individual", "space").map((f) => f.id),
      ["ind-section"],
    );
  });

  it("treats space and individual roots as No folder", async () => {
    const { resolveHelpArticleFolderId } = await import(
      "./help-article-placement.ts"
    );
    assert.equal(
      resolveHelpArticleFolderId(
        { parentId: "space" },
        { audience: "group", spaceRootId: "space" },
      ),
      null,
    );
    assert.equal(
      resolveHelpArticleFolderId(
        { parentId: "ind-root" },
        {
          audience: "individual",
          spaceRootId: "space",
          individualRootId: "ind-root",
        },
      ),
      null,
    );
    assert.equal(
      resolveHelpArticleFolderId(
        { parentId: "email" },
        { audience: "group", spaceRootId: "space" },
      ),
      "email",
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupHelpArticleIndividualDocumentsByContact } from "./help-article-individual-groups.js";
import type { KnowledgeListItem } from "../navigation/entity-routes.js";

function doc(
  partial: Partial<KnowledgeListItem> & Pick<KnowledgeListItem, "id" | "title">,
): KnowledgeListItem {
  return {
    kind: "document",
    ...partial,
  };
}

describe("groupHelpArticleIndividualDocumentsByContact", () => {
  it("groups by primary contact and sorts labels", () => {
    const contactById = new Map([
      ["c-b", { name: "Bob", avatarSrc: null }],
      ["c-a", { name: "Ada", avatarSrc: "/a.png" }],
    ]);
    const groups = groupHelpArticleIndividualDocumentsByContact(
      [
        doc({ id: "1", title: "Zed", contactIds: ["c-b"] }),
        doc({ id: "2", title: "Alpha", contactIds: ["c-a", "c-b"] }),
        doc({ id: "3", title: "Loose", contactIds: [] }),
        doc({ id: "4", title: "Folder skip", kind: "folder" }),
      ],
      contactById,
    );

    assert.deepEqual(
      groups.map((group) => ({
        id: group.contactId,
        label: group.label,
        itemIds: group.items.map((item) => item.id),
      })),
      [
        { id: "c-a", label: "Ada", itemIds: ["2"] },
        { id: "c-b", label: "Bob", itemIds: ["1"] },
        { id: null, label: "No contacts", itemIds: ["3"] },
      ],
    );
    assert.equal(groups[0]?.avatarSrc, "/a.png");
  });

  it("uses contact id as fallback label", () => {
    const groups = groupHelpArticleIndividualDocumentsByContact([
      doc({ id: "1", title: "Doc", contactIds: ["missing"] }),
    ]);
    assert.equal(groups[0]?.label, "missing");
    assert.equal(groups[0]?.contactId, "missing");
  });
});

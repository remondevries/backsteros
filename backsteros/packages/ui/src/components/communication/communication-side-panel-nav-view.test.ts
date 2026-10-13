import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCommunicationSidePanelKeyboardItemIds } from "./communication-side-panel-nav-view.js";

describe("buildCommunicationSidePanelKeyboardItemIds", () => {
  it("nests mailbox ids under email in visual order", () => {
    assert.deepEqual(
      buildCommunicationSidePanelKeyboardItemIds([
        { inboxId: "box-sander", email: "sander@example.com", displayName: "Sander" },
        { inboxId: "box-ralph", email: "ralph@example.com", displayName: "Ralph" },
      ]),
      [
        "all",
        "email",
        "inbox:box-sander",
        "inbox:box-ralph",
        "whatsapp",
        "chat",
        "support",
      ],
    );
  });

  it("dedupes mailboxes by inbox id", () => {
    assert.deepEqual(
      buildCommunicationSidePanelKeyboardItemIds([
        {
          inboxId: "box-sander",
          email: "sander@example.com",
          displayName: "Sander",
        },
        {
          inboxId: "box-sander",
          email: "sander@example.com",
          displayName: "Sander",
        },
      ]),
      ["all", "email", "inbox:box-sander", "whatsapp", "chat", "support"],
    );
  });

  it("omits mailbox ids when Email accounts are collapsed", () => {
    assert.deepEqual(
      buildCommunicationSidePanelKeyboardItemIds(
        [
          {
            inboxId: "box-sander",
            email: "sander@example.com",
            displayName: "Sander",
          },
        ],
        { emailExpanded: false },
      ),
      ["all", "email", "whatsapp", "chat", "support"],
    );
  });
});

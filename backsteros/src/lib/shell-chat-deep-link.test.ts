import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseShellChatDeepLink,
  shellChatDeepLinkHref,
  shellChatDeepLinkScheme,
} from "./shell-chat-deep-link.js";

describe("parseShellChatDeepLink", () => {
  it("parses backsteros://chat/<threadId>?message=", () => {
    const parsed = parseShellChatDeepLink(
      "backsteros://chat/th_abc12345?message=msg_999",
    );
    assert.deepEqual(parsed, {
      threadId: "th_abc12345",
      messageId: "msg_999",
    });
  });

  it("parses /chat/<threadId>?message=", () => {
    const parsed = parseShellChatDeepLink(
      "/chat/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee?message=msg_1",
    );
    assert.deepEqual(parsed, {
      threadId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      messageId: "msg_1",
    });
  });

  it("returns null for unrelated hrefs", () => {
    assert.equal(parseShellChatDeepLink("/projects/OS"), null);
    assert.equal(parseShellChatDeepLink("https://example.com/chat/x"), null);
  });
});

describe("shellChatDeepLink builders", () => {
  it("builds matching scheme and href forms", () => {
    assert.equal(
      shellChatDeepLinkScheme("th_1", "m_2"),
      "backsteros://chat/th_1?message=m_2",
    );
    assert.equal(shellChatDeepLinkHref("th_1", "m_2"), "/chat/th_1?message=m_2");
  });
});

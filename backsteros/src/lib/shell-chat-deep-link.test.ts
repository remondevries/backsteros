import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isShellChatPendingLink,
  openShellChatDeepLink,
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

  it("allows thread-only links for notifications", () => {
    assert.deepEqual(parseShellChatDeepLink("backsteros://chat/th_abc12345"), {
      threadId: "th_abc12345",
      messageId: null,
    });
  });

  it("returns null for unrelated hrefs", () => {
    assert.equal(parseShellChatDeepLink("/projects/OS"), null);
    assert.equal(parseShellChatDeepLink("https://example.com/chat/x"), null);
    assert.equal(parseShellChatDeepLink("javascript:alert(1)"), null);
  });
});

describe("isShellChatPendingLink / openShellChatDeepLink", () => {
  it("requires message= for Channel pending links", () => {
    assert.equal(
      isShellChatPendingLink("backsteros://chat/th_abc12345?message=m1"),
      true,
    );
    assert.equal(isShellChatPendingLink("/chat/th_abc12345?message=m1"), true);
    assert.equal(isShellChatPendingLink("backsteros://chat/th_abc12345"), false);
    assert.equal(isShellChatPendingLink("https://evil.example/chat/x"), false);
    assert.equal(isShellChatPendingLink("grokbot://app/v1/agent?id=x"), false);
  });

  it("refuses to open non-pending forms when requirePendingForm is set", () => {
    assert.equal(
      openShellChatDeepLink("https://evil.example/phish", {
        requirePendingForm: true,
      }),
      false,
    );
    assert.equal(
      openShellChatDeepLink("backsteros://chat/th_abc12345", {
        requirePendingForm: true,
      }),
      false,
    );
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

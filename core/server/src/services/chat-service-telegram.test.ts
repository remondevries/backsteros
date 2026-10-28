import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mergeTelegramIdentityOnContact,
  resolveTelegramIdentityFromChatwoot,
  telegramMeUrl,
} from "../lib/telegram-contact-identity.js";

describe("OS-146 fillLinkedContactTelegram identity decision", () => {
  it("stores chat_id + username for an inbound Telegram sender", () => {
    const identity = resolveTelegramIdentityFromChatwoot({
      username: "remon",
      inboxSourceId: "7014761034",
    });
    const merged = mergeTelegramIdentityOnContact({
      telegramChatId: null,
      socialAccounts: [{ platform: "telegram", url: "https://t.me/remon" }],
      nextChatId: identity.chatId,
      nextUsername: identity.username,
    });
    assert.equal(merged.changed, true);
    assert.equal(merged.telegramChatId, "7014761034");
    assert.ok(
      merged.socialAccounts.some(
        (entry) => entry.url === "https://t.me/remon",
      ),
      "keeps existing t.me link",
    );
  });

  it("stores numeric chat_id when username field is the chat_id", () => {
    const identity = resolveTelegramIdentityFromChatwoot({
      username: "7014761034",
    });
    const merged = mergeTelegramIdentityOnContact({
      telegramChatId: null,
      socialAccounts: [],
      nextChatId: identity.chatId,
      nextUsername: identity.username,
    });
    assert.equal(merged.telegramChatId, "7014761034");
    assert.equal(merged.socialAccounts.length, 0);
  });

  it("skips telegramChatId when another contact already owns it, keeps username update", () => {
    const merged = mergeTelegramIdentityOnContact({
      telegramChatId: null,
      socialAccounts: [],
      nextChatId: "7014761034",
      nextUsername: "remon",
      chatIdTakenByOtherContact: true,
    });
    assert.equal(merged.skippedChatIdTaken, true);
    assert.equal(merged.telegramChatId, null);
    assert.deepEqual(merged.socialAccounts, [
      { platform: "telegram", url: telegramMeUrl("remon") },
    ]);
  });
});

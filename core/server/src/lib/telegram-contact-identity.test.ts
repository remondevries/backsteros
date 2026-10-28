import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mergeTelegramIdentityOnContact,
  normalizeTelegramChatId,
  normalizeTelegramUsername,
  resolveTelegramIdentityFromChatwoot,
  telegramMeUrl,
} from "./telegram-contact-identity.js";

describe("OS-146 Telegram contact identity", () => {
  it("normalizes chat_id digits and ignores handles", () => {
    assert.equal(normalizeTelegramChatId("7014761034"), "7014761034");
    assert.equal(normalizeTelegramChatId("@remon"), null);
    assert.equal(normalizeTelegramUsername("@remon"), "remon");
    assert.equal(normalizeTelegramUsername("7014761034"), null);
    assert.equal(
      normalizeTelegramUsername("https://t.me/RemonDevries"),
      "RemonDevries",
    );
  });

  it("merges chat_id and keeps/adds t.me username without dropping existing links", () => {
    const merged = mergeTelegramIdentityOnContact({
      telegramChatId: null,
      socialAccounts: [{ platform: "telegram", url: "https://t.me/oldhandle" }],
      nextChatId: "7014761034",
      nextUsername: "remon",
    });
    assert.equal(merged.changed, true);
    assert.equal(merged.telegramChatId, "7014761034");
    assert.deepEqual(merged.socialAccounts, [
      { platform: "telegram", url: "https://t.me/oldhandle" },
      { platform: "telegram", url: telegramMeUrl("remon") },
    ]);
  });

  it("does not overwrite a differing stored chat_id", () => {
    const merged = mergeTelegramIdentityOnContact({
      telegramChatId: "111",
      socialAccounts: [],
      nextChatId: "222",
      nextUsername: null,
    });
    assert.equal(merged.changed, false);
    assert.equal(merged.telegramChatId, "111");
    assert.equal(merged.skippedChatIdTaken, false);
  });

  it("skips claiming a chat_id taken by another contact but still updates username", () => {
    const merged = mergeTelegramIdentityOnContact({
      telegramChatId: null,
      socialAccounts: [],
      nextChatId: "7014761034",
      nextUsername: "remon",
      chatIdTakenByOtherContact: true,
    });
    assert.equal(merged.skippedChatIdTaken, true);
    assert.equal(merged.telegramChatId, null);
    assert.equal(merged.changed, true);
    assert.deepEqual(merged.socialAccounts, [
      { platform: "telegram", url: telegramMeUrl("remon") },
    ]);
  });

  it("resolves chat_id vs username from Chatwoot fields", () => {
    assert.deepEqual(
      resolveTelegramIdentityFromChatwoot({
        username: "remon",
        inboxSourceId: "7014761034",
      }),
      { chatId: "7014761034", username: "remon" },
    );
    assert.deepEqual(
      resolveTelegramIdentityFromChatwoot({
        username: "7014761034",
      }),
      { chatId: "7014761034", username: null },
    );
  });
});

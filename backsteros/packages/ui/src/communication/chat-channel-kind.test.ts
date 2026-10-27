import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  chatChannelKindLabel,
  resolveChatChannelKind,
} from "./chat-channel-kind.js";

describe("resolveChatChannelKind", () => {
  it("maps Telegram channels", () => {
    assert.equal(resolveChatChannelKind("Channel::Telegram"), "telegram");
    assert.equal(resolveChatChannelKind("telegram"), "telegram");
  });

  it("maps Instagram channels before Facebook / Messenger", () => {
    assert.equal(resolveChatChannelKind("Channel::Instagram"), "instagram");
    assert.equal(resolveChatChannelKind("instagram"), "instagram");
    assert.equal(
      resolveChatChannelKind("Channel::InstagramDirect"),
      "instagram",
    );
    // Facebook-page Instagram inbox: channel may still say FacebookPage.
    assert.equal(
      resolveChatChannelKind("Channel::FacebookPage", {
        inboxName: "Instagram — lemodesignn",
      }),
      "instagram",
    );
    assert.equal(
      resolveChatChannelKind("Channel::FacebookPage", {
        inboxName: "Messenger",
      }),
      "messenger",
    );
  });

  it("maps Facebook / Messenger channels", () => {
    assert.equal(resolveChatChannelKind("Channel::FacebookPage"), "messenger");
    assert.equal(resolveChatChannelKind("Channel::Facebook"), "messenger");
    assert.equal(resolveChatChannelKind("messenger"), "messenger");
  });

  it("maps WhatsApp channels", () => {
    assert.equal(resolveChatChannelKind("Channel::Whatsapp"), "whatsapp");
    assert.equal(resolveChatChannelKind("Channel::WhatsappCloud"), "whatsapp");
    assert.equal(resolveChatChannelKind("whatsapp"), "whatsapp");
    assert.equal(
      resolveChatChannelKind("Channel::Api", { inboxName: "WhatsApp Cloud" }),
      "whatsapp",
    );
  });

  it("maps X / Twitter channels", () => {
    assert.equal(resolveChatChannelKind("Channel::TwitterProfile"), "x");
    assert.equal(resolveChatChannelKind("Channel::X"), "x");
    assert.equal(resolveChatChannelKind("twitter"), "x");
    assert.equal(
      resolveChatChannelKind("Channel::Api", { inboxName: "X — @backsteros" }),
      "x",
    );
    // Custom X proxy via Chatwoot API — handle only in inbox / contact name.
    assert.equal(
      resolveChatChannelKind("Channel::Api", {
        inboxName: "Remon de Vries (@remondevries)",
      }),
      "x",
    );
    assert.equal(
      resolveChatChannelKind("Channel::Api", {
        contactName: "Remon de Vries (@remondevries)",
      }),
      "x",
    );
  });

  it("keeps website / API as generic chat", () => {
    assert.equal(resolveChatChannelKind("Channel::Api"), "chat");
    assert.equal(
      resolveChatChannelKind("Channel::Api", {
        contactName: "Coby van Beets-van der Hoeff",
      }),
      "chat",
    );
    assert.equal(resolveChatChannelKind("Channel::WebWidget"), "chat");
    assert.equal(resolveChatChannelKind(null), "chat");
  });
});

describe("chatChannelKindLabel", () => {
  it("labels each kind", () => {
    assert.equal(chatChannelKindLabel("telegram"), "Telegram");
    assert.equal(chatChannelKindLabel("instagram"), "Instagram");
    assert.equal(chatChannelKindLabel("messenger"), "Messenger");
    assert.equal(chatChannelKindLabel("whatsapp"), "WhatsApp");
    assert.equal(chatChannelKindLabel("x"), "X");
    assert.equal(chatChannelKindLabel("chat"), "Chat");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  chatChannelSocialKind,
  chatChannelSocialOffer,
  chatFacebookMessengerIdOffer,
  findContactForFacebookMessengerOffer,
  matchChatContact,
  normalizeFacebookHandle,
  normalizeInstagramHandle,
  normalizeTelegramHandle,
  resolveChatContact,
  withChatChannelSocialAccount,
  withFacebookSocialAccount,
  withInstagramSocialAccount,
  withTelegramSocialAccount,
  withWhatsAppSocialAccount,
  withXSocialAccount,
  normalizeWhatsAppHandle,
  normalizeXHandle,
} from "./match-chat-contact.js";

describe("matchChatContact", () => {
  it("matches by email", () => {
    const contacts = [
      { id: "c1", email: "ada@example.com" },
      {
        id: "c2",
        emails: [{ address: "bob@work.test" }],
      },
    ];
    assert.equal(
      matchChatContact(contacts, { contactEmail: "bob@work.test" })?.id,
      "c2",
    );
  });

  it("matches by phone when email is missing", () => {
    const contacts = [{ id: "c1", phone: "+31 6 1550 8080" }];
    assert.equal(
      matchChatContact(contacts, { contactPhone: "+31615508080" })?.id,
      "c1",
    );
  });

  it("matches by Telegram social handle", () => {
    const contacts = [
      {
        id: "c1",
        socialAccounts: [{ platform: "Telegram", url: "https://t.me/remon" }],
      },
    ];
    assert.equal(
      matchChatContact(contacts, { contactUsername: "@Remon" })?.id,
      "c1",
    );
  });

  it("matches Facebook by facebookMessengerId", () => {
    const contacts = [
      { id: "c1", facebookMessengerId: "5232323873480533" },
    ];
    assert.equal(
      matchChatContact(contacts, {
        channelType: "Channel::FacebookPage",
        contactUsername: "5232323873480533",
      })?.id,
      "c1",
    );
  });

  it("matches by Instagram social handle", () => {
    const contacts = [
      {
        id: "c1",
        socialAccounts: [
          {
            platform: "Instagram",
            url: "https://www.instagram.com/remon_devries",
          },
        ],
      },
    ];
    assert.equal(
      matchChatContact(contacts, {
        channelType: "Channel::Instagram",
        contactUsername: "remon_devries",
      })?.id,
      "c1",
    );
  });

  it("matches WhatsApp by phone / wa.me social", () => {
    const contacts = [
      {
        id: "c1",
        phone: "+31 6 1550 8080",
        socialAccounts: [
          { platform: "WhatsApp", url: "https://wa.me/31615508080" },
        ],
      },
    ];
    assert.equal(
      matchChatContact(contacts, {
        channelType: "Channel::Whatsapp",
        contactUsername: "31615508080",
      })?.id,
      "c1",
    );
  });

  it("matches by X social handle", () => {
    const contacts = [
      {
        id: "c1",
        socialAccounts: [{ platform: "X", url: "https://x.com/remon_devries" }],
      },
    ];
    assert.equal(
      matchChatContact(contacts, {
        channelType: "Channel::TwitterProfile",
        contactUsername: "@Remon_Devries",
      })?.id,
      "c1",
    );
  });

  it("returns null when nothing matches", () => {
    assert.equal(
      matchChatContact([{ id: "c1", email: "ada@example.com" }], {
        contactEmail: "other@example.com",
        contactPhone: "+1000",
        contactUsername: "nobody",
      }),
      null,
    );
  });
});

describe("resolveChatContact", () => {
  it("prefers durable contactId over soft-match", () => {
    const contacts = [
      { id: "c1", email: "ada@example.com" },
      { id: "c2", email: "bob@example.com" },
    ];
    assert.equal(
      resolveChatContact(contacts, {
        contactId: "c2",
        contactEmail: "ada@example.com",
      })?.id,
      "c2",
    );
  });

  it("falls back to soft-match when contactId is missing", () => {
    const contacts = [{ id: "c1", email: "ada@example.com" }];
    assert.equal(
      resolveChatContact(contacts, {
        contactId: null,
        contactEmail: "ada@example.com",
      })?.id,
      "c1",
    );
  });

  it("falls back when durable contactId is stale", () => {
    const contacts = [{ id: "c1", email: "ada@example.com" }];
    assert.equal(
      resolveChatContact(contacts, {
        contactId: "missing",
        contactEmail: "ada@example.com",
      })?.id,
      "c1",
    );
  });
});

describe("normalizeTelegramHandle", () => {
  it("strips @ and t.me URLs", () => {
    assert.equal(normalizeTelegramHandle("@Remon"), "remon");
    assert.equal(normalizeTelegramHandle("https://t.me/Remon"), "remon");
    assert.equal(normalizeTelegramHandle("t.me/Remon?start=1"), "remon");
  });
});

describe("withTelegramSocialAccount", () => {
  it("adds a Telegram social account when missing", () => {
    assert.deepEqual(withTelegramSocialAccount([], "@remon"), [
      { platform: "Telegram", url: "https://t.me/remon" },
    ]);
  });

  it("returns null when the handle is already present", () => {
    assert.equal(
      withTelegramSocialAccount(
        [{ platform: "Telegram", url: "https://t.me/remon" }],
        "@Remon",
      ),
      null,
    );
  });
});

describe("withFacebookSocialAccount", () => {
  it("stores numeric Facebook ids as profile.php URLs", () => {
    assert.deepEqual(withFacebookSocialAccount([], "1029384756"), [
      {
        platform: "Facebook",
        url: "https://www.facebook.com/profile.php?id=1029384756",
      },
    ]);
  });

  it("stores vanity handles as facebook.com URLs", () => {
    assert.deepEqual(withFacebookSocialAccount([], "remon.design"), [
      { platform: "Facebook", url: "https://www.facebook.com/remon.design" },
    ]);
  });
});

describe("withInstagramSocialAccount", () => {
  it("adds an Instagram social account when missing", () => {
    assert.deepEqual(withInstagramSocialAccount([], "@remon_devries"), [
      {
        platform: "Instagram",
        url: "https://www.instagram.com/remon_devries",
      },
    ]);
  });

  it("skips opaque numeric Instagram-scoped ids", () => {
    assert.equal(withInstagramSocialAccount([], "5174845292553392"), null);
  });

  it("returns null when the handle is already present", () => {
    assert.equal(
      withInstagramSocialAccount(
        [
          {
            platform: "Instagram",
            url: "https://www.instagram.com/remon_devries",
          },
        ],
        "remon_devries",
      ),
      null,
    );
  });
});

describe("withChatChannelSocialAccount", () => {
  it("maps Telegram channels to Telegram social", () => {
    assert.deepEqual(
      withChatChannelSocialAccount([], {
        channelType: "Channel::Telegram",
        contactUsername: "@remon",
      }),
      [{ platform: "Telegram", url: "https://t.me/remon" }],
    );
  });

  it("maps Instagram channels to Instagram social", () => {
    assert.deepEqual(
      withChatChannelSocialAccount([], {
        channelType: "Channel::Instagram",
        contactUsername: "remon_devries",
      }),
      [
        {
          platform: "Instagram",
          url: "https://www.instagram.com/remon_devries",
        },
      ],
    );
  });

  it("maps Facebook/Messenger channels to Facebook social", () => {
    assert.deepEqual(
      withChatChannelSocialAccount([], {
        channelType: "Channel::FacebookPage",
        contactUsername: "1029384756",
      }),
      [
        {
          platform: "Facebook",
          url: "https://www.facebook.com/profile.php?id=1029384756",
        },
      ],
    );
  });
});

describe("withWhatsAppSocialAccount", () => {
  it("adds a WhatsApp social account when missing", () => {
    assert.deepEqual(withWhatsAppSocialAccount([], "+31 6 1550 8080"), [
      { platform: "WhatsApp", url: "https://wa.me/31615508080" },
    ]);
  });

  it("returns null when the number is already present", () => {
    assert.equal(
      withWhatsAppSocialAccount(
        [{ platform: "WhatsApp", url: "https://wa.me/31615508080" }],
        "31615508080",
      ),
      null,
    );
  });
});

describe("withXSocialAccount", () => {
  it("adds an X social account when missing", () => {
    assert.deepEqual(withXSocialAccount([], "@remon_devries"), [
      { platform: "X", url: "https://x.com/remon_devries" },
    ]);
  });

  it("skips opaque numeric X user ids", () => {
    assert.equal(withXSocialAccount([], "2244994945"), null);
  });
});

describe("chatChannelSocialKind", () => {
  it("classifies channel types", () => {
    assert.equal(chatChannelSocialKind("Channel::Telegram"), "telegram");
    assert.equal(chatChannelSocialKind("Channel::Instagram"), "instagram");
    assert.equal(chatChannelSocialKind("Channel::Whatsapp"), "whatsapp");
    assert.equal(chatChannelSocialKind("Channel::TwitterProfile"), "x");
    assert.equal(chatChannelSocialKind("Channel::X"), "x");
    assert.equal(chatChannelSocialKind("Channel::FacebookPage"), "facebook");
    assert.equal(chatChannelSocialKind("Channel::Api"), null);
  });
});

describe("chatChannelSocialOffer", () => {
  it("offers Telegram when the contact is missing the handle", () => {
    const offer = chatChannelSocialOffer([], {
      channelType: "Channel::Telegram",
      contactUsername: "@remon",
    });
    assert.equal(offer?.platform, "Telegram");
    assert.equal(offer?.displayHandle, "@remon");
    assert.equal(offer?.opaqueId, false);
    assert.deepEqual(offer?.nextAccounts, [
      { platform: "Telegram", url: "https://t.me/remon" },
    ]);
  });

  it("treats numeric Facebook PSIDs as opaque ids, not public handles", () => {
    const offer = chatChannelSocialOffer([], {
      channelType: "Channel::FacebookPage",
      contactUsername: "5232323873480533",
    });
    assert.equal(offer?.platform, "Facebook");
    assert.equal(offer?.handle, "5232323873480533");
    assert.equal(offer?.displayHandle, null);
    assert.equal(offer?.opaqueId, true);
  });

  it("keeps Facebook vanity names as display handles", () => {
    const offer = chatChannelSocialOffer([], {
      channelType: "Channel::FacebookPage",
      contactUsername: "lemo.design",
    });
    assert.equal(offer?.displayHandle, "lemo.design");
    assert.equal(offer?.opaqueId, false);
  });

  it("returns null when the social is already present", () => {
    assert.equal(
      chatChannelSocialOffer(
        [{ platform: "Telegram", url: "https://t.me/remon" }],
        {
          channelType: "Channel::Telegram",
          contactUsername: "@Remon",
        },
      ),
      null,
    );
  });

  it("returns null when the visitor has no channel username", () => {
    assert.equal(
      chatChannelSocialOffer([], {
        channelType: "Channel::Telegram",
        contactUsername: null,
      }),
      null,
    );
  });

  it("offers Instagram when the contact is missing the handle", () => {
    const offer = chatChannelSocialOffer([], {
      channelType: "Channel::Instagram",
      contactUsername: "remon_devries",
    });
    assert.equal(offer?.platform, "Instagram");
    assert.equal(offer?.displayHandle, "@remon_devries");
    assert.equal(offer?.opaqueId, false);
    assert.deepEqual(offer?.nextAccounts, [
      {
        platform: "Instagram",
        url: "https://www.instagram.com/remon_devries",
      },
    ]);
  });

  it("skips Instagram opaque numeric ids", () => {
    assert.equal(
      chatChannelSocialOffer([], {
        channelType: "Channel::Instagram",
        contactUsername: "5174845292553392",
      }),
      null,
    );
  });

  it("offers WhatsApp when the contact is missing the number", () => {
    const offer = chatChannelSocialOffer([], {
      channelType: "Channel::Whatsapp",
      contactUsername: "+31615508080",
    });
    assert.equal(offer?.platform, "WhatsApp");
    assert.equal(offer?.displayHandle, "+31615508080");
    assert.deepEqual(offer?.nextAccounts, [
      { platform: "WhatsApp", url: "https://wa.me/31615508080" },
    ]);
  });

  it("offers X when the contact is missing the handle", () => {
    const offer = chatChannelSocialOffer([], {
      channelType: "Channel::TwitterProfile",
      contactUsername: "remon_devries",
    });
    assert.equal(offer?.platform, "X");
    assert.equal(offer?.displayHandle, "@remon_devries");
    assert.deepEqual(offer?.nextAccounts, [
      { platform: "X", url: "https://x.com/remon_devries" },
    ]);
  });
});

describe("normalizeWhatsAppHandle", () => {
  it("strips to digits from phones and wa.me URLs", () => {
    assert.equal(normalizeWhatsAppHandle("+31 6 1550 8080"), "31615508080");
    assert.equal(
      normalizeWhatsAppHandle("https://wa.me/31615508080"),
      "31615508080",
    );
  });
});

describe("normalizeXHandle", () => {
  it("strips @ and x.com / twitter.com URLs", () => {
    assert.equal(normalizeXHandle("@Remon_Devries"), "remon_devries");
    assert.equal(
      normalizeXHandle("https://x.com/remon_devries"),
      "remon_devries",
    );
    assert.equal(
      normalizeXHandle("https://twitter.com/remon_devries"),
      "remon_devries",
    );
  });
});

describe("normalizeInstagramHandle", () => {
  it("strips @ and instagram.com URLs", () => {
    assert.equal(normalizeInstagramHandle("@Remon_Devries"), "remon_devries");
    assert.equal(
      normalizeInstagramHandle("https://www.instagram.com/remon_devries/"),
      "remon_devries",
    );
    assert.equal(
      normalizeInstagramHandle("instagram.com/remon_devries?hl=en"),
      "remon_devries",
    );
  });
});

describe("chatFacebookMessengerIdOffer", () => {
  it("offers when the contact is missing the Messenger id", () => {
    assert.equal(
      chatFacebookMessengerIdOffer(null, "5232323873480533"),
      "5232323873480533",
    );
    assert.equal(
      chatFacebookMessengerIdOffer(
        { facebookMessengerId: null },
        "5232323873480533",
      ),
      "5232323873480533",
    );
  });

  it("returns null when already set", () => {
    assert.equal(
      chatFacebookMessengerIdOffer(
        { facebookMessengerId: "5232323873480533" },
        "5232323873480533",
      ),
      null,
    );
  });
});

describe("findContactForFacebookMessengerOffer", () => {
  it("prefers the durable matched contact", () => {
    const matched = { id: "c1", name: "Remon de Vries" };
    assert.equal(
      findContactForFacebookMessengerOffer(
        [
          matched,
          { id: "c2", name: "Remon de Vries", organizationId: "o1" },
        ],
        { matchedContact: matched, contactName: "Remon de Vries" },
      )?.id,
      "c1",
    );
  });

  it("matches a unique name within the linked organization", () => {
    assert.equal(
      findContactForFacebookMessengerOffer(
        [
          {
            id: "c1",
            name: "Remon de Vries",
            organizationId: "o1",
          },
          { id: "c2", name: "Other", organizationId: "o1" },
        ],
        {
          contactName: "Remon de Vries",
          organizationId: "o1",
        },
      )?.id,
      "c1",
    );
  });

  it("returns null when the name is ambiguous", () => {
    assert.equal(
      findContactForFacebookMessengerOffer(
        [
          { id: "c1", name: "Remon de Vries" },
          { id: "c2", name: "Remon de Vries" },
        ],
        { contactName: "Remon de Vries" },
      ),
      null,
    );
  });
});

describe("normalizeFacebookHandle", () => {
  it("extracts ids from profile URLs", () => {
    assert.equal(
      normalizeFacebookHandle(
        "https://www.facebook.com/profile.php?id=1029384756",
      ),
      "1029384756",
    );
    assert.equal(
      normalizeFacebookHandle("https://www.facebook.com/remon.design"),
      "remon.design",
    );
  });
});

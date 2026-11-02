import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { channelRoomOwnerXHandleFromSocialAccounts } from "./channel-room-owner.js";

describe("channelRoomOwnerXHandleFromSocialAccounts", () => {
  it("extracts an @handle from x.com / twitter social urls", () => {
    assert.equal(
      channelRoomOwnerXHandleFromSocialAccounts([
        { platform: "X", url: "https://x.com/remondevries" },
      ]),
      "remondevries",
    );
    assert.equal(
      channelRoomOwnerXHandleFromSocialAccounts([
        { platform: "Twitter", url: "https://twitter.com/remon_devries" },
      ]),
      "remon_devries",
    );
  });

  it("ignores non-X platforms and numeric path segments", () => {
    assert.equal(
      channelRoomOwnerXHandleFromSocialAccounts([
        { platform: "Instagram", url: "https://www.instagram.com/remon_devries" },
        { platform: "X", url: "https://x.com/i/user/12345" },
      ]),
      null,
    );
  });
});

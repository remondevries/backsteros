import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clerkHandshakeQueryFromUrl,
  mergeClerkHandshakeQuery,
} from "./clerk-oauth-handoff.ts";

describe("mergeClerkHandshakeQuery", () => {
  it("merges Clerk handoff params onto the current app URL", () => {
    const next = mergeClerkHandshakeQuery(
      "tauri://localhost/",
      "__clerk_handshake=abc&__clerk_db_jwt=dvb_1&other=1",
    );
    assert.ok(next);
    const url = new URL(next!);
    assert.equal(url.searchParams.get("__clerk_handshake"), "abc");
    assert.equal(url.searchParams.get("__clerk_db_jwt"), "dvb_1");
    assert.equal(url.searchParams.get("other"), null);
  });

  it("returns null when nothing changes", () => {
    assert.equal(
      mergeClerkHandshakeQuery(
        "tauri://localhost/?__clerk_handshake=abc",
        "__clerk_handshake=abc",
      ),
      null,
    );
  });

  it("preserves hash routes used by Clerk SignIn", () => {
    const next = mergeClerkHandshakeQuery(
      "https://tauri.localhost/#/inbox",
      "?__clerk_handshake=tok",
    );
    assert.ok(next);
    const url = new URL(next!);
    assert.equal(url.hash, "#/inbox");
    assert.equal(url.searchParams.get("__clerk_handshake"), "tok");
  });
});

describe("clerkHandshakeQueryFromUrl", () => {
  it("extracts only __clerk_ params", () => {
    assert.equal(
      clerkHandshakeQueryFromUrl(
        "https://tender.accounts.dev/popup-callback?__clerk_handshake=h&__clerk_db_jwt=d&x=1",
      ),
      "__clerk_handshake=h&__clerk_db_jwt=d",
    );
  });
});

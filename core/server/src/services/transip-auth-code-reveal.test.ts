import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { revealTransipDomainAuthCode } from "./transip-domains-sync.js";

describe("revealTransipDomainAuthCode", () => {
  it("writes an audit entry (without the code) then fetches auth-code", async () => {
    const audits: Array<{
      workspaceId: string;
      domainName: string;
      actor: {
        kind: string;
        userId: string | null;
        apiKeyId: string | null;
        contactId: string | null;
      };
    }> = [];
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      return new Response(JSON.stringify({ authCode: "EPP-SECRET" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const result = await revealTransipDomainAuthCode(
      "ws-1",
      "AnyAnimal.NL",
      {
        kind: "local_shell",
        userId: "owner-1",
        apiKeyId: null,
        apiKeyName: null,
        contactId: null,
      },
      {
        accessToken: "token",
        fetchImpl,
        recordAudit: async (entry) => {
          audits.push(entry);
        },
      },
    );

    assert.equal(audits.length, 1);
    assert.equal(audits[0]?.domainName, "anyanimal.nl");
    assert.equal(audits[0]?.actor.userId, "owner-1");
    assert.equal(audits[0]?.actor.kind, "local_shell");
    assert.equal(
      JSON.stringify(audits[0]).includes("EPP-SECRET"),
      false,
      "audit must never contain the auth code",
    );
    assert.equal(calls.length, 1);
    assert.ok(calls[0]?.includes("/domains/anyanimal.nl/auth-code"));
    assert.deepEqual(result, {
      domainName: "anyanimal.nl",
      authCode: "EPP-SECRET",
      error: null,
    });
  });
});

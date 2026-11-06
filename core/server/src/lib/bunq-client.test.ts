import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertBunqPermittedIps,
  assertBunqSandboxApiKey,
  assertBunqSandboxBaseUrl,
  BUNQ_SANDBOX_API_BASE,
  BunqClient,
  BunqLiveApiRefusedError,
  generateBunqSigningKeyPair,
  mapBunqMonetaryAccount,
  mapBunqPayment,
  signBunqRequestBody,
} from "./bunq-client.js";

describe("bunq-client sandbox guards", () => {
  it("allows only the official sandbox API base", () => {
    const url = assertBunqSandboxBaseUrl(BUNQ_SANDBOX_API_BASE);
    assert.equal(url.hostname, "public-api.sandbox.bunq.com");
  });

  it("refuses live api.bunq.com", () => {
    assert.throws(
      () => assertBunqSandboxBaseUrl("https://api.bunq.com/v1"),
      (error: unknown) => error instanceof BunqLiveApiRefusedError,
    );
  });

  it("refuses non-sandbox hosts even when path looks like v1", () => {
    assert.throws(
      () => assertBunqSandboxBaseUrl("https://example.com/v1"),
      (error: unknown) => error instanceof BunqLiveApiRefusedError,
    );
  });

  it("accepts sandbox_ API keys only", () => {
    assert.equal(
      assertBunqSandboxApiKey("sandbox_test_key_abc"),
      "sandbox_test_key_abc",
    );
    assert.throws(
      () => assertBunqSandboxApiKey("live-looking-production-key"),
      (error: unknown) => error instanceof BunqLiveApiRefusedError,
    );
  });

  it("rejects wildcard permitted_ips", () => {
    assert.throws(
      () => assertBunqPermittedIps(["*"]),
      (error: unknown) =>
        error instanceof Error && error.message.includes("wildcards"),
    );
    assert.deepEqual(assertBunqPermittedIps(["203.0.113.10"]), ["203.0.113.10"]);
  });
});

describe("bunq-client mappers", () => {
  it("maps monetary accounts with IBAN alias and balance", () => {
    const mapped = mapBunqMonetaryAccount({
      id: 42,
      description: "Main",
      currency: "EUR",
      status: "ACTIVE",
      balance: { value: "12.34", currency: "EUR" },
      alias: [{ type: "IBAN", value: "NL00BUNQ0000000000" }],
    });
    assert.equal(mapped?.id, "42");
    assert.equal(mapped?.iban, "NL00BUNQ0000000000");
    assert.equal(mapped?.balance?.value, "12.34");
  });

  it("maps payments with counterparty label", () => {
    const mapped = mapBunqPayment({
      id: "7",
      created: "2026-11-06 10:00:00.000000",
      amount: { value: "-5.00", currency: "EUR" },
      description: "Coffee",
      type: "BUNQ",
      sub_type: "PAYMENT",
      counterparty_alias: {
        display_name: "Cafe",
        type: "IBAN",
        value: "NL00BUNQ1111111111",
      },
    });
    assert.equal(mapped?.id, "7");
    assert.equal(mapped?.counterpartyName, "Cafe");
    assert.equal(mapped?.counterpartyIban, "NL00BUNQ1111111111");
    assert.equal(mapped?.amount?.value, "-5.00");
  });
});

describe("bunq-client signing + mocked session flow", () => {
  it("signs request bodies with the RSA private key", () => {
    const { privateKeyPem } = generateBunqSigningKeyPair();
    const signature = signBunqRequestBody(privateKeyPem, '{"hello":"world"}');
    assert.ok(signature.length > 32);
  });

  it("runs installation → device → session → list accounts against a fake fetch", async () => {
    const { privateKeyPem } = generateBunqSigningKeyPair();
    const calls: Array<{ method: string; url: string; body: string | undefined }> =
      [];

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string"
          ? init.body
          : init?.body == null
            ? undefined
            : String(init.body);
      calls.push({ method, url, body });

      if (url.endsWith("/installation") && method === "POST") {
        return new Response(
          JSON.stringify({
            Response: [
              { Id: { id: 1 } },
              { Token: { token: "install-token", id: 1 } },
              {
                ServerPublicKey: {
                  server_public_key: "-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----",
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/device-server") && method === "POST") {
        assert.ok(body?.includes("sandbox_fake_key"));
        assert.ok(body?.includes("203.0.113.10"));
        assert.equal(
          (init?.headers as Record<string, string>)?.[
            "X-Bunq-Client-Authentication"
          ],
          "install-token",
        );
        assert.ok(
          (init?.headers as Record<string, string>)?.[
            "X-Bunq-Client-Signature"
          ],
        );
        return new Response(JSON.stringify({ Response: [{ Id: { id: 99 } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/session-server") && method === "POST") {
        return new Response(
          JSON.stringify({
            Response: [
              { Id: { id: 2 } },
              { Token: { token: "session-token", id: 2 } },
              { UserPerson: { id: 55, display_name: "Sandbox" } },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/payment") && method === "GET") {
        return new Response(
          JSON.stringify({
            Response: [
              {
                Payment: {
                  id: 9,
                  created: "2026-11-06 12:00:00.000000",
                  amount: { value: "1.00", currency: "EUR" },
                  description: "Top-up",
                  type: "BUNQ",
                  sub_type: "PAYMENT",
                  counterparty_alias: {
                    display_name: "Self",
                    type: "IBAN",
                    value: "NL00BUNQ0000000000",
                  },
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.includes("/user/55/monetary-account") &&
        !url.includes("/payment") &&
        method === "GET"
      ) {
        return new Response(
          JSON.stringify({
            Response: [
              {
                MonetaryAccountBank: {
                  id: 100,
                  description: "Checking",
                  status: "ACTIVE",
                  currency: "EUR",
                  balance: { value: "10.00", currency: "EUR" },
                  alias: [{ type: "IBAN", value: "NL00BUNQ0000000000" }],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(`unexpected ${method} ${url}`, { status: 500 });
    };

    const client = new BunqClient({
      apiKey: "sandbox_fake_key",
      signingPrivateKeyPem: privateKeyPem,
      permittedIps: ["203.0.113.10"],
      fetchImpl,
    });

    const context = await client.ensureApiContext({ forceNewSession: true });
    assert.equal(context.installationToken, "install-token");
    assert.equal(context.deviceId, "99");
    assert.equal(context.sessionToken, "session-token");
    assert.equal(context.userId, "55");

    const accounts = await client.listMonetaryAccounts();
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0]?.id, "100");
    assert.equal(accounts[0]?.balance?.value, "10.00");

    const payments = await client.listPayments("100", { count: 10 });
    assert.equal(payments.length, 1);
    assert.equal(payments[0]?.description, "Top-up");

    assert.ok(calls.some((call) => call.url.endsWith("/installation")));
    assert.ok(calls.some((call) => call.url.endsWith("/device-server")));
    assert.ok(calls.some((call) => call.url.endsWith("/session-server")));
  });

  it("refuses constructing a client pointed at the live host", () => {
    const { privateKeyPem } = generateBunqSigningKeyPair();
    assert.throws(
      () =>
        new BunqClient({
          baseUrl: "https://api.bunq.com/v1",
          apiKey: "sandbox_fake_key",
          signingPrivateKeyPem: privateKeyPem,
          permittedIps: ["203.0.113.10"],
        }),
      (error: unknown) => error instanceof BunqLiveApiRefusedError,
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertBunqApiKey,
  assertBunqBaseUrl,
  assertBunqPermittedIps,
  assertBunqSandboxApiKey,
  assertBunqSandboxBaseUrl,
  BUNQ_PRODUCTION_API_BASE,
  BUNQ_SANDBOX_API_BASE,
  BunqApiError,
  BunqClient,
  BunqLiveApiRefusedError,
  BunqPaymentAmbiguousOutcomeError,
  extractBunqErrorDescriptions,
  formatBunqHttpFailure,
  generateBunqSigningKeyPair,
  mapBunqMonetaryAccount,
  mapBunqPayment,
  signBunqRequestBody,
} from "./bunq-client.js";

describe("bunq error sanitization", () => {
  it("extracts error_description without exposing the raw body shape secrets", () => {
    const body = JSON.stringify({
      Error: [
        {
          error_description:
            "User credentials are incorrect. Incorrect API key or IP address.",
          error_description_translated: "…",
        },
      ],
    });
    assert.deepEqual(extractBunqErrorDescriptions(body), [
      "User credentials are incorrect. Incorrect API key or IP address.",
    ]);
  });

  it("maps session-server auth rejection to reconnect guidance", () => {
    const body = JSON.stringify({
      Error: [
        {
          error_description:
            "User credentials are incorrect. Incorrect API key or IP address.",
        },
      ],
    });
    const formatted = formatBunqHttpFailure(
      "POST",
      "/session-server",
      400,
      body,
    );
    assert.equal(formatted.code, "bunq_auth_rejected");
    assert.match(formatted.message, /API key or egress IP/i);
    assert.match(formatted.message, /Settings → bunq/i);
    assert.equal(formatted.message.includes("sk_"), false);
  });

  it("keeps generic path/status when bunq body has no Error descriptions", () => {
    const formatted = formatBunqHttpFailure("POST", "/session-server", 400, "{}");
    assert.equal(formatted.code, "bunq_api_error");
    assert.equal(formatted.message, "bunq POST /session-server failed (400)");
  });

  it("surfaces non-auth bunq descriptions without blind retry language", () => {
    const body = JSON.stringify({
      Error: [{ error_description: "Too many requests please slow down." }],
    });
    const formatted = formatBunqHttpFailure("GET", "/user/1/monetary-account", 429, body);
    assert.equal(formatted.code, "bunq_api_error");
    assert.match(formatted.message, /Too many requests/i);
    assert.equal(/reconnect|retry automatically/i.test(formatted.message), false);
  });

  it("requestJson attaches formatted auth rejection on session-server 400", async () => {
    const { privateKeyPem } = generateBunqSigningKeyPair();
    const client = new BunqClient({
      apiKey: "sandbox_fake_key",
      signingPrivateKeyPem: privateKeyPem,
      permittedIps: ["203.0.113.10"],
      installationToken: "inst",
      environment: "sandbox",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            Error: [
              {
                error_description:
                  "User credentials are incorrect. Incorrect API key or IP address.",
              },
            ],
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
    });
    await assert.rejects(
      () => client.createSession(),
      (error: unknown) =>
        error instanceof BunqApiError &&
        error.status === 400 &&
        error.code === "bunq_auth_rejected" &&
        /Settings → bunq/i.test(error.message),
    );
  });
});

describe("bunq-client sandbox guards", () => {
  it("allows only the official sandbox API base", () => {
    const url = assertBunqSandboxBaseUrl(BUNQ_SANDBOX_API_BASE);
    assert.equal(url.hostname, "public-api.sandbox.bunq.com");
  });

  it("refuses live api.bunq.com on the sandbox path", () => {
    assert.throws(
      () => assertBunqSandboxBaseUrl("https://api.bunq.com/v1"),
      (error: unknown) =>
        error instanceof BunqLiveApiRefusedError &&
        /sandbox path|disabled on the sandbox path/i.test(error.message),
    );
  });

  it("refuses non-sandbox hosts even when path looks like v1", () => {
    assert.throws(
      () => assertBunqSandboxBaseUrl("https://example.com/v1"),
      (error: unknown) => error instanceof BunqLiveApiRefusedError,
    );
  });

  it("accepts sandbox_ API keys only on sandbox path", () => {
    assert.equal(
      assertBunqSandboxApiKey("sandbox_test_key_abc"),
      "sandbox_test_key_abc",
    );
    assert.throws(
      () => assertBunqSandboxApiKey("live-looking-production-key"),
      (error: unknown) => error instanceof BunqLiveApiRefusedError,
    );
  });

  it("rejects wildcard / CIDR / IPv6 permitted_ips", () => {
    assert.throws(
      () => assertBunqPermittedIps(["*"]),
      (error: unknown) =>
        error instanceof Error && error.message.includes("wildcards"),
    );
    assert.throws(
      () => assertBunqPermittedIps(["188.34.196.0/24"]),
      (error: unknown) =>
        error instanceof Error && /CIDR|IPv6|IPv4/i.test(error.message),
    );
    assert.throws(
      () => assertBunqPermittedIps(["2001:db8::1"]),
      (error: unknown) =>
        error instanceof Error && /CIDR|IPv6|IPv4/i.test(error.message),
    );
    assert.deepEqual(assertBunqPermittedIps(["188.34.196.92"]), [
      "188.34.196.92",
    ]);
  });
});

describe("bunq-client production allowlist", () => {
  it("allows only https://api.bunq.com/v1 on production path", () => {
    const url = assertBunqBaseUrl(BUNQ_PRODUCTION_API_BASE, "production");
    assert.equal(url.hostname, "api.bunq.com");
  });

  it("refuses sandbox host on production path", () => {
    assert.throws(
      () => assertBunqBaseUrl(BUNQ_SANDBOX_API_BASE, "production"),
      (error: unknown) => error instanceof BunqLiveApiRefusedError,
    );
  });

  it("refuses sandbox_ keys on production path", () => {
    assert.throws(
      () => assertBunqApiKey("sandbox_test_key_abc", "production"),
      (error: unknown) =>
        error instanceof BunqLiveApiRefusedError &&
        /refuses sandbox_/i.test(error.message),
    );
  });

  it("accepts non-sandbox keys on production path", () => {
    assert.equal(
      assertBunqApiKey("live-looking-production-key", "production"),
      "live-looking-production-key",
    );
  });

  it("refuses constructing a sandbox client pointed at the live host", () => {
    const { privateKeyPem } = generateBunqSigningKeyPair();
    assert.throws(
      () =>
        new BunqClient({
          environment: "sandbox",
          baseUrl: BUNQ_PRODUCTION_API_BASE,
          apiKey: "sandbox_fake_key",
          signingPrivateKeyPem: privateKeyPem,
          permittedIps: ["188.34.196.92"],
        }),
      (error: unknown) => error instanceof BunqLiveApiRefusedError,
    );
  });

  it("constructs a production client for api.bunq.com only", () => {
    const { privateKeyPem } = generateBunqSigningKeyPair();
    const client = new BunqClient({
      environment: "production",
      apiKey: "live-looking-production-key",
      signingPrivateKeyPem: privateKeyPem,
      permittedIps: ["188.34.196.92"],
    });
    assert.equal(client.environment, "production");
  });

  it("refuses Sugar Daddy on a production client", async () => {
    const { privateKeyPem } = generateBunqSigningKeyPair();
    const client = new BunqClient({
      environment: "production",
      apiKey: "live-looking-production-key",
      signingPrivateKeyPem: privateKeyPem,
      permittedIps: ["188.34.196.92"],
      sessionToken: "sess",
      userId: "2",
      installationToken: "inst",
    });
    await assert.rejects(
      () => client.createSandboxSugarDaddyRequestInquiry("99"),
      (error: unknown) =>
        error instanceof BunqLiveApiRefusedError &&
        /sandbox-only/i.test(error.message),
    );
  });

  it("refuses createPayment unless allowPaymentWrites is set", async () => {
    const { privateKeyPem } = generateBunqSigningKeyPair();
    const client = new BunqClient({
      environment: "sandbox",
      apiKey: "sandbox_fake_key",
      signingPrivateKeyPem: privateKeyPem,
      permittedIps: ["127.0.0.1"],
      sessionToken: "sess",
      userId: "2",
    });
    await assert.rejects(
      () =>
        client.createPayment({
          monetaryAccountId: "1",
          amountValue: "1.00",
          amountCurrency: "EUR",
          recipientName: "Ada",
          recipientIban: "NL91ABNA0417164300",
          description: "test",
          idempotencyKey: "11111111-1111-1111-1111-111111111111",
        }),
      (error: unknown) =>
        error instanceof BunqLiveApiRefusedError &&
        /payment writes are disabled/i.test(error.message),
    );
  });

  it("refuses live production createPayment in test env even with allowPaymentWrites", async () => {
    const { privateKeyPem } = generateBunqSigningKeyPair();
    const client = new BunqClient({
      environment: "production",
      apiKey: "live-looking-production-key",
      signingPrivateKeyPem: privateKeyPem,
      permittedIps: ["188.34.196.92"],
      sessionToken: "sess",
      userId: "2",
      allowPaymentWrites: true,
    });
    await assert.rejects(
      () =>
        client.createPayment({
          monetaryAccountId: "1",
          amountValue: "1.00",
          amountCurrency: "EUR",
          recipientName: "Ada",
          recipientIban: "NL91ABNA0417164300",
          description: "test",
          idempotencyKey: "11111111-1111-1111-1111-111111111111",
        }),
      (error: unknown) =>
        error instanceof BunqLiveApiRefusedError &&
        /live bunq payment writes refused/i.test(error.message),
    );
  });

  it("posts a single sandbox payment with X-Bunq-Client-Idempotency-Key via mocked fetch", async () => {
    const { privateKeyPem } = generateBunqSigningKeyPair();
    const idem = "22222222-2222-2222-2222-222222222222";
    const calls: Array<{
      method: string;
      url: string;
      body: string;
      headers: HeadersInit | undefined;
    }> = [];
    const client = new BunqClient({
      environment: "sandbox",
      apiKey: "sandbox_fake_key",
      signingPrivateKeyPem: privateKeyPem,
      permittedIps: ["127.0.0.1"],
      sessionToken: "sess",
      userId: "2",
      allowPaymentWrites: true,
      fetchImpl: async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const body = typeof init?.body === "string" ? init.body : "";
        calls.push({ method, url, body, headers: init?.headers });
        assert.equal(method, "POST");
        assert.match(url, /\/payment$/);
        assert.doesNotMatch(url, /draft-payment|schedule|card|mandate|webhook/i);
        assert.doesNotMatch(url, /api\.bunq\.com/);
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("X-Bunq-Client-Idempotency-Key"), idem);
        assert.ok(headers.get("X-Bunq-Client-Request-Id"));
        assert.notEqual(headers.get("X-Bunq-Client-Request-Id"), idem);
        return new Response(JSON.stringify({ Response: [{ Id: { id: 99 } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    const result = await client.createPayment({
      monetaryAccountId: "10",
      amountValue: "2.50",
      amountCurrency: "EUR",
      recipientName: "Ada Lovelace",
      recipientIban: "NL91 ABNA 0417 1643 00",
      description: "Books",
      idempotencyKey: idem,
    });
    assert.equal(result.paymentId, "99");
    assert.equal(calls.length, 1);
    const parsed = JSON.parse(calls[0]!.body) as {
      amount: { value: string; currency: string };
      counterparty_alias: { type: string; value: string; name: string };
      description: string;
    };
    assert.equal(parsed.amount.value, "2.50");
    assert.equal(parsed.counterparty_alias.type, "IBAN");
    assert.equal(parsed.counterparty_alias.value, "NL91ABNA0417164300");
    assert.equal(parsed.description, "Books");
  });

  it("classifies 5xx payment responses as ambiguous outcome", async () => {
    const { privateKeyPem } = generateBunqSigningKeyPair();
    const client = new BunqClient({
      environment: "sandbox",
      apiKey: "sandbox_fake_key",
      signingPrivateKeyPem: privateKeyPem,
      permittedIps: ["127.0.0.1"],
      sessionToken: "sess",
      userId: "2",
      allowPaymentWrites: true,
      fetchImpl: async () =>
        new Response("upstream", { status: 503 }),
    });
    await assert.rejects(
      () =>
        client.createPayment({
          monetaryAccountId: "10",
          amountValue: "1.00",
          amountCurrency: "EUR",
          recipientName: "Ada",
          recipientIban: "NL91ABNA0417164300",
          description: "x",
          idempotencyKey: "33333333-3333-3333-3333-333333333333",
        }),
      (error: unknown) => error instanceof BunqPaymentAmbiguousOutcomeError,
    );
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

  it("posts Sugar Daddy request-inquiry on the sandbox host only", async () => {
    const { privateKeyPem } = generateBunqSigningKeyPair();
    const calls: Array<{ method: string; url: string; body: string | null }> =
      [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? init.body : null;
      calls.push({ method, url, body });
      assert.match(url, /^https:\/\/public-api\.sandbox\.bunq\.com\//);
      assert.doesNotMatch(url, /api\.bunq\.com/);
      return new Response(
        JSON.stringify({ Response: [{ Id: { id: 4242 } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const client = new BunqClient({
      apiKey: "sandbox_fake_key",
      signingPrivateKeyPem: privateKeyPem,
      permittedIps: ["203.0.113.10"],
      fetchImpl,
      installationToken: "inst",
      serverPublicKeyPem:
        "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----",
      sessionToken: "sess",
      deviceId: "1",
      userId: "2",
    });
    const result = await client.createSandboxSugarDaddyRequestInquiry("99", {
      amountValue: "25.00",
    });
    assert.equal(result.requestInquiryId, "4242");
    const inquiry = calls.find((c) => c.url.includes("/request-inquiry"));
    assert.ok(inquiry);
    assert.equal(inquiry?.method, "POST");
    const payload = JSON.parse(inquiry?.body ?? "{}") as {
      counterparty_alias?: { value?: string };
      amount_inquired?: { value?: string; currency?: string };
    };
    assert.equal(payload.counterparty_alias?.value, "sugardaddy@bunq.com");
    assert.equal(payload.amount_inquired?.value, "25.00");
    assert.equal(payload.amount_inquired?.currency, "EUR");
  });

  it("rejects Sugar Daddy amounts above €500", async () => {
    const { privateKeyPem } = generateBunqSigningKeyPair();
    const client = new BunqClient({
      apiKey: "sandbox_fake_key",
      signingPrivateKeyPem: privateKeyPem,
      permittedIps: ["203.0.113.10"],
      installationToken: "inst",
      sessionToken: "sess",
      deviceId: "1",
      userId: "2",
    });
    await assert.rejects(
      () =>
        client.createSandboxSugarDaddyRequestInquiry("99", {
          amountValue: "500.01",
        }),
      (error: unknown) =>
        error instanceof BunqApiError &&
        /0\.01 and 500/.test(error.message),
    );
  });
});

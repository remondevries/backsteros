/**
 * OS-167 local-only payment simulation.
 *
 * When BUNQ_PAYMENT_SIMULATION=true, createPayment never touches api.bunq.com
 * (or any network). Results are visibly marked SIMULATION.
 *
 * Demo ambiguous path: memo containing "[SIM:AMBIGUOUS]" → ambiguous outcome
 * (needs_reconciliation) so Remon can exercise re-approve locks locally.
 */

import { randomUUID } from "node:crypto";

import {
  BunqClient,
  BunqLiveApiRefusedError,
  BunqPaymentAmbiguousOutcomeError,
  generateBunqSigningKeyPair,
} from "./bunq-client.js";

export const BUNQ_PAYMENT_SIMULATION_MEMO_MARKER = "[SIM:AMBIGUOUS]";
export const BUNQ_PAYMENT_SIMULATION_ID_PREFIX = "SIM-";

export function isBunqPaymentSimulationEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.BUNQ_PAYMENT_SIMULATION?.trim() === "true";
}

/** Refuse combining simulation with live production payment writes. */
export function assertBunqPaymentSimulationSafe(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isBunqPaymentSimulationEnabled(env)) return;
  if (env.BUNQ_ALLOW_LIVE_PAYMENT_WRITES?.trim() === "true") {
    throw new BunqLiveApiRefusedError(
      "BUNQ_PAYMENT_SIMULATION cannot run with BUNQ_ALLOW_LIVE_PAYMENT_WRITES=true",
    );
  }
}

export function shouldSimulateAmbiguousPaymentOutcome(memo: string): boolean {
  return memo.includes(BUNQ_PAYMENT_SIMULATION_MEMO_MARKER);
}

export function buildSimulationPaymentId(): string {
  return `${BUNQ_PAYMENT_SIMULATION_ID_PREFIX}${randomUUID()}`;
}

/**
 * In-process BunqClient whose fetchImpl never dials the network.
 * Hard-refuses any URL that looks like live/sandbox bunq hosts.
 */
export function createSimulatedBunqPaymentClient(): BunqClient {
  assertBunqPaymentSimulationSafe();
  const { privateKeyPem } = generateBunqSigningKeyPair();
  return new BunqClient({
    environment: "sandbox",
    apiKey: "sandbox_simulation_only_not_a_real_key",
    signingPrivateKeyPem: privateKeyPem,
    permittedIps: ["127.0.0.1"],
    sessionToken: "sim-session",
    userId: "sim-user",
    allowPaymentWrites: true,
    deviceDescription: "BacksterOS bunq SIMULATION (local preview)",
    fetchImpl: async (input, init) => {
      const url = String(input);
      // Live bunq host must never be contacted — even as a URL string target.
      if (/https?:\/\/api\.bunq\.com\b/i.test(url)) {
        throw new BunqLiveApiRefusedError(
          `BUNQ_PAYMENT_SIMULATION refused live bunq URL ${url}`,
        );
      }
      // Sandbox host may appear in the constructed URL; we intercept in-process
      // and never dial (no real fetch).

      const method = (init?.method ?? "GET").toUpperCase();
      if (method !== "POST" || !/\/payment(?:\?|$)/.test(url)) {
        throw new BunqLiveApiRefusedError(
          `BUNQ_PAYMENT_SIMULATION only fakes POST …/payment (got ${method} ${url})`,
        );
      }

      const bodyRaw = typeof init?.body === "string" ? init.body : "";
      let memo = "";
      try {
        const parsed = JSON.parse(bodyRaw) as { description?: string };
        memo = parsed.description ?? "";
      } catch {
        memo = bodyRaw;
      }

      if (shouldSimulateAmbiguousPaymentOutcome(memo)) {
        throw new BunqPaymentAmbiguousOutcomeError(
          "SIMULATION: forced ambiguous outcome ([SIM:AMBIGUOUS] memo)",
          503,
        );
      }

      const paymentId = buildSimulationPaymentId();
      return new Response(
        JSON.stringify({ Response: [{ Id: { id: paymentId } }] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    },
  });
}

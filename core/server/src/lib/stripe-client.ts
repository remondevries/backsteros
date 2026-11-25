import Stripe from "stripe";

export class StripeNotConfiguredError extends Error {
  readonly code = "stripe_not_configured" as const;

  constructor(
    message = "Stripe secret key is not configured. Paste a secret key in Settings → Stripe.",
  ) {
    super(message);
    this.name = "StripeNotConfiguredError";
  }
}

export class StripeApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, options?: { code?: string; status?: number }) {
    super(message);
    this.name = "StripeApiError";
    this.code = options?.code ?? "stripe_api_error";
    this.status = options?.status ?? 400;
  }
}

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: "2026-11-18.endive",
    maxNetworkRetries: 2,
    typescript: true,
  });
}

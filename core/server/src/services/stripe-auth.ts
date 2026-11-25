import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function readSecretFromStripeEnvFile(): string | null {
  try {
    const filePath = path.join(os.homedir(), ".config", "secrets", "stripe.env");
    const text = fs.readFileSync(filePath, "utf8");
    for (const line of text.split("\n")) {
      const match = /^(?:export\s+)?STRIPE_SECRET_KEY=(.+)$/u.exec(line.trim());
      if (!match) continue;
      const value = match[1]!.trim().replace(/^['"]|['"]$/gu, "");
      if (value) return value;
    }
  } catch {
    // Fall through.
  }
  return null;
}

/**
 * Env / machine-secret Stripe key used when workspace Settings has no key.
 * Order: `STRIPE_SECRET_KEY` → `~/.config/secrets/stripe.env`.
 */
export function getConfiguredStripeSecretKey(): string | null {
  const fromEnv = process.env.STRIPE_SECRET_KEY?.trim() || "";
  if (fromEnv) return fromEnv;
  return readSecretFromStripeEnvFile();
}

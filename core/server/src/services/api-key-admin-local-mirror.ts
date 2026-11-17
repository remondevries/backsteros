/**
 * OS-181: optionally insert a cloud-minted api_keys row on the Mac immediately
 * so the key authenticates locally before replication catches up. Never stores
 * the plaintext secret — only hash + ciphertext.
 */

import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import { encryptWebhookSecret } from "../lib/auto-review-webhook.js";
import {
  apiKeyLookupPrefix,
  hashApiKey,
} from "../lib/crypto.js";

export type CloudMintedApiKeyRow = {
  id: string;
  workspaceId: string;
  userId?: string | null;
  name: string;
  prefix?: string;
  scopes: string[];
  contactId?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  revokedAt?: string | null;
};

/**
 * Upsert the cloud-minted key locally from the one-time plaintext response.
 */
export async function mirrorCloudMintedApiKeyLocally(input: {
  apiKey: CloudMintedApiKeyRow;
  secret: string;
}): Promise<"inserted" | "updated"> {
  const now = new Date();
  const keyHash = hashApiKey(input.secret);
  const prefix =
    input.apiKey.prefix?.trim() || apiKeyLookupPrefix(input.secret);
  const secretCiphertext = encryptWebhookSecret(input.secret);
  const values = {
    id: input.apiKey.id,
    workspaceId: input.apiKey.workspaceId,
    userId: input.apiKey.userId ?? null,
    name: input.apiKey.name,
    prefix,
    keyHash,
    secretCiphertext,
    scopes: input.apiKey.scopes,
    contactId: input.apiKey.contactId ?? null,
    expiresAt: input.apiKey.expiresAt ? new Date(input.apiKey.expiresAt) : null,
    createdAt: input.apiKey.createdAt
      ? new Date(input.apiKey.createdAt)
      : now,
    updatedAt: input.apiKey.updatedAt
      ? new Date(input.apiKey.updatedAt)
      : now,
    revokedAt: input.apiKey.revokedAt
      ? new Date(input.apiKey.revokedAt)
      : null,
  };

  const [existing] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(eq(apiKeys.id, values.id))
    .limit(1);

  if (existing) {
    await db
      .update(apiKeys)
      .set({
        workspaceId: values.workspaceId,
        userId: values.userId,
        name: values.name,
        prefix: values.prefix,
        keyHash: values.keyHash,
        secretCiphertext: values.secretCiphertext,
        scopes: values.scopes,
        contactId: values.contactId,
        expiresAt: values.expiresAt,
        revokedAt: values.revokedAt,
        updatedAt: values.updatedAt,
      })
      .where(eq(apiKeys.id, values.id));
    return "updated";
  }

  await db.insert(apiKeys).values(values);
  return "inserted";
}

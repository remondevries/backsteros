import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "../db/index.js";
import { letterAttachments, letters } from "../db/schema.js";
import { createApiKey } from "../services/api-keys.js";
import { getCoreReplicationConfig } from "../services/core-replication/config.js";
import { runCoreReplicationTick } from "../services/core-replication/worker.js";

const ws = process.env.PROOF_WORKSPACE_ID?.trim() || "ws_legacy_default";
const localApiBase = process.env.PROOF_API_URL?.trim() || "http://127.0.0.1:8788";

async function resolveApiKey(): Promise<string> {
  const fromEnv = process.env.PROOF_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  const { secret } = await createApiKey(ws, "SiChwMAnh6tXSbe-dVIIP", {
    name: `letter-pdf-503-proof-${Date.now()}`,
    scopes: ["letters:read", "letters:write"],
  });
  return secret;
}

/** Cloud auth: env override, or create locally and push `api_keys` to peer. */
async function resolveCloudApiKey(localKey: string): Promise<string> {
  const fromEnv = process.env.PROOF_CLOUD_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  const config = getCoreReplicationConfig();
  if (!config || config.role !== "local") {
    return localKey;
  }

  console.log("pushing_api_keys_to_cloud");
  await runCoreReplicationTick();
  return localKey;
}

async function resolveLetterId(): Promise<string> {
  const fromEnv = process.env.PROOF_LETTER_ID?.trim();
  if (fromEnv) return fromEnv;

  const [letter] = await db
    .select({ id: letters.id })
    .from(letters)
    .where(and(eq(letters.workspaceId, ws), isNull(letters.deletedAt)))
    .orderBy(desc(letters.updatedAt))
    .limit(1);
  if (!letter) {
    throw new Error("No letter found for proof — set PROOF_LETTER_ID");
  }
  return letter.id;
}

async function resolveAttachmentId(letterId: string): Promise<string> {
  const fromEnv = process.env.PROOF_LETTER_ATTACHMENT_ID?.trim();
  if (fromEnv) return fromEnv;

  const [attachment] = await db
    .select({ id: letterAttachments.id })
    .from(letterAttachments)
    .where(
      and(
        eq(letterAttachments.workspaceId, ws),
        eq(letterAttachments.letterId, letterId),
        isNull(letterAttachments.deletedAt),
      ),
    )
    .orderBy(desc(letterAttachments.updatedAt))
    .limit(1);

  return attachment?.id ?? "proof-attachment-id";
}

function cloudApiBase(): string {
  const config = getCoreReplicationConfig();
  if (!config) throw new Error("CORE_REPLICATION_NOT_CONFIGURED");
  return config.peerUrl.replace(/\/$/, "");
}

async function expectPdfRequiresLocalCore(
  label: string,
  response: Response,
): Promise<void> {
  const bodyText = await response.text();
  let payload: { code?: string; error?: string } = {};
  try {
    payload = JSON.parse(bodyText) as { code?: string; error?: string };
  } catch {
    payload = { error: bodyText };
  }

  console.log(`${label}_status`, response.status);
  console.log(`${label}_code`, payload.code);
  console.log(`${label}_error`, payload.error);

  if (response.status !== 503) {
    throw new Error(`${label}: expected 503, got ${response.status}`);
  }
  if (payload.code !== "pdf_requires_local_core") {
    throw new Error(`${label}: expected code pdf_requires_local_core`);
  }
}

async function main() {
  const localApiKey = await resolveApiKey();
  const cloudApiKey = await resolveCloudApiKey(localApiKey);
  const letterId = await resolveLetterId();
  const attachmentId = await resolveAttachmentId(letterId);
  const cloudBase = cloudApiBase();
  const cloudAuthHeaders = { Authorization: `Bearer ${cloudApiKey}` };
  const localAuthHeaders = { Authorization: `Bearer ${localApiKey}` };

  console.log("letter_id", letterId);
  console.log("attachment_id", attachmentId);
  console.log("cloud_api_base", cloudBase);
  console.log("local_api_base", localApiBase);

  const getPdf = await fetch(
    `${cloudBase}/api/v1/letters/${encodeURIComponent(letterId)}/pdf`,
    { headers: cloudAuthHeaders },
  );
  await expectPdfRequiresLocalCore("cloud_get_pdf", getPdf);

  const getAttachment = await fetch(
    `${cloudBase}/api/v1/letters/${encodeURIComponent(letterId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { headers: cloudAuthHeaders },
  );
  await expectPdfRequiresLocalCore("cloud_get_attachment", getAttachment);

  const putPdf = await fetch(
    `${cloudBase}/api/v1/letters/${encodeURIComponent(letterId)}/pdf`,
    {
      method: "PUT",
      headers: {
        ...cloudAuthHeaders,
        "Content-Type": "application/pdf",
        "X-Filename": "proof.pdf",
      },
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), // %PDF-
    },
  );
  await expectPdfRequiresLocalCore("cloud_put_pdf", putPdf);

  const postAttachment = await fetch(
    `${cloudBase}/api/v1/letters/${encodeURIComponent(letterId)}/attachments`,
    {
      method: "POST",
      headers: {
        ...cloudAuthHeaders,
        "Content-Type": "application/pdf",
        "X-Filename": "proof.pdf",
      },
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
    },
  );
  await expectPdfRequiresLocalCore("cloud_post_attachment", postAttachment);

  // Local-core may serve bytes when present, or 404 — never 503 pdf_requires_local_core.
  const localGet = await fetch(
    `${localApiBase}/api/v1/letters/${encodeURIComponent(letterId)}/pdf`,
    { headers: localAuthHeaders },
  );
  const localBody = await localGet.text();
  let localPayload: { code?: string } = {};
  try {
    localPayload = JSON.parse(localBody) as { code?: string };
  } catch {
    localPayload = {};
  }
  console.log("local_get_pdf_status", localGet.status);
  console.log("local_get_pdf_code", localPayload.code ?? "(binary or none)");
  if (localGet.status === 503 && localPayload.code === "pdf_requires_local_core") {
    throw new Error("local-core returned pdf_requires_local_core");
  }

  console.log("PROOF_OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

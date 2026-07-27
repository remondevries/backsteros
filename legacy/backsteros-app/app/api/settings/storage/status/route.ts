import { ApiClientError } from "@backsteros/api-client";

import {
  createAuthenticatedApiClient,
  resolveServerApiUrl,
} from "@/lib/server/api-client";

export const dynamic = "force-dynamic";

const NOT_CONFIGURED_REASON =
  "Set SPACES_ENDPOINT, SPACES_BUCKET, SPACES_ACCESS_KEY_ID, and SPACES_SECRET_ACCESS_KEY on the API deployment.";

function apiOrigin(apiUrl: string): string {
  return apiUrl.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
}

function statusResponse(configured: boolean, reason?: string | null) {
  return Response.json({
    configured,
    reason: configured ? null : (reason ?? NOT_CONFIGURED_REASON),
  });
}

export async function GET() {
  try {
    const client = await createAuthenticatedApiClient();
    if (!client) {
      return statusResponse(false, "Sign in to check object storage status.");
    }

    // Preferred: dedicated storage status (API builds that include it).
    try {
      const storage = await client.requestJson<{ configured?: boolean }>(
        "/api/v1/settings/storage",
      );
      if (typeof storage.configured === "boolean") {
        return statusResponse(storage.configured);
      }
    } catch (error) {
      if (!(error instanceof ApiClientError) || error.status !== 404) {
        throw error;
      }
    }

    // Next: health field on newer API builds.
    const apiUrl = await resolveServerApiUrl();
    const healthResponse = await fetch(`${apiOrigin(apiUrl)}/health`, {
      cache: "no-store",
    });
    if (healthResponse.ok) {
      const health = (await healthResponse.json()) as {
        spacesConfigured?: unknown;
      };
      if (typeof health.spacesConfigured === "boolean") {
        return statusResponse(health.spacesConfigured);
      }
    }

    // Fallback for current production: bootstrap already reports Spaces.
    const bootstrap = await client.requestJson<{ spaces_configured?: boolean }>(
      "/api/v1/sync/bootstrap",
      { method: "POST" },
    );
    return statusResponse(Boolean(bootstrap.spaces_configured));
  } catch {
    return statusResponse(
      false,
      "Could not reach the API to check object storage.",
    );
  }
}

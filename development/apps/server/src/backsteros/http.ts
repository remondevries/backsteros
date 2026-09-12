import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { readBacksterosAgentProfile, writeBacksterosAgentProfile } from "./agent-profile.ts";

const AGENT_PROFILE_PATH = "/api/backsteros/agent-profile";

export const backsterosAgentProfileGetRouteLayer = HttpRouter.add(
  "GET",
  AGENT_PROFILE_PATH,
  Effect.gen(function* () {
    const profile = readBacksterosAgentProfile();
    return HttpServerResponse.jsonUnsafe({ ok: true, ...profile });
  }),
);

export const backsterosAgentProfilePutRouteLayer = HttpRouter.add(
  "PUT",
  AGENT_PROFILE_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "Expected JSON body" },
        { status: 400 },
      );
    }
    const body = bodyJson as Record<string, unknown>;
    const contactIdRaw = body.contactId;
    if (contactIdRaw !== undefined && contactIdRaw !== null && typeof contactIdRaw !== "string") {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "contactId must be a string or null" },
        { status: 400 },
      );
    }

    const profile = writeBacksterosAgentProfile({
      contactId: typeof contactIdRaw === "string" ? contactIdRaw : null,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, ...profile });
  }),
);

export const backsterosAgentProfileRouteLayer = Layer.mergeAll(
  backsterosAgentProfileGetRouteLayer,
  backsterosAgentProfilePutRouteLayer,
);

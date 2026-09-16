import { initContract } from "@ts-rest/core";
import { z } from "zod";

import { badRequestSchema, errorSchema } from "./schemas.js";
import * as s from "./schemas.js";

const c = initContract();

/**
 * File-task mailbox lives here so `apiContract` stays under TS7056.
 * Cloud-core only; not replicated. Public POST is tokenized, not API-key auth.
 */
export const fileTaskCallbackContract = c.router(
  {
    createFileTaskCallback: {
      method: "POST",
      path: "/api/v1/file-task-callbacks",
      body: s.createFileTaskCallbackSchema,
      responses: {
        200: s.fileTaskCallbackCreatedSchema,
        400: badRequestSchema,
        401: errorSchema,
        403: errorSchema,
        409: errorSchema,
      },
      summary:
        "Mint a public callback URL for a Development file-task webhook job",
    },
    getFileTaskCallback: {
      method: "GET",
      path: "/api/v1/file-task-callbacks/:requestId",
      pathParams: z.object({ requestId: z.string().min(1) }),
      responses: {
        200: s.fileTaskCallbackPollSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
      summary: "Poll a file-task mailbox until the agent posts a result",
    },
    postPublicFileTaskCallback: {
      method: "POST",
      path: "/api/v1/public/file-task-callbacks/:requestId",
      pathParams: z.object({ requestId: z.string().min(1) }),
      query: z.object({ token: z.string().min(1) }),
      body: s.fileTaskCallbackResultSchema,
      responses: {
        200: z.object({ ok: z.literal(true) }),
        400: badRequestSchema,
        401: errorSchema,
        404: errorSchema,
        409: errorSchema,
      },
      summary:
        "Agent posts a file-task result (token in query; no API key)",
    },
  },
  { strictStatusCodes: true },
);

import { initContract } from "@ts-rest/core";
import { z } from "zod";

import { badRequestSchema, errorSchema } from "./schemas.js";
import * as s from "./schemas.js";

const c = initContract();

/**
 * Extra TransIP routes live here so `apiContract` stays under TypeScript's
 * declaration serialization limit (TS7056).
 */
export const transipContract = c.router(
  {
    getTransipDomainDetail: {
      method: "GET",
      path: "/api/v1/transip/domains/:domainName",
      pathParams: z.object({ domainName: z.string().min(1) }),
      responses: {
        200: s.transipDomainDetailSchema,
        400: badRequestSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
      summary:
        "TransIP domain detail: auth/EPP code, nameservers, WHOIS contacts",
    },
    updateTransipDomainTags: {
      method: "PUT",
      path: "/api/v1/transip/domains/:domainName/tags",
      pathParams: z.object({ domainName: z.string().min(1) }),
      body: s.updateTransipDomainTagsInputSchema,
      responses: {
        200: s.updateTransipDomainTagsResultSchema,
        400: badRequestSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
      summary: "Replace TransIP domain tags and sync the Catalog project icon",
    },
    updateTransipDomainContacts: {
      method: "PUT",
      path: "/api/v1/transip/domains/:domainName/contacts",
      pathParams: z.object({ domainName: z.string().min(1) }),
      body: s.updateTransipDomainContactsInputSchema,
      responses: {
        200: s.updateTransipDomainContactsResultSchema,
        400: badRequestSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
      summary: "Replace TransIP WHOIS contacts for a domain",
    },
  },
  {
    strictStatusCodes: true,
    pathPrefix: "",
  },
);

export type TransipContract = typeof transipContract;

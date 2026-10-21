/**
 * CardDAV address books for BacksterOS (iOS Contacts ↔ Postgres).
 * Public host: contacts.backsteros.com → cloud-core.
 *
 * Hierarchy (RFC 6352 / iOS discovery):
 *   /dav/principals/me/     — principal
 *   /dav/                   — addressbook-home-set
 *   /dav/contacts/          — people (personal avatars)
 *   /dav/organizations/     — company cards (org API avatars)
 */
import type { Context, Hono, Next } from "hono";
import { and, eq, inArray, isNull, max } from "drizzle-orm";

import { db } from "../db/index.js";
import { contacts, organizations } from "../db/schema.js";
import { MAX_AVATAR_BYTES } from "../lib/upload-limits.js";
import {
  type AuthContext,
  logUnauthorizedRequest,
  resolveAuthFlexible,
} from "../middleware/auth.js";
import * as circleService from "../services/circle-domain.js";
import { hasCardDavScope } from "../services/carddav/auth.js";
import {
  formatOrganizationVCard,
  organizationEtag,
  parseOrganizationVCard,
  type OrganizationVCardSource,
} from "../services/carddav/org-vcard.js";
import { optimizeCardDavPhoto } from "../services/carddav/photo.js";
import {
  CARDDAV_CARD_REV,
  contactEtag,
  formatVCard,
  parseVCard,
  type ContactVCardSource,
} from "../services/carddav/vcard.js";
import {
  multistatus,
  parseRequestedProps,
  wantsProp,
  xmlEscape,
} from "../services/carddav/xml.js";
import {
  recordContactRestSyncEvent,
  recordOrganizationRestSyncEvent,
} from "../services/sync.js";
import { nudgeContactLive, nudgeOrganizationLive } from "./route-shared.js";

const PRINCIPAL_PATH = "/dav/principals/me/";
const HOME_SET_PATH = "/dav/";
const ADDRESSBOOK_PATH = "/dav/contacts/";
const ORG_ADDRESSBOOK_PATH = "/dav/organizations/";
const PUBLIC_ORIGIN = "https://contacts.backsteros.com";

function davChallenge() {
  return {
    "WWW-Authenticate": 'Basic realm="BacksterOS CardDAV"',
    "Content-Type": "application/xml; charset=utf-8",
  };
}

function cardDavLog(
  c: Context,
  status: number,
  extra: Record<string, string | number | boolean | undefined>,
) {
  const path = new URL(c.req.url).pathname;
  const ua = c.req.header("User-Agent") ?? "-";
  const depth = c.req.header("Depth") ?? "-";
  const parts = Object.entries(extra)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");
  console.info(
    `[carddav] ${c.req.method} ${path} → ${status} depth=${JSON.stringify(depth)} ua=${JSON.stringify(ua)}${parts ? ` ${parts}` : ""}`,
  );
}

async function requireCardDavAuth(c: Context, next: Next) {
  const auth = await resolveAuthFlexible(c.req.header("Authorization"));
  if (!auth || !hasCardDavScope(auth)) {
    cardDavLog(c, 401, {
      auth: "fail",
      hasAuthorization: Boolean(c.req.header("Authorization")),
      scopeOk: auth ? hasCardDavScope(auth) : false,
    });
    void logUnauthorizedRequest({
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      userAgent: c.req.header("User-Agent"),
      authorization: c.req.header("Authorization"),
    });
    return c.text(
      '<?xml version="1.0"?><d:error xmlns:d="DAV:"><d:need-privileges/></d:error>',
      401,
      davChallenge(),
    );
  }
  c.set("auth", auth);
  await next();
}

function withCardDavAuth(
  handler: (c: Context) => Response | Promise<Response | void> | void,
) {
  return async (c: Context) => {
    const auth = await resolveAuthFlexible(c.req.header("Authorization"));
    if (!auth || !hasCardDavScope(auth)) {
      cardDavLog(c, 401, {
        auth: "fail",
        hasAuthorization: Boolean(c.req.header("Authorization")),
        scopeOk: auth ? hasCardDavScope(auth) : false,
      });
      void logUnauthorizedRequest({
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        userAgent: c.req.header("User-Agent"),
        authorization: c.req.header("Authorization"),
      });
      return c.text(
        '<?xml version="1.0"?><d:error xmlns:d="DAV:"><d:need-privileges/></d:error>',
        401,
        davChallenge(),
      );
    }
    c.set("auth", auth);
    return handler(c);
  };
}

function absoluteHref(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${PUBLIC_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

function principalHref(): string {
  return absoluteHref(PRINCIPAL_PATH);
}

function homeSetHref(): string {
  return absoluteHref(HOME_SET_PATH);
}

function addressbookHref(): string {
  return absoluteHref(ADDRESSBOOK_PATH);
}

function orgAddressbookHref(): string {
  return absoluteHref(ORG_ADDRESSBOOK_PATH);
}

function contactHref(contactId: string): string {
  return absoluteHref(
    `${ADDRESSBOOK_PATH}${encodeURIComponent(contactId)}.vcf`,
  );
}

function organizationHref(organizationId: string): string {
  return absoluteHref(
    `${ORG_ADDRESSBOOK_PATH}${encodeURIComponent(organizationId)}.vcf`,
  );
}

function depthHeader(c: Context): number {
  const raw = (c.req.header("Depth") ?? "1").trim().toLowerCase();
  if (raw === "infinity") return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 1;
}

function davHeaders() {
  return {
    "Content-Type": "application/xml; charset=utf-8",
    DAV: "1, 3, addressbook, sync-collection",
  };
}

async function loadContactSources(
  workspaceId: string,
): Promise<ContactVCardSource[]> {
  const rows = await circleService.listContacts(workspaceId);
  const orgIds = [
    ...new Set(
      rows
        .map((row) => row.organizationId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const orgNames = new Map<string, string>();
  if (orgIds.length > 0) {
    const orgs = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(
        and(
          eq(organizations.workspaceId, workspaceId),
          isNull(organizations.deletedAt),
          inArray(organizations.id, orgIds),
        ),
      );
    for (const org of orgs) orgNames.set(org.id, org.name);
  }

  return rows.map((row) => ({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    name: row.name,
    title: row.title,
    email: row.email,
    emails: row.emails ?? [],
    phone: row.phone,
    phones: row.phones ?? [],
    address: row.address,
    city: row.city,
    postalCode: row.postalCode,
    region: row.region,
    country: row.country,
    birthday: row.birthday,
    socialAccounts: row.socialAccounts ?? [],
    notes: row.notes,
    organizationName: row.organizationId
      ? (orgNames.get(row.organizationId) ?? null)
      : null,
    updatedAt: row.updatedAt,
  }));
}

async function collectionCtag(workspaceId: string): Promise<string> {
  const [row] = await db
    .select({ latest: max(contacts.updatedAt) })
    .from(contacts)
    .where(
      and(eq(contacts.workspaceId, workspaceId), isNull(contacts.deletedAt)),
    );
  const latest = row?.latest ?? new Date(0);
  // Include card rev so clients re-sync when PHOTO policy changes.
  return `"ctag-${latest.getTime()}-${CARDDAV_CARD_REV}"`;
}

async function orgCollectionCtag(workspaceId: string): Promise<string> {
  const [row] = await db
    .select({ latest: max(organizations.updatedAt) })
    .from(organizations)
    .where(
      and(
        eq(organizations.workspaceId, workspaceId),
        isNull(organizations.deletedAt),
      ),
    );
  const latest = row?.latest ?? new Date(0);
  return `"ctag-org-${latest.getTime()}-${CARDDAV_CARD_REV}"`;
}

async function personalPhoto(
  workspaceId: string,
  contactId: string,
): Promise<{ contentType: string; bytes: Uint8Array } | null> {
  const result = await circleService.getAvatar(workspaceId, "contact", contactId);
  if (!result?.bytes?.length) return null;
  return optimizeCardDavPhoto(
    result.bytes,
    result.row.contentType || "image/jpeg",
  );
}

/** Same organization avatar the REST API serves (`entityType=organization`). */
async function organizationPhoto(
  workspaceId: string,
  organizationId: string,
): Promise<{ contentType: string; bytes: Uint8Array } | null> {
  const result = await circleService.getAvatar(
    workspaceId,
    "organization",
    organizationId,
  );
  if (!result?.bytes?.length) return null;
  return optimizeCardDavPhoto(
    result.bytes,
    result.row.contentType || "image/jpeg",
  );
}

function loadOrganizationSources(
  workspaceId: string,
): Promise<OrganizationVCardSource[]> {
  return circleService.listOrganizations(workspaceId).then((rows) =>
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      emails: row.emails ?? [],
      phone: row.phone,
      phones: row.phones ?? [],
      website: row.website,
      address: row.address,
      city: row.city,
      postalCode: row.postalCode,
      region: row.region,
      country: row.country,
      socialAccounts: row.socialAccounts ?? [],
      notes: row.notes,
      updatedAt: row.updatedAt,
    })),
  );
}

function privilegeSetXml(): string {
  return `<D:current-user-privilege-set>
      <D:privilege><D:read/></D:privilege>
      <D:privilege><D:write/></D:privilege>
      <D:privilege><D:write-content/></D:privilege>
      <D:privilege><D:bind/></D:privilege>
      <D:privilege><D:unbind/></D:privilege>
    </D:current-user-privilege-set>`;
}

function principalProps(requested: Set<string>): string {
  const parts: string[] = [];
  if (wantsProp(requested, "resourcetype")) {
    parts.push(
      "<D:resourcetype><D:collection/><D:principal/></D:resourcetype>",
    );
  }
  if (wantsProp(requested, "displayname")) {
    parts.push("<D:displayname>BacksterOS</D:displayname>");
  }
  if (wantsProp(requested, "current-user-principal")) {
    parts.push(
      `<D:current-user-principal><D:href>${xmlEscape(principalHref())}</D:href></D:current-user-principal>`,
    );
  }
  if (wantsProp(requested, "principal-URL")) {
    parts.push(
      `<D:principal-URL><D:href>${xmlEscape(principalHref())}</D:href></D:principal-URL>`,
    );
  }
  if (wantsProp(requested, "addressbook-home-set")) {
    parts.push(
      `<C:addressbook-home-set><D:href>${xmlEscape(homeSetHref())}</D:href></C:addressbook-home-set>`,
    );
  }
  if (wantsProp(requested, "current-user-privilege-set")) {
    parts.push(privilegeSetXml());
  }
  return parts.join("");
}

function supportedReportSetXml(): string {
  return `<D:supported-report-set>
      <D:supported-report><D:report><C:addressbook-query/></D:report></D:supported-report>
      <D:supported-report><D:report><C:addressbook-multiget/></D:report></D:supported-report>
      <D:supported-report><D:report><D:sync-collection/></D:report></D:supported-report>
    </D:supported-report-set>`;
}

function homeSetProps(requested: Set<string>): string {
  const parts: string[] = [];
  if (wantsProp(requested, "resourcetype")) {
    parts.push("<D:resourcetype><D:collection/></D:resourcetype>");
  }
  if (wantsProp(requested, "displayname")) {
    parts.push("<D:displayname>Address Books</D:displayname>");
  }
  if (wantsProp(requested, "current-user-principal")) {
    parts.push(
      `<D:current-user-principal><D:href>${xmlEscape(principalHref())}</D:href></D:current-user-principal>`,
    );
  }
  if (wantsProp(requested, "principal-URL")) {
    parts.push(
      `<D:principal-URL><D:href>${xmlEscape(principalHref())}</D:href></D:principal-URL>`,
    );
  }
  if (wantsProp(requested, "addressbook-home-set")) {
    parts.push(
      `<C:addressbook-home-set><D:href>${xmlEscape(homeSetHref())}</D:href></C:addressbook-home-set>`,
    );
  }
  if (wantsProp(requested, "supported-report-set")) {
    parts.push(supportedReportSetXml());
  }
  if (wantsProp(requested, "current-user-privilege-set")) {
    parts.push(privilegeSetXml());
  }
  return parts.join("");
}

function addressbookChildProps(
  ctag: string,
  requested: Set<string>,
  displayName: string,
): string {
  const parts: string[] = [];
  if (wantsProp(requested, "resourcetype")) {
    parts.push(
      "<D:resourcetype><D:collection/><C:addressbook/></D:resourcetype>",
    );
  }
  if (wantsProp(requested, "displayname")) {
    parts.push(`<D:displayname>${xmlEscape(displayName)}</D:displayname>`);
  }
  parts.push(`<CS:getctag>${xmlEscape(ctag)}</CS:getctag>`);
  return parts.join("");
}

function addressbookProps(ctag: string, requested: Set<string>): string {
  const parts: string[] = [];
  if (wantsProp(requested, "resourcetype")) {
    parts.push(
      "<D:resourcetype><D:collection/><C:addressbook/></D:resourcetype>",
    );
  }
  if (wantsProp(requested, "displayname")) {
    parts.push("<D:displayname>BacksterOS Contacts</D:displayname>");
  }
  parts.push(`<CS:getctag>${xmlEscape(ctag)}</CS:getctag>`);
  if (wantsProp(requested, "current-user-principal")) {
    parts.push(
      `<D:current-user-principal><D:href>${xmlEscape(principalHref())}</D:href></D:current-user-principal>`,
    );
  }
  if (wantsProp(requested, "principal-URL")) {
    parts.push(
      `<D:principal-URL><D:href>${xmlEscape(principalHref())}</D:href></D:principal-URL>`,
    );
  }
  if (wantsProp(requested, "addressbook-home-set")) {
    parts.push(
      `<C:addressbook-home-set><D:href>${xmlEscape(homeSetHref())}</D:href></C:addressbook-home-set>`,
    );
  }
  if (wantsProp(requested, "current-user-privilege-set")) {
    parts.push(privilegeSetXml());
  }
  if (
    wantsProp(requested, "supported-address-data") ||
    wantsProp(requested, "address-data")
  ) {
    parts.push(
      `<C:supported-address-data><C:address-data-type content-type="text/vcard" version="3.0"/></C:supported-address-data>`,
    );
  }
  if (wantsProp(requested, "supported-report-set")) {
    parts.push(supportedReportSetXml());
  }
  if (wantsProp(requested, "sync-token")) {
    parts.push(
      `<D:sync-token>https://contacts.backsteros.com/sync/${xmlEscape(ctag.replaceAll('"', ""))}</D:sync-token>`,
    );
  }
  return parts.join("");
}

function contactPropsXml(
  source: ContactVCardSource,
  vcard: string,
  requested: Set<string>,
  includeAddressData: boolean,
): string {
  const parts: string[] = [];
  const etag = contactEtag(source);
  if (wantsProp(requested, "getetag") || requested.has("*")) {
    parts.push(`<D:getetag>${xmlEscape(etag)}</D:getetag>`);
  }
  if (wantsProp(requested, "getcontenttype") || requested.has("*")) {
    parts.push("<D:getcontenttype>text/vcard; charset=utf-8</D:getcontenttype>");
  }
  if (wantsProp(requested, "resourcetype") || requested.has("*")) {
    parts.push("<D:resourcetype/>");
  }
  if (
    includeAddressData ||
    wantsProp(requested, "address-data") ||
    requested.has("*")
  ) {
    parts.push(
      `<C:address-data content-type="text/vcard" version="3.0">${xmlEscape(vcard)}</C:address-data>`,
    );
  }
  return parts.join("");
}

async function propfindPrincipal(c: Context) {
  const auth = c.get("auth") as AuthContext | undefined;
  const body = await c.req.text();
  const requested = parseRequestedProps(body);
  const path = new URL(c.req.url).pathname;
  const href =
    path.startsWith("/principals")
      ? absoluteHref(path.endsWith("/") ? path : `${path}/`)
      : principalHref();
  cardDavLog(c, 207, {
    handler: "principal",
    auth: auth?.apiKeyName ?? auth?.kind ?? "ok",
    props: [...requested].join(",") || "-",
    href,
  });
  return c.body(
    multistatus([
      {
        href,
        propstats: [
          {
            status: "HTTP/1.1 200 OK",
            propsXml: principalProps(requested),
          },
        ],
      },
    ]),
    207,
    davHeaders(),
  );
}

/** Root `/` — iOS probes here after well-known for current-user-principal. */
async function propfindRoot(c: Context) {
  const auth = c.get("auth") as AuthContext | undefined;
  const body = await c.req.text();
  const requested = parseRequestedProps(body);
  cardDavLog(c, 207, {
    handler: "root",
    auth: auth?.apiKeyName ?? auth?.kind ?? "ok",
    props: [...requested].join(",") || "-",
  });
  return c.body(
    multistatus([
      {
        href: absoluteHref("/"),
        propstats: [
          {
            status: "HTTP/1.1 200 OK",
            propsXml: principalProps(requested),
          },
        ],
      },
    ]),
    207,
    davHeaders(),
  );
}

/** `/principals/` collection — iOS often walks here looking for a principal child. */
async function propfindPrincipalsCollection(c: Context) {
  const auth = c.get("auth") as AuthContext | undefined;
  const body = await c.req.text();
  const requested = parseRequestedProps(body);
  const responses = [
    {
      href: absoluteHref("/principals/"),
      propstats: [
        {
          status: "HTTP/1.1 200 OK",
          propsXml: (() => {
            const parts: string[] = [];
            if (wantsProp(requested, "resourcetype")) {
              parts.push(
                "<D:resourcetype><D:collection/></D:resourcetype>",
              );
            }
            if (wantsProp(requested, "displayname")) {
              parts.push("<D:displayname>Principals</D:displayname>");
            }
            if (wantsProp(requested, "current-user-principal")) {
              parts.push(
                `<D:current-user-principal><D:href>${xmlEscape(principalHref())}</D:href></D:current-user-principal>`,
              );
            }
            if (wantsProp(requested, "addressbook-home-set")) {
              parts.push(
                `<C:addressbook-home-set><D:href>${xmlEscape(homeSetHref())}</D:href></C:addressbook-home-set>`,
              );
            }
            return parts.join("");
          })(),
        },
      ],
    },
  ];
  if (depthHeader(c) >= 1) {
    responses.push({
      href: absoluteHref("/principals/me/"),
      propstats: [
        {
          status: "HTTP/1.1 200 OK",
          propsXml: principalProps(requested),
        },
      ],
    });
  }
  cardDavLog(c, 207, {
    handler: "principals-collection",
    auth: auth?.apiKeyName ?? auth?.kind ?? "ok",
    props: [...requested].join(",") || "-",
    children: depthHeader(c) >= 1 ? 1 : 0,
  });
  return c.body(multistatus(responses), 207, davHeaders());
}

async function propfindHomeSet(c: Context) {
  const auth = c.get("auth") as AuthContext;
  const body = await c.req.text();
  const requested = parseRequestedProps(body);
  const [ctag, orgCtag] = await Promise.all([
    collectionCtag(auth.workspaceId),
    orgCollectionCtag(auth.workspaceId),
  ]);
  const responses = [
    {
      href: homeSetHref(),
      propstats: [
        {
          status: "HTTP/1.1 200 OK",
          propsXml: homeSetProps(requested),
        },
      ],
    },
  ];

  if (depthHeader(c) >= 1) {
    responses.push(
      {
        href: addressbookHref(),
        propstats: [
          {
            status: "HTTP/1.1 200 OK",
            propsXml: addressbookChildProps(
              ctag,
              requested,
              "BacksterOS Contacts",
            ),
          },
        ],
      },
      {
        href: orgAddressbookHref(),
        propstats: [
          {
            status: "HTTP/1.1 200 OK",
            propsXml: addressbookChildProps(
              orgCtag,
              requested,
              "BacksterOS Organizations",
            ),
          },
        ],
      },
    );
  }

  cardDavLog(c, 207, {
    handler: "home-set",
    auth: auth.apiKeyName ?? auth.kind,
    props: [...requested].join(",") || "-",
    children: depthHeader(c) >= 1 ? 2 : 0,
  });
  return c.body(multistatus(responses), 207, davHeaders());
}

async function propfindAddressbook(c: Context) {
  const auth = c.get("auth") as AuthContext;
  const body = await c.req.text();
  const requested = parseRequestedProps(body);
  const ctag = await collectionCtag(auth.workspaceId);
  const responses = [
    {
      href: addressbookHref(),
      propstats: [
        {
          status: "HTTP/1.1 200 OK",
          propsXml: addressbookProps(ctag, requested),
        },
      ],
    },
  ];

  if (depthHeader(c) >= 1) {
    const sources = await loadContactSources(auth.workspaceId);
    const wantData =
      wantsProp(requested, "address-data") || requested.has("*");
    for (const source of sources) {
      const photo = wantData
        ? await personalPhoto(auth.workspaceId, source.id)
        : null;
      const vcard = formatVCard(source, photo);
      responses.push({
        href: contactHref(source.id),
        propstats: [
          {
            status: "HTTP/1.1 200 OK",
            propsXml: contactPropsXml(
              source,
              vcard,
              requested,
              wantsProp(requested, "address-data"),
            ),
          },
        ],
      });
    }
  }

  cardDavLog(c, 207, {
    handler: "addressbook",
    auth: auth.apiKeyName ?? auth.kind,
    props: [...requested].join(",") || "-",
    contacts: Math.max(0, responses.length - 1),
  });
  return c.body(multistatus(responses), 207, davHeaders());
}

async function reportAddressbook(c: Context) {
  const auth = c.get("auth") as AuthContext;
  const body = await c.req.text();
  const includeData = /address-data/i.test(body);
  const sources = await loadContactSources(auth.workspaceId);
  const requested = parseRequestedProps(body);
  if (requested.size === 0) requested.add("*");
  const responses = [];
  let photos = 0;
  for (const source of sources) {
    const photo = includeData
      ? await personalPhoto(auth.workspaceId, source.id)
      : null;
    if (photo) photos += 1;
    const vcard = formatVCard(source, photo);
    responses.push({
      href: contactHref(source.id),
      propstats: [
        {
          status: "HTTP/1.1 200 OK",
          propsXml: contactPropsXml(source, vcard, requested, includeData),
        },
      ],
    });
  }
  const xml = multistatus(responses);
  cardDavLog(c, 207, {
    handler: "report",
    auth: auth.apiKeyName ?? auth.kind,
    contacts: responses.length,
    photos,
    bytes: xml.length,
    includeData,
  });
  return c.body(xml, 207, davHeaders());
}

async function getContactVcf(c: Context, file: string) {
  const auth = c.get("auth") as AuthContext;
  if (!file.endsWith(".vcf")) return c.notFound();
  const id = decodeURIComponent(file.replace(/\.vcf$/i, ""));
  const row = await circleService.getContactById(auth.workspaceId, id);
  if (!row) return c.notFound();
  const source: ContactVCardSource = {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    name: row.name,
    title: row.title,
    email: row.email,
    emails: row.emails ?? [],
    phone: row.phone,
    phones: row.phones ?? [],
    address: row.address,
    city: row.city,
    postalCode: row.postalCode,
    region: row.region,
    country: row.country,
    birthday: row.birthday,
    socialAccounts: row.socialAccounts ?? [],
    notes: row.notes,
    updatedAt: row.updatedAt,
  };
  if (row.organizationId) {
    const org = await circleService.getOrganizationById(
      auth.workspaceId,
      row.organizationId,
    );
    source.organizationName = org?.name ?? null;
  }
  const photo = await personalPhoto(auth.workspaceId, row.id);
  const vcard = formatVCard(source, photo);
  const etag = contactEtag(source);
  const ifNoneMatch = c.req.header("If-None-Match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return c.body(null, 304, { ETag: etag });
  }
  return c.body(vcard, 200, {
    "Content-Type": "text/vcard; charset=utf-8",
    ETag: etag,
  });
}

async function putContactVcf(c: Context, file: string) {
  const auth = c.get("auth") as AuthContext;
  if (!file.endsWith(".vcf")) {
    return c.text("Not a vCard resource", 400);
  }
  const idFromPath = decodeURIComponent(file.replace(/\.vcf$/i, ""));
  const raw = await c.req.text();
  const parsed = parseVCard(raw, idFromPath);
  if (!parsed) {
    return c.text("Invalid vCard", 400);
  }
  const contactId = parsed.uid || idFromPath;

  const ifMatch = c.req.header("If-Match");
  const existing = await circleService.getContactById(
    auth.workspaceId,
    contactId,
  );
  if (ifMatch && ifMatch !== "*" && existing) {
    const current = contactEtag(existing);
    if (ifMatch !== current) {
      return c.body(null, 412, { ETag: current });
    }
  }

  const patch = {
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    title: parsed.title,
    emails: parsed.emails,
    email: parsed.emails[0]?.address ?? null,
    phones: parsed.phones,
    phone: parsed.phones[0]?.number ?? null,
    address: parsed.address,
    city: parsed.city,
    postalCode: parsed.postalCode,
    region: parsed.region,
    country: parsed.country,
    birthday: parsed.birthday,
    socialAccounts: parsed.socialAccounts,
    notes: parsed.notes,
  };

  const keyBase = [parsed.firstName, parsed.lastName]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  let row;
  if (existing) {
    row = await circleService.updateContact(
      auth.workspaceId,
      contactId,
      patch,
    );
  } else {
    row = await circleService.createContact(
      auth.workspaceId,
      {
        ...patch,
        key:
          keyBase ||
          contactId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 21) ||
          contactId,
        firstName: patch.firstName || "Contact",
      },
      contactId,
    );
  }
  if (!row) {
    return c.text("Contact write failed", 500);
  }

  if (parsed.photo?.bytes?.length) {
    if (parsed.photo.bytes.byteLength > MAX_AVATAR_BYTES) {
      return c.text("Photo too large", 413);
    }
    await circleService.putAvatar(
      auth.workspaceId,
      "contact",
      row.id,
      parsed.photo.bytes,
      parsed.photo.contentType || "image/jpeg",
    );
    const refreshed = await circleService.getContactById(
      auth.workspaceId,
      row.id,
    );
    if (refreshed) row = refreshed;
  }

  await recordContactRestSyncEvent(auth.workspaceId, row, "upsert");
  nudgeContactLive(auth, row.id, "upsert");

  const etag = contactEtag(row);
  return c.body(null, existing ? 204 : 201, {
    ETag: etag,
    Location: contactHref(row.id),
  });
}

async function deleteContactVcf(c: Context, file: string) {
  const auth = c.get("auth") as AuthContext;
  if (!file.endsWith(".vcf")) return c.notFound();
  const id = decodeURIComponent(file.replace(/\.vcf$/i, ""));
  const row = await circleService.deleteContact(auth.workspaceId, id);
  if (!row) return c.notFound();
  await recordContactRestSyncEvent(auth.workspaceId, row, "delete");
  nudgeContactLive(auth, row.id, "delete");
  return c.body(null, 204);
}

function orgContactPropsXml(
  source: OrganizationVCardSource,
  vcard: string,
  requested: Set<string>,
  includeAddressData: boolean,
): string {
  const parts: string[] = [];
  const etag = organizationEtag(source);
  if (wantsProp(requested, "getetag") || requested.has("*")) {
    parts.push(`<D:getetag>${xmlEscape(etag)}</D:getetag>`);
  }
  if (wantsProp(requested, "getcontenttype") || requested.has("*")) {
    parts.push("<D:getcontenttype>text/vcard; charset=utf-8</D:getcontenttype>");
  }
  if (wantsProp(requested, "resourcetype") || requested.has("*")) {
    parts.push("<D:resourcetype/>");
  }
  if (
    includeAddressData ||
    wantsProp(requested, "address-data") ||
    requested.has("*")
  ) {
    parts.push(
      `<C:address-data content-type="text/vcard" version="3.0">${xmlEscape(vcard)}</C:address-data>`,
    );
  }
  return parts.join("");
}

function orgAddressbookProps(ctag: string, requested: Set<string>): string {
  const parts: string[] = [];
  if (wantsProp(requested, "resourcetype")) {
    parts.push(
      "<D:resourcetype><D:collection/><C:addressbook/></D:resourcetype>",
    );
  }
  if (wantsProp(requested, "displayname")) {
    parts.push("<D:displayname>BacksterOS Organizations</D:displayname>");
  }
  parts.push(`<CS:getctag>${xmlEscape(ctag)}</CS:getctag>`);
  if (wantsProp(requested, "current-user-principal")) {
    parts.push(
      `<D:current-user-principal><D:href>${xmlEscape(principalHref())}</D:href></D:current-user-principal>`,
    );
  }
  if (wantsProp(requested, "principal-URL")) {
    parts.push(
      `<D:principal-URL><D:href>${xmlEscape(principalHref())}</D:href></D:principal-URL>`,
    );
  }
  if (wantsProp(requested, "addressbook-home-set")) {
    parts.push(
      `<C:addressbook-home-set><D:href>${xmlEscape(homeSetHref())}</D:href></C:addressbook-home-set>`,
    );
  }
  if (wantsProp(requested, "current-user-privilege-set")) {
    parts.push(privilegeSetXml());
  }
  if (
    wantsProp(requested, "supported-address-data") ||
    wantsProp(requested, "address-data")
  ) {
    parts.push(
      `<C:supported-address-data><C:address-data-type content-type="text/vcard" version="3.0"/></C:supported-address-data>`,
    );
  }
  if (wantsProp(requested, "supported-report-set")) {
    parts.push(supportedReportSetXml());
  }
  if (wantsProp(requested, "sync-token")) {
    parts.push(
      `<D:sync-token>https://contacts.backsteros.com/sync/org/${xmlEscape(ctag.replaceAll('"', ""))}</D:sync-token>`,
    );
  }
  return parts.join("");
}

async function propfindOrgAddressbook(c: Context) {
  const auth = c.get("auth") as AuthContext;
  const body = await c.req.text();
  const requested = parseRequestedProps(body);
  const ctag = await orgCollectionCtag(auth.workspaceId);
  const responses = [
    {
      href: orgAddressbookHref(),
      propstats: [
        {
          status: "HTTP/1.1 200 OK",
          propsXml: orgAddressbookProps(ctag, requested),
        },
      ],
    },
  ];

  if (depthHeader(c) >= 1) {
    const sources = await loadOrganizationSources(auth.workspaceId);
    const wantData =
      wantsProp(requested, "address-data") || requested.has("*");
    for (const source of sources) {
      const photo = wantData
        ? await organizationPhoto(auth.workspaceId, source.id)
        : null;
      const vcard = formatOrganizationVCard(source, photo);
      responses.push({
        href: organizationHref(source.id),
        propstats: [
          {
            status: "HTTP/1.1 200 OK",
            propsXml: orgContactPropsXml(
              source,
              vcard,
              requested,
              wantsProp(requested, "address-data"),
            ),
          },
        ],
      });
    }
  }

  cardDavLog(c, 207, {
    handler: "org-addressbook",
    auth: auth.apiKeyName ?? auth.kind,
    props: [...requested].join(",") || "-",
    organizations: Math.max(0, responses.length - 1),
  });
  return c.body(multistatus(responses), 207, davHeaders());
}

async function reportOrgAddressbook(c: Context) {
  const auth = c.get("auth") as AuthContext;
  const body = await c.req.text();
  const includeData = /address-data/i.test(body);
  const sources = await loadOrganizationSources(auth.workspaceId);
  const requested = parseRequestedProps(body);
  if (requested.size === 0) requested.add("*");
  const responses = [];
  let photos = 0;
  for (const source of sources) {
    const photo = includeData
      ? await organizationPhoto(auth.workspaceId, source.id)
      : null;
    if (photo) photos += 1;
    const vcard = formatOrganizationVCard(source, photo);
    responses.push({
      href: organizationHref(source.id),
      propstats: [
        {
          status: "HTTP/1.1 200 OK",
          propsXml: orgContactPropsXml(source, vcard, requested, includeData),
        },
      ],
    });
  }
  const xml = multistatus(responses);
  cardDavLog(c, 207, {
    handler: "org-report",
    auth: auth.apiKeyName ?? auth.kind,
    organizations: responses.length,
    photos,
    bytes: xml.length,
    includeData,
  });
  return c.body(xml, 207, davHeaders());
}

async function getOrganizationVcf(c: Context, file: string) {
  const auth = c.get("auth") as AuthContext;
  if (!file.endsWith(".vcf")) return c.notFound();
  const id = decodeURIComponent(file.replace(/\.vcf$/i, ""));
  const row = await circleService.getOrganizationById(auth.workspaceId, id);
  if (!row) return c.notFound();
  const source: OrganizationVCardSource = {
    id: row.id,
    name: row.name,
    email: row.email,
    emails: row.emails ?? [],
    phone: row.phone,
    phones: row.phones ?? [],
    website: row.website,
    address: row.address,
    city: row.city,
    postalCode: row.postalCode,
    region: row.region,
    country: row.country,
    socialAccounts: row.socialAccounts ?? [],
    notes: row.notes,
    updatedAt: row.updatedAt,
  };
  const photo = await organizationPhoto(auth.workspaceId, row.id);
  const vcard = formatOrganizationVCard(source, photo);
  const etag = organizationEtag(source);
  const ifNoneMatch = c.req.header("If-None-Match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return c.body(null, 304, { ETag: etag });
  }
  return c.body(vcard, 200, {
    "Content-Type": "text/vcard; charset=utf-8",
    ETag: etag,
  });
}

async function putOrganizationVcf(c: Context, file: string) {
  const auth = c.get("auth") as AuthContext;
  if (!file.endsWith(".vcf")) {
    return c.text("Not a vCard resource", 400);
  }
  const idFromPath = decodeURIComponent(file.replace(/\.vcf$/i, ""));
  const raw = await c.req.text();
  const parsed = parseOrganizationVCard(raw, idFromPath);
  if (!parsed) {
    return c.text("Invalid vCard", 400);
  }
  const organizationId = parsed.uid || idFromPath;

  const ifMatch = c.req.header("If-Match");
  const existing = await circleService.getOrganizationById(
    auth.workspaceId,
    organizationId,
  );
  if (ifMatch && ifMatch !== "*" && existing) {
    const current = organizationEtag(existing);
    if (ifMatch !== current) {
      return c.body(null, 412, { ETag: current });
    }
  }

  const patch = {
    name: parsed.name,
    emails: parsed.emails,
    email: parsed.emails[0]?.address ?? null,
    phones: parsed.phones,
    phone: parsed.phones[0]?.number ?? null,
    website: parsed.website,
    address: parsed.address,
    city: parsed.city,
    postalCode: parsed.postalCode,
    region: parsed.region,
    country: parsed.country,
    socialAccounts: parsed.socialAccounts,
    notes: parsed.notes,
  };

  const keyBase = parsed.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  let row;
  if (existing) {
    row = await circleService.updateOrganization(
      auth.workspaceId,
      organizationId,
      patch,
    );
  } else {
    row = await circleService.createOrganization(
      auth.workspaceId,
      {
        ...patch,
        key:
          keyBase ||
          organizationId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 21) ||
          organizationId,
        name: patch.name || "Organization",
      },
      organizationId,
    );
  }
  if (!row) {
    return c.text("Organization write failed", 500);
  }

  if (parsed.photo?.bytes?.length) {
    if (parsed.photo.bytes.byteLength > MAX_AVATAR_BYTES) {
      return c.text("Photo too large", 413);
    }
    await circleService.putAvatar(
      auth.workspaceId,
      "organization",
      row.id,
      parsed.photo.bytes,
      parsed.photo.contentType || "image/jpeg",
    );
    const refreshed = await circleService.getOrganizationById(
      auth.workspaceId,
      row.id,
    );
    if (refreshed) row = refreshed;
  }

  await recordOrganizationRestSyncEvent(auth.workspaceId, row, "upsert");
  nudgeOrganizationLive(auth, row.id, "upsert");

  const etag = organizationEtag(row);
  return c.body(null, existing ? 204 : 201, {
    ETag: etag,
    Location: organizationHref(row.id),
  });
}

async function deleteOrganizationVcf(c: Context, file: string) {
  const auth = c.get("auth") as AuthContext;
  if (!file.endsWith(".vcf")) return c.notFound();
  const id = decodeURIComponent(file.replace(/\.vcf$/i, ""));
  const row = await circleService.deleteOrganization(auth.workspaceId, id);
  if (!row) return c.notFound();
  await recordOrganizationRestSyncEvent(auth.workspaceId, row, "delete");
  nudgeOrganizationLive(auth, row.id, "delete");
  return c.body(null, 204);
}

function optionsDav(c: Context) {
  return c.body(null, 204, {
    Allow: "OPTIONS, GET, PUT, DELETE, PROPFIND, REPORT",
    DAV: "1, 3, addressbook, sync-collection",
  });
}

export function registerCardDavRoutes(app: Hono) {
  app.use("/.well-known/carddav", requireCardDavAuth);
  app.use("/dav", requireCardDavAuth);
  app.use("/dav/*", requireCardDavAuth);
  app.use("/principals", requireCardDavAuth);
  app.use("/principals/*", requireCardDavAuth);

  // iOS discovers via /.well-known/carddav — answer with 207 (no 301;
  // Apple often drops Basic credentials across redirects).
  app.on("PROPFIND", "/.well-known/carddav", propfindPrincipal);
  app.get("/.well-known/carddav", (c) => c.redirect(principalHref(), 301));
  app.options("/.well-known/carddav", optionsDav);

  // iOS also PROPFINDs `/` and `/principals/` after well-known (was 404 → verify fail).
  app.on("PROPFIND", "/", withCardDavAuth(propfindRoot));
  app.options("/", withCardDavAuth(optionsDav));

  app.on("PROPFIND", "/principals", propfindPrincipalsCollection);
  app.on("PROPFIND", "/principals/", propfindPrincipalsCollection);
  app.on("PROPFIND", "/principals/me", propfindPrincipal);
  app.on("PROPFIND", "/principals/me/", propfindPrincipal);
  app.options("/principals", optionsDav);
  app.options("/principals/", optionsDav);
  app.options("/principals/me", optionsDav);
  app.options("/principals/me/", optionsDav);

  app.on("PROPFIND", "/dav/principals/me", propfindPrincipal);
  app.on("PROPFIND", "/dav/principals/me/", propfindPrincipal);
  app.options("/dav/principals/me", optionsDav);
  app.options("/dav/principals/me/", optionsDav);

  app.on("PROPFIND", "/dav", propfindHomeSet);
  app.on("PROPFIND", "/dav/", propfindHomeSet);
  app.options("/dav", optionsDav);
  app.options("/dav/", optionsDav);

  app.on("PROPFIND", "/dav/contacts", propfindAddressbook);
  app.on("PROPFIND", "/dav/contacts/", propfindAddressbook);
  app.on("REPORT", "/dav/contacts", reportAddressbook);
  app.on("REPORT", "/dav/contacts/", reportAddressbook);
  app.options("/dav/contacts", optionsDav);
  app.options("/dav/contacts/", optionsDav);

  app.get("/dav/contacts/:file", (c) => getContactVcf(c, c.req.param("file")));
  app.put("/dav/contacts/:file", (c) => putContactVcf(c, c.req.param("file")));
  app.delete("/dav/contacts/:file", (c) =>
    deleteContactVcf(c, c.req.param("file")),
  );

  app.on("PROPFIND", "/dav/organizations", propfindOrgAddressbook);
  app.on("PROPFIND", "/dav/organizations/", propfindOrgAddressbook);
  app.on("REPORT", "/dav/organizations", reportOrgAddressbook);
  app.on("REPORT", "/dav/organizations/", reportOrgAddressbook);
  app.options("/dav/organizations", optionsDav);
  app.options("/dav/organizations/", optionsDav);

  app.get("/dav/organizations/:file", (c) =>
    getOrganizationVcf(c, c.req.param("file")),
  );
  app.put("/dav/organizations/:file", (c) =>
    putOrganizationVcf(c, c.req.param("file")),
  );
  app.delete("/dav/organizations/:file", (c) =>
    deleteOrganizationVcf(c, c.req.param("file")),
  );

  // Legacy flat /dav/{id}.vcf → people book (pre-hierarchy clients).
  app.get("/dav/:file", (c) => {
    const file = c.req.param("file");
    if (
      file === "contacts" ||
      file === "principals" ||
      file === "organizations"
    ) {
      return c.notFound();
    }
    return getContactVcf(c, file);
  });
  app.put("/dav/:file", (c) => {
    const file = c.req.param("file");
    if (
      file === "contacts" ||
      file === "principals" ||
      file === "organizations"
    ) {
      return c.notFound();
    }
    return putContactVcf(c, file);
  });
  app.delete("/dav/:file", (c) => {
    const file = c.req.param("file");
    if (
      file === "contacts" ||
      file === "principals" ||
      file === "organizations"
    ) {
      return c.notFound();
    }
    return deleteContactVcf(c, file);
  });
}

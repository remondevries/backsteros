/**
 * CardDAV address book for BacksterOS contacts (iOS Contacts ↔ Postgres).
 * Public host: contacts.backsteros.com → cloud-core.
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
import { recordContactRestSyncEvent } from "../services/sync.js";
import { nudgeContactLive } from "./route-shared.js";

const PRINCIPAL = "carddav";
const ADDRESSBOOK_PATH = `/dav/addressbooks/${PRINCIPAL}/contacts/`;
const PRINCIPAL_PATH = `/dav/principals/${PRINCIPAL}/`;
const ADDRESSBOOK_HOME = `/dav/addressbooks/${PRINCIPAL}/`;

function davChallenge() {
  return {
    "WWW-Authenticate": 'Basic realm="BacksterOS CardDAV"',
    "Content-Type": "application/xml; charset=utf-8",
  };
}

async function requireCardDavAuth(c: Context, next: Next) {
  const auth = await resolveAuthFlexible(c.req.header("Authorization"));
  if (!auth || !hasCardDavScope(auth)) {
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

function contactHref(contactId: string): string {
  return `${ADDRESSBOOK_PATH}${encodeURIComponent(contactId)}.vcf`;
}

function depthHeader(c: Context): number {
  const raw = (c.req.header("Depth") ?? "1").trim().toLowerCase();
  if (raw === "infinity") return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 1;
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
  return `"ctag-${latest.getTime()}"`;
}

async function personalPhoto(
  workspaceId: string,
  contactId: string,
): Promise<{ contentType: string; bytes: Uint8Array } | null> {
  const result = await circleService.getAvatar(workspaceId, "contact", contactId);
  if (!result?.bytes?.length) return null;
  return {
    contentType: result.row.contentType || "image/jpeg",
    bytes: result.bytes,
  };
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
  if (wantsProp(requested, "getctag") || wantsProp(requested, "getctag")) {
    parts.push(`<CS:getctag>${xmlEscape(ctag)}</CS:getctag>`);
  }
  if (wantsProp(requested, "current-user-privilege-set")) {
    parts.push(`<D:current-user-privilege-set>
      <D:privilege><D:read/></D:privilege>
      <D:privilege><D:write/></D:privilege>
      <D:privilege><D:write-content/></D:privilege>
      <D:privilege><D:bind/></D:privilege>
      <D:privilege><D:unbind/></D:privilege>
    </D:current-user-privilege-set>`);
  }
  if (wantsProp(requested, "supported-address-data") || wantsProp(requested, "address-data")) {
    parts.push(
      `<C:supported-address-data><C:address-data-type content-type="text/vcard" version="3.0"/></C:supported-address-data>`,
    );
  }
  if (wantsProp(requested, "sync-token")) {
    parts.push(`<D:sync-token>https://contacts.backsteros.com/sync/${xmlEscape(ctag.replaceAll('"', ""))}</D:sync-token>`);
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

export function registerCardDavRoutes(app: Hono) {
  app.use("/.well-known/carddav", requireCardDavAuth);
  app.use("/dav/*", requireCardDavAuth);

  app.all("/.well-known/carddav", (c) => {
    return c.redirect(ADDRESSBOOK_HOME, 301);
  });

  // Root DAV discovery
  app.on("PROPFIND", "/dav/", async (c) => {
    const body = await c.req.text();
    const requested = parseRequestedProps(body);
    const props: string[] = [];
    if (wantsProp(requested, "current-user-principal")) {
      props.push(
        `<D:current-user-principal><D:href>${xmlEscape(PRINCIPAL_PATH)}</D:href></D:current-user-principal>`,
      );
    }
    if (wantsProp(requested, "resourcetype")) {
      props.push("<D:resourcetype><D:collection/></D:resourcetype>");
    }
    const xml = multistatus([
      {
        href: "/dav/",
        propstats: [
          { status: "HTTP/1.1 200 OK", propsXml: props.join("") || "<D:resourcetype><D:collection/></D:resourcetype>" },
        ],
      },
    ]);
    return c.body(xml, 207, { "Content-Type": "application/xml; charset=utf-8" });
  });

  app.on("PROPFIND", "/dav/principals/:name/", async (c) => {
    const body = await c.req.text();
    const requested = parseRequestedProps(body);
    const props: string[] = [];
    if (wantsProp(requested, "resourcetype")) {
      props.push(
        "<D:resourcetype><D:collection/><D:principal/></D:resourcetype>",
      );
    }
    if (wantsProp(requested, "displayname")) {
      props.push("<D:displayname>BacksterOS</D:displayname>");
    }
    if (wantsProp(requested, "addressbook-home-set")) {
      props.push(
        `<C:addressbook-home-set><D:href>${xmlEscape(ADDRESSBOOK_HOME)}</D:href></C:addressbook-home-set>`,
      );
    }
    if (wantsProp(requested, "principal-URL")) {
      props.push(
        `<D:principal-URL><D:href>${xmlEscape(PRINCIPAL_PATH)}</D:href></D:principal-URL>`,
      );
    }
    const xml = multistatus([
      {
        href: PRINCIPAL_PATH,
        propstats: [{ status: "HTTP/1.1 200 OK", propsXml: props.join("") }],
      },
    ]);
    return c.body(xml, 207, { "Content-Type": "application/xml; charset=utf-8" });
  });

  app.on("PROPFIND", "/dav/addressbooks/:name/", async (c) => {
    const auth = c.get("auth") as AuthContext;
    const body = await c.req.text();
    const requested = parseRequestedProps(body);
    const ctag = await collectionCtag(auth.workspaceId);
    const responses = [
      {
        href: ADDRESSBOOK_HOME,
        propstats: [
          {
            status: "HTTP/1.1 200 OK",
            propsXml:
              "<D:resourcetype><D:collection/></D:resourcetype><D:displayname>Address books</D:displayname>",
          },
        ],
      },
    ];
    if (depthHeader(c) >= 1) {
      responses.push({
        href: ADDRESSBOOK_PATH,
        propstats: [
          {
            status: "HTTP/1.1 200 OK",
            propsXml: addressbookProps(ctag, requested),
          },
        ],
      });
    }
    return c.body(multistatus(responses), 207, {
      "Content-Type": "application/xml; charset=utf-8",
    });
  });

  app.on("PROPFIND", "/dav/addressbooks/:name/contacts/", async (c) => {
    const auth = c.get("auth") as AuthContext;
    const body = await c.req.text();
    const requested = parseRequestedProps(body);
    const ctag = await collectionCtag(auth.workspaceId);
    const responses = [
      {
        href: ADDRESSBOOK_PATH,
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
      for (const source of sources) {
        const photo = wantsProp(requested, "address-data") || requested.has("*")
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

    return c.body(multistatus(responses), 207, {
      "Content-Type": "application/xml; charset=utf-8",
    });
  });

  app.on("REPORT", "/dav/addressbooks/:name/contacts/", async (c) => {
    const auth = c.get("auth") as AuthContext;
    const body = await c.req.text();
    const includeData = /address-data/i.test(body);
    const sources = await loadContactSources(auth.workspaceId);
    const requested = parseRequestedProps(body);
    if (requested.size === 0) requested.add("*");
    const responses = [];
    for (const source of sources) {
      const photo = includeData
        ? await personalPhoto(auth.workspaceId, source.id)
        : null;
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
    return c.body(multistatus(responses), 207, {
      "Content-Type": "application/xml; charset=utf-8",
      DAV: "1, 3, addressbook, sync-collection",
    });
  });

  app.get("/dav/addressbooks/:name/contacts/:file", async (c) => {
    const auth = c.get("auth") as AuthContext;
    const file = c.req.param("file");
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
  });

  app.put("/dav/addressbooks/:name/contacts/:file", async (c) => {
    const auth = c.get("auth") as AuthContext;
    const file = c.req.param("file");
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
          key: keyBase || contactId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 21) || contactId,
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
  });

  app.delete("/dav/addressbooks/:name/contacts/:file", async (c) => {
    const auth = c.get("auth") as AuthContext;
    const file = c.req.param("file");
    if (!file.endsWith(".vcf")) return c.notFound();
    const id = decodeURIComponent(file.replace(/\.vcf$/i, ""));
    const row = await circleService.deleteContact(auth.workspaceId, id);
    if (!row) return c.notFound();
    await recordContactRestSyncEvent(auth.workspaceId, row, "delete");
    nudgeContactLive(auth, row.id, "delete");
    return c.body(null, 204);
  });

  // OPTIONS for DAV discovery
  app.options("/dav/*", (c) =>
    c.body(null, 204, {
      Allow:
        "OPTIONS, GET, PUT, DELETE, PROPFIND, REPORT",
      DAV: "1, 3, addressbook, sync-collection",
    }),
  );

  app.options("/.well-known/carddav", (c) =>
    c.body(null, 204, {
      Allow: "OPTIONS, PROPFIND, GET",
      DAV: "1, 3, addressbook",
    }),
  );
}

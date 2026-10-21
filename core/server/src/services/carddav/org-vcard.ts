/**
 * Organization ↔ company vCard 3.0 (CardDAV / iOS Contacts).
 * Uses Apple `X-ABShowAs:COMPANY`. UID = organizations.id.
 * PHOTO = organization avatar (`entityType=organization`), same as the API.
 */
import { CARDDAV_CARD_REV } from "./vcard.js";

export type OrganizationVCardSource = {
  id: string;
  name: string;
  email: string | null;
  emails: { label: "general" | "support" | "other"; address: string }[];
  phone: string | null;
  phones: { label: "general" | "support" | "other"; number: string }[];
  website: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  region: string | null;
  country: string | null;
  socialAccounts: { platform: string; url: string }[];
  notes: string | null;
  updatedAt: Date;
};

export type ParsedVCardOrganization = {
  uid: string;
  name: string;
  emails: { label: "general" | "support" | "other"; address: string }[];
  phones: { label: "general" | "support" | "other"; number: string }[];
  website: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  region: string | null;
  country: string | null;
  socialAccounts: { platform: string; url: string }[];
  notes: string | null;
  photo?: { contentType: string; bytes: Uint8Array } | null;
  isCompany: boolean;
};

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let remaining = line;
  parts.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    parts.push(` ${remaining.slice(0, 74)}`);
    remaining = remaining.slice(74);
  }
  return parts.join("\r\n");
}

function emailType(label: "general" | "support" | "other"): string {
  if (label === "support") return "INTERNET;TYPE=WORK";
  if (label === "other") return "INTERNET;TYPE=OTHER";
  return "INTERNET;TYPE=WORK";
}

function phoneType(label: "general" | "support" | "other"): string {
  if (label === "other") return "TYPE=OTHER,VOICE";
  return "TYPE=WORK,VOICE";
}

function labelFromEmailType(params: string): "general" | "support" | "other" {
  const upper = params.toUpperCase();
  if (upper.includes("OTHER")) return "other";
  return "general";
}

function labelFromPhoneType(params: string): "general" | "support" | "other" {
  const upper = params.toUpperCase();
  if (upper.includes("OTHER") || upper.includes("CELL") || upper.includes("MOBILE")) {
    return "other";
  }
  return "general";
}

function collectEmails(org: OrganizationVCardSource) {
  if (org.emails.length > 0) return org.emails;
  if (org.email?.trim()) {
    return [{ label: "general" as const, address: org.email.trim() }];
  }
  return [];
}

function collectPhones(org: OrganizationVCardSource) {
  if (org.phones.length > 0) return org.phones;
  if (org.phone?.trim()) {
    return [{ label: "general" as const, number: org.phone.trim() }];
  }
  return [];
}

function photoTypeFromContentType(contentType: string): string {
  const lower = contentType.toLowerCase();
  if (lower.includes("png")) return "PNG";
  if (lower.includes("gif")) return "GIF";
  return "JPEG";
}

export function organizationEtag(org: {
  id: string;
  updatedAt: Date;
}): string {
  return `"${org.updatedAt.getTime()}-${org.id}-org-${CARDDAV_CARD_REV}"`;
}

export function formatOrganizationVCard(
  org: OrganizationVCardSource,
  photo?: { contentType: string; bytes: Uint8Array } | null,
): string {
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];
  lines.push(`UID:${escapeText(org.id)}`);
  const name = org.name.trim() || "Organization";
  lines.push(`FN:${escapeText(name)}`);
  // Company cards: empty structured name; Apple shows FN + ORG as company.
  lines.push("N:;;;;");
  lines.push(`ORG:${escapeText(name)}`);
  lines.push("X-ABShowAs:COMPANY");
  for (const email of collectEmails(org)) {
    lines.push(
      `EMAIL;TYPE=${emailType(email.label)}:${escapeText(email.address)}`,
    );
  }
  for (const phone of collectPhones(org)) {
    lines.push(`TEL;${phoneType(phone.label)}:${escapeText(phone.number)}`);
  }
  const street = org.address?.trim() ?? "";
  const city = org.city?.trim() ?? "";
  const region = org.region?.trim() ?? "";
  const postal = org.postalCode?.trim() ?? "";
  const country = org.country?.trim() ?? "";
  if (street || city || region || postal || country) {
    lines.push(
      `ADR;TYPE=WORK:;;${escapeText(street)};${escapeText(city)};${escapeText(region)};${escapeText(postal)};${escapeText(country)}`,
    );
  }
  if (org.website?.trim()) {
    lines.push(`URL:${escapeText(org.website.trim())}`);
  }
  for (const social of org.socialAccounts) {
    if (!social.url?.trim()) continue;
    lines.push(
      `URL;TYPE=${escapeText(social.platform || "other")}:${escapeText(social.url.trim())}`,
    );
  }
  if (org.notes?.trim()) {
    lines.push(`NOTE:${escapeText(org.notes.trim())}`);
  }
  if (photo?.bytes?.length) {
    const type = photoTypeFromContentType(photo.contentType || "image/jpeg");
    const b64 = Buffer.from(photo.bytes).toString("base64");
    lines.push(`PHOTO;ENCODING=B;TYPE=${type}:${b64}`);
  }
  lines.push(`REV:${org.updatedAt.toISOString().replace(/\.\d{3}Z$/, "Z")}`);
  lines.push("END:VCARD");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

function unfold(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const out: string[] = [];
  for (const line of normalized.split("\n")) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else if (line.length > 0) {
      out.push(line);
    }
  }
  return out;
}

function splitProp(line: string): {
  name: string;
  params: string;
  value: string;
} {
  const colon = line.indexOf(":");
  if (colon < 0) return { name: line.toUpperCase(), params: "", value: "" };
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const semi = left.indexOf(";");
  if (semi < 0) {
    return { name: left.toUpperCase(), params: "", value };
  }
  return {
    name: left.slice(0, semi).toUpperCase(),
    params: left.slice(semi + 1),
    value,
  };
}

function contentTypeFromPhotoType(type: string): string {
  const upper = type.toUpperCase();
  if (upper.includes("PNG")) return "image/png";
  if (upper.includes("GIF")) return "image/gif";
  return "image/jpeg";
}

export function parseOrganizationVCard(
  raw: string,
  fallbackUid?: string,
): ParsedVCardOrganization | null {
  const lines = unfold(raw);
  let uid = fallbackUid?.trim() ?? "";
  let fn = "";
  let orgName = "";
  let isCompany = false;
  const emails: ParsedVCardOrganization["emails"] = [];
  const phones: ParsedVCardOrganization["phones"] = [];
  let website: string | null = null;
  let address: string | null = null;
  let city: string | null = null;
  let postalCode: string | null = null;
  let region: string | null = null;
  let country: string | null = null;
  const socialAccounts: ParsedVCardOrganization["socialAccounts"] = [];
  let notes: string | null = null;
  let photo: ParsedVCardOrganization["photo"] = null;

  for (const line of lines) {
    const { name, params, value } = splitProp(line);
    if (name === "UID") {
      uid = unescapeText(value).trim() || uid;
    } else if (name === "FN") {
      fn = unescapeText(value).trim();
    } else if (name === "ORG") {
      orgName = unescapeText(value).split(";")[0]?.trim() || orgName;
    } else if (name === "X-ABSHOWAS") {
      if (unescapeText(value).trim().toUpperCase() === "COMPANY") {
        isCompany = true;
      }
    } else if (name === "EMAIL") {
      const addressValue = unescapeText(value).trim();
      if (addressValue) {
        emails.push({
          label: labelFromEmailType(params),
          address: addressValue,
        });
      }
    } else if (name === "TEL") {
      const number = unescapeText(value).trim();
      if (number) {
        phones.push({
          label: labelFromPhoneType(params),
          number,
        });
      }
    } else if (name === "ADR") {
      const parts = value.split(";");
      address = unescapeText(parts[2] ?? "").trim() || null;
      city = unescapeText(parts[3] ?? "").trim() || null;
      region = unescapeText(parts[4] ?? "").trim() || null;
      postalCode = unescapeText(parts[5] ?? "").trim() || null;
      country = unescapeText(parts[6] ?? "").trim() || null;
    } else if (name === "URL") {
      const url = unescapeText(value).trim();
      if (!url) continue;
      const platformMatch = /TYPE=([^;]+)/i.exec(params);
      if (platformMatch?.[1]) {
        socialAccounts.push({
          platform: platformMatch[1].trim(),
          url,
        });
      } else if (!website) {
        website = url;
      } else {
        socialAccounts.push({ platform: "other", url });
      }
    } else if (name === "NOTE") {
      notes = unescapeText(value).trim() || null;
    } else if (name === "PHOTO") {
      const upperParams = params.toUpperCase();
      if (
        upperParams.includes("ENCODING=B") ||
        upperParams.includes("ENCODING=BASE64")
      ) {
        const typeMatch = /TYPE=([^;]+)/i.exec(params);
        const contentType = contentTypeFromPhotoType(typeMatch?.[1] ?? "JPEG");
        try {
          const bytes = Buffer.from(value.replace(/\s+/g, ""), "base64");
          if (bytes.length > 0) {
            photo = { contentType, bytes: new Uint8Array(bytes) };
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  if (!uid) return null;
  const name = orgName || fn || "Organization";
  if (!orgName && !fn) isCompany = true;

  return {
    uid,
    name,
    emails,
    phones,
    website,
    address,
    city,
    postalCode,
    region,
    country,
    socialAccounts,
    notes,
    photo,
    isCompany: isCompany || Boolean(orgName),
  };
}

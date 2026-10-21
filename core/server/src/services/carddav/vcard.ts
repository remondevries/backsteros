/**
 * vCard 3.0 ↔ BacksterOS contact fields (CardDAV / iOS Contacts).
 * UID is always the contact id. PHOTO uses the personal avatar only.
 */

export type ContactVCardSource = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  title: string | null;
  email: string | null;
  emails: { label: "personal" | "work" | "other"; address: string }[];
  phone: string | null;
  phones: { label: "personal" | "work" | "other"; number: string }[];
  address: string | null;
  city: string | null;
  postalCode: string | null;
  region: string | null;
  country: string | null;
  birthday: string | null;
  socialAccounts: { platform: string; url: string }[];
  notes: string | null;
  organizationName?: string | null;
  updatedAt: Date;
};

export type ParsedVCardContact = {
  uid: string;
  firstName: string;
  lastName: string;
  title: string | null;
  emails: { label: "personal" | "work" | "other"; address: string }[];
  phones: { label: "personal" | "work" | "other"; number: string }[];
  address: string | null;
  city: string | null;
  postalCode: string | null;
  region: string | null;
  country: string | null;
  birthday: string | null;
  socialAccounts: { platform: string; url: string }[];
  notes: string | null;
  photo?: { contentType: string; bytes: Uint8Array } | null;
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

function emailType(label: "personal" | "work" | "other"): string {
  if (label === "work") return "INTERNET;TYPE=WORK";
  if (label === "other") return "INTERNET;TYPE=OTHER";
  return "INTERNET;TYPE=HOME";
}

function phoneType(label: "personal" | "work" | "other"): string {
  if (label === "work") return "TYPE=WORK,VOICE";
  if (label === "other") return "TYPE=OTHER,VOICE";
  return "TYPE=HOME,VOICE";
}

function labelFromEmailType(params: string): "personal" | "work" | "other" {
  const upper = params.toUpperCase();
  if (upper.includes("WORK")) return "work";
  if (upper.includes("OTHER")) return "other";
  return "personal";
}

function labelFromPhoneType(params: string): "personal" | "work" | "other" {
  const upper = params.toUpperCase();
  if (upper.includes("WORK")) return "work";
  if (upper.includes("OTHER") || upper.includes("CELL") || upper.includes("MOBILE")) {
    return upper.includes("WORK") ? "work" : "personal";
  }
  if (upper.includes("HOME")) return "personal";
  return "personal";
}

function collectEmails(contact: ContactVCardSource): {
  label: "personal" | "work" | "other";
  address: string;
}[] {
  if (contact.emails.length > 0) return contact.emails;
  if (contact.email?.trim()) {
    return [{ label: "personal", address: contact.email.trim() }];
  }
  return [];
}

function collectPhones(contact: ContactVCardSource): {
  label: "personal" | "work" | "other";
  number: string;
}[] {
  if (contact.phones.length > 0) return contact.phones;
  if (contact.phone?.trim()) {
    return [{ label: "personal", number: contact.phone.trim() }];
  }
  return [];
}

function photoTypeFromContentType(contentType: string): string {
  const lower = contentType.toLowerCase();
  if (lower.includes("png")) return "PNG";
  if (lower.includes("gif")) return "GIF";
  if (lower.includes("webp")) return "JPEG";
  return "JPEG";
}

export function contactEtag(contact: { id: string; updatedAt: Date }): string {
  return `"${contact.updatedAt.getTime()}-${contact.id}"`;
}

export function formatVCard(
  contact: ContactVCardSource,
  photo?: { contentType: string; bytes: Uint8Array } | null,
): string {
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];
  lines.push(`UID:${escapeText(contact.id)}`);
  const fn =
    contact.name.trim() ||
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
    "Contact";
  lines.push(`FN:${escapeText(fn)}`);
  lines.push(
    `N:${escapeText(contact.lastName)};${escapeText(contact.firstName)};;;`,
  );
  if (contact.title?.trim()) {
    lines.push(`TITLE:${escapeText(contact.title.trim())}`);
  }
  if (contact.organizationName?.trim()) {
    lines.push(`ORG:${escapeText(contact.organizationName.trim())}`);
  }
  for (const email of collectEmails(contact)) {
    lines.push(`EMAIL;TYPE=${emailType(email.label)}:${escapeText(email.address)}`);
  }
  for (const phone of collectPhones(contact)) {
    lines.push(`TEL;${phoneType(phone.label)}:${escapeText(phone.number)}`);
  }
  const street = contact.address?.trim() ?? "";
  const city = contact.city?.trim() ?? "";
  const region = contact.region?.trim() ?? "";
  const postal = contact.postalCode?.trim() ?? "";
  const country = contact.country?.trim() ?? "";
  if (street || city || region || postal || country) {
    lines.push(
      `ADR;TYPE=HOME:;;${escapeText(street)};${escapeText(city)};${escapeText(region)};${escapeText(postal)};${escapeText(country)}`,
    );
  }
  if (contact.birthday?.trim()) {
    const bday = contact.birthday.trim().replaceAll("-", "");
    if (/^\d{8}$/.test(bday)) {
      lines.push(`BDAY:${bday}`);
    }
  }
  for (const social of contact.socialAccounts) {
    if (!social.url?.trim()) continue;
    lines.push(`URL;TYPE=${escapeText(social.platform || "other")}:${escapeText(social.url.trim())}`);
  }
  if (contact.notes?.trim()) {
    lines.push(`NOTE:${escapeText(contact.notes.trim())}`);
  }
  if (photo?.bytes?.length) {
    const type = photoTypeFromContentType(photo.contentType || "image/jpeg");
    const b64 = Buffer.from(photo.bytes).toString("base64");
    lines.push(`PHOTO;ENCODING=b;TYPE=${type}:${b64}`);
  }
  lines.push(`REV:${contact.updatedAt.toISOString().replace(/\.\d{3}Z$/, "Z")}`);
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

function splitProp(line: string): { name: string; params: string; value: string } {
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

/**
 * Parse a vCard 3.0 body into contact fields.
 * Requires UID (or falls back to `fallbackUid`).
 */
export function parseVCard(
  raw: string,
  fallbackUid?: string,
): ParsedVCardContact | null {
  const lines = unfold(raw);
  let uid = fallbackUid?.trim() ?? "";
  let firstName = "";
  let lastName = "";
  let fn = "";
  let title: string | null = null;
  const emails: ParsedVCardContact["emails"] = [];
  const phones: ParsedVCardContact["phones"] = [];
  let address: string | null = null;
  let city: string | null = null;
  let postalCode: string | null = null;
  let region: string | null = null;
  let country: string | null = null;
  let birthday: string | null = null;
  const socialAccounts: ParsedVCardContact["socialAccounts"] = [];
  let notes: string | null = null;
  let photo: ParsedVCardContact["photo"] = null;

  for (const line of lines) {
    const { name, params, value } = splitProp(line);
    if (name === "UID") {
      uid = unescapeText(value).trim() || uid;
    } else if (name === "FN") {
      fn = unescapeText(value).trim();
    } else if (name === "N") {
      const parts = value.split(";");
      lastName = unescapeText(parts[0] ?? "").trim();
      firstName = unescapeText(parts[1] ?? "").trim();
    } else if (name === "TITLE") {
      title = unescapeText(value).trim() || null;
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
    } else if (name === "BDAY") {
      const rawBday = unescapeText(value).trim();
      if (/^\d{8}$/.test(rawBday)) {
        birthday = `${rawBday.slice(0, 4)}-${rawBday.slice(4, 6)}-${rawBday.slice(6, 8)}`;
      } else if (/^\d{4}-\d{2}-\d{2}/.test(rawBday)) {
        birthday = rawBday.slice(0, 10);
      }
    } else if (name === "URL") {
      const url = unescapeText(value).trim();
      if (url) {
        const platformMatch = /TYPE=([^;]+)/i.exec(params);
        socialAccounts.push({
          platform: platformMatch?.[1]?.trim() || "other",
          url,
        });
      }
    } else if (name === "NOTE") {
      notes = unescapeText(value).trim() || null;
    } else if (name === "PHOTO") {
      const upperParams = params.toUpperCase();
      if (upperParams.includes("ENCODING=B") || upperParams.includes("ENCODING=BASE64")) {
        const typeMatch = /TYPE=([^;]+)/i.exec(params);
        const contentType = contentTypeFromPhotoType(typeMatch?.[1] ?? "JPEG");
        try {
          const bytes = Buffer.from(value.replace(/\s+/g, ""), "base64");
          if (bytes.length > 0) {
            photo = { contentType, bytes: new Uint8Array(bytes) };
          }
        } catch {
          /* ignore bad photo */
        }
      }
    }
  }

  if (!uid) return null;
  if (!firstName && fn) {
    const parts = fn.split(/\s+/);
    firstName = parts[0] ?? fn;
    lastName = parts.slice(1).join(" ");
  }
  if (!firstName) firstName = "Contact";

  return {
    uid,
    firstName,
    lastName,
    title,
    emails,
    phones,
    address,
    city,
    postalCode,
    region,
    country,
    birthday,
    socialAccounts,
    notes,
    photo,
  };
}

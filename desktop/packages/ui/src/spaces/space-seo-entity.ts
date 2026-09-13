/**
 * Form + API helpers for space-level SEO entity metadata
 * (Open Graph site name, Organization / address, social sameAs URLs).
 */

export type SpaceSeoEntityAddress = {
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode: string;
  addressCountry: string;
};

export type SpaceSeoEntitySocial = {
  facebook: string;
  twitter: string;
  linkedin: string;
  instagram: string;
  youtube: string;
  github: string;
};

export type SpaceSeoEntitySettings = {
  siteName: string;
  organizationName: string;
  phone: string;
  email: string;
  address: SpaceSeoEntityAddress;
  social: SpaceSeoEntitySocial;
};

/** Compact payload matching core `spaceSeoMetaSchema` (empty keys omitted). */
export type SpaceSeoEntityPayload = {
  siteName?: string;
  organizationName?: string;
  phone?: string;
  email?: string;
  address?: Partial<SpaceSeoEntityAddress>;
  social?: Partial<SpaceSeoEntitySocial>;
};

export const DEFAULT_SPACE_SEO_ENTITY: SpaceSeoEntitySettings = {
  siteName: "",
  organizationName: "",
  phone: "",
  email: "",
  address: {
    streetAddress: "",
    addressLocality: "",
    addressRegion: "",
    postalCode: "",
    addressCountry: "",
  },
  social: {
    facebook: "",
    twitter: "",
    linkedin: "",
    instagram: "",
    youtube: "",
    github: "",
  },
};

/** Fixed URL prefixes shown in the SEO social fields (user edits the leaf only). */
export const SPACE_SEO_SOCIAL_PREFIXES: Record<
  keyof SpaceSeoEntitySocial,
  string
> = {
  facebook: "https://facebook.com/",
  twitter: "https://x.com/",
  linkedin: "https://linkedin.com/company/",
  instagram: "https://instagram.com/",
  youtube: "https://youtube.com/@",
  github: "https://github.com/",
};

export const SPACE_SEO_SOCIAL_FIELDS: ReadonlyArray<{
  key: keyof SpaceSeoEntitySocial;
  label: string;
  placeholder: string;
}> = [
  { key: "facebook", label: "Facebook", placeholder: "your-page" },
  { key: "twitter", label: "X / Twitter", placeholder: "handle" },
  { key: "linkedin", label: "LinkedIn", placeholder: "your-company" },
  { key: "instagram", label: "Instagram", placeholder: "handle" },
  { key: "youtube", label: "YouTube", placeholder: "channel" },
  { key: "github", label: "GitHub", placeholder: "org-or-user" },
];

const SOCIAL_PREFIX_ALIASES: Record<keyof SpaceSeoEntitySocial, string[]> = {
  facebook: [
    "https://facebook.com/",
    "http://facebook.com/",
    "https://www.facebook.com/",
    "http://www.facebook.com/",
    "https://fb.com/",
    "http://fb.com/",
  ],
  twitter: [
    "https://x.com/",
    "http://x.com/",
    "https://www.x.com/",
    "http://www.x.com/",
    "https://twitter.com/",
    "http://twitter.com/",
    "https://www.twitter.com/",
    "http://www.twitter.com/",
  ],
  linkedin: [
    "https://linkedin.com/company/",
    "http://linkedin.com/company/",
    "https://www.linkedin.com/company/",
    "http://www.linkedin.com/company/",
    "https://linkedin.com/in/",
    "http://linkedin.com/in/",
    "https://www.linkedin.com/in/",
    "http://www.linkedin.com/in/",
  ],
  instagram: [
    "https://instagram.com/",
    "http://instagram.com/",
    "https://www.instagram.com/",
    "http://www.instagram.com/",
  ],
  youtube: [
    "https://youtube.com/@",
    "http://youtube.com/@",
    "https://www.youtube.com/@",
    "http://www.youtube.com/@",
    "https://youtube.com/",
    "http://youtube.com/",
    "https://www.youtube.com/",
    "http://www.youtube.com/",
  ],
  github: [
    "https://github.com/",
    "http://github.com/",
    "https://www.github.com/",
    "http://www.github.com/",
  ],
};

function trimOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Strip a known network prefix so the form stores only the handle/path leaf. */
export function spaceSeoSocialLeaf(
  network: keyof SpaceSeoEntitySocial,
  value: string,
): string {
  let leaf = value.trim();
  if (!leaf) return "";
  for (const prefix of SOCIAL_PREFIX_ALIASES[network]) {
    if (leaf.toLowerCase().startsWith(prefix.toLowerCase())) {
      leaf = leaf.slice(prefix.length);
      break;
    }
  }
  leaf = leaf.replace(/^\/+/, "");
  if (network === "youtube") leaf = leaf.replace(/^@+/, "");
  return leaf;
}

/** Compose a full profile URL from the editable leaf (empty leaf → empty). */
export function spaceSeoSocialHref(
  network: keyof SpaceSeoEntitySocial,
  leaf: string,
): string | null {
  const cleaned = spaceSeoSocialLeaf(network, leaf);
  if (!cleaned) return null;
  return `${SPACE_SEO_SOCIAL_PREFIXES[network]}${cleaned}`;
}

export function spaceSeoEntityFromPayload(
  value: SpaceSeoEntityPayload | null | undefined,
): SpaceSeoEntitySettings {
  const address = value?.address ?? {};
  const social = value?.social ?? {};
  return {
    siteName: trimOrEmpty(value?.siteName),
    organizationName: trimOrEmpty(value?.organizationName),
    phone: trimOrEmpty(value?.phone),
    email: trimOrEmpty(value?.email),
    address: {
      streetAddress: trimOrEmpty(address.streetAddress),
      addressLocality: trimOrEmpty(address.addressLocality),
      addressRegion: trimOrEmpty(address.addressRegion),
      postalCode: trimOrEmpty(address.postalCode),
      addressCountry: trimOrEmpty(address.addressCountry),
    },
    social: {
      facebook: spaceSeoSocialLeaf("facebook", trimOrEmpty(social.facebook)),
      twitter: spaceSeoSocialLeaf("twitter", trimOrEmpty(social.twitter)),
      linkedin: spaceSeoSocialLeaf("linkedin", trimOrEmpty(social.linkedin)),
      instagram: spaceSeoSocialLeaf("instagram", trimOrEmpty(social.instagram)),
      youtube: spaceSeoSocialLeaf("youtube", trimOrEmpty(social.youtube)),
      github: spaceSeoSocialLeaf("github", trimOrEmpty(social.github)),
    },
  };
}

function compactRecord<T extends Record<string, string>>(
  record: T,
): Partial<T> | undefined {
  const entries = Object.entries(record).filter(([, v]) => v.trim());
  if (entries.length === 0) return undefined;
  return Object.fromEntries(
    entries.map(([k, v]) => [k, v.trim()]),
  ) as Partial<T>;
}

export function spaceSeoEntityToPayload(
  form: SpaceSeoEntitySettings,
): SpaceSeoEntityPayload {
  const address = compactRecord({
    streetAddress: form.address.streetAddress,
    addressLocality: form.address.addressLocality,
    addressRegion: form.address.addressRegion,
    postalCode: form.address.postalCode,
    addressCountry: form.address.addressCountry,
  });
  const socialEntries = (
    Object.keys(SPACE_SEO_SOCIAL_PREFIXES) as Array<keyof SpaceSeoEntitySocial>
  )
    .map((key) => {
      const href = spaceSeoSocialHref(key, form.social[key]);
      return href ? ([key, href] as const) : null;
    })
    .filter((entry): entry is readonly [keyof SpaceSeoEntitySocial, string] =>
      Boolean(entry),
    );
  const social =
    socialEntries.length > 0
      ? (Object.fromEntries(socialEntries) as Partial<SpaceSeoEntitySocial>)
      : undefined;
  const payload: SpaceSeoEntityPayload = {};
  const siteName = form.siteName.trim();
  const organizationName = form.organizationName.trim();
  const phone = form.phone.trim();
  const email = form.email.trim();
  if (siteName) payload.siteName = siteName;
  if (organizationName) payload.organizationName = organizationName;
  if (phone) payload.phone = phone;
  if (email) payload.email = email;
  if (address) payload.address = address;
  if (social) payload.social = social;
  return payload;
}

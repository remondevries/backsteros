export type SupportPartyEmail = {
  label: string;
  address: string;
};

export type SupportPartyPhone = {
  label: string;
  number: string;
};

export type SupportContactCardModel = {
  id: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  organizationName?: string | null;
  avatarSrc?: string | null;
  emails: SupportPartyEmail[];
  phones: SupportPartyPhone[];
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  region?: string | null;
  country?: string | null;
};

export type SupportOrganizationCardModel = {
  id: string;
  name: string;
  avatarSrc?: string | null;
  website?: string | null;
  emails: SupportPartyEmail[];
  phones: SupportPartyPhone[];
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  region?: string | null;
  country?: string | null;
};

export function formatSupportChannelLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/\s+/g, "")}`;
}

export function websiteHref(website: string): string | null {
  const trimmed = website.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

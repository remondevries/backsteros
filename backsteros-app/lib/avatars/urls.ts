import { withBasePath } from "@/lib/base-path";

function withCacheBuster(href: string, updatedAt: Date | number): string {
  const version =
    updatedAt instanceof Date ? updatedAt.getTime() : Number(updatedAt);
  return `${href}?v=${version}`;
}

export function getContactAvatarHref(contactId: string): string {
  return withBasePath(`/api/contacts/${contactId}/avatar`);
}

export function getContactAvatarSrc(
  contactId: string,
  updatedAt: Date | number,
): string {
  return withCacheBuster(getContactAvatarHref(contactId), updatedAt);
}

export function getOrganizationAvatarHref(organizationId: string): string {
  return withBasePath(`/api/organizations/${organizationId}/avatar`);
}

export function getOrganizationAvatarSrc(
  organizationId: string,
  updatedAt: Date | number,
): string {
  return withCacheBuster(getOrganizationAvatarHref(organizationId), updatedAt);
}

export function getUserAvatarHref(): string {
  return withBasePath("/api/users/me/avatar");
}

export function getUserAvatarSrc(updatedAt: Date | number): string {
  return withCacheBuster(getUserAvatarHref(), updatedAt);
}

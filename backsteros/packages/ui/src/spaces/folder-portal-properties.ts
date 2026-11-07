/**
 * Portal-facing metadata stored on Spaces folders (`properties` JSONB).
 * Mirrored to publishSlug / seoDescription / icon columns by core.
 */

import {
  getEntityIconColor,
  isValidEntityIconColor,
  parseEntityIcon,
  serializeEntityIcon,
} from "../entity/entity-icon.js";

export type FolderPortalProperties = {
  /** Folder display name (`documents.title`). */
  title: string;
  slug: string;
  description: string;
  /** Serialized entity icon (`serializeEntityIcon`) or empty. */
  icon: string;
  /** Accent / icon paint color (`#RRGGBB`). */
  color: string;
};

function propString(
  props: Record<string, unknown>,
  key: string,
): string {
  const value = props[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function folderPortalPropertiesFromDocument(doc: {
  publishSlug?: string | null;
  seoDescription?: string | null;
  icon?: string | null;
  properties?: Record<string, unknown> | null;
  path?: string | null;
  title?: string;
}): FolderPortalProperties {
  const props = doc.properties ?? {};
  const pathLeaf = (doc.path ?? "")
    .split("/")
    .filter(Boolean)
    .at(-1);

  const icon =
    propString(props, "icon") || doc.icon?.trim() || "";
  const colorFromProps = propString(props, "color");
  const colorFromIcon = getEntityIconColor(icon) ?? "";

  return {
    title: doc.title?.trim() || propString(props, "title") || pathLeaf || "",
    slug:
      propString(props, "slug") ||
      doc.publishSlug?.trim() ||
      pathLeaf ||
      "",
    description:
      propString(props, "description") ||
      doc.seoDescription?.trim() ||
      "",
    icon,
    color:
      (isValidEntityIconColor(colorFromProps) ? colorFromProps : "") ||
      colorFromIcon,
  };
}

/** Embed `color` into the serialized icon so portal can read it from `documents.icon`. */
export function folderPortalIconWithColor(
  icon: string,
  color: string,
): string {
  const nextColor = isValidEntityIconColor(color) ? color : undefined;
  const parsed = parseEntityIcon(icon || null);
  if (parsed.kind === "emoji") {
    return serializeEntityIcon(parsed) ?? icon;
  }
  if (parsed.kind === "icon") {
    return (
      serializeEntityIcon({
        kind: "icon",
        key: parsed.key,
        color: nextColor,
        ...(parsed.tags ? { tags: parsed.tags } : {}),
      }) ?? icon
    );
  }
  return serializeEntityIcon({ kind: "default", color: nextColor }) ?? "";
}

export function folderPortalPropertiesPayload(
  next: FolderPortalProperties,
): Record<string, unknown> {
  const color = next.color.trim();
  const icon = folderPortalIconWithColor(next.icon, color);
  return {
    title: next.title.trim() || null,
    slug: next.slug.trim() || null,
    description: next.description.trim() || null,
    icon: icon.trim() || null,
    color: isValidEntityIconColor(color) ? color : null,
  };
}

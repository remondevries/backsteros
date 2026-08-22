/**
 * Cached avatars from `useEntityAvatarSrcMap` carry a `.svg` suffix when the
 * bytes are SVG — RN `Image` cannot render those, so callers use `SvgUri`.
 */
export function isSvgAvatarUri(uri: string): boolean {
  const path = uri.split("?")[0]?.toLowerCase() ?? "";
  return path.endsWith(".svg");
}

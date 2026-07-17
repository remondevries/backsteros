const AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function normalizeAvatarMimeType(value: string | null | undefined): string | null {
  const mime = value?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!mime) return null;
  if (mime === "image/jpg" || mime === "image/pjpeg") return "image/jpeg";
  if (AVATAR_MIME_TYPES.has(mime)) return mime;
  return null;
}

export function sniffAvatarContentType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function resolveAvatarContentType(
  declared: string | null | undefined,
  bytes: Uint8Array,
): string {
  // Bytes win so we never serve PNG/WebP as image/jpeg under nosniff.
  return (
    sniffAvatarContentType(bytes) ??
    normalizeAvatarMimeType(declared) ??
    "image/jpeg"
  );
}

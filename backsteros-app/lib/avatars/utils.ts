export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const AVATAR_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

const AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function assertAvatarFile(file: File): string | null {
  if (file.size <= 0) {
    return "Choose an image file to upload.";
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return "Avatar must be 5 MB or smaller.";
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const hasAllowedExtension = AVATAR_EXTENSIONS.has(extension);
  const hasAllowedMime = file.type ? AVATAR_MIME_TYPES.has(file.type) : false;

  if (!hasAllowedExtension && !hasAllowedMime) {
    return "Only JPG, PNG, WebP, or GIF images are supported.";
  }

  return null;
}

export function resolveAvatarContentType(file: File): string {
  if (file.type && AVATAR_MIME_TYPES.has(file.type)) {
    return file.type;
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}

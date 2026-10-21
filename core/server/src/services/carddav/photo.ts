/**
 * Resize/compress contact photos for CardDAV (iOS).
 *
 * Sources of truth for limits:
 * - Apple iCloud Contacts: max photo 224 KB; max contact/vCard 256 KB
 *   (https://support.apple.com/en-us/103188)
 * - Nextcloud Contacts stores ≤256×256 (crop UI up to 512×512)
 * - iOS only accepts inline base64 PHOTO (not remote URIs)
 *
 * We target ≤512px JPEG at ≤160 KB binary so base64 (~213 KB) + text
 * stays under Apple’s 256 KB card limit, while looking sharp on Retina.
 * The failure mode we hit was bulk REPORT of multi‑MB originals (~57 MB),
 * not a hard Apple pixel limit.
 */
import sharp from "sharp";

/** Max edge for CardDAV PHOTO — Retina-friendly contact detail. */
export const CARDDAV_PHOTO_MAX_EDGE = 512;
/**
 * Max JPEG bytes before base64. Apple allows 224 KB photo / 256 KB card;
 * leave headroom for text and XML escaping.
 */
export const CARDDAV_PHOTO_MAX_BYTES = 160_000;

/** Stored personal avatars (BacksterOS UI) — higher than CardDAV wire size. */
export const CONTACT_AVATAR_STORE_EDGE = 1024;
export const CONTACT_AVATAR_STORE_MAX_BYTES = 300_000;

export type CardDavPhoto = {
  contentType: string;
  bytes: Uint8Array;
};

/**
 * Downscale + JPEG-compress an avatar for CardDAV embedding.
 * Returns null if the input cannot be decoded.
 */
export async function optimizeCardDavPhoto(
  bytes: Uint8Array,
  _contentType?: string,
): Promise<CardDavPhoto | null> {
  if (!bytes.length) return null;

  try {
    let edge = CARDDAV_PHOTO_MAX_EDGE;
    let quality = 82;
    let out = await encodeJpeg(bytes, edge, quality);

    while (out.byteLength > CARDDAV_PHOTO_MAX_BYTES && quality > 50) {
      quality -= 8;
      out = await encodeJpeg(bytes, edge, quality);
    }
    if (out.byteLength > CARDDAV_PHOTO_MAX_BYTES) {
      edge = 384;
      quality = 78;
      out = await encodeJpeg(bytes, edge, quality);
    }
    while (out.byteLength > CARDDAV_PHOTO_MAX_BYTES && quality > 45) {
      quality -= 8;
      out = await encodeJpeg(bytes, edge, quality);
    }
    if (out.byteLength > CARDDAV_PHOTO_MAX_BYTES) {
      edge = 256;
      quality = 72;
      out = await encodeJpeg(bytes, edge, quality);
    }
    while (out.byteLength > CARDDAV_PHOTO_MAX_BYTES && quality > 40) {
      quality -= 8;
      out = await encodeJpeg(bytes, edge, quality);
    }

    return { contentType: "image/jpeg", bytes: new Uint8Array(out) };
  } catch {
    return null;
  }
}

/**
 * Normalize personal contact avatars on upload (store a sane size for the app).
 * CardDAV still re-encodes to {@link CARDDAV_PHOTO_MAX_*} on sync.
 */
export async function optimizeContactAvatarForStorage(
  bytes: Uint8Array,
  contentType: string,
): Promise<CardDavPhoto> {
  if (
    bytes.byteLength <= CONTACT_AVATAR_STORE_MAX_BYTES &&
    /jpeg|jpg/i.test(contentType) &&
    !(await isWiderThan(bytes, CONTACT_AVATAR_STORE_EDGE))
  ) {
    return { contentType, bytes };
  }
  try {
    let quality = 85;
    let out = await encodeJpeg(bytes, CONTACT_AVATAR_STORE_EDGE, quality);
    while (
      out.byteLength > CONTACT_AVATAR_STORE_MAX_BYTES &&
      quality > 55
    ) {
      quality -= 8;
      out = await encodeJpeg(bytes, CONTACT_AVATAR_STORE_EDGE, quality);
    }
    return { contentType: "image/jpeg", bytes: new Uint8Array(out) };
  } catch {
    return { contentType, bytes };
  }
}

async function encodeJpeg(
  bytes: Uint8Array,
  edge: number,
  quality: number,
): Promise<Buffer> {
  return sharp(Buffer.from(bytes))
    .rotate()
    .resize(edge, edge, { fit: "cover", withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

async function isWiderThan(bytes: Uint8Array, edge: number): Promise<boolean> {
  try {
    const meta = await sharp(Buffer.from(bytes)).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    return w > edge || h > edge;
  } catch {
    return true;
  }
}

/**
 * Resize/compress contact photos for CardDAV (iOS).
 * Large personal avatars (~MBs) make addressbook-query REPORT explode;
 * iOS then times out verification or skips PHOTO.
 */
import sharp from "sharp";

/** Target max edge for CardDAV PHOTO (contact list thumbs). */
export const CARDDAV_PHOTO_MAX_EDGE = 256;
/** Soft byte budget after JPEG encode (base64 expands ~4/3). */
export const CARDDAV_PHOTO_MAX_BYTES = 48_000;

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
    let quality = 75;
    let out = await encodeJpeg(bytes, edge, quality);

    while (out.byteLength > CARDDAV_PHOTO_MAX_BYTES && quality > 45) {
      quality -= 10;
      out = await encodeJpeg(bytes, edge, quality);
    }
    if (out.byteLength > CARDDAV_PHOTO_MAX_BYTES) {
      edge = 192;
      quality = 70;
      out = await encodeJpeg(bytes, edge, quality);
    }
    if (out.byteLength > CARDDAV_PHOTO_MAX_BYTES) {
      edge = 128;
      quality = 65;
      out = await encodeJpeg(bytes, edge, quality);
    }

    return { contentType: "image/jpeg", bytes: new Uint8Array(out) };
  } catch {
    return null;
  }
}

/**
 * Normalize personal contact avatars on upload (store a sane size).
 * Leaves small images alone; large ones become ≤512px JPEG.
 */
export async function optimizeContactAvatarForStorage(
  bytes: Uint8Array,
  contentType: string,
): Promise<CardDavPhoto> {
  const MAX_STORE_EDGE = 512;
  const MAX_STORE_BYTES = 200_000;
  if (
    bytes.byteLength <= MAX_STORE_BYTES &&
    /jpeg|jpg/i.test(contentType) &&
    !(await isWiderThan(bytes, MAX_STORE_EDGE))
  ) {
    return { contentType, bytes };
  }
  try {
    const out = await encodeJpeg(bytes, MAX_STORE_EDGE, 82);
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

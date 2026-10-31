/**
 * Pre-crop the sign-off footer avatar to a circular PNG with transparent
 * corners. Several clients (Outlook, some webmail) ignore CSS border-radius on
 * <img>, so the circle must be in the pixel data.
 */
import sharp from "sharp";

export const EMAIL_SIGN_OFF_AVATAR_EDGE = 96;

export async function renderCircularSignOffAvatarPng(
  bytes: Uint8Array,
  edge: number = EMAIL_SIGN_OFF_AVATAR_EDGE,
): Promise<Uint8Array> {
  const size = Math.max(16, Math.floor(edge));
  const radius = size / 2;
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<circle cx="${radius}" cy="${radius}" r="${radius}" fill="#fff"/>` +
      `</svg>`,
  );
  const png = await sharp(Buffer.from(bytes))
    .rotate()
    .resize(size, size, { fit: "cover" })
    .composite([
      {
        input: await sharp(mask).png().toBuffer(),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();
  return new Uint8Array(png);
}

/**
 * Pre-crop the sign-off footer avatar to a circular PNG with transparent
 * corners. Several clients (Outlook, some webmail) ignore CSS border-radius on
 * <img>, so the circle must be in the pixel data.
 *
 * The HTML <img> stays 96×96 CSS pixels; the PNG is rendered at up to 3×
 * (288px) so Retina clients stay sharp. Never upscale past the source.
 */
import sharp from "sharp";

/** CSS / HTML display size for the sign-off <img>. */
export const EMAIL_SIGN_OFF_AVATAR_DISPLAY_EDGE = 96;

/** Max render edge (3× display) for Retina. */
export const EMAIL_SIGN_OFF_AVATAR_PIXEL_RATIO = 3;

export const EMAIL_SIGN_OFF_AVATAR_MAX_EDGE =
  EMAIL_SIGN_OFF_AVATAR_DISPLAY_EDGE * EMAIL_SIGN_OFF_AVATAR_PIXEL_RATIO;

/** Soft target for the attached PNG (base64 grows ~4/3). */
export const EMAIL_SIGN_OFF_AVATAR_MAX_BYTES = 80_000;

/** @deprecated Use {@link EMAIL_SIGN_OFF_AVATAR_DISPLAY_EDGE}. */
export const EMAIL_SIGN_OFF_AVATAR_EDGE = EMAIL_SIGN_OFF_AVATAR_DISPLAY_EDGE;

/**
 * Pick the PNG pixel edge: min(3× display, source min edge), never upscale,
 * at least 16px so tiny sources still produce a usable mark.
 */
export function resolveCircularSignOffAvatarRenderEdge(
  sourceWidth: number,
  sourceHeight: number,
): number {
  const sourceMin = Math.min(
    Math.max(0, Math.floor(sourceWidth)),
    Math.max(0, Math.floor(sourceHeight)),
  );
  if (sourceMin <= 0) return EMAIL_SIGN_OFF_AVATAR_DISPLAY_EDGE;
  return Math.max(16, Math.min(EMAIL_SIGN_OFF_AVATAR_MAX_EDGE, sourceMin));
}

export async function renderCircularSignOffAvatarPng(
  bytes: Uint8Array,
  /**
   * Optional override for tests. Production callers omit this so the edge is
   * derived from source metadata (≤288, never upscale).
   */
  edgeOverride?: number,
): Promise<Uint8Array> {
  const meta = await sharp(Buffer.from(bytes)).metadata();
  const size =
    edgeOverride !== undefined
      ? Math.max(16, Math.floor(edgeOverride))
      : resolveCircularSignOffAvatarRenderEdge(
          meta.width ?? 0,
          meta.height ?? 0,
        );
  const radius = size / 2;
  // Soft circle: slight radius inset + SVG raster antialias at the rim.
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<defs>` +
      `<filter id="edge" x="-2%" y="-2%" width="104%" height="104%">` +
      `<feGaussianBlur in="SourceAlpha" stdDeviation="0.6" result="blur"/>` +
      `<feComponentTransfer in="blur" result="soft">` +
      `<feFuncA type="linear" slope="1.35"/>` +
      `</feComponentTransfer>` +
      `<feComposite in="SourceGraphic" in2="soft" operator="in"/>` +
      `</filter>` +
      `</defs>` +
      `<circle cx="${radius}" cy="${radius}" r="${Math.max(1, radius - 0.5)}" fill="#fff" filter="url(#edge)"/>` +
      `</svg>`,
  );

  let png = await sharp(Buffer.from(bytes))
    .rotate()
    .resize(size, size, {
      fit: "cover",
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: true,
    })
    .composite([
      {
        input: await sharp(mask)
          .resize(size, size, { fit: "fill" })
          .png()
          .toBuffer(),
        blend: "dest-in",
      },
    ])
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();

  // If still large (busy photos), drop to 2× display and recompress.
  if (
    png.byteLength > EMAIL_SIGN_OFF_AVATAR_MAX_BYTES &&
    size > EMAIL_SIGN_OFF_AVATAR_DISPLAY_EDGE * 2
  ) {
    const smaller = EMAIL_SIGN_OFF_AVATAR_DISPLAY_EDGE * 2;
    png = Buffer.from(
      await renderCircularSignOffAvatarPng(bytes, smaller),
    );
  }

  return new Uint8Array(png);
}

/** Stable ids for Moneybird files exposed on `/api/v1/transactions/:id/attachments`. */

export function encodeTransactionAttachmentId(parts: {
  invoiceType: string;
  invoiceId: string;
  moneybirdAttachmentId: string;
}): string {
  return [
    encodeURIComponent(parts.invoiceType),
    encodeURIComponent(parts.invoiceId),
    encodeURIComponent(parts.moneybirdAttachmentId),
  ].join(":");
}

export function decodeTransactionAttachmentId(
  id: string,
): {
  invoiceType: string;
  invoiceId: string;
  moneybirdAttachmentId: string;
} | null {
  const parts = id.split(":");
  if (parts.length !== 3) return null;
  try {
    const invoiceType = decodeURIComponent(parts[0] ?? "");
    const invoiceId = decodeURIComponent(parts[1] ?? "");
    const moneybirdAttachmentId = decodeURIComponent(parts[2] ?? "");
    if (!invoiceType || !invoiceId || !moneybirdAttachmentId) return null;
    return { invoiceType, invoiceId, moneybirdAttachmentId };
  } catch {
    return null;
  }
}

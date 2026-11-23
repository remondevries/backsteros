/**
 * Resolve PDFs / attachments for a ledger transaction via Moneybird.
 *
 * Bank lines are Moneybird financial mutations (`sourceCode: moneybird`,
 * `externalId` = mutation id). Files live on the linked invoice/document, not
 * on the mutation itself.
 */

import type { DbFinancialTransaction } from "../../db/schema.js";
import {
  MoneybirdApiError,
  MoneybirdClient,
  mapMoneybirdMutationPayments,
  moneybirdAttachableCollectionPath,
  type MoneybirdDownloadedFile,
  type MoneybirdMutationPayment,
} from "../../lib/moneybird-client.js";
import { getMoneybirdCredentials } from "../moneybird-settings.js";
import { encodeTransactionAttachmentId } from "./transaction-attachment-ids.js";
import { getTransactionById } from "./finance/transactions.js";

export {
  decodeTransactionAttachmentId,
  encodeTransactionAttachmentId,
} from "./transaction-attachment-ids.js";

const SALES_INVOICE_PDF_ATTACHMENT_ID = "pdf";

export type TransactionAttachmentRef = {
  id: string;
  filename: string;
  contentType: string;
  size: number | null;
  invoiceType: string;
  invoiceId: string;
  /** Moneybird attachment id, or `pdf` for a rendered sales invoice PDF. */
  moneybirdAttachmentId: string;
  kind: "attachment" | "sales_invoice_pdf";
};

export type TransactionAttachmentListResult =
  | { ok: true; attachments: TransactionAttachmentRef[] }
  | {
      ok: false;
      status: 404 | 400 | 502;
      error: string;
      code?: string;
    };

export type TransactionAttachmentDownloadResult =
  | {
      ok: true;
      file: MoneybirdDownloadedFile;
      attachment: TransactionAttachmentRef;
    }
  | {
      ok: false;
      status: 404 | 400 | 502;
      error: string;
      code?: string;
    };

function isMoneybirdMutationTransaction(
  row: DbFinancialTransaction,
): row is DbFinancialTransaction & { externalId: string } {
  return (
    row.sourceCode === "moneybird" &&
    typeof row.externalId === "string" &&
    row.externalId.length > 0 &&
    !row.externalId.startsWith("moneybird-ledger-alignment:")
  );
}

async function requireClient(workspaceId: string): Promise<
  | { ok: true; client: MoneybirdClient }
  | { ok: false; status: 400; error: string; code: string }
> {
  const { apiToken, administrationId } =
    await getMoneybirdCredentials(workspaceId);
  if (!apiToken) {
    return {
      ok: false,
      status: 400,
      error: "Moneybird API token is not configured",
      code: "moneybird_not_configured",
    };
  }
  if (!administrationId) {
    return {
      ok: false,
      status: 400,
      error: "Moneybird administration id is not configured",
      code: "moneybird_not_configured",
    };
  }
  return {
    ok: true,
    client: new MoneybirdClient({ apiToken, administrationId }),
  };
}

function paymentsFromMutationRaw(
  raw: Record<string, unknown>,
): MoneybirdMutationPayment[] {
  return mapMoneybirdMutationPayments(raw.payments).filter((payment) =>
    Boolean(moneybirdAttachableCollectionPath(payment.invoiceType)),
  );
}

async function collectAttachmentsForPayments(
  client: MoneybirdClient,
  payments: MoneybirdMutationPayment[],
): Promise<TransactionAttachmentRef[]> {
  const out: TransactionAttachmentRef[] = [];
  const seen = new Set<string>();

  for (const payment of payments) {
    const listed = await client.listAttachableAttachments(
      payment.invoiceType,
      payment.invoiceId,
    );
    for (const meta of listed) {
      const id = encodeTransactionAttachmentId({
        invoiceType: payment.invoiceType,
        invoiceId: payment.invoiceId,
        moneybirdAttachmentId: meta.id,
      });
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        filename: meta.filename?.trim() || `attachment-${meta.id}`,
        contentType: meta.contentType?.trim() || "application/octet-stream",
        size: meta.size,
        invoiceType: payment.invoiceType,
        invoiceId: payment.invoiceId,
        moneybirdAttachmentId: meta.id,
        kind: "attachment",
      });
    }

    // Sales invoices always have a rendered PDF even when no file was uploaded.
    if (payment.invoiceType === "SalesInvoice") {
      const id = encodeTransactionAttachmentId({
        invoiceType: payment.invoiceType,
        invoiceId: payment.invoiceId,
        moneybirdAttachmentId: SALES_INVOICE_PDF_ATTACHMENT_ID,
      });
      if (!seen.has(id)) {
        seen.add(id);
        out.push({
          id,
          filename: `sales-invoice-${payment.invoiceId}.pdf`,
          contentType: "application/pdf",
          size: null,
          invoiceType: payment.invoiceType,
          invoiceId: payment.invoiceId,
          moneybirdAttachmentId: SALES_INVOICE_PDF_ATTACHMENT_ID,
          kind: "sales_invoice_pdf",
        });
      }
    }
  }

  return out;
}

export async function listTransactionAttachments(
  workspaceId: string,
  transactionId: string,
): Promise<TransactionAttachmentListResult> {
  const row = await getTransactionById(workspaceId, transactionId);
  if (!row) {
    return { ok: false, status: 404, error: "Transaction not found" };
  }
  if (!isMoneybirdMutationTransaction(row)) {
    return {
      ok: true,
      attachments: [],
    };
  }

  const clientResult = await requireClient(workspaceId);
  if (!clientResult.ok) return clientResult;

  try {
    const mutations = await clientResult.client.fetchFinancialMutationsByIds([
      row.externalId,
    ]);
    const mutation = mutations[0];
    if (!mutation) {
      return {
        ok: false,
        status: 404,
        error: "Moneybird mutation not found",
        code: "moneybird_mutation_not_found",
      };
    }
    const payments = paymentsFromMutationRaw(mutation.raw);
    const attachments = await collectAttachmentsForPayments(
      clientResult.client,
      payments,
    );
    return { ok: true, attachments };
  } catch (error) {
    if (error instanceof MoneybirdApiError) {
      return {
        ok: false,
        status: error.status === 404 ? 404 : 502,
        error: error.message,
        code: "moneybird_error",
      };
    }
    throw error;
  }
}

export async function downloadTransactionAttachment(
  workspaceId: string,
  transactionId: string,
  attachmentId: string,
): Promise<TransactionAttachmentDownloadResult> {
  const listed = await listTransactionAttachments(workspaceId, transactionId);
  if (!listed.ok) return listed;

  const attachment =
    listed.attachments.find((entry) => entry.id === attachmentId) ?? null;
  if (!attachment) {
    return {
      ok: false,
      status: 404,
      error: "Attachment not found",
      code: "attachment_not_found",
    };
  }

  const clientResult = await requireClient(workspaceId);
  if (!clientResult.ok) return clientResult;

  try {
    const file =
      attachment.kind === "sales_invoice_pdf"
        ? await clientResult.client.downloadSalesInvoicePdf(attachment.invoiceId)
        : await clientResult.client.downloadAttachableAttachment(
            attachment.invoiceType,
            attachment.invoiceId,
            attachment.moneybirdAttachmentId,
          );
    return {
      ok: true,
      attachment,
      file: {
        ...file,
        filename: file.filename ?? attachment.filename,
        contentType:
          file.contentType === "application/octet-stream" &&
          attachment.contentType !== "application/octet-stream"
            ? attachment.contentType
            : file.contentType,
      },
    };
  } catch (error) {
    if (error instanceof MoneybirdApiError) {
      return {
        ok: false,
        status: error.status === 404 ? 404 : 502,
        error: error.message,
        code: "moneybird_error",
      };
    }
    throw error;
  }
}

/** Primary PDF for the transaction: first PDF attachment, else first file. */
export async function downloadTransactionPdf(
  workspaceId: string,
  transactionId: string,
): Promise<TransactionAttachmentDownloadResult> {
  const listed = await listTransactionAttachments(workspaceId, transactionId);
  if (!listed.ok) return listed;
  if (listed.attachments.length === 0) {
    return {
      ok: false,
      status: 404,
      error: "No attachment linked to this transaction",
      code: "attachment_not_found",
    };
  }
  const preferred =
    listed.attachments.find(
      (entry) =>
        entry.kind === "sales_invoice_pdf" ||
        entry.contentType === "application/pdf" ||
        entry.filename.toLowerCase().endsWith(".pdf"),
    ) ?? listed.attachments[0]!;
  return downloadTransactionAttachment(
    workspaceId,
    transactionId,
    preferred.id,
  );
}

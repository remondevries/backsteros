import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  moneybirdAttachableCollectionPath,
  mapMoneybirdMutationPayments,
  mapMoneybirdAttachmentMeta,
} from "../../lib/moneybird-client.js";
import {
  decodeTransactionAttachmentId,
  encodeTransactionAttachmentId,
} from "./transaction-attachment-ids.js";

describe("transaction attachment id encoding", () => {
  it("round-trips invoice type, invoice id, and attachment id", () => {
    const id = encodeTransactionAttachmentId({
      invoiceType: "PurchaseInvoice",
      invoiceId: "504586029406095155",
      moneybirdAttachmentId: "504586029458523972",
    });
    assert.equal(
      id,
      "PurchaseInvoice:504586029406095155:504586029458523972",
    );
    assert.deepEqual(decodeTransactionAttachmentId(id), {
      invoiceType: "PurchaseInvoice",
      invoiceId: "504586029406095155",
      moneybirdAttachmentId: "504586029458523972",
    });
  });

  it("rejects malformed ids", () => {
    assert.equal(decodeTransactionAttachmentId("only-one"), null);
    assert.equal(decodeTransactionAttachmentId("a:b"), null);
  });
});

describe("moneybird attachable paths", () => {
  it("maps known invoice types to REST collections", () => {
    assert.equal(
      moneybirdAttachableCollectionPath("SalesInvoice"),
      "sales_invoices",
    );
    assert.equal(
      moneybirdAttachableCollectionPath("PurchaseInvoice"),
      "documents/purchase_invoices",
    );
    assert.equal(
      moneybirdAttachableCollectionPath("Receipt"),
      "documents/receipts",
    );
    assert.equal(
      moneybirdAttachableCollectionPath("Document"),
      "documents/general_documents",
    );
    assert.equal(moneybirdAttachableCollectionPath("UnknownType"), null);
  });

  it("maps mutation payments and attachment metadata", () => {
    const payments = mapMoneybirdMutationPayments([
      {
        id: "1",
        invoice_type: "SalesInvoice",
        invoice_id: "99",
      },
      { id: "2", invoice_type: "SalesInvoice" },
      { price: "1.00" },
    ]);
    assert.deepEqual(payments, [
      { id: "1", invoiceType: "SalesInvoice", invoiceId: "99" },
    ]);

    const meta = mapMoneybirdAttachmentMeta({
      id: "55",
      filename: "invoice.pdf",
      content_type: "application/pdf",
      size: 1200,
    });
    assert.deepEqual(meta, {
      id: "55",
      filename: "invoice.pdf",
      contentType: "application/pdf",
      size: 1200,
    });
  });
});

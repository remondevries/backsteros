import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	serializeDocumentPdfActivity,
	type DocumentPdfListItem,
} from "./document-pdf-export.js";
import type { DocumentActivityRow } from "./document-activities.js";

function sampleActivity(
	overrides: Partial<DocumentActivityRow> & {
		data?: Record<string, unknown>;
	} = {},
): DocumentActivityRow {
	const now = new Date("2026-11-24T21:00:00.000Z");
	const { data, ...rest } = overrides;
	return {
		id: "act_1",
		workspaceId: "ws_1",
		documentId: "doc_1",
		projectId: "proj_1",
		type: "pdf_creation",
		actorKind: "agent",
		actorUserId: null,
		actorContactId: null,
		actorApiKeyId: "key_1",
		actorName: "Agent",
		occurredAt: now,
		data: data ?? {
			channel: "letter",
			letterId: "let_9",
			brand: "rdv",
			filename: "brief-rdv.pdf",
			byteSize: 1200,
			contentVersion: 4,
		},
		clientEventId: "document-pdf:doc_1:let_9",
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
		...rest,
	};
}

describe("serializeDocumentPdfActivity", () => {
	it("exposes letter download path when letterId is present", () => {
		const item: DocumentPdfListItem = serializeDocumentPdfActivity(
			sampleActivity(),
		);
		assert.equal(item.activityId, "act_1");
		assert.equal(item.letterId, "let_9");
		assert.equal(item.brand, "rdv");
		assert.equal(item.filename, "brief-rdv.pdf");
		assert.equal(item.byteSize, 1200);
		assert.equal(item.contentVersion, 4);
		assert.equal(item.pdfPath, "/api/v1/letters/let_9/pdf");
		assert.equal(item.occurredAt, "2026-11-24T21:00:00.000Z");
	});

	it("leaves pdfPath null for download-only metadata rows", () => {
		const item = serializeDocumentPdfActivity(
			sampleActivity({
				data: {
					channel: "download",
					letterId: null,
					filename: "brief-rdv.pdf",
				},
			}),
		);
		assert.equal(item.letterId, null);
		assert.equal(item.pdfPath, null);
		assert.equal(item.channel, "download");
	});
});

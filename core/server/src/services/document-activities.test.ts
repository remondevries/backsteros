import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

function source(): string {
	return readFileSync(join(here, "document-activities.ts"), "utf8");
}

describe("document-activities coalesce (OS-205)", () => {
	it("does not coalesce text_content_change — each content_version stays its own row", () => {
		const src = source();
		const start = src.indexOf("const COALESCEABLE");
		assert.ok(start >= 0, "COALESCEABLE set missing");
		const end = src.indexOf("]);", start);
		assert.ok(end > start, "COALESCEABLE set unclosed");
		const block = src.slice(start, end + 3);
		assert.match(block, /"rename"/);
		assert.match(block, /"front_matter_change"/);
		assert.doesNotMatch(block, /"text_content_change"/);
		assert.match(
			src,
			/text_content_change is intentionally excluded \(OS-205\)/,
		);
	});

	it("soft-deletes snapshot activities and linked text versions", () => {
		const src = source();
		assert.match(src, /export async function deleteDocumentActivity/);
		assert.match(src, /DELETABLE_DOCUMENT_ACTIVITY_TYPES/);
		assert.match(src, /"text_content_change"/);
		assert.match(src, /"pdf_creation"/);
		assert.match(src, /softDeleteDocumentVersion/);
	});
});

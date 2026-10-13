import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiClientError } from "@backsteros/api-client";

import {
  LOCAL_CORE_PDF_OFFLINE_MESSAGE,
  letterPdfLoadErrorMessage,
} from "./letter-pdf-load-error.ts";
import { shouldAttemptLetterPdfFetch } from "./workspace/powersync-write-path.ts";

describe("letterPdfLoadErrorMessage", () => {
  it("maps 503 pdf_requires_local_core to Mac offline copy", () => {
    const err = new ApiClientError(
      503,
      {
        error: "Letter PDFs are only available from local-core",
        code: "pdf_requires_local_core",
      },
      new Headers(),
    );
    assert.equal(letterPdfLoadErrorMessage(err), LOCAL_CORE_PDF_OFFLINE_MESSAGE);
  });

  it("maps fetch TypeError to Mac offline copy", () => {
    assert.equal(
      letterPdfLoadErrorMessage(new TypeError("Failed to fetch")),
      LOCAL_CORE_PDF_OFFLINE_MESSAGE,
    );
  });

  it("keeps genuine missing-file 404 wording", () => {
    const err = new ApiClientError(
      404,
      { error: "Letter PDF not found", code: "not_found" },
      new Headers(),
    );
    assert.match(letterPdfLoadErrorMessage(err), /not found/i);
  });
});

describe("shouldAttemptLetterPdfFetch", () => {
  it("blocks fetch when local-core is offline", () => {
    assert.equal(shouldAttemptLetterPdfFetch(false, true), false);
    assert.equal(shouldAttemptLetterPdfFetch(null, true), false);
  });
});

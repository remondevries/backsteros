import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checksumForContent,
  documentContentEtag,
} from "../lib/storage.ts";
import { isLiveBacksterosDatabaseUrl } from "./document-search-live-url.ts";
import { decideBackfillStamp } from "./document-search-stamp.ts";

describe("isLiveBacksterosDatabaseUrl", () => {
  it("detects the live database name and ignores backsteros_test", () => {
    assert.equal(
      isLiveBacksterosDatabaseUrl(
        "postgresql://backsteros:x@127.0.0.1:5433/backsteros",
      ),
      true,
    );
    assert.equal(
      isLiveBacksterosDatabaseUrl(
        "postgresql://backsteros:x@127.0.0.1:5433/backsteros_test",
      ),
      false,
    );
    assert.equal(
      isLiveBacksterosDatabaseUrl(
        "postgresql://backsteros:x@127.0.0.1:5433/backsteros?sslmode=disable",
      ),
      true,
    );
  });
});

describe("decideBackfillStamp", () => {
  it("stamps the document etag when vault bytes match", () => {
    const body = "---\ntype: knowledge\n---\n\n# Vault\n";
    const etag = documentContentEtag(body);
    assert.deepEqual(
      decideBackfillStamp({
        rowContentEtag: etag,
        rowChecksum: checksumForContent(body),
        body,
      }),
      { kind: "match", contentEtag: etag },
    );
  });

  it("repairs YAML-rewrite rows whose checksum matches the vault", () => {
    const original = "# Notes\nplain body\n";
    const vault = "---\ntype: knowledge\n---\n\n# Notes\nplain body\n";
    const decision = decideBackfillStamp({
      rowContentEtag: documentContentEtag(original),
      rowChecksum: checksumForContent(vault),
      body: vault,
    });
    assert.equal(decision.kind, "yamlRepair");
    assert.equal(decision.contentEtag, documentContentEtag(vault));
  });

  it("counts etag drift when bytes and checksum both disagree", () => {
    const rowBody = "# Old\n";
    const vault = "# New vault bytes\n";
    const decision = decideBackfillStamp({
      rowContentEtag: documentContentEtag(rowBody),
      rowChecksum: checksumForContent(rowBody),
      body: vault,
    });
    assert.deepEqual(decision, {
      kind: "etagDrift",
      contentEtag: documentContentEtag(vault),
    });
  });

  it("stamps the bytes hash when the document etag is null", () => {
    const body = "# No etag yet\n";
    assert.deepEqual(
      decideBackfillStamp({
        rowContentEtag: null,
        rowChecksum: null,
        body,
      }),
      { kind: "nullEtag", contentEtag: documentContentEtag(body) },
    );
  });
});

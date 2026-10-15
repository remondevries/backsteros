import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildBacksterDesignUri,
  coercePenpotDesignUrl,
  isBacksterDesignUri,
  parsePenpotDesignLink,
  resolvePenpotDesignOpenUrl,
} from "./penpot-design-link.js";

const FILE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const PAGE = "11111111-2222-3333-4444-555555555555";
const BOARD = "99999999-8888-7777-6666-555555555555";
const TEAM = "abcdef01-2345-6789-abcd-ef0123456789";
const PROJECT = "fedcba09-8765-4321-0fed-cba987654321";

test("coercePenpotDesignUrl from modern hash workspace URL", () => {
  const raw = `https://localhost:3449/#/workspace?team-id=${TEAM}&file-id=${FILE}&page-id=${PAGE}&board-id=${BOARD}`;
  const uri = coercePenpotDesignUrl(raw);
  assert.ok(uri);
  assert.equal(isBacksterDesignUri(uri!), true);
  const parsed = parsePenpotDesignLink(uri!);
  assert.equal(parsed?.fileId, FILE);
  assert.equal(parsed?.pageId, PAGE);
  assert.equal(parsed?.boardId, BOARD);
  assert.equal(parsed?.teamId, TEAM);
});

test("coercePenpotDesignUrl from legacy path workspace URL", () => {
  const raw = `https://localhost:3449/#/workspace/${PROJECT}/${FILE}?page-id=${PAGE}`;
  const parsed = parsePenpotDesignLink(raw);
  assert.equal(parsed?.fileId, FILE);
  assert.equal(parsed?.projectId, PROJECT);
  assert.equal(parsed?.pageId, PAGE);
});

test("buildBacksterDesignUri + resolvePenpotDesignOpenUrl round-trip", () => {
  const uri = buildBacksterDesignUri({
    fileId: FILE,
    pageId: PAGE,
    boardId: BOARD,
    teamId: TEAM,
  });
  const open = resolvePenpotDesignOpenUrl(uri, "https://localhost:3449");
  assert.equal(
    open,
    `https://localhost:3449/#/workspace?file-id=${FILE}&page-id=${PAGE}&board-id=${BOARD}&team-id=${TEAM}`,
  );
});

test("rejects unrelated https URLs", () => {
  assert.equal(coercePenpotDesignUrl("https://example.com/foo"), null);
  assert.equal(coercePenpotDesignUrl("https://github.com/org/repo"), null);
  assert.equal(coercePenpotDesignUrl("/tasks/abc"), null);
});

test("accepts already-canonical URI", () => {
  const uri = buildBacksterDesignUri({ fileId: FILE, pageId: PAGE });
  assert.equal(coercePenpotDesignUrl(uri), uri);
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  listEstimateMarkdownTables,
  normalizeEstimateTableDisplayMarkdown,
  parseEstimatePlanComparisonFenceSource,
  parseMarkdownTableToPlanComparison,
  setEstimateTableDisplayMode,
} from "./estimate-table-display.js";

const SAMPLE_TABLE = `| | **Google Workspace** | **Microsoft 365** |
|---|---|---|
| E-mail | Gmail (op jullie domein) | Outlook |
| Bestanden | Google Drive | OneDrive / SharePoint |`;

test("parseMarkdownTableToPlanComparison reads 3-column GFM tables", () => {
  const data = parseMarkdownTableToPlanComparison(SAMPLE_TABLE);
  assert.ok(data);
  assert.equal(data.leftLabel, "Google Workspace");
  assert.equal(data.rightLabel, "Microsoft 365");
  assert.equal(data.rows.length, 2);
  assert.equal(data.rows[0]?.label, "E-mail");
  assert.equal(data.rows[0]?.left, "Gmail (op jullie domein)");
});

test("normalizeEstimateTableDisplayMarkdown rewrites marked tables to fence", () => {
  const md = `## Kort vergeleken

<!-- estimate-table: plan-comparison -->
${SAMPLE_TABLE}

Beide zijn volwaardig.
`;
  const out = normalizeEstimateTableDisplayMarkdown(md);
  assert.match(out, /```estimate-plan-comparison/);
  assert.doesNotMatch(out, /<!-- estimate-table/);
  assert.doesNotMatch(out, /\| E-mail \|/);
  const fence = out.match(
    /```estimate-plan-comparison\n([\s\S]*?)\n```/,
  )?.[1];
  assert.ok(fence);
  const data = parseEstimatePlanComparisonFenceSource(fence);
  assert.equal(data?.leftLabel, "Google Workspace");
  assert.equal(data?.rows[1]?.right, "OneDrive / SharePoint");
});

test("setEstimateTableDisplayMode adds and clears marker", () => {
  const md = `Intro

${SAMPLE_TABLE}

Outro
`;
  const [block] = listEstimateMarkdownTables(md);
  assert.ok(block);
  assert.equal(block.mode, null);

  const marked = setEstimateTableDisplayMode(md, block, "plan-comparison");
  assert.match(marked, /<!-- estimate-table: plan-comparison -->\n\|/);
  const [markedBlock] = listEstimateMarkdownTables(marked);
  assert.equal(markedBlock?.mode, "plan-comparison");

  const cleared = setEstimateTableDisplayMode(
    marked,
    markedBlock!,
    null,
  );
  assert.doesNotMatch(cleared, /estimate-table/);
  assert.match(cleared, /\| E-mail \|/);
});

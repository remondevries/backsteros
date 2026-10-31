import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

function readSrc(relativeFromThisDir: string): string {
  return readFileSync(join(here, relativeFromThisDir), "utf8");
}

describe("lead agent validation (REST + sync)", () => {
  it("create/update resolveLeadAgent requires enabled agents.contact_id", () => {
    const src = readSrc("./projects.ts");
    assert.match(src, /async function resolveLeadAgentContactId/);
    assert.match(src, /eq\(agents\.contactId, contactId\)/);
    assert.match(src, /eq\(agents\.enabled, true\)/);
    assert.match(src, /LEAD_AGENT_NOT_AGENT/);
    assert.match(src, /input\.leadAgentContactId/);
  });

  it("PowerSync apply-sync-change maps leadAgentContactId into project writes", () => {
    const apply = readSrc("../sync/apply-sync-change.ts");
    const mappers = readSrc("../sync/payload-mappers.ts");
    assert.match(
      mappers,
      /leadAgentContactId:\s*asNullableString\([\s\S]*lead_agent_contact_id/,
    );
    assert.match(apply, /leadAgentContactId:\s*input\.leadAgentContactId/);
    assert.match(apply, /taskProjectService\.updateProject/);
    assert.match(apply, /taskProjectService\.createProject/);
  });

  it("desktop PROJECT_LIST_COLUMNS selects lead_agent_contact_id from PowerSync SQLite", () => {
    const sql = readFileSync(
      join(
        here,
        "../../../../../backsteros/src/lib/workspace/workspace-sql.ts",
      ),
      "utf8",
    );
    assert.match(sql, /"lead_agent_contact_id"/);
    assert.match(sql, /"channel_status"/);
    assert.match(sql, /"channel_pending_link"/);
    assert.match(sql, /"channel_requested_at"/);
  });
});



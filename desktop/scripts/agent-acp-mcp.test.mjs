import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  cursorProjectSlug,
  ensureMcpApprovalsFile,
  ensureWorkspaceTrusted,
  mcpApprovalKey,
  mcpJsonServerToAcp,
  mcpJsonToAcpServers,
  permissionLooksLikeFileRead,
  prepareSessionMcp,
  readProjectMcpJson,
} from "./agent-acp-mcp.mjs";

/** @type {string[]} */
const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempProject(mcpServers) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "backsteros-acp-mcp-"));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, ".cursor"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".cursor", "mcp.json"),
    `${JSON.stringify({ mcpServers }, null, 2)}\n`,
  );
  return dir;
}

test("cursorProjectSlug matches Cursor project folder naming", () => {
  assert.equal(
    cursorProjectSlug("/Users/remondevries/BacksterOS/Projects/BF"),
    "Users-remondevries-BacksterOS-Projects-BF",
  );
});

test("mcpJsonServerToAcp converts stdio env object to ACP env array", () => {
  const acp = mcpJsonServerToAcp(
    "moneybird",
    {
      command: "npx",
      args: ["-y", "moneybird-mcp-server"],
      env: { MONEYBIRD_API_TOKEN: "secret", MONEYBIRD_ADMINISTRATION_ID: "1" },
    },
    { cwd: "/tmp/project" },
  );
  assert.ok(acp);
  assert.equal(acp.name, "moneybird");
  assert.equal(acp.command, "npx");
  assert.deepEqual(acp.args, ["-y", "moneybird-mcp-server"]);
  assert.deepEqual(acp.env, [
    { name: "MONEYBIRD_API_TOKEN", value: "secret" },
    { name: "MONEYBIRD_ADMINISTRATION_ID", value: "1" },
  ]);
});

test("mcpJsonServerToAcp converts remote http servers", () => {
  const acp = mcpJsonServerToAcp(
    "remote",
    {
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer tok" },
    },
    { cwd: "/tmp/project" },
  );
  assert.deepEqual(acp, {
    type: "http",
    name: "remote",
    url: "https://example.com/mcp",
    headers: [{ name: "Authorization", value: "Bearer tok" }],
  });
});

test("mcpJsonToAcpServers interpolates workspace and env placeholders", () => {
  const servers = mcpJsonToAcpServers(
    {
      local: {
        command: "${workspaceFolder}/bin/mcp",
        args: ["--home", "${userHome}"],
        env: { TOKEN: "${env:TEST_MCP_TOKEN}" },
      },
    },
    {
      cwd: "/tmp/ws",
      env: { TEST_MCP_TOKEN: "abc123" },
    },
  );
  assert.equal(servers.length, 1);
  assert.equal(servers[0]?.command, "/tmp/ws/bin/mcp");
  assert.deepEqual(servers[0]?.args, ["--home", os.homedir()]);
  assert.deepEqual(servers[0]?.env, [{ name: "TOKEN", value: "abc123" }]);
});

test("prepareSessionMcp writes approvals and trusts workspace", () => {
  const project = makeTempProject({
    demo: {
      command: "npx",
      args: ["-y", "demo-mcp"],
      env: { DEMO_KEY: "x" },
    },
  });

  const prepared = prepareSessionMcp(project);
  assert.equal(prepared.serverNames.join(","), "demo");
  assert.equal(prepared.mcpServers.length, 1);
  assert.ok(prepared.approvalsPath);
  assert.ok(prepared.trustedPath);
  assert.ok(fs.existsSync(prepared.approvalsPath));
  assert.ok(fs.existsSync(prepared.trustedPath));

  const approvals = JSON.parse(fs.readFileSync(prepared.approvalsPath, "utf8"));
  assert.ok(Array.isArray(approvals));
  assert.ok(approvals.length >= 1);
  assert.ok(approvals.every((key) => String(key).startsWith("demo-")));

  const trust = JSON.parse(fs.readFileSync(prepared.trustedPath, "utf8"));
  assert.equal(trust.workspacePath, path.resolve(project));

  // Cleanup project-dir under ~/.cursor/projects (created outside temp).
  const slug = cursorProjectSlug(project);
  const projectDir = path.join(os.homedir(), ".cursor", "projects", slug);
  fs.rmSync(projectDir, { recursive: true, force: true });
});

test("ensureMcpApprovalsFile merges without duplicates", () => {
  const project = makeTempProject({});
  const key = mcpApprovalKey("a", { command: "x" }, project);
  const first = ensureMcpApprovalsFile(project, [key]);
  const second = ensureMcpApprovalsFile(project, [key, key]);
  assert.equal(first.wrote, true);
  assert.equal(second.wrote, false);
  assert.deepEqual(second.keys, [key]);
  ensureWorkspaceTrusted(project);
  const slug = cursorProjectSlug(project);
  fs.rmSync(path.join(os.homedir(), ".cursor", "projects", slug), {
    recursive: true,
    force: true,
  });
});

test("readProjectMcpJson returns null when missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "backsteros-acp-mcp-empty-"));
  tempDirs.push(dir);
  assert.equal(readProjectMcpJson(dir), null);
});

test("permissionLooksLikeFileRead auto-allows file tools but not MCP", () => {
  assert.equal(
    permissionLooksLikeFileRead({
      toolCall: { kind: "read", title: "Read file" },
    }),
    true,
  );
  assert.equal(
    permissionLooksLikeFileRead({
      toolCall: { kind: "search", title: "Grep" },
    }),
    true,
  );
  assert.equal(
    permissionLooksLikeFileRead({
      toolCall: { kind: "execute", title: "Shell" },
    }),
    false,
  );
  assert.equal(
    permissionLooksLikeFileRead({
      toolCall: { title: "moneybird_list" },
    }),
    false,
  );
  assert.equal(
    permissionLooksLikeFileRead({
      toolCall: { kind: "mcp", title: "moneybird_get" },
    }),
    false,
  );
  // Must not treat moneybird_list as a file list tool.
  assert.equal(
    permissionLooksLikeFileRead({
      toolCall: { title: "moneybird_list invoices" },
    }),
    false,
  );
});

import { describe, expect, it } from "vitest";

import { sanitizeSshError } from "./ssh.ts";

describe("sanitizeSshError", () => {
  it("collapses heredoc dumps into a short publickey hint", () => {
    const raw = [
      "Command failed: ssh -o BatchMode=yes root@1.2.3.4 python3 - <<'PY'",
      "import json",
      "print(1)",
      "PY",
      'Load key "/tmp/hetzner.pub": invalid format',
      "Permission denied (publickey).",
    ].join("\n");
    expect(sanitizeSshError(new Error(raw))).toMatch(/permission denied \(publickey\)/i);
    expect(sanitizeSshError(new Error(raw))).not.toMatch(/import json/);
  });

  it("detects a dead 1Password agent", () => {
    expect(sanitizeSshError(new Error("Error connecting to agent: Connection refused"))).toMatch(
      /1Password SSH agent/i,
    );
  });
});

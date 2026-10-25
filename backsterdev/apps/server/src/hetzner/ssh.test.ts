// @effect-diagnostics nodeBuiltinImport:off globalFetch:off globalFetchInEffect:off globalDate:off preferSchemaOverJson:off globalTimers:off unknownInEffectCatch:off anyUnknownInErrorContext:off catchToOrElseSucceed:off
import { describe, expect, it } from "vite-plus/test";

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

  it("distinguishes Tailscale port-refused from a dead agent", () => {
    expect(
      sanitizeSshError(new Error("ssh: connect to host 100.1.2.3 port 22: Connection refused")),
    ).toMatch(/sshd listening on the tailnet/i);
  });
});

import { describe, expect, it } from "vite-plus/test";

import { resolveServerListenHost } from "./config.ts";

describe("resolveServerListenHost", () => {
  it("clamps wildcard binds to loopback unless Tailscale serve is on", () => {
    expect(resolveServerListenHost({ host: "0.0.0.0", tailscaleServeEnabled: false })).toBe(
      "127.0.0.1",
    );
    expect(resolveServerListenHost({ host: "0.0.0.0", tailscaleServeEnabled: true })).toBe(
      "0.0.0.0",
    );
    expect(
      resolveServerListenHost({ host: undefined, tailscaleServeEnabled: false }),
    ).toBeUndefined();
  });
});

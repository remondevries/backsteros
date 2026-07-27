import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AgentPtyUnavailableError,
  getAgentPtyConnection,
} from "./agent-pty.js";

describe("getAgentPtyConnection", () => {
  it("returns ws + http + token when configured", () => {
    const prevUrl = process.env.AGENT_PTY_PUBLIC_URL;
    const prevToken = process.env.AGENT_PTY_AUTH_TOKEN;
    process.env.AGENT_PTY_PUBLIC_URL = "http://macbook.tailnet.ts.net:3101/";
    process.env.AGENT_PTY_AUTH_TOKEN = "secret-token";
    try {
      const connection = getAgentPtyConnection();
      assert.equal(connection.httpOrigin, "http://macbook.tailnet.ts.net:3101");
      assert.equal(connection.wsUrl, "ws://macbook.tailnet.ts.net:3101");
      assert.equal(connection.token, "secret-token");
    } finally {
      if (prevUrl === undefined) delete process.env.AGENT_PTY_PUBLIC_URL;
      else process.env.AGENT_PTY_PUBLIC_URL = prevUrl;
      if (prevToken === undefined) delete process.env.AGENT_PTY_AUTH_TOKEN;
      else process.env.AGENT_PTY_AUTH_TOKEN = prevToken;
    }
  });

  it("throws when unset", () => {
    const prevUrl = process.env.AGENT_PTY_PUBLIC_URL;
    const prevToken = process.env.AGENT_PTY_AUTH_TOKEN;
    delete process.env.AGENT_PTY_PUBLIC_URL;
    delete process.env.AGENT_PTY_AUTH_TOKEN;
    try {
      assert.throws(() => getAgentPtyConnection(), AgentPtyUnavailableError);
    } finally {
      if (prevUrl === undefined) delete process.env.AGENT_PTY_PUBLIC_URL;
      else process.env.AGENT_PTY_PUBLIC_URL = prevUrl;
      if (prevToken === undefined) delete process.env.AGENT_PTY_AUTH_TOKEN;
      else process.env.AGENT_PTY_AUTH_TOKEN = prevToken;
    }
  });
});

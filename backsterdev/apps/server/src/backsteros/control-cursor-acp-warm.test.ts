// @effect-diagnostics nodeBuiltinImport:off
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ensureCursorAcpWarmPool,
  kickCursorAcpWarmPool,
  resetCursorAcpWarmPoolForTests,
  resolveCursorAcpWarmConfig,
  setCursorAcpWarmPoolTestOverrides,
  shutdownCursorAcpWarmPool,
  takeCursorAcpWarmProcess,
} from "./control-cursor-acp-warm.ts";
import { isCursorAcpWarmTarget } from "@t3tools/provider-acp/server/AcpWarmProcessPool";
import { shouldAuthenticateBeforeSession } from "@t3tools/provider-acp/server/AcpSessionRuntime";

function makeFakeAcpChild(options?: { readonly failInitialize?: boolean }) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const child = Object.assign(new EventEmitter(), {
    stdin,
    stdout,
    stderr,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    killed: false,
    pid: 42_042,
    kill: vi.fn(() => {
      child.killed = true;
      child.exitCode = 0;
      child.emit("exit", 0);
      return true;
    }),
    on: EventEmitter.prototype.on,
    once: EventEmitter.prototype.once,
    off: EventEmitter.prototype.off,
  });

  stdin.on("data", (chunk: Buffer | string) => {
    const line = String(chunk).trim();
    if (!line) return;
    let message: { id?: number; method?: string };
    try {
      message = JSON.parse(line) as { id?: number; method?: string };
    } catch {
      return;
    }
    if (message.method !== "initialize" || message.id == null) return;
    queueMicrotask(() => {
      if (options?.failInitialize) {
        stdout.write(
          `${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { message: "no" } })}\n`,
        );
        return;
      }
      stdout.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          result: { protocolVersion: 2, agentCapabilities: {} },
        })}\n`,
      );
    });
  });

  return child;
}

describe("control-cursor-acp-warm", () => {
  afterEach(() => {
    resetCursorAcpWarmPoolForTests();
    vi.restoreAllMocks();
  });

  it("is enabled by default and disabled when BACKSTEROS_CURSOR_ACP_WARM=0", () => {
    expect(resolveCursorAcpWarmConfig({}).enabled).toBe(true);
    expect(resolveCursorAcpWarmConfig({ BACKSTEROS_CURSOR_ACP_WARM: "0" }).enabled).toBe(false);
  });

  it("prepare fills the pool and take drains it then kicks a refill", async () => {
    const spawned: Array<ReturnType<typeof makeFakeAcpChild>> = [];
    setCursorAcpWarmPoolTestOverrides({
      spawnImpl: (() => {
        const child = makeFakeAcpChild();
        spawned.push(child);
        return child;
      }) as unknown as typeof import("node:child_process").spawn,
      config: { enabled: true, poolSize: 1, command: "cursor-agent", args: ["acp"] },
    });

    await ensureCursorAcpWarmPool();
    expect(spawned).toHaveLength(1);

    const first = takeCursorAcpWarmProcess();
    expect(first?.process).toBe(spawned[0]);
    expect(takeCursorAcpWarmProcess()).toBeNull();

    // Refill kicked by take — wait for the second spawn to initialize.
    await vi.waitFor(() => expect(spawned.length).toBe(2));
    await ensureCursorAcpWarmPool();
    const second = takeCursorAcpWarmProcess();
    expect(second?.process).toBe(spawned[1]);
  });

  it("kickCursorAcpWarmPool is fire-and-forget and populates the pool", async () => {
    const spawned: Array<ReturnType<typeof makeFakeAcpChild>> = [];
    setCursorAcpWarmPoolTestOverrides({
      spawnImpl: (() => {
        const child = makeFakeAcpChild();
        spawned.push(child);
        return child;
      }) as unknown as typeof import("node:child_process").spawn,
      config: { enabled: true, poolSize: 1, command: "cursor-agent", args: ["acp"] },
    });

    kickCursorAcpWarmPool();
    await vi.waitFor(() => expect(spawned.length).toBe(1));
    // Kick is fire-and-forget — wait until initialize finishes and the slot is set.
    await ensureCursorAcpWarmPool();
    expect(takeCursorAcpWarmProcess()?.process).toBe(spawned[0]);
  });

  it("does not spawn when warm is disabled", async () => {
    const spawnImpl = vi.fn();
    setCursorAcpWarmPoolTestOverrides({
      spawnImpl: spawnImpl as unknown as typeof import("node:child_process").spawn,
      config: { enabled: false, poolSize: 1, command: "cursor-agent", args: ["acp"] },
    });
    kickCursorAcpWarmPool();
    await ensureCursorAcpWarmPool();
    expect(spawnImpl).not.toHaveBeenCalled();
    expect(takeCursorAcpWarmProcess()).toBeNull();
  });

  it("skipSignIn defaults on; shutdown kills held process", async () => {
    expect(resolveCursorAcpWarmConfig({}).skipSignIn).toBe(true);
    const spawned: Array<ReturnType<typeof makeFakeAcpChild>> = [];
    setCursorAcpWarmPoolTestOverrides({
      spawnImpl: (() => {
        const child = makeFakeAcpChild();
        spawned.push(child);
        return child;
      }) as unknown as typeof import("node:child_process").spawn,
      config: { enabled: true, poolSize: 1, command: "cursor-agent", args: ["acp"] },
    });
    await ensureCursorAcpWarmPool();
    shutdownCursorAcpWarmPool();
    expect(spawned[0]?.kill).toHaveBeenCalled();
    expect(takeCursorAcpWarmProcess()).toBeNull();
  });

  it("detects Cursor ACP targets and skips pre-session auth for Cursor-like init", () => {
    expect(isCursorAcpWarmTarget({ commandPath: "/bin/cursor-agent" })).toBe(true);
    expect(isCursorAcpWarmTarget({ agentId: "claude-acp" })).toBe(false);
    expect(
      shouldAuthenticateBeforeSession(
        {
          protocolVersion: 2,
          authMethods: [{ id: "cursor_login", name: "Log in", type: "agent" }],
        },
        {},
      ),
    ).toBe(false);
    expect(
      shouldAuthenticateBeforeSession({ protocolVersion: 2 }, { authenticateEagerly: true }),
    ).toBe(true);
  });

  it("spawn error does not reject ensure", async () => {
    setCursorAcpWarmPoolTestOverrides({
      spawnImpl: (() => {
        const child = makeFakeAcpChild();
        queueMicrotask(() => child.emit("error", new Error("spawn ENOENT")));
        return child;
      }) as unknown as typeof import("node:child_process").spawn,
      config: { enabled: true, poolSize: 1, command: "missing-cursor-agent", args: ["acp"] },
    });
    await expect(ensureCursorAcpWarmPool()).resolves.toBeUndefined();
  });
});

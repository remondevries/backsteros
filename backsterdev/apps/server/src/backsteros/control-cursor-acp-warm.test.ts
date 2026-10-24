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
  takeCursorAcpWarmProcess,
} from "./control-cursor-acp-warm.ts";

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
    kill: vi.fn(() => {
      child.killed = true;
      child.exitCode = 0;
      child.emit("exit", 0);
      return true;
    }),
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
          result: { protocolVersion: 1, agentCapabilities: {} },
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
      }) as typeof import("node:child_process").spawn,
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
      }) as typeof import("node:child_process").spawn,
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
});

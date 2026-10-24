/**
 * Pre-spawn a Cursor ACP process (initialize done, sign-in skipped when
 * credentials are already cached) so a later session can skip cold
 * spawn+initialize+authenticate and only run session/new + prompt.
 *
 * Pool size 1 by default; off when BACKSTEROS_CURSOR_ACP_WARM=0 /
 * T3_ACP_WARM_POOL=0. session/new still receives the thread cwd, so the warm
 * OS cwd need not match the project folder.
 */
// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalTimers:off
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";

import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import type * as EffectAcpSchema from "effect-acp/compat";

type PooledWarmProcess = {
  readonly process: ChildProcessWithoutNullStreams;
  readonly initializeResult: EffectAcpSchema.InitializeResponse;
  readonly initializedAt: number;
  readonly stopDrain: () => void;
};

export type AcpWarmSlot = {
  readonly process: ChildProcessWithoutNullStreams;
  readonly handle: ChildProcessSpawner.ChildProcessHandle;
  readonly initializeResult: EffectAcpSchema.InitializeResponse;
  readonly initializedAt: number;
};

type WarmConfig = {
  readonly enabled: boolean;
  readonly poolSize: number;
  readonly command: string;
  readonly args: readonly string[];
  /** When true (default), warm does not call authenticate after initialize. */
  readonly skipSignIn: boolean;
  readonly cwd?: string;
};

const DEFAULT_COMMAND = "cursor-agent";
const DEFAULT_ARGS = ["acp"] as const;

let warmSlot: PooledWarmProcess | null = null;
let refillInFlight: Promise<void> | null = null;
let nextRequestId = 1;

/** Test seam: override spawn / config. */
let testOverrides: {
  readonly spawnImpl?: typeof spawn;
  readonly config?: Partial<WarmConfig>;
} | null = null;

export function resetAcpWarmProcessPoolForTests(): void {
  shutdownAcpWarmProcessPool();
  testOverrides = null;
  nextRequestId = 1;
}

export function setAcpWarmProcessPoolTestOverrides(overrides: {
  readonly spawnImpl?: typeof spawn;
  readonly config?: Partial<WarmConfig>;
} | null): void {
  testOverrides = overrides;
}

export function resolveAcpWarmProcessPoolConfig(
  env: NodeJS.ProcessEnv = process.env,
): WarmConfig {
  const disabled =
    env.BACKSTEROS_CURSOR_ACP_WARM === "0" ||
    env.BACKSTEROS_CURSOR_ACP_WARM === "false" ||
    env.T3_CURSOR_ACP_WARM === "0" ||
    env.T3_ACP_WARM_POOL === "0" ||
    env.T3_ACP_WARM_POOL === "false";
  const poolSizeRaw = Number(
    env.BACKSTEROS_CURSOR_ACP_WARM_POOL_SIZE ?? env.T3_ACP_WARM_POOL_SIZE ?? "1",
  );
  const poolSize = Number.isFinite(poolSizeRaw) && poolSizeRaw > 0 ? Math.floor(poolSizeRaw) : 1;
  const skipSignIn =
    env.BACKSTEROS_CURSOR_ACP_WARM_SKIP_SIGN_IN !== "0" &&
    env.BACKSTEROS_CURSOR_ACP_WARM_SKIP_SIGN_IN !== "false";
  const cwd = env.BACKSTEROS_CURSOR_ACP_WARM_CWD?.trim() || undefined;
  return {
    enabled: !disabled,
    poolSize: Math.min(poolSize, 4),
    command: env.BACKSTEROS_CURSOR_ACP_COMMAND?.trim() || DEFAULT_COMMAND,
    args: DEFAULT_ARGS,
    skipSignIn,
    ...(cwd ? { cwd } : {}),
    ...testOverrides?.config,
  };
}

/** True when the ACP registry agent should use the Cursor warm pool. */
export function isCursorAcpWarmTarget(input: {
  readonly agentId?: string;
  readonly commandPath?: string;
}): boolean {
  const agentId = input.agentId?.trim() ?? "";
  if (/cursor/i.test(agentId)) return true;
  const base = (input.commandPath ?? "").split(/[\\/]/).pop() ?? "";
  return /^cursor-agent(\.exe|\.cmd)?$/i.test(base);
}

/** Fire-and-forget: ensure a warm process exists (control start entry). */
export function kickAcpWarmProcessPool(): void {
  void ensureAcpWarmProcessPool().catch(() => undefined);
}

export async function ensureAcpWarmProcessPool(): Promise<void> {
  const config = resolveAcpWarmProcessPoolConfig();
  if (!config.enabled || config.poolSize < 1) return;
  if (warmSlot && isProcessAlive(warmSlot.process)) return;
  if (refillInFlight) {
    await refillInFlight;
    return;
  }
  refillInFlight = refillWarmSlot(config).finally(() => {
    refillInFlight = null;
  });
  await refillInFlight;
}

/**
 * Hand a prepared process to a session (caller owns lifetime). Refills the
 * pool in the background. Returns null when disabled or not ready.
 *
 * session/new applies the thread cwd — the warm OS cwd does not need to match.
 */
export function takeAcpWarmProcess(): AcpWarmSlot | null {
  const config = resolveAcpWarmProcessPoolConfig();
  if (!config.enabled) return null;
  const slot = warmSlot;
  warmSlot = null;
  if (!slot || !isProcessAlive(slot.process)) {
    kickAcpWarmProcessPool();
    return null;
  }
  slot.stopDrain();
  kickAcpWarmProcessPool();
  return {
    process: slot.process,
    handle: childProcessHandleFromNode(slot.process),
    initializeResult: slot.initializeResult,
    initializedAt: slot.initializedAt,
  };
}

/** Kill any held warm process (server shutdown / restart). */
export function shutdownAcpWarmProcessPool(): void {
  destroyPooled(warmSlot);
  warmSlot = null;
  refillInFlight = null;
}

async function refillWarmSlot(config: WarmConfig): Promise<void> {
  destroyPooled(warmSlot);
  warmSlot = null;
  const spawnImpl = testOverrides?.spawnImpl ?? spawn;
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawnImpl(config.command, [...config.args], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
      ...(config.cwd ? { cwd: config.cwd } : {}),
    }) as ChildProcessWithoutNullStreams;
  } catch {
    // Spawn sync throw (rare); never crash the server.
    return;
  }

  // Missing binary / spawn failure must not become an unhandled 'error' crash.
  child.on("error", () => {
    if (warmSlot?.process === child) {
      destroyPooled(warmSlot);
      warmSlot = null;
    } else {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
  });

  try {
    const initializeResult = await initializeAcpChild(child);
    if (!isProcessAlive(child)) {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
      return;
    }
    // skipSignIn is the default: authenticate is intentionally not called here.
    // Cursor advertises cursor_login even with cached credentials; session/new
    // will retry authenticate only on auth-required (-32000).
    void config.skipSignIn;
    const stopDrain = startStdoutDrain(child);
    warmSlot = {
      process: child,
      initializeResult,
      initializedAt: Date.now(),
      stopDrain,
    };
  } catch {
    try {
      child.stdin.end();
    } catch {
      // ignore
    }
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
}

function initializeAcpChild(
  child: ChildProcessWithoutNullStreams,
): Promise<EffectAcpSchema.InitializeResponse> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: child.stdout });
    const requestId = nextRequestId++;
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("ACP warm initialize timed out"));
    }, 15_000);

    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`ACP warm process exited during initialize (${code})`));
    };

    const onLine = (line: string) => {
      let message: {
        id?: number;
        result?: EffectAcpSchema.InitializeResponse;
        error?: unknown;
      };
      try {
        message = JSON.parse(line) as typeof message;
      } catch {
        return;
      }
      if (message.id !== requestId) return;
      cleanup();
      if (message.error) {
        reject(new Error(`ACP warm initialize failed: ${JSON.stringify(message.error)}`));
        return;
      }
      if (!message.result) {
        reject(new Error("ACP warm initialize returned no result"));
        return;
      }
      resolve(message.result);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      rl.off("line", onLine);
      child.off("exit", onExit);
      rl.close();
      child.stdout.resume();
    };

    rl.on("line", onLine);
    child.once("exit", onExit);

    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id: requestId,
      method: "initialize",
      params: {
        protocolVersion: 2,
        clientCapabilities: {},
        clientInfo: { name: "t3-code-warm", version: "0.0.0" },
      },
    });
    try {
      child.stdin.write(`${payload}\n`);
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * Discard stdout/stderr while pooled so a chatty agent cannot fill the pipe
 * buffer and hang. Stopped on {@link takeAcpWarmProcess}.
 */
function startStdoutDrain(child: ChildProcessWithoutNullStreams): () => void {
  const onData = () => undefined;
  const onErr = () => undefined;
  child.stdout.on("data", onData);
  child.stderr.on("data", onErr);
  child.stdout.resume();
  child.stderr.resume();
  return () => {
    child.stdout.off("data", onData);
    child.stderr.off("data", onErr);
  };
}

function isProcessAlive(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode === null && child.signalCode === null && !child.killed;
}

function destroyPooled(slot: PooledWarmProcess | null): void {
  if (!slot) return;
  try {
    slot.stopDrain();
  } catch {
    // ignore
  }
  try {
    slot.process.stdin.end();
  } catch {
    // ignore
  }
  try {
    slot.process.kill("SIGTERM");
  } catch {
    // ignore
  }
}

/**
 * Wrap a Node child process as an Effect {@link ChildProcessSpawner.ChildProcessHandle}
 * so AcpSessionRuntime can adopt a warm process without re-spawning.
 */
export function childProcessHandleFromNode(
  child: ChildProcessWithoutNullStreams,
): ChildProcessSpawner.ChildProcessHandle {
  const exitDeferred = Deferred.makeUnsafe<ChildProcessSpawner.ExitCode>();
  const settleExit = (code: number | null, signal: NodeJS.Signals | null) => {
    if (Deferred.isDoneUnsafe(exitDeferred)) return;
    const exitCode = ChildProcessSpawner.ExitCode(code ?? (signal ? 1 : 0));
    Deferred.doneUnsafe(exitDeferred, Effect.succeed(exitCode));
  };
  if (child.exitCode !== null || child.signalCode !== null) {
    settleExit(child.exitCode, child.signalCode);
  } else {
    child.once("exit", (code, signal) => settleExit(code, signal));
  }

  const stdoutPass = new PassThrough();
  const stderrPass = new PassThrough();
  child.stdout.pipe(stdoutPass);
  child.stderr.pipe(stderrPass);

  const stdinSink = Sink.forEach((chunk: Uint8Array) =>
    Effect.sync(() => {
      if (!child.stdin.destroyed) {
        child.stdin.write(chunk);
      }
    }),
  );

  const stdout = Stream.fromAsyncIterable(
    stdoutPass as AsyncIterable<Uint8Array>,
    () => new Error("ACP warm stdout closed"),
  );
  const stderr = Stream.fromAsyncIterable(
    stderrPass as AsyncIterable<Uint8Array>,
    () => new Error("ACP warm stderr closed"),
  );

  return {
    pid: ChildProcessSpawner.ProcessId(child.pid ?? 0),
    exitCode: Deferred.await(exitDeferred),
    isRunning: Effect.sync(
      () => child.exitCode === null && child.signalCode === null && !child.killed,
    ),
    kill: () =>
      Effect.sync(() => {
        try {
          child.kill("SIGTERM");
        } catch {
          // ignore
        }
      }),
    stdin: stdinSink,
    stdout,
    stderr,
    all: Stream.merge(stdout, stderr),
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    unref: () => {
      child.unref();
      return Effect.sync(() =>
        Effect.sync(() => {
          child.ref();
        }),
      );
    },
  } as unknown as ChildProcessSpawner.ChildProcessHandle;
}

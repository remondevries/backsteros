/**
 * Pre-spawn a Cursor ACP process (initialize done) so a later session can
 * skip cold spawn+init. Pool size 1 by default; off when
 * BACKSTEROS_CURSOR_ACP_WARM=0.
 *
 * Control start kicks {@link kickCursorAcpWarmPool} in parallel with task
 * resolve; the process is refilled after {@link takeCursorAcpWarmProcess}.
 */
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface } from "node:readline";

export type CursorAcpWarmSlot = {
  readonly process: ChildProcessWithoutNullStreams;
  readonly initializedAt: number;
};

type WarmConfig = {
  readonly enabled: boolean;
  readonly poolSize: number;
  readonly command: string;
  readonly args: readonly string[];
};

const DEFAULT_COMMAND = "cursor-agent";
const DEFAULT_ARGS = ["acp"] as const;

let warmSlot: CursorAcpWarmSlot | null = null;
let refillInFlight: Promise<void> | null = null;
let nextRequestId = 1;

/** Test seam: override spawn / config. */
let testOverrides: {
  readonly spawnImpl?: typeof spawn;
  readonly config?: Partial<WarmConfig>;
} | null = null;

export function resetCursorAcpWarmPoolForTests(): void {
  destroySlot(warmSlot);
  warmSlot = null;
  refillInFlight = null;
  testOverrides = null;
  nextRequestId = 1;
}

export function setCursorAcpWarmPoolTestOverrides(overrides: {
  readonly spawnImpl?: typeof spawn;
  readonly config?: Partial<WarmConfig>;
} | null): void {
  testOverrides = overrides;
}

export function resolveCursorAcpWarmConfig(
  env: NodeJS.ProcessEnv = process.env,
): WarmConfig {
  const disabled =
    env.BACKSTEROS_CURSOR_ACP_WARM === "0" ||
    env.BACKSTEROS_CURSOR_ACP_WARM === "false" ||
    env.T3_CURSOR_ACP_WARM === "0";
  const poolSizeRaw = Number(env.BACKSTEROS_CURSOR_ACP_WARM_POOL_SIZE ?? "1");
  const poolSize = Number.isFinite(poolSizeRaw) && poolSizeRaw > 0 ? Math.floor(poolSizeRaw) : 1;
  return {
    enabled: !disabled,
    poolSize: Math.min(poolSize, 4),
    command: env.BACKSTEROS_CURSOR_ACP_COMMAND?.trim() || DEFAULT_COMMAND,
    args: DEFAULT_ARGS,
    ...testOverrides?.config,
  };
}

/** Fire-and-forget: ensure a warm process exists (control start entry). */
export function kickCursorAcpWarmPool(): void {
  void ensureCursorAcpWarmPool().catch(() => undefined);
}

export async function ensureCursorAcpWarmPool(): Promise<void> {
  const config = resolveCursorAcpWarmConfig();
  if (!config.enabled || config.poolSize < 1) return;
  if (warmSlot && isSlotAlive(warmSlot)) return;
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
 */
export function takeCursorAcpWarmProcess(): CursorAcpWarmSlot | null {
  const config = resolveCursorAcpWarmConfig();
  if (!config.enabled) return null;
  const slot = warmSlot;
  warmSlot = null;
  if (!slot || !isSlotAlive(slot)) {
    kickCursorAcpWarmPool();
    return null;
  }
  kickCursorAcpWarmPool();
  return slot;
}

async function refillWarmSlot(config: WarmConfig): Promise<void> {
  destroySlot(warmSlot);
  warmSlot = null;
  const spawnImpl = testOverrides?.spawnImpl ?? spawn;
  const child = spawnImpl(config.command, [...config.args], {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  }) as ChildProcessWithoutNullStreams;

  try {
    await initializeAcpChild(child);
    if (!isProcessAlive(child)) {
      destroySlot({ process: child, initializedAt: Date.now() });
      return;
    }
    warmSlot = { process: child, initializedAt: Date.now() };
  } catch {
    destroySlot({ process: child, initializedAt: Date.now() });
  }
}

function initializeAcpChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: child.stdout });
    const requestId = nextRequestId++;
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Cursor ACP warm initialize timed out"));
    }, 15_000);

    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`Cursor ACP warm process exited during initialize (${code})`));
    };

    const onLine = (line: string) => {
      let message: { id?: number; result?: unknown; error?: unknown };
      try {
        message = JSON.parse(line) as { id?: number; result?: unknown; error?: unknown };
      } catch {
        return;
      }
      if (message.id !== requestId) return;
      cleanup();
      if (message.error) {
        reject(new Error(`Cursor ACP warm initialize failed: ${JSON.stringify(message.error)}`));
        return;
      }
      resolve();
    };

    const cleanup = () => {
      clearTimeout(timeout);
      rl.off("line", onLine);
      child.off("exit", onExit);
      rl.close();
    };

    rl.on("line", onLine);
    child.once("exit", onExit);

    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id: requestId,
      method: "initialize",
      params: {
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: "backsterdev-control-warm", version: "0.0.0" },
      },
    });
    child.stdin.write(`${payload}\n`);
  });
}

function isSlotAlive(slot: CursorAcpWarmSlot): boolean {
  return isProcessAlive(slot.process);
}

function isProcessAlive(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode === null && child.signalCode === null && !child.killed;
}

function destroySlot(slot: CursorAcpWarmSlot | null): void {
  if (!slot) return;
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

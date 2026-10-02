/**
 * DrainableWorker - A queue-based worker that exposes a `drain()` effect.
 *
 * Wraps the common `Queue.unbounded` + `Effect.forever` pattern and adds
 * a signal that resolves when the queue is empty **and** the current item
 * has finished processing. This lets tests replace timing-sensitive
 * `Effect.sleep` calls with deterministic `drain()`.
 *
 * Optional `concurrency` runs that many workers against the same queue so
 * independent items (e.g. session starts on different threads) can proceed
 * in parallel (OS-73). Pass `key` so items that share a key stay strictly
 * ordered while different keys still run concurrently — the place in each
 * key's FIFO is reserved at enqueue, and only one worker runs a given key
 * at a time (no head-of-line blocking across keys).
 *
 * @module DrainableWorker
 */
import * as Scope from "effect/Scope";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as TxQueue from "effect/TxQueue";
import * as TxRef from "effect/TxRef";

export interface DrainableWorker<A> {
  /**
   * Enqueue a work item and track it for `drain()`.
   *
   * This wraps `Queue.offer` so drain state is updated atomically with the
   * enqueue path instead of inferring it from queue internals.
   */
  readonly enqueue: (item: A) => Effect.Effect<void>;

  /**
   * Resolves when the queue is empty and the worker is idle (not processing).
   */
  readonly drain: Effect.Effect<void>;
}

export type MakeDrainableWorkerOptions<A> = {
  /**
   * Number of concurrent processors pulling from the same queue.
   * Defaults to 1 (sequential). Cap at a sensible limit for session starts.
   */
  readonly concurrency?: number;
  /**
   * When set, items that return the same key run one-at-a-time in enqueue
   * order. Different keys may still overlap up to `concurrency`.
   */
  readonly key?: (item: A) => string;
};

type KeyedQueues<A> = {
  readonly pending: Map<string, A[]>;
  readonly active: Set<string>;
};

/**
 * Create a drainable worker that processes items from an unbounded queue.
 *
 * The worker is forked into the current scope and will be interrupted when
 * the scope closes. A finalizer shuts down the queue.
 *
 * @param process - The effect to run for each queued item.
 * @param options - Optional concurrency and per-key serial ordering.
 * @returns A `DrainableWorker` with `enqueue` and `drain`.
 */
export const makeDrainableWorker = <A, E, R>(
  process: (item: A) => Effect.Effect<void, E, R>,
  options?: MakeDrainableWorkerOptions<A>,
): Effect.Effect<DrainableWorker<A>, never, Scope.Scope | R> =>
  Effect.gen(function* () {
    const outstanding = yield* TxRef.make(0);
    const concurrency = Math.max(1, Math.min(options?.concurrency ?? 1, 16));
    const keyOf = options?.key;

    if (!keyOf) {
      const queue = yield* Effect.acquireRelease(TxQueue.unbounded<A>(), TxQueue.shutdown);

      const workerLoop = TxQueue.take(queue).pipe(
        Effect.tap((a) =>
          Effect.ensuring(
            process(a),
            TxRef.update(outstanding, (n) => n - 1),
          ),
        ),
        Effect.forever,
        Effect.forkScoped,
      );

      for (let i = 0; i < concurrency; i += 1) {
        yield* workerLoop;
      }

      return {
        enqueue: (element) =>
          TxQueue.offer(queue, element).pipe(
            Effect.tap(() => TxRef.update(outstanding, (n) => n + 1)),
            Effect.tx,
          ),
        drain: TxRef.get(outstanding).pipe(
          Effect.tap((n) => (n > 0 ? Effect.txRetry : Effect.void)),
          Effect.tx,
        ),
      } satisfies DrainableWorker<A>;
    }

    // Keyed mode: per-key FIFO queues; runnable-key queue dispatches workers.
    const runnableKeys = yield* Effect.acquireRelease(
      TxQueue.unbounded<string>(),
      TxQueue.shutdown,
    );
    const keyed = yield* Ref.make<KeyedQueues<A>>({
      pending: new Map(),
      active: new Set(),
    });

    const takeNextForKey = (key: string): Effect.Effect<A | undefined> =>
      Ref.modify(keyed, (state) => {
        const queue = state.pending.get(key);
        if (!queue || queue.length === 0) {
          return [undefined, state] as const;
        }
        const [head, ...rest] = queue;
        const pending = new Map(state.pending);
        if (rest.length === 0) pending.delete(key);
        else pending.set(key, rest);
        return [head, { ...state, pending }] as const;
      });

    const finishKey = (key: string): Effect.Effect<void> =>
      Ref.modify(keyed, (state) => {
        const active = new Set(state.active);
        active.delete(key);
        const hasMore = (state.pending.get(key)?.length ?? 0) > 0;
        if (hasMore) {
          active.add(key);
        }
        return [hasMore, { ...state, active }] as const;
      }).pipe(
        Effect.flatMap((hasMore) => (hasMore ? TxQueue.offer(runnableKeys, key) : Effect.void)),
      );

    const processKey = (key: string): Effect.Effect<void, never, R> =>
      Effect.gen(function* () {
        while (true) {
          const item = yield* takeNextForKey(key);
          if (item === undefined) break;
          // Interrupt-safe: always drop outstanding, keep draining this key, and
          // never let a failed/interrupted item kill the worker forever-loop.
          yield* Effect.ensuring(
            process(item).pipe(Effect.catchCause(() => Effect.void)),
            TxRef.update(outstanding, (n) => n - 1),
          );
        }
      }).pipe(Effect.ensuring(finishKey(key)));

    const workerLoop = TxQueue.take(runnableKeys).pipe(
      Effect.flatMap((key) => processKey(key)),
      Effect.forever,
      Effect.forkScoped,
    );

    for (let i = 0; i < concurrency; i += 1) {
      yield* workerLoop;
    }

    const enqueue = (element: A): Effect.Effect<void> =>
      Effect.gen(function* () {
        yield* TxRef.update(outstanding, (n) => n + 1).pipe(Effect.tx);
        const key = keyOf(element);
        const shouldStart = yield* Ref.modify(keyed, (state) => {
          const pending = new Map(state.pending);
          const existing = pending.get(key) ?? [];
          pending.set(key, [...existing, element]);
          if (state.active.has(key)) {
            return [false, { ...state, pending }] as const;
          }
          const active = new Set(state.active);
          active.add(key);
          return [true, { pending, active }] as const;
        });
        if (shouldStart) {
          yield* TxQueue.offer(runnableKeys, key);
        }
      });

    return {
      enqueue,
      drain: TxRef.get(outstanding).pipe(
        Effect.tap((n) => (n > 0 ? Effect.txRetry : Effect.void)),
        Effect.tx,
      ),
    } satisfies DrainableWorker<A>;
  });

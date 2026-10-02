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
 * ordered while different keys still run concurrently.
 *
 * @module DrainableWorker
 */
import * as Scope from "effect/Scope";
import * as Deferred from "effect/Deferred";
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
    const queue = yield* Effect.acquireRelease(TxQueue.unbounded<A>(), TxQueue.shutdown);
    const outstanding = yield* TxRef.make(0);
    const concurrency = Math.max(1, Math.min(options?.concurrency ?? 1, 16));
    const keyOf = options?.key;
    const keyGates = yield* Ref.make(new Map<string, Deferred.Deferred<void, never>>());

    const processSeriallyByKey = (item: A): Effect.Effect<void, E, R> => {
      if (!keyOf) {
        return process(item);
      }
      const key = keyOf(item);
      return Effect.gen(function* () {
        const done = yield* Deferred.make<void>();
        const previous = yield* Ref.modify(keyGates, (gates) => {
          const prev = gates.get(key);
          const next = new Map(gates);
          next.set(key, done);
          return [prev, next] as const;
        });
        if (previous) {
          yield* Deferred.await(previous);
        }
        yield* Effect.ensuring(
          process(item),
          Effect.gen(function* () {
            yield* Deferred.succeed(done, undefined).pipe(Effect.orDie);
            yield* Ref.update(keyGates, (gates) => {
              if (gates.get(key) !== done) return gates;
              const next = new Map(gates);
              next.delete(key);
              return next;
            });
          }),
        );
      });
    };

    const workerLoop = TxQueue.take(queue).pipe(
      Effect.tap((a) =>
        Effect.ensuring(
          processSeriallyByKey(a),
          TxRef.update(outstanding, (n) => n - 1),
        ),
      ),
      Effect.forever,
      Effect.forkScoped,
    );

    for (let i = 0; i < concurrency; i += 1) {
      yield* workerLoop;
    }

    const drain: DrainableWorker<A>["drain"] = TxRef.get(outstanding).pipe(
      Effect.tap((n) => (n > 0 ? Effect.txRetry : Effect.void)),
      Effect.tx,
    );

    const enqueue = (element: A): Effect.Effect<boolean, never, never> =>
      TxQueue.offer(queue, element).pipe(
        Effect.tap(() => TxRef.update(outstanding, (n) => n + 1)),
        Effect.tx,
      );

    return { enqueue, drain } satisfies DrainableWorker<A>;
  });

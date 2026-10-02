import { it } from "@effect/vitest";
import { describe, expect } from "vite-plus/test";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

import { makeDrainableWorker } from "./DrainableWorker.ts";

describe("makeDrainableWorker", () => {
  it.live("waits for work enqueued during active processing before draining", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const processed: string[] = [];
        const firstStarted = yield* Deferred.make<void>();
        const releaseFirst = yield* Deferred.make<void>();
        const secondStarted = yield* Deferred.make<void>();
        const releaseSecond = yield* Deferred.make<void>();

        const worker = yield* makeDrainableWorker((item: string) =>
          Effect.gen(function* () {
            if (item === "first") {
              yield* Deferred.succeed(firstStarted, undefined).pipe(Effect.orDie);
              yield* Deferred.await(releaseFirst);
            }

            if (item === "second") {
              yield* Deferred.succeed(secondStarted, undefined).pipe(Effect.orDie);
              yield* Deferred.await(releaseSecond);
            }

            processed.push(item);
          }),
        );

        yield* worker.enqueue("first");
        yield* Deferred.await(firstStarted);

        const drained = yield* Deferred.make<void>();
        yield* Effect.forkChild(
          worker.drain.pipe(
            Effect.tap(() => Deferred.succeed(drained, undefined).pipe(Effect.orDie)),
          ),
        );

        yield* worker.enqueue("second");
        yield* Deferred.succeed(releaseFirst, undefined);
        yield* Deferred.await(secondStarted);

        expect(yield* Deferred.isDone(drained)).toBe(false);

        yield* Deferred.succeed(releaseSecond, undefined);
        yield* Deferred.await(drained);

        expect(processed).toEqual(["first", "second"]);
      }),
    ),
  );

  it.live("runs different keys in parallel when concurrency > 1", () =>
    Effect.scoped(
      Effect.gen(function* () {
        type Item = { readonly key: string; readonly label: string };
        const inFlight = yield* Ref.make(0);
        const sawParallel = yield* Ref.make(false);
        const release = yield* Deferred.make<void>();
        const bothEntered = yield* Deferred.make<void>();

        const worker = yield* makeDrainableWorker(
          (_item: Item) =>
            Effect.gen(function* () {
              const current = yield* Ref.updateAndGet(inFlight, (n) => n + 1);
              if (current >= 2) {
                yield* Ref.set(sawParallel, true);
                yield* Deferred.succeed(bothEntered, undefined).pipe(Effect.orDie);
              }
              yield* Deferred.await(release);
              yield* Ref.update(inFlight, (n) => n - 1);
            }),
          {
            concurrency: 4,
            key: (item) => item.key,
          },
        );

        yield* worker.enqueue({ key: "a", label: "start-a" });
        yield* worker.enqueue({ key: "b", label: "start-b" });
        yield* Deferred.await(bothEntered);
        expect(yield* Ref.get(sawParallel)).toBe(true);
        yield* Deferred.succeed(release, undefined);
        yield* worker.drain;
      }),
    ),
  );

  it.live("keeps same-key start then interrupt strictly ordered", () =>
    Effect.scoped(
      Effect.gen(function* () {
        type Item = { readonly key: string; readonly label: string };
        const order: string[] = [];
        const startEntered = yield* Deferred.make<void>();
        const releaseStart = yield* Deferred.make<void>();
        const interruptEntered = yield* Deferred.make<void>();

        const worker = yield* makeDrainableWorker(
          (item: Item) =>
            Effect.gen(function* () {
              order.push(`enter:${item.label}`);
              if (item.label === "start") {
                yield* Deferred.succeed(startEntered, undefined).pipe(Effect.orDie);
                yield* Deferred.await(releaseStart);
              } else {
                yield* Deferred.succeed(interruptEntered, undefined).pipe(Effect.orDie);
              }
              order.push(`leave:${item.label}`);
            }),
          {
            concurrency: 4,
            key: (item) => item.key,
          },
        );

        yield* worker.enqueue({ key: "thread-1", label: "start" });
        yield* worker.enqueue({ key: "thread-1", label: "interrupt" });
        yield* Deferred.await(startEntered);

        // Interrupt is queued/running but must not enter until start finishes.
        expect(order).toEqual(["enter:start"]);
        expect(yield* Deferred.isDone(interruptEntered)).toBe(false);

        yield* Deferred.succeed(releaseStart, undefined);
        yield* Deferred.await(interruptEntered);
        yield* worker.drain;

        expect(order).toEqual(["enter:start", "leave:start", "enter:interrupt", "leave:interrupt"]);
      }),
    ),
  );
});

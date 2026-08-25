/**
 * Serialize Moneybird HTTP calls in-process. Moneybird throttles per IP
 * (150 requests / 5 minutes); parallel UI requests must not stampede the API.
 */
let tail: Promise<unknown> = Promise.resolve();

export function enqueueMoneybirdRequest<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

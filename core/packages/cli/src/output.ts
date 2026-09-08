export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printLine(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function printErr(message: string): void {
  process.stderr.write(`${message}\n`);
}

/** Prefer JSON when --json; otherwise a one-line summary, with full JSON on stderr only if needed. */
export function emitResult(
  json: boolean,
  value: unknown,
  summary: string,
): void {
  if (json) {
    printJson(value);
    return;
  }
  printLine(summary);
}

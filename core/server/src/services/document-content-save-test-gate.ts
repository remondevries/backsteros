/**
 * Test-only gate: awaited after the document row lock is held and before
 * putObject. Production leaves this null.
 */
let gate: (() => Promise<void>) | null = null;

export function setDocumentContentSaveTestGate(
  next: (() => Promise<void>) | null,
): void {
  gate = next;
}

export async function awaitDocumentContentSaveTestGate(): Promise<void> {
  if (gate) {
    await gate();
  }
}

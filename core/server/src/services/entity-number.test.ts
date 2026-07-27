import assert from "node:assert/strict";
import test from "node:test";

/**
 * Pure allocation helper mirroring nextTaskNumber / nextEntityNumber:
 * next = max(counter, maxExisting + 1), then counter becomes next + 1.
 */
export function allocateNextNumber(
  counterNextValue: number | null | undefined,
  maxExistingNumber: number,
): { allocated: number; nextCounter: number } {
  const minNext = Math.max(0, maxExistingNumber) + 1;
  const current = counterNextValue ?? 1;
  const allocated = Math.max(current, minNext);
  return { allocated, nextCounter: allocated + 1 };
}

test("allocateNextNumber starts at 1 when empty", () => {
  assert.deepEqual(allocateNextNumber(null, 0), {
    allocated: 1,
    nextCounter: 2,
  });
});

test("allocateNextNumber advances a healthy counter", () => {
  assert.deepEqual(allocateNextNumber(16, 15), {
    allocated: 16,
    nextCounter: 17,
  });
});

test("allocateNextNumber floors behind counters after Circle import", () => {
  // CI had max legacy number 15 but counter stuck at 2 → would have reused 2.
  assert.deepEqual(allocateNextNumber(2, 15), {
    allocated: 16,
    nextCounter: 17,
  });
});

test("allocateNextNumber seeds missing counters from existing max", () => {
  assert.deepEqual(allocateNextNumber(null, 1), {
    allocated: 2,
    nextCounter: 3,
  });
});

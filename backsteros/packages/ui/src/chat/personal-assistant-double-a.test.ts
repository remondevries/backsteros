import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  clearPersonalAssistantDoubleA,
  consumePersonalAssistantDoubleA,
  isPersonalAssistantDoubleAKey,
  isPersonalAssistantDoubleAPending,
  PERSONAL_ASSISTANT_DOUBLE_A_MS,
  setPersonalAssistantDoubleAHandler,
  setPersonalAssistantSingleAHandler,
} from "./personal-assistant-double-a.ts";

function keyEvent(
  partial: Partial<
    Pick<
      KeyboardEvent,
      "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat"
    >
  > = {},
) {
  return {
    key: "a",
    code: "KeyA",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    ...partial,
  };
}

afterEach(() => {
  clearPersonalAssistantDoubleA();
  setPersonalAssistantSingleAHandler(null);
  setPersonalAssistantDoubleAHandler(null);
});

test("plain a is the double-tap key", () => {
  assert.equal(isPersonalAssistantDoubleAKey(keyEvent()), true);
  assert.equal(isPersonalAssistantDoubleAKey(keyEvent({ key: "A" })), true);
  assert.equal(
    isPersonalAssistantDoubleAKey(keyEvent({ shiftKey: true })),
    false,
  );
});

test("A then A quickly fires double, not single", async () => {
  let singles = 0;
  let doubles = 0;
  setPersonalAssistantSingleAHandler(() => {
    singles += 1;
  });
  setPersonalAssistantDoubleAHandler(() => {
    doubles += 1;
  });

  assert.equal(consumePersonalAssistantDoubleA(keyEvent()), true);
  assert.equal(isPersonalAssistantDoubleAPending(), true);
  assert.equal(consumePersonalAssistantDoubleA(keyEvent()), true);
  assert.equal(isPersonalAssistantDoubleAPending(), false);
  assert.equal(doubles, 1);
  assert.equal(singles, 0);

  await new Promise((resolve) =>
    setTimeout(resolve, PERSONAL_ASSISTANT_DOUBLE_A_MS + 40),
  );
  assert.equal(singles, 0);
});

test("single A fires assignee handler after the delay", async () => {
  let singles = 0;
  let doubles = 0;
  setPersonalAssistantSingleAHandler(() => {
    singles += 1;
  });
  setPersonalAssistantDoubleAHandler(() => {
    doubles += 1;
  });

  assert.equal(consumePersonalAssistantDoubleA(keyEvent()), true);
  assert.equal(singles, 0);
  await new Promise((resolve) =>
    setTimeout(resolve, PERSONAL_ASSISTANT_DOUBLE_A_MS + 40),
  );
  assert.equal(singles, 1);
  assert.equal(doubles, 0);
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  accumulateCalendarHorizontalDatePan,
  createCalendarHorizontalDatePanState,
  resolveCalendarHorizontalPanWheel,
  shouldPreventCalendarPageHorizontalScroll,
} from "./calendar-horizontal-date-pan.js";

test("resolveCalendarHorizontalPanWheel ignores vertical-dominant trackpad scroll", () => {
  assert.equal(
    resolveCalendarHorizontalPanWheel({
      deltaX: 4,
      deltaY: 40,
      shiftKey: false,
    }),
    null,
  );
});

test("resolveCalendarHorizontalPanWheel claims horizontal trackpad scroll", () => {
  assert.deepEqual(
    resolveCalendarHorizontalPanWheel({
      deltaX: 30,
      deltaY: 4,
      shiftKey: false,
    }),
    { deltaPx: 30 },
  );
});

test("resolveCalendarHorizontalPanWheel maps shift+vertical to horizontal pan", () => {
  assert.deepEqual(
    resolveCalendarHorizontalPanWheel({
      deltaX: 0,
      deltaY: 40,
      shiftKey: true,
    }),
    { deltaPx: 40 },
  );
});

test("resolveCalendarHorizontalPanWheel stays locked on diagonal bursts", () => {
  assert.deepEqual(
    resolveCalendarHorizontalPanWheel(
      { deltaX: 12, deltaY: 20, shiftKey: false },
      { locked: true },
    ),
    { deltaPx: 12 },
  );
});

test("shouldPreventCalendarPageHorizontalScroll blocks shift wheel", () => {
  assert.equal(
    shouldPreventCalendarPageHorizontalScroll({
      deltaX: 0,
      deltaY: 20,
      shiftKey: true,
    }),
    true,
  );
});

test("accumulateCalendarHorizontalDatePan steps by threshold", () => {
  let state = createCalendarHorizontalDatePanState();

  let result = accumulateCalendarHorizontalDatePan(state, 30, {
    thresholdPx: 60,
  });
  assert.equal(result.dayDelta, 0);
  assert.equal(result.nextState.accumulatedPx, 30);

  result = accumulateCalendarHorizontalDatePan(result.nextState, 40, {
    thresholdPx: 60,
  });
  assert.equal(result.dayDelta, 1);
  assert.equal(result.nextState.accumulatedPx, 10);

  result = accumulateCalendarHorizontalDatePan(result.nextState, -80, {
    thresholdPx: 60,
  });
  assert.equal(result.dayDelta, -1);
  assert.equal(result.nextState.accumulatedPx, -10);
  state = result.nextState;
  assert.equal(state.accumulatedPx, -10);
});

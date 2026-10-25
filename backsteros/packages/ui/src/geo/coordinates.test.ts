import assert from "node:assert/strict";
import { test } from "node:test";

import { asCoord, coordinatesKey, sameCoordinates } from "./coordinates.js";

test("asCoord accepts finite numbers and numeric strings", () => {
  assert.equal(asCoord(52.37), 52.37);
  assert.equal(asCoord(" 4.89 "), 4.89);
  assert.equal(asCoord("0"), 0);
});

test("asCoord rejects blanks, NaN, infinities and other types", () => {
  assert.equal(asCoord(""), null);
  assert.equal(asCoord("   "), null);
  assert.equal(asCoord("abc"), null);
  assert.equal(asCoord(Number.NaN), null);
  assert.equal(asCoord(Number.POSITIVE_INFINITY), null);
  assert.equal(asCoord(null), null);
  assert.equal(asCoord(undefined), null);
  assert.equal(asCoord({}), null);
});

test("coordinatesKey rounds to five decimals", () => {
  assert.equal(coordinatesKey(52.3700001, 4.8899999), "52.37000,4.89000");
});

test("sameCoordinates tolerates sub-metre drift only", () => {
  const target = { latitude: 52.37, longitude: 4.89 };
  assert.equal(
    sameCoordinates({ latitude: "52.370001", longitude: 4.890001 }, target),
    true,
  );
  assert.equal(
    sameCoordinates({ latitude: 52.371, longitude: 4.89 }, target),
    false,
  );
  assert.equal(sameCoordinates({ latitude: null, longitude: 4.89 }, target), false);
  assert.equal(sameCoordinates(undefined, target), false);
});

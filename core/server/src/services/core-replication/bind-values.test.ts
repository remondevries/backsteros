import assert from "node:assert/strict";
import test from "node:test";

import {
  arrayElementTypeFromUdtName,
  buildBindPlaceholder,
  serializeBindValue,
} from "./bind-values.js";

test("arrayElementTypeFromUdtName maps Postgres array udt names", () => {
  assert.equal(arrayElementTypeFromUdtName("_text"), "text");
  assert.equal(arrayElementTypeFromUdtName("_varchar"), "varchar");
  assert.equal(arrayElementTypeFromUdtName("jsonb"), null);
  assert.equal(arrayElementTypeFromUdtName("_bad;drop"), null);
});

test("buildBindPlaceholder rebuilds text[] columns from JSON instead of casting to jsonb", () => {
  assert.equal(
    buildBindPlaceholder(3, ["example.com", "lemo.design"], "text"),
    "ARRAY(SELECT jsonb_array_elements_text($3::jsonb))::text[]",
  );
  assert.equal(
    buildBindPlaceholder(1, [], "text"),
    "ARRAY(SELECT jsonb_array_elements_text($1::jsonb))::text[]",
  );
  assert.equal(serializeBindValue(["example.com"]), '["example.com"]');
});

test("buildBindPlaceholder keeps jsonb and scalar binds unchanged", () => {
  assert.equal(buildBindPlaceholder(2, ["a"], null), "$2::jsonb");
  assert.equal(buildBindPlaceholder(2, { a: 1 }, undefined), "$2::jsonb");
  assert.equal(buildBindPlaceholder(4, "plain", "text"), "$4");
  assert.equal(buildBindPlaceholder(5, null, "text"), "$5");
  assert.equal(buildBindPlaceholder(6, new Date(0), null), "$6");
  assert.equal(buildBindPlaceholder(7, ["a"], "text); drop table x; --"), "$7::jsonb");
});

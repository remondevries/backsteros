import assert from "node:assert/strict";
import { test } from "node:test";

import {
  absoluteToProjectRelative,
  projectRelativeToAbsolute,
} from "./project-fs-rest";

const root = "/Users/me/Projects/OS/Codebase";

test("absoluteToProjectRelative maps the working directory root to empty", () => {
  assert.equal(absoluteToProjectRelative(root, root), "");
  assert.equal(absoluteToProjectRelative(`${root}/`, root), "");
});

test("absoluteToProjectRelative keeps nested paths relative", () => {
  assert.equal(
    absoluteToProjectRelative(root, `${root}/backsteros/src/lib`),
    "backsteros/src/lib",
  );
});

test("projectRelativeToAbsolute round-trips nested paths", () => {
  const relative = "backsteros/package.json";
  assert.equal(
    absoluteToProjectRelative(
      root,
      projectRelativeToAbsolute(root, relative),
    ),
    relative,
  );
});

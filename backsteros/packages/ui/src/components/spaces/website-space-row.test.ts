import assert from "node:assert/strict";
import { test } from "node:test";

import { websiteFaviconHost } from "./website-space-row.js";

test("websiteFaviconHost prefers URL host from description", () => {
  assert.equal(
    websiteFaviconHost({
      id: "1",
      title: "Portal",
      categoryId: "websites",
      description: "Live at https://www.lemo-design.com/clients",
    }),
    "lemo-design.com",
  );
});

test("websiteFaviconHost slugifies path leaf to .com", () => {
  assert.equal(
    websiteFaviconHost({
      id: "1",
      title: "Lemo-Design",
      path: "websites/lemo-design",
      categoryId: "websites",
    }),
    "lemo-design.com",
  );
});

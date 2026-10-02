import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CONTROL_ROUTE_PATHS,
  CONTROL_SESSIONS_PRUNE_PATH,
  backsterosControlPruneRouteLayer,
  backsterosControlRouteLayer,
} from "./http.ts";

describe("backsteros control route registration (OS-73 prune)", () => {
  it("exports the prune path used by POST /sessions/prune", () => {
    expect(CONTROL_SESSIONS_PRUNE_PATH).toBe("/api/backsteros/control/sessions/prune");
    expect(CONTROL_ROUTE_PATHS.prune).toBe(CONTROL_SESSIONS_PRUNE_PATH);
  });

  it("registers prune on the merged control route layer", () => {
    // Layers are opaque; assert the source wires prune into the merge so a
    // future edit cannot drop the route without failing this check.
    const path = fileURLToPath(new URL("./http.ts", import.meta.url));
    const src = fs.readFileSync(path, "utf8");
    expect(src).toContain("backsterosControlPruneRouteLayer");
    expect(src).toMatch(
      /backsterosControlRouteLayer\s*=\s*Layer\.mergeAll\([\s\S]*backsterosControlPruneRouteLayer/,
    );
    expect(src).toContain('HttpRouter.add(\n  "POST",\n  CONTROL_SESSIONS_PRUNE_PATH');
    expect(backsterosControlPruneRouteLayer).toBeDefined();
    expect(backsterosControlRouteLayer).toBeDefined();
  });
});

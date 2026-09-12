import { describe, expect, it } from "vitest";

import {
  OV_REFERENCE_COMPONENTS,
  resolveComponentDeploys,
  siteRootNameHints,
  type WordpressAppRecord,
} from "./wordpress-components.ts";

function appWith(components: WordpressAppRecord["components"]): WordpressAppRecord {
  return {
    serverId: "165290762",
    service: "oosterlaarverhoeven-wordpress",
    siteRoot: "/home/deploy/sites/oosterlaarverhoeven",
    components,
    webhookToken: "test-token",
    updatedAt: "2026-09-10T00:00:00.000Z",
  };
}

describe("resolveComponentDeploys", () => {
  const ov = appWith(
    OV_REFERENCE_COMPONENTS.map((c, index) => ({
      ...c,
      id: `c${index}`,
      lastDeployAt: null,
      lastDeployStatus: null,
      lastDeploySha: null,
      updatedAt: "2026-09-10T00:00:00.000Z",
    })),
  );

  it("matches theme production branch only", () => {
    const matches = resolveComponentDeploys({
      apps: [ov],
      repository: "Lemo-Design/oosterlaarverhoeven",
      ref: "refs/heads/production",
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.component.type).toBe("theme");
    expect(matches[0]?.component.path).toBe("wp-content/themes/oosterlaarverhoeven/");
  });

  it("ignores theme main branch", () => {
    const matches = resolveComponentDeploys({
      apps: [ov],
      repository: "Lemo-Design/oosterlaarverhoeven",
      ref: "refs/heads/main",
    });
    expect(matches).toHaveLength(0);
  });

  it("matches platform plugin on main", () => {
    const matches = resolveComponentDeploys({
      apps: [ov],
      repository: "Lemo-Design/wordpress-plugin-admin-dashboard",
      ref: "refs/heads/main",
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.component.type).toBe("platform_plugin");
  });

  it("skips autoDeploy=false components by default", () => {
    const matches = resolveComponentDeploys({
      apps: [ov],
      repository: "Lemo-Design/wordpress-recipe",
      ref: "refs/heads/main",
    });
    expect(matches).toHaveLength(0);
  });

  it("includes manual components when requireAutoDeploy=false", () => {
    const matches = resolveComponentDeploys({
      apps: [ov],
      repository: "Lemo-Design/wordpress-recipe",
      ref: "refs/heads/main",
      requireAutoDeploy: false,
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.component.type).toBe("recipe_mu");
  });

  it("normalizes github URLs in repo field", () => {
    const custom = appWith([
      {
        id: "1",
        type: "theme",
        repo: "https://github.com/Lemo-Design/oosterlaarverhoeven.git",
        path: "wp-content/themes/oosterlaarverhoeven/",
        ref: "production",
        autoDeploy: true,
        rolloutGroup: null,
        lastDeployAt: null,
        lastDeployStatus: null,
        lastDeploySha: null,
        updatedAt: "2026-09-10T00:00:00.000Z",
      },
    ]);
    const matches = resolveComponentDeploys({
      apps: [custom],
      repository: "Lemo-Design/oosterlaarverhoeven",
      ref: "refs/heads/production",
    });
    expect(matches).toHaveLength(1);
  });
});

describe("siteRootNameHints", () => {
  it("derives site slug from *-wordpress service", () => {
    expect(siteRootNameHints("oosterlaarverhoeven-wordpress")).toEqual(
      expect.arrayContaining(["oosterlaarverhoeven-wordpress", "oosterlaarverhoeven"]),
    );
  });
});

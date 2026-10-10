import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mapProjectUpsert } from "./sync.js";

/**
 * Exercises the real mapProjectUpsert path: explicit null must clear nullable
 * columns; omitted keys must stay undefined so updateProject preserves them.
 */
describe("mapProjectUpsert null clears", () => {
  const nullableStringFields: Array<{
    snake: string;
    camel: string;
    mapped: keyof ReturnType<typeof mapProjectUpsert>;
  }> = [
    { snake: "summary", camel: "summary", mapped: "summary" },
    { snake: "description", camel: "description", mapped: "description" },
    {
      snake: "organization_id",
      camel: "organizationId",
      mapped: "organizationId",
    },
    { snake: "area_id", camel: "areaId", mapped: "areaId" },
    { snake: "area", camel: "area", mapped: "area" },
    { snake: "start_date", camel: "startDate", mapped: "startDate" },
    { snake: "due_date", camel: "dueDate", mapped: "dueDate" },
    { snake: "icon", camel: "icon", mapped: "icon" },
    { snake: "color", camel: "color", mapped: "color" },
    { snake: "provider", camel: "provider", mapped: "provider" },
    { snake: "category", camel: "category", mapped: "category" },
    {
      snake: "github_repository",
      camel: "githubRepository",
      mapped: "githubRepository",
    },
    {
      snake: "cloudflare_zone_id",
      camel: "cloudflareZoneId",
      mapped: "cloudflareZoneId",
    },
    {
      snake: "local_working_directory",
      camel: "localWorkingDirectory",
      mapped: "localWorkingDirectory",
    },
    {
      snake: "development_location",
      camel: "developmentLocation",
      mapped: "developmentLocation",
    },
    {
      snake: "production_location",
      camel: "productionLocation",
      mapped: "productionLocation",
    },
    {
      snake: "local_location",
      camel: "localLocation",
      mapped: "localLocation",
    },
    {
      snake: "development_setup_error",
      camel: "developmentSetupError",
      mapped: "developmentSetupError",
    },
    {
      snake: "development_setup_updated_at",
      camel: "developmentSetupUpdatedAt",
      mapped: "developmentSetupUpdatedAt",
    },
    {
      snake: "health_check_mode",
      camel: "healthCheckMode",
      mapped: "healthCheckMode",
    },
    {
      snake: "health_check_domain",
      camel: "healthCheckDomain",
      mapped: "healthCheckDomain",
    },
  ];

  for (const field of nullableStringFields) {
    it(`clears ${field.mapped} from snake_case null`, () => {
      const mapped = mapProjectUpsert({
        id: "p1",
        [field.snake]: null,
      });
      assert.equal(mapped[field.mapped], null);
    });

    it(`clears ${field.mapped} from camelCase null`, () => {
      const mapped = mapProjectUpsert({
        id: "p1",
        [field.camel]: null,
      });
      assert.equal(mapped[field.mapped], null);
    });

    it(`leaves ${field.mapped} unset when omitted`, () => {
      const mapped = mapProjectUpsert({ id: "p1", name: "Keep" });
      assert.equal(mapped[field.mapped], undefined);
    });
  }

  it("clears hourlyRateCents from snake_case null", () => {
    assert.equal(
      mapProjectUpsert({ id: "p1", hourly_rate_cents: null }).hourlyRateCents,
      null,
    );
  });

  it("clears hourlyRateCents from camelCase null", () => {
    assert.equal(
      mapProjectUpsert({ id: "p1", hourlyRateCents: null }).hourlyRateCents,
      null,
    );
  });

  it("leaves hourlyRateCents unset when omitted", () => {
    assert.equal(mapProjectUpsert({ id: "p1" }).hourlyRateCents, undefined);
  });

  it("clears developmentSetupStatus from null", () => {
    assert.equal(
      mapProjectUpsert({ id: "p1", development_setup_status: null })
        .developmentSetupStatus,
      null,
    );
  });

  it("leaves developmentSetupStatus unset when omitted", () => {
    assert.equal(
      mapProjectUpsert({ id: "p1" }).developmentSetupStatus,
      undefined,
    );
  });

  it("keeps non-null required fields unset (not cleared) when payload sends null", () => {
    const mapped = mapProjectUpsert({
      id: "p1",
      key: null,
      name: null,
      type: null,
      status: null,
      priority: null,
      sort_order: null,
    });
    assert.equal(mapped.key, undefined);
    assert.equal(mapped.name, undefined);
    assert.equal(mapped.type, undefined);
    assert.equal(mapped.status, undefined);
    assert.equal(mapped.priority, undefined);
    assert.equal(mapped.sortOrder, undefined);
  });

  it("maps a string value for organizationId and githubRepository", () => {
    const mapped = mapProjectUpsert({
      id: "p1",
      organization_id: "org-1",
      github_repository: "owner/repo",
    });
    assert.equal(mapped.organizationId, "org-1");
    assert.equal(mapped.githubRepository, "owner/repo");
  });

  it("prefers snake_case when both snake and camel are present", () => {
    const mapped = mapProjectUpsert({
      id: "p1",
      organization_id: null,
      organizationId: "org-should-not-win",
    });
    assert.equal(mapped.organizationId, null);
  });
});

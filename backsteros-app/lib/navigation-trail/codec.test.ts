import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appendNavigationTrailNode,
  buildNavigationTrailHref,
  getNavigationTrailAncestorHref,
  parseNavigationTrailPath,
} from "./codec";
import { getNavigationTrailRefFromCanonicalHref } from "./canonical-ref";

describe("navigation trail codec", () => {
  const sourceHref =
    "/organizations/lemo-design/projects/ci/documents/specs/architecture";

  it("appends a typed task to an arbitrary source path", () => {
    const taskHref = appendNavigationTrailNode(sourceHref, {
      kind: "task",
      routeParam: "CI-12",
    });
    assert.equal(taskHref, `${sourceHref}/~task/CI-12`);
  });

  it("supports an unlimited typed trail", () => {
    const taskHref = appendNavigationTrailNode(sourceHref, {
      kind: "task",
      routeParam: "CI-12",
    });
    const nestedHref = appendNavigationTrailNode(taskHref, {
      kind: "document",
      projectRouteParam: "LD",
      relativePath: "notes/follow up",
    });
    assert.equal(
      nestedHref,
      `${sourceHref}/~task/CI-12/~document/LD/notes/follow%20up`,
    );

    const parsed = parseNavigationTrailPath(nestedHref);
    assert.deepEqual(parsed, {
      sourceHref,
      nodes: [
        { kind: "task", routeParam: "CI-12" },
        {
          kind: "document",
          projectRouteParam: "LD",
          relativePath: "notes/follow up",
        },
      ],
    });

    assert.equal(
      parsed ? getNavigationTrailAncestorHref(parsed, 0) : null,
      taskHref,
    );
    assert.equal(
      parsed ? getNavigationTrailAncestorHref(parsed, -1) : null,
      sourceHref,
    );
  });

  it("rejects non-trail and incomplete trail paths", () => {
    assert.equal(parseNavigationTrailPath("/projects/ci"), null);
    assert.equal(parseNavigationTrailPath("/projects/ci/~document/LD"), null);
    assert.equal(
      parseNavigationTrailPath("/knowledge/source/~unknown/value"),
      null,
    );
  });

  it("builds and parses stable entity ids with query strings", () => {
    assert.equal(
      buildNavigationTrailHref({
        sourceHref: "/letters/l-2",
        nodes: [{ kind: "project", routeParam: "CI" }],
      }),
      "/letters/l-2/~project/CI",
    );

    const stableTaskId = "550e8400-e29b-41d4-a716-446655440000";
    const stableHref = appendNavigationTrailNode(
      "/journal/2026-07-11?mode=edit",
      {
        kind: "task",
        routeParam: "LD-3",
        entityId: stableTaskId,
      },
    );
    assert.equal(
      stableHref,
      `/journal/2026-07-11/~task/LD-3~${stableTaskId}?mode=edit`,
    );
    assert.deepEqual(parseNavigationTrailPath(stableHref), {
      sourceHref: "/journal/2026-07-11?mode=edit",
      nodes: [
        { kind: "task", routeParam: "LD-3", entityId: stableTaskId },
      ],
    });
  });

  it("builds and parses nanoid entity ids in trail payloads", () => {
    const nanoidTaskId = "V1StGXR8_Z5jdHi6B-myT";
    const href = appendNavigationTrailNode("/journal/2026-07-11", {
      kind: "task",
      routeParam: "ld-1",
      entityId: nanoidTaskId,
    });
    assert.equal(href, `/journal/2026-07-11/~task/ld-1~${nanoidTaskId}`);
    assert.deepEqual(parseNavigationTrailPath(href), {
      sourceHref: "/journal/2026-07-11",
      nodes: [
        { kind: "task", routeParam: "ld-1", entityId: nanoidTaskId },
      ],
    });
  });

  it("builds journal task trails with slug only when entityId is omitted", () => {
    const href = appendNavigationTrailNode("/journal/2026-07-11", {
      kind: "task",
      routeParam: "ld-1",
    });
    assert.equal(href, "/journal/2026-07-11/~task/ld-1");
    assert.deepEqual(parseNavigationTrailPath(href), {
      sourceHref: "/journal/2026-07-11",
      nodes: [{ kind: "task", routeParam: "ld-1" }],
    });
  });

  it("encodes unicode source paths", () => {
    assert.equal(
      appendNavigationTrailNode("/knowledge/résumé", {
        kind: "letter",
        routeParam: "l-2",
      }),
      "/knowledge/r%C3%A9sum%C3%A9/~letter/l-2",
    );
  });

  it("parses canonical entity hrefs into trail refs", () => {
    assert.deepEqual(
      getNavigationTrailRefFromCanonicalHref(
        "/projects/ci/documents/specs/na%C3%AFve",
      ),
      {
        kind: "document",
        projectRouteParam: "ci",
        relativePath: "specs/naïve",
      },
    );
    assert.deepEqual(
      getNavigationTrailRefFromCanonicalHref("/contacts/ada/tasks/ADA-4?edit=1"),
      { kind: "task", routeParam: "ADA-4" },
    );
  });
});

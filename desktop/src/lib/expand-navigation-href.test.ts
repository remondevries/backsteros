import { describe, expect, it } from "vitest";

import { expandNavigationHref } from "./expand-navigation-href";

describe("expandNavigationHref", () => {
  it("leaves Journal on the list root like letters and tasks", () => {
    expect(expandNavigationHref("/journal")).toBe("/journal");
  });

  it("leaves a dated journal href alone", () => {
    expect(expandNavigationHref("/journal/2026-01-02")).toBe(
      "/journal/2026-01-02",
    );
  });

  it("expands section roots that remap", () => {
    expect(expandNavigationHref("/email")).toBe("/inbox");
    expect(expandNavigationHref("/finance")).toBe("/finance/dashboard");
    expect(expandNavigationHref("/settings")).toBe("/settings/general");
  });

  it("leaves already-concrete hrefs alone", () => {
    expect(expandNavigationHref("/tasks")).toBe("/tasks");
    expect(expandNavigationHref("/letters")).toBe("/letters");
    expect(expandNavigationHref("/calendar")).toBe("/calendar");
  });
});

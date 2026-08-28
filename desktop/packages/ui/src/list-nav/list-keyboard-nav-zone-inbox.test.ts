import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getDefaultListKeyboardNavZone,
  getListKeyboardNavSurfaceKey,
  resolveZonePolicy,
  shouldAutoSwitchJkToMainList,
} from "./list-keyboard-nav-zone.js";

describe("getDefaultListKeyboardNavZone", () => {
  it("keeps inbox j/k on the side panel", () => {
    assert.equal(getDefaultListKeyboardNavZone("/inbox"), "sidepanel");
    assert.equal(getDefaultListKeyboardNavZone("/inbox/in-1"), "sidepanel");
  });

  it("keeps entity nested lists on main", () => {
    assert.equal(
      getDefaultListKeyboardNavZone("/contacts/1/tasks"),
      "main",
    );
    assert.equal(
      getDefaultListKeyboardNavZone("/organizations/acme/transactions"),
      "main",
    );
    assert.equal(
      getDefaultListKeyboardNavZone("/organizations/acme/invoices"),
      "main",
    );
  });
});

describe("shouldAutoSwitchJkToMainList", () => {
  it("does not steal inbox j/k away from the side panel", () => {
    assert.equal(shouldAutoSwitchJkToMainList("/inbox"), false);
    assert.equal(shouldAutoSwitchJkToMainList("/inbox/in-1"), false);
  });

  it("keeps inbox-sourced email j/k on the side panel", () => {
    assert.equal(shouldAutoSwitchJkToMainList("/email/box/msg"), false);
  });
});

describe("resolveZonePolicy", () => {
  it("entity nested lists default to main; active sidepanel keeps j/k", () => {
    for (const path of [
      "/contacts/1/tasks",
      "/organizations/acme/contacts",
      "/organizations/acme/transactions",
      "/organizations/acme/invoices",
    ]) {
      const policy = resolveZonePolicy(path);
      assert.equal(policy.defaultZone, "main", path);
      assert.equal(policy.autoSwitchJkToMain, false, path);
      assert.equal(
        resolveZonePolicy(path, {
          activeZone: "main",
          hasMainList: true,
        }).jkZone,
        "main",
        path,
      );
      assert.equal(
        resolveZonePolicy(path, {
          activeZone: "sidepanel",
          preferSidepanelForJk: false,
          hasMainList: true,
        }).jkZone,
        "sidepanel",
        path,
      );
      assert.equal(
        resolveZonePolicy(path, {
          activeZone: "sidepanel",
          preferSidepanelForJk: true,
          hasMainList: true,
        }).jkZone,
        "sidepanel",
        path,
      );
    }
  });

  it("inbox and email stay on sidepanel without auto-switch", () => {
    for (const path of ["/inbox", "/inbox/in-1", "/email/box/msg"]) {
      const policy = resolveZonePolicy(path);
      assert.equal(policy.defaultZone, "sidepanel");
      assert.equal(policy.autoSwitchJkToMain, false);
      assert.equal(
        resolveZonePolicy(path, {
          activeZone: "sidepanel",
          preferSidepanelForJk: false,
          hasMainList: true,
        }).jkZone,
        "sidepanel",
      );
    }
  });

  it("journal and finance stay on sidepanel without auto-switch", () => {
    for (const path of ["/journal", "/journal/2024-01-01", "/finance"]) {
      const policy = resolveZonePolicy(path);
      assert.equal(policy.defaultZone, "sidepanel");
      assert.equal(policy.autoSwitchJkToMain, false);
    }
  });

  it("calendar auto-switch depends on calendarPageMode flag", () => {
    assert.equal(
      resolveZonePolicy("/calendar", { calendarPageMode: "timetracking" })
        .autoSwitchJkToMain,
      false,
    );
    assert.equal(
      resolveZonePolicy("/calendar", { calendarPageMode: "calendar" })
        .autoSwitchJkToMain,
      true,
    );
    assert.equal(
      resolveZonePolicy("/calendar", { calendarPageMode: null })
        .autoSwitchJkToMain,
      true,
    );
  });

  it("knowledge/letters default sidepanel with auto-switch to main", () => {
    for (const path of ["/knowledge", "/letters"]) {
      const policy = resolveZonePolicy(path, {
        activeZone: "sidepanel",
        preferSidepanelForJk: false,
        hasMainList: true,
      });
      assert.equal(policy.defaultZone, "sidepanel");
      assert.equal(policy.autoSwitchJkToMain, true);
      assert.equal(policy.jkZone, "main");
    }
  });

  it("preferSidepanelForJk keeps j/k on sidepanel when auto-switch would fire", () => {
    assert.equal(
      resolveZonePolicy("/knowledge", {
        activeZone: "sidepanel",
        preferSidepanelForJk: true,
        hasMainList: true,
      }).jkZone,
      "sidepanel",
    );
  });
});

describe("getListKeyboardNavSurfaceKey", () => {
  it("groups inbox and inbox-sourced email as one surface", () => {
    assert.equal(getListKeyboardNavSurfaceKey("/inbox"), "inbox");
    assert.equal(getListKeyboardNavSurfaceKey("/inbox/in-1"), "inbox");
    assert.equal(getListKeyboardNavSurfaceKey("/email/box/msg"), "inbox");
  });

  it("distinguishes journal from inbox for keep-alive flips", () => {
    assert.equal(getListKeyboardNavSurfaceKey("/journal"), "journal");
    assert.equal(getListKeyboardNavSurfaceKey("/journal/2024-01-01"), "journal");
    assert.notEqual(
      getListKeyboardNavSurfaceKey("/journal"),
      getListKeyboardNavSurfaceKey("/inbox"),
    );
  });

  it("treats tasks as its own surface", () => {
    assert.equal(getListKeyboardNavSurfaceKey("/tasks"), "tasks");
    assert.equal(getListKeyboardNavSurfaceKey("/tasks/abc"), "tasks");
  });

  it("keeps section roots distinct for warm flips", () => {
    assert.equal(getListKeyboardNavSurfaceKey("/knowledge"), "knowledge");
    assert.equal(getListKeyboardNavSurfaceKey("/letters"), "letters");
    assert.equal(getListKeyboardNavSurfaceKey("/contacts"), "contacts");
    assert.equal(getListKeyboardNavSurfaceKey("/projects"), "projects");
    assert.equal(getListKeyboardNavSurfaceKey("/organizations"), "organizations");
  });
});

describe("tasks list zone policy", () => {
  it("defaults j/k to main and ignores stale sidepanel preference", () => {
    const policy = resolveZonePolicy("/tasks");
    assert.equal(policy.defaultZone, "main");
    assert.equal(policy.autoSwitchJkToMain, true);
    assert.equal(
      resolveZonePolicy("/tasks", {
        activeZone: "sidepanel",
        preferSidepanelForJk: true,
        hasMainList: true,
      }).jkZone,
      "main",
    );
  });

  it("defaults projects root to main", () => {
    assert.equal(resolveZonePolicy("/projects").defaultZone, "main");
    assert.equal(resolveZonePolicy("/projects/CA").defaultZone, "sidepanel");
  });
});

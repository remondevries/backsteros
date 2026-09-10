import { describe, expect, it } from "vite-plus/test";

import { resolveTaskPropertyDropdownOpenCandidatesFromEvent } from "./taskPropertyDropdownKeys";

function keyEvent(
  overrides: Partial<Pick<KeyboardEvent, "key" | "code" | "shiftKey">> = {},
): Pick<KeyboardEvent, "key" | "code" | "shiftKey"> {
  return {
    key: "s",
    code: "KeyS",
    shiftKey: false,
    ...overrides,
  };
}

describe("resolveTaskPropertyDropdownOpenCandidatesFromEvent", () => {
  it("maps plain letter hotkeys like desktop", () => {
    expect(resolveTaskPropertyDropdownOpenCandidatesFromEvent(keyEvent())).toEqual(["status"]);
    expect(
      resolveTaskPropertyDropdownOpenCandidatesFromEvent(keyEvent({ key: "p", code: "KeyP" })),
    ).toEqual(["priority", "project"]);
    expect(
      resolveTaskPropertyDropdownOpenCandidatesFromEvent(keyEvent({ key: "a", code: "KeyA" })),
    ).toEqual(["assignee", "area"]);
    expect(
      resolveTaskPropertyDropdownOpenCandidatesFromEvent(keyEvent({ key: "r", code: "KeyR" })),
    ).toEqual(["related", "receivedDate"]);
    expect(
      resolveTaskPropertyDropdownOpenCandidatesFromEvent(keyEvent({ key: "o", code: "KeyO" })),
    ).toEqual(["organization"]);
  });

  it("maps shift variants like desktop", () => {
    expect(
      resolveTaskPropertyDropdownOpenCandidatesFromEvent(
        keyEvent({ key: "d", code: "KeyD", shiftKey: true }),
      ),
    ).toEqual(["dueDate"]);
    expect(
      resolveTaskPropertyDropdownOpenCandidatesFromEvent(
        keyEvent({ key: "p", code: "KeyP", shiftKey: true }),
      ),
    ).toEqual(["project"]);
    expect(
      resolveTaskPropertyDropdownOpenCandidatesFromEvent(
        keyEvent({ key: "s", code: "KeyS", shiftKey: true }),
      ),
    ).toEqual(["startDate"]);
    expect(
      resolveTaskPropertyDropdownOpenCandidatesFromEvent(
        keyEvent({ key: "c", code: "KeyC", shiftKey: true }),
      ),
    ).toEqual(["contact"]);
  });

  it("ignores unmapped keys", () => {
    expect(
      resolveTaskPropertyDropdownOpenCandidatesFromEvent(keyEvent({ key: "x", code: "KeyX" })),
    ).toEqual([]);
  });
});

import { describe, expect, it } from "vite-plus/test";

import { buildMentionDesktopHref } from "./mention-desktop-href";
import { decideMentionOpenTarget } from "./mention-open-target";
import { parseMentionToken } from "./mention-tokens";

function taskToken(displayId = "BDV-61") {
  return parseMentionToken(`[@task:${displayId}]`)!;
}

describe("buildMentionDesktopHref", () => {
  it("builds project task paths from display ids", () => {
    expect(
      buildMentionDesktopHref({
        token: taskToken("PF-43"),
        task: { number: 43, projectKey: "PF" },
      }),
    ).toBe("/projects/PF/tasks/pf-43");
  });

  it("builds inbox task paths", () => {
    expect(
      buildMentionDesktopHref({
        token: taskToken("INBOX-3"),
        task: { number: 3, projectKey: null },
      }),
    ).toBe("/inbox/inbox-3");
  });

  it("builds contact, letter, and document paths", () => {
    expect(
      buildMentionDesktopHref({
        token: parseMentionToken("[@contact:C-12]")!,
        contactRouteParam: 12,
      }),
    ).toBe("/contacts/12");

    expect(
      buildMentionDesktopHref({
        token: parseMentionToken("[@letter:L-7]")!,
      }),
    ).toBe("/letters/l-7");

    expect(
      buildMentionDesktopHref({
        token: parseMentionToken("[@document:OS/docs/a.md]")!,
      }),
    ).toBe("/projects/OS/documents/docs/a.md");
  });
});

describe("decideMentionOpenTarget", () => {
  it("opens codebase tasks inside BacksterDEV", () => {
    expect(
      decideMentionOpenTarget({
        token: taskToken("BDV-61"),
        resolved: true,
        taskId: "task-1",
        projectId: "proj-1",
        projectType: "codebase",
      }),
    ).toEqual({
      kind: "backsterdev",
      taskId: "task-1",
      projectId: "proj-1",
    });
  });

  it("opens non-codebase tasks in desktop via path deep links", () => {
    expect(
      decideMentionOpenTarget({
        token: taskToken("PF-43"),
        resolved: true,
        taskId: "task-2",
        projectId: "proj-2",
        projectType: "general",
        desktopHrefInput: {
          task: { number: 43, projectKey: "PF" },
        },
      }),
    ).toEqual({
      kind: "desktop",
      href: "/projects/PF/tasks/pf-43",
    });
  });

  it("opens letters/docs/contacts in desktop", () => {
    expect(
      decideMentionOpenTarget({
        token: parseMentionToken("[@letter:L-1]")!,
        resolved: true,
      }),
    ).toEqual({ kind: "desktop", href: "/letters/l-1" });

    expect(
      decideMentionOpenTarget({
        token: parseMentionToken("[@contact:C-4]")!,
        resolved: true,
        desktopHrefInput: { contactRouteParam: 4 },
      }),
    ).toEqual({ kind: "desktop", href: "/contacts/4" });
  });

  it("returns none for unresolved or deleted mentions", () => {
    expect(
      decideMentionOpenTarget({
        token: taskToken("GONE-1"),
        resolved: false,
      }),
    ).toEqual({ kind: "none" });
  });
});

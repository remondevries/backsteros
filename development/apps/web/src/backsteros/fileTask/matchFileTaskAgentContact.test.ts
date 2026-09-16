import { describe, expect, it } from "vitest";

import { matchFileTaskAgentContact } from "./matchFileTaskAgentContact";
import type { BacksterosContact } from "../types";

function contact(
  partial: Pick<BacksterosContact, "id" | "name"> & Partial<Omit<BacksterosContact, "id" | "name">>,
): BacksterosContact {
  return {
    email: null,
    ...partial,
  };
}

describe("matchFileTaskAgentContact", () => {
  const contacts = [
    contact({ id: "1", name: "Sander Bakker", firstName: "Sander", lastName: "Bakker" }),
    contact({ id: "2", name: "Remon de Vries", firstName: "Remon", lastName: "de Vries" }),
  ] as const;

  it("matches exact full name", () => {
    expect(matchFileTaskAgentContact("Sander Bakker", contacts)?.id).toBe("1");
  });

  it("matches first name used as agent display name", () => {
    expect(matchFileTaskAgentContact("Sander", contacts)?.id).toBe("1");
  });

  it("is case-insensitive and trims", () => {
    expect(matchFileTaskAgentContact("  remon  ", contacts)?.id).toBe("2");
  });

  it("returns null when nothing matches", () => {
    expect(matchFileTaskAgentContact("Grok", contacts)).toBeNull();
    expect(matchFileTaskAgentContact("", contacts)).toBeNull();
  });
});

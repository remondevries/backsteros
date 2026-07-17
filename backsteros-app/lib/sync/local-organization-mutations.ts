"use client";

type Fail = { ok: false; error: string };
const fail = (): Fail => ({ ok: false, error: "Offline mutations are unavailable." });

export async function createLocalOrganization(...args: unknown[]): Promise<Fail> {
  void args;
  return fail();
}
export async function updateLocalOrganizationName(...args: unknown[]): Promise<Fail> {
  void args;
  return fail();
}
export async function updateLocalOrganizationDetails(
  ...args: unknown[]
): Promise<Fail> {
  void args;
  return fail();
}
export async function updateLocalOrganizationSummary(
  ...args: unknown[]
): Promise<Fail> {
  void args;
  return fail();
}
export async function deleteLocalOrganization(...args: unknown[]): Promise<Fail> {
  void args;
  return fail();
}

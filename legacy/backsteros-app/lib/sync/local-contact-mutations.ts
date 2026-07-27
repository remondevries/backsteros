"use client";

type Fail = { ok: false; error: string };
const fail = (): Fail => ({ ok: false, error: "Offline mutations are unavailable." });

export async function createLocalContact(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function updateLocalContactName(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function updateLocalContactDetails(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function updateLocalContactSummary(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function updateLocalContactOrganization(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function deleteLocalContact(...args: unknown[]): Promise<Fail> { void args; return fail(); }

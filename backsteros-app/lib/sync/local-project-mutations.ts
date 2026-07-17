"use client";

type Fail = { ok: false; error: string };
const fail = (): Fail => ({ ok: false, error: "Offline mutations are unavailable." });

export async function updateLocalProjectName(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function updateLocalProjectKey(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function updateLocalProjectSummary(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function updateLocalProjectDescription(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function updateLocalProjectStatus(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function updateLocalProjectIcon(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function updateLocalProjectPriority(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function updateLocalProjectArea(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function updateLocalProjectOrganization(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function updateLocalProjectStartDate(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function updateLocalProjectDueDate(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function deleteLocalProject(...args: unknown[]): Promise<Fail> { void args; return fail(); }

"use client";

type Fail = { ok: false; error: string };
const fail = (): Fail => ({ ok: false, error: "Offline mutations are unavailable." });

export async function updateLocalTaskAssignee(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function updateLocalTaskStatus(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function updateLocalTaskPriority(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function updateLocalTaskDueDate(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function moveLocalTaskToProject(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function updateLocalTaskTitle(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function updateLocalTaskDescription(...args: unknown[]): Promise<Fail> { void args; return fail(); }
export async function deleteLocalTask(...args: unknown[]): Promise<Fail> { void args; return fail(); }

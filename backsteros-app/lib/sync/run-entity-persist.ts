"use client";

export async function runEntityPersist<TResult extends { ok: boolean }>(
  _mobile: () => Promise<TResult>,
  server: () => Promise<TResult>,
): Promise<TResult> {
  return server();
}

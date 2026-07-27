"use client";

import type { LocalCreatedTaskSnapshot } from "./local-created-task-snapshot";

export type CreateLocalInboxTaskInput = {
  title: string;
  dueDate?: string | null;
  assigneeId?: string | null;
  status?: string;
};

export type CreateLocalInboxTaskResult =
  | { ok: true; snapshot: LocalCreatedTaskSnapshot }
  | { ok: false; error: string };

export async function createLocalInboxTask(
  input: CreateLocalInboxTaskInput,
): Promise<CreateLocalInboxTaskResult> {
  void input;
  return { ok: false, error: "Offline inbox create is unavailable." };
}

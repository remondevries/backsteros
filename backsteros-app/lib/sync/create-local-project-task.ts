"use client";

import type { LocalCreatedTaskSnapshot } from "./local-created-task-snapshot";

export type CreateLocalProjectTaskInput = {
  projectId: string;
  title: string;
  dueDate?: string | null;
  assigneeId?: string | null;
  status?: string;
};

export type CreateLocalProjectTaskResult =
  | { ok: true; snapshot: LocalCreatedTaskSnapshot }
  | { ok: false; error: string };

export async function createLocalProjectTask(
  input: CreateLocalProjectTaskInput,
): Promise<CreateLocalProjectTaskResult> {
  void input;
  return { ok: false, error: "Offline project task create is unavailable." };
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { createInboxTaskAction } from "@/lib/mutations/tasks";
import { TaskPriorityIcon } from "@/components/task-priority/task-priority-icon";
import { TaskCreateAssigneeDropdown } from "@/components/tasks/task-create-assignee-dropdown";
import type { AssignableContact } from "@/lib/contacts/assignable-contact";
import { getInboxTaskHref } from "@/lib/entity-route-hrefs";
import { isMobileRuntime } from "@/lib/platform/runtime";
import { createLocalInboxTask } from "@/lib/sync/create-local-inbox-task";
import type { LocalCreatedTaskSnapshot } from "@/lib/sync/local-created-task-snapshot";
import { parseDueDateInputValue } from "@/lib/task-due-date";
import { scheduleInlineAddOnBlurAction } from "@/lib/tasks/inline-add-on-blur";
import type { TaskStatus } from "@/lib/task-status";

type AddInboxTaskInlineProps = {
  contacts: AssignableContact[];
  defaultAssigneeId: string | null;
  dueDate?: string | null;
  status?: TaskStatus;
  onCancel: () => void;
  onCreated?: (snapshot: LocalCreatedTaskSnapshot) => void | Promise<void>;
};

export function AddInboxTaskInline({
  contacts,
  defaultAssigneeId,
  dueDate,
  status,
  onCancel,
  onCreated,
}: AddInboxTaskInlineProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(
    defaultAssigneeId,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      onCancel();
      return;
    }

    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;

    startTransition(async () => {
      try {
        setError(null);
        const resolvedStatus = status ?? "triage";
        const result = isMobileRuntime()
          ? await createLocalInboxTask({
              title: trimmed,
              dueDate,
              assigneeId,
              status: resolvedStatus,
            })
          : await createInboxTaskAction({
              title: trimmed,
              dueDate,
              assigneeId,
            }).then((serverResult) => {
              if (!serverResult.ok) {
                return serverResult;
              }

              let parsedDueDate: number | null = null;
              if (dueDate != null && dueDate.trim()) {
                parsedDueDate = parseDueDateInputValue(dueDate)?.getTime() ?? null;
              }

              const now = Date.now();
              return {
                ok: true as const,
                snapshot: {
                  taskId: serverResult.taskId,
                  taskNumber: serverResult.taskNumber,
                  title: trimmed,
                  status: resolvedStatus,
                  priority: 0,
                  dueDate: parsedDueDate,
                  projectId: null,
                  contactId: null,
                  sortOrder: now,
                  updatedAt: now,
                },
              };
            });

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setTitle("");
        await onCreated?.(result.snapshot);
        onCancel();
        if (!onCreated) {
          router.push(getInboxTaskHref(result.snapshot.taskNumber));
          router.refresh();
        }
      } finally {
        submittingRef.current = false;
      }
    });
  }

  return (
    <div ref={containerRef} className="border-b border-white/10 px-2 py-2">
      <form
        className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          <TaskPriorityIcon priority={0} />
        </span>

        <input
          ref={inputRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
          onBlur={() => {
            scheduleInlineAddOnBlurAction({
              container: containerRef.current,
              title,
              isPending,
              isSubmitting: () => submittingRef.current,
              onCancel,
              onSubmit: submit,
            });
          }}
          disabled={isPending}
          placeholder="Quick capture…"
          aria-label="Inbox task title"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium leading-[18px] text-foreground placeholder:text-foreground/40 focus:outline-none"
        />

        <TaskCreateAssigneeDropdown
          contacts={contacts}
          value={assigneeId}
          onChange={setAssigneeId}
          disabled={isPending}
        />
      </form>
      {error ? (
        <p className="px-2 pb-1 text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { createTaskAction } from "@/lib/mutations/tasks";
import { TaskPriorityIcon } from "@/components/task-priority/task-priority-icon";
import { TaskCreateAssigneeDropdown } from "@/components/tasks/task-create-assignee-dropdown";
import type { AssignableContact } from "@/lib/contacts/assignable-contact";
import { isMobileRuntime } from "@/lib/platform/runtime";
import { createLocalProjectTask } from "@/lib/sync/create-local-project-task";
import type { LocalCreatedTaskSnapshot } from "@/lib/sync/local-created-task-snapshot";
import { scheduleInlineAddOnBlurAction } from "@/lib/tasks/inline-add-on-blur";
import type { TaskStatus } from "@/lib/task-status";

type AddTaskInlineProps = {
  projectId: string;
  status: TaskStatus;
  contacts: AssignableContact[];
  defaultAssigneeId: string | null;
  onCancel: () => void;
  onCreated?: (snapshot: LocalCreatedTaskSnapshot) => void | Promise<void>;
};

export function AddTaskInline({
  projectId,
  status,
  contacts,
  defaultAssigneeId,
  onCancel,
  onCreated,
}: AddTaskInlineProps) {
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
        const result = isMobileRuntime()
          ? await createLocalProjectTask({
              projectId,
              title: trimmed,
              status,
              assigneeId,
            })
          : await createTaskAction({
              projectId,
              title: trimmed,
              status,
              assigneeId,
            }).then((serverResult) => {
              if (!serverResult.ok) {
                return serverResult;
              }

              const now = Date.now();
              return {
                ok: true as const,
                snapshot: {
                  taskId: serverResult.taskId,
                  taskNumber: serverResult.taskNumber,
                  title: trimmed,
                  status,
                  priority: 0,
                  dueDate: null,
                  projectId,
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
      } finally {
        submittingRef.current = false;
      }
    });
  }

  return (
    <div ref={containerRef} className="list-none">
      <form
        className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2.5"
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
          placeholder="Task title"
          aria-label="Task title"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium leading-[18px] text-foreground placeholder:text-foreground/40 focus:outline-none"
        />

        <TaskCreateAssigneeDropdown
          contacts={contacts}
          value={assigneeId}
          onChange={setAssigneeId}
          disabled={isPending}
        />

        {error ? (
          <span className="sr-only" role="alert">
            {error}
          </span>
        ) : null}
      </form>
      {error ? (
        <p className="px-2 pb-2 text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

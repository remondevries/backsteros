"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { updateTaskStatusAction } from "@/lib/mutations/tasks";
import {
  navigateInboxAfterStatusChange,
  notifyInboxStatusChange,
  shouldNotifyInboxStatusChange } from "@/lib/inbox/inbox-status-change-notification";
import { updateLocalTaskStatus } from "@/lib/sync/local-task-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import { TaskStatusIcon } from "@/components/task-status";
import { PropertyDropdown } from "@/components/ui/property-dropdown";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  type TaskStatus } from "@/lib/task-status";

import { buildTaskStatusDropdownOptions } from "./task-status-dropdown-options";

type TaskStatusDropdownProps = {
  taskId: string;
  projectId: string | null;
  status: string;
  variant: "property" | "icon";
  disabled?: boolean;
  onStatusChange?: (status: TaskStatus) => void;
};

export function TaskStatusDropdown({
  taskId,
  projectId,
  status: initialStatus,
  variant,
  disabled = false,
  onStatusChange }: TaskStatusDropdownProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState(() =>
    migrateLegacyTaskStatus(initialStatus),
  );
  const [error, setError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [prevInitialStatus, setPrevInitialStatus] = useState(initialStatus);
  if (initialStatus !== prevInitialStatus) {
    setPrevInitialStatus(initialStatus);
    setStatus(migrateLegacyTaskStatus(initialStatus));
  }

  const options = useMemo(() => buildTaskStatusDropdownOptions(), []);

  const statusLabel = getTaskStatusLabel(status);

  function handleChange(nextStatus: TaskStatus) {
    if (disabled || nextStatus === status) return;

    const previousStatus = status;
    setStatus(nextStatus);
    setError(null);
    onStatusChange?.(nextStatus);

    startTransition(async () => {
      const result = await runEntityPersist(
        () =>
          updateLocalTaskStatus({
            taskId,
            projectId,
            status: nextStatus,
          }),
        () =>
          updateTaskStatusAction({
            taskId,
            projectId,
            status: nextStatus,
          }),
      );

      if (!result.ok) {
        setStatus(previousStatus);
        onStatusChange?.(previousStatus);
        setError(result.error);
        return;
      }

      if (
        pathname.startsWith("/inbox") &&
        shouldNotifyInboxStatusChange(nextStatus) &&
        result.taskNumber != null
      ) {
        notifyInboxStatusChange(
          {
            kind: "task",
            title: result.title,
            status: nextStatus,
            taskNumber: result.taskNumber,
            projectKey: result.projectKey,
            projectName: result.projectName,
            contactKey: result.contactKey },
          router,
        );
        navigateInboxAfterStatusChange(router);
      }
    });
  }

  if (variant === "property") {
    return (
      <div className="flex flex-col gap-1">
        <PropertyDropdown
          value={status}
          options={options}
          onChange={handleChange}
          disabled={disabled || isPending}
          searchPlaceholder="Change status…"
          searchShortcutLabel="S"
          ariaLabel="Change status"
          taskPropertyDropdownId="status"
          fallbackIcon={
            <TaskStatusIcon status={status} title={statusLabel} size={14} />
          }
          fallbackLabel={statusLabel}
        />
        {error ? (
          <p className="px-1 text-[11px] text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <SearchableDropdown
        value={status}
        options={options}
        onChange={handleChange}
        disabled={disabled || isPending}
        searchPlaceholder="Change status…"
        searchShortcutLabel="S"
        ariaLabel={`Change status: ${statusLabel}`}
        taskPropertyDropdownId="status"
        className="inline-flex"
        panelWidth={280}
        panelAlign="start"
        renderTrigger={({ open, disabled, triggerId, onToggle }) => (
          <button
            type="button"
            id={triggerId}
            title={statusLabel}
            tabIndex={-1}
            className="flex size-4 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-55"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={`Change status: ${statusLabel}`}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onFocus={() => setIsHovered(true)}
            onBlur={() => setIsHovered(false)}
          >
            <TaskStatusIcon
              status={status}
              title={statusLabel}
              highlighted={isHovered || open}
            />
          </button>
        )}
      />
      {error ? (
        <p className="text-[11px] text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

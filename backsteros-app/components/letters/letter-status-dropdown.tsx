"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { updateLetterStatusAction } from "@/lib/mutations/letters";
import { updateLocalLetterStatus } from "@/lib/sync/local-letter-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import { TaskStatusIcon } from "@/components/task-status";
import { PropertyDropdown } from "@/components/ui/property-dropdown";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import { buildTaskStatusDropdownOptions } from "@/components/tasks/task-status-dropdown-options";
import {
  navigateInboxAfterStatusChange,
  notifyInboxStatusChange,
  shouldNotifyInboxStatusChange } from "@/lib/inbox/inbox-status-change-notification";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  type TaskStatus } from "@/lib/task-status";

type LetterStatusDropdownProps = {
  letterId: string;
  projectId: string | null;
  status: string;
  title?: string;
  letterNumber?: number | null;
  projectKey?: string | null;
  projectName?: string | null;
  variant: "property" | "icon";
  onStatusChange?: (status: TaskStatus) => void;
};

export function LetterStatusDropdown({
  letterId,
  projectId,
  status: initialStatus,
  title = "Letter",
  letterNumber = null,
  projectKey = null,
  projectName = null,
  variant,
  onStatusChange }: LetterStatusDropdownProps) {
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
    if (nextStatus === status) return;

    const previousStatus = status;
    setStatus(nextStatus);
    setError(null);
    onStatusChange?.(nextStatus);

    startTransition(async () => {
      const result = await runEntityPersist(
        () =>
          updateLocalLetterStatus({
            letterId,
            projectId,
            status: nextStatus,
          }),
        () =>
          updateLetterStatusAction({
            letterId,
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
        shouldNotifyInboxStatusChange(nextStatus)
      ) {
        notifyInboxStatusChange(
          {
            kind: "letter",
            title,
            status: nextStatus,
            letterNumber,
            projectKey,
            projectName,
          },
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
          disabled={isPending}
          searchPlaceholder="Change status…"
          searchShortcutLabel="S"
          ariaLabel="Change status"
          fallbackIcon={
            <TaskStatusIcon status={status} title={statusLabel} size={14} />
          }
          fallbackLabel={statusLabel}
          taskPropertyDropdownId="status"
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
        disabled={isPending}
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

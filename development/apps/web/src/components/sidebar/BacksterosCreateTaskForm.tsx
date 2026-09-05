import { TerminalIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";

import { BacksterosContactPersonIcon } from "~/backsteros/ContactPersonIcon";
import { createBacksterosTask, fetchBacksterosContacts } from "~/backsteros/client";
import { BacksterosDueDatePropertyMenu } from "~/backsteros/DueDatePropertyMenu";
import { BacksterosEntityAvatarIcon } from "~/backsteros/EntityAvatarIcon";
import { openBacksterosTaskChat } from "~/backsteros/openTaskChat";
import { useBacksterosTaskDetailUiStore } from "~/backsteros/taskDetailUiStore";
import {
  BACKSTEROS_TASK_PRIORITY_LABELS,
  getBacksterosTaskPriorityLabel,
} from "~/backsteros/taskDetailFormat";
import { BacksterosTaskPriorityIcon } from "~/backsteros/TaskPriorityIcon";
import { BacksterosTaskStatusIcon } from "~/backsteros/TaskStatusIcon";
import {
  BACKSTEROS_TASK_STATUS_ORDER,
  getBacksterosTaskStatusLabel,
  type BacksterosTaskStatus,
} from "~/backsteros/taskStatus";
import type { BacksterosCodebaseProject, BacksterosContact } from "~/backsteros/types";
import { useBacksterosContactAvatarSrcMap } from "~/backsteros/useBacksterosContactAvatars";
import { useEnsureBacksterosT3Project } from "~/backsteros/useEnsureBacksterosT3Project";
import { cn } from "~/lib/utils";
import { useProjects } from "~/state/entities";
import { Button } from "../ui/button";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { toastManager } from "../ui/toast";
import "~/backsteros/backsterosPropertyMenu.css";

function PropertyChipMenu(props: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly searchHint: string;
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly muted?: boolean;
}) {
  return (
    <Menu>
      <MenuTrigger
        disabled={props.disabled}
        className={cn(
          "bos-task-property-chip",
          props.muted && "bos-task-property-chip--muted",
        )}
        aria-label={props.label}
      >
        <span className="bos-task-property-chip__icon">{props.icon}</span>
        <span className="bos-task-property-chip__label">{props.label}</span>
      </MenuTrigger>
      <MenuPopup align="start" className="bos-task-property-menu">
        <div className="bos-task-property-menu__search">{props.searchHint}</div>
        {props.children}
      </MenuPopup>
    </Menu>
  );
}

export function BacksterosCreateTaskForm({
  project,
}: {
  readonly project: BacksterosCodebaseProject;
}) {
  const router = useRouter();
  const projects = useProjects();
  const ensureT3Project = useEnsureBacksterosT3Project();
  const openTaskDetail = useBacksterosTaskDetailUiStore((state) => state.openTaskDetail);
  const closeTaskDetail = useBacksterosTaskDetailUiStore((state) => state.closeTaskDetail);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<BacksterosTaskStatus>("triage");
  const [priority, setPriority] = useState(0);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<readonly BacksterosContact[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setTitle("");
    setDescription("");
    setStatus("triage");
    setPriority(0);
    setDueDate(null);
    setAssigneeId(null);
  }, [project.id]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchBacksterosContacts(controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setContacts(list);
      })
      .catch(() => {
        if (!controller.signal.aborted) setContacts([]);
      });
    return () => controller.abort();
  }, []);

  const avatarSrcById = useBacksterosContactAvatarSrcMap(contacts);
  const assignee = useMemo(
    () => contacts.find((contact) => contact.id === assigneeId) ?? null,
    [assigneeId, contacts],
  );
  const canSubmit = title.trim().length > 0 && !submitting;

  const handleCreate = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || submitting) return;

    setSubmitting(true);
    try {
      const created = await createBacksterosTask({
        title: trimmedTitle,
        projectId: project.id,
        description: description.trim() || null,
        status,
        priority,
        dueDate,
        assigneeId,
      });

      openTaskDetail({ taskId: created.id, project });
      await openBacksterosTaskChat({
        task: created,
        backsterosProject: project,
        projects,
        ensureT3Project,
        navigate: (opts) => router.navigate(opts as never),
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not create task",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    assigneeId,
    description,
    dueDate,
    ensureT3Project,
    openTaskDetail,
    priority,
    project,
    projects,
    router,
    status,
    submitting,
    title,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canSubmit) {
              event.preventDefault();
              void handleCreate();
            }
          }}
          placeholder="Task title"
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-base font-semibold text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring"
        />

        <div className="bos-task-detail-properties mt-3">
          <PropertyChipMenu
            disabled={submitting}
            searchHint="Set status…"
            label={getBacksterosTaskStatusLabel(status)}
            icon={<BacksterosTaskStatusIcon status={status} size={12} className="shrink-0" />}
          >
            <MenuRadioGroup
              value={status}
              onValueChange={(value) => setStatus(value as BacksterosTaskStatus)}
            >
              {BACKSTEROS_TASK_STATUS_ORDER.map((entry) => (
                <MenuRadioItem
                  key={entry}
                  value={entry}
                  closeOnClick
                  className="bos-task-property-menu__option"
                >
                  <span className="bos-task-property-menu__option-icon">
                    <BacksterosTaskStatusIcon status={entry} size={14} />
                  </span>
                  <span className="bos-task-property-menu__option-label">
                    {getBacksterosTaskStatusLabel(entry)}
                  </span>
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </PropertyChipMenu>

          <PropertyChipMenu
            disabled={submitting}
            searchHint="Set priority…"
            label={getBacksterosTaskPriorityLabel(priority)}
            icon={<BacksterosTaskPriorityIcon priority={priority} size={12} />}
          >
            <MenuRadioGroup
              value={String(priority)}
              onValueChange={(value) => setPriority(Number(value))}
            >
              {BACKSTEROS_TASK_PRIORITY_LABELS.map((label, value) => (
                <MenuRadioItem
                  key={label}
                  value={String(value)}
                  closeOnClick
                  className="bos-task-property-menu__option"
                >
                  <span className="bos-task-property-menu__option-icon">
                    <BacksterosTaskPriorityIcon priority={value} size={14} />
                  </span>
                  <span className="bos-task-property-menu__option-label">{label}</span>
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </PropertyChipMenu>

          <BacksterosDueDatePropertyMenu
            dueDate={dueDate}
            status={status}
            disabled={submitting}
            onChange={setDueDate}
          />

          <PropertyChipMenu
            disabled={submitting}
            searchHint="Set assignee…"
            label={assignee?.name ?? "Unassigned"}
            muted={!assignee}
            icon={
              assignee ? (
                <BacksterosEntityAvatarIcon
                  src={avatarSrcById[assignee.id] ?? null}
                  size={12}
                />
              ) : (
                <BacksterosContactPersonIcon size={12} className="opacity-70" />
              )
            }
          >
            <MenuRadioGroup
              value={assigneeId ?? "__unassigned__"}
              onValueChange={(value) => {
                setAssigneeId(value === "__unassigned__" ? null : value);
              }}
            >
              <MenuRadioItem
                value="__unassigned__"
                closeOnClick
                className="bos-task-property-menu__option"
              >
                <span className="bos-task-property-menu__option-main">
                  <span className="bos-task-property-menu__option-icon">
                    <BacksterosContactPersonIcon size={14} className="opacity-70" />
                  </span>
                  <span className="bos-task-property-menu__option-label">Unassigned</span>
                </span>
              </MenuRadioItem>
              <MenuSeparator className="bos-task-property-menu__separator" />
              {contacts.map((contact) => (
                <MenuRadioItem
                  key={contact.id}
                  value={contact.id}
                  closeOnClick
                  className="bos-task-property-menu__option"
                >
                  <span className="bos-task-property-menu__option-main">
                    <span className="bos-task-property-menu__option-icon">
                      <BacksterosEntityAvatarIcon
                        src={avatarSrcById[contact.id] ?? null}
                        size={14}
                      />
                    </span>
                    <span className="bos-task-property-menu__option-label">
                      {contact.name}
                    </span>
                  </span>
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </PropertyChipMenu>

          <span className="bos-task-property-chip bos-task-property-chip--static">
            <span className="bos-task-property-chip__icon">
              <TerminalIcon className="size-3 shrink-0 opacity-70" />
            </span>
            <span className="bos-task-property-chip__label">{project.name}</span>
          </span>
        </div>

        <div className="mt-4 border-t border-border/50 pt-3">
          <div className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Description
          </div>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            placeholder="Add a description…"
            className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-sidebar-border/60 px-3 py-2.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={submitting}
          onClick={closeTaskDetail}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canSubmit}
          onClick={() => void handleCreate()}
        >
          {submitting ? "Creating…" : "Create task"}
        </Button>
      </div>
    </div>
  );
}

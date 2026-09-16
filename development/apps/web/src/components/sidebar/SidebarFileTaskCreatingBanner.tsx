import { BorderBeam } from "border-beam";
import { memo, useEffect, useMemo, useState } from "react";

import { fetchBacksterosContacts } from "~/backsteros/client";
import { BacksterosEntityAvatarIcon } from "~/backsteros/EntityAvatarIcon";
import { matchFileTaskAgentContact } from "~/backsteros/fileTask/matchFileTaskAgentContact";
import {
  FILE_TASK_UI_PREVIEW,
  FILE_TASK_UI_PREVIEW_CREATING,
} from "~/backsteros/fileTaskUiPreview";
import { useFileTaskCreatingStore } from "~/backsteros/fileTaskCreatingStore";
import type { BacksterosContact } from "~/backsteros/types";
import { useBacksterosContactAvatarSrcMap } from "~/backsteros/useBacksterosContactAvatars";
import { cn } from "~/lib/utils";

function FileTaskAgentBusyAvatar({
  agentName,
  contacts,
  avatarSrcById,
}: {
  readonly agentName: string;
  readonly contacts: readonly BacksterosContact[];
  readonly avatarSrcById: Readonly<Record<string, string>>;
}) {
  const contact = matchFileTaskAgentContact(agentName, contacts);
  const src = contact ? (avatarSrcById[contact.id] ?? null) : null;

  return (
    <span className="relative size-5 shrink-0" aria-hidden>
      <BacksterosEntityAvatarIcon src={src} size={20} />
      <span
        className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-sidebar"
        title="Working"
      />
    </span>
  );
}

/** Creating strip above Code / Servers / Git while a file-task webhook job runs. */
export const SidebarFileTaskCreatingBanner = memo(function SidebarFileTaskCreatingBanner() {
  const liveJob = useFileTaskCreatingStore((state) => state.creating);
  const [contacts, setContacts] = useState<readonly BacksterosContact[]>([]);

  const job =
    liveJob?.phase === "creating"
      ? liveJob
      : FILE_TASK_UI_PREVIEW
        ? FILE_TASK_UI_PREVIEW_CREATING
        : null;

  useEffect(() => {
    if (!job || job.phase !== "creating") {
      setContacts([]);
      return;
    }
    const controller = new AbortController();
    void fetchBacksterosContacts(controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setContacts(list);
      })
      .catch(() => {
        if (!controller.signal.aborted) setContacts([]);
      });
    return () => controller.abort();
  }, [job]);

  const avatarEntities = useMemo(() => {
    if (!job) return [];
    const contact = matchFileTaskAgentContact(job.agentName, contacts);
    return contact ? [contact] : [];
  }, [contacts, job]);
  const avatarSrcById = useBacksterosContactAvatarSrcMap(avatarEntities);

  if (!job || job.phase !== "creating") return null;

  const isPreview = FILE_TASK_UI_PREVIEW && job === FILE_TASK_UI_PREVIEW_CREATING;
  const projectLabel = job.projectKey?.trim() || job.projectName.trim() || "project";

  return (
    <BorderBeam size="sm" colorVariant="ocean" strength={0.7} theme="auto" borderRadius={10}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-[10px] px-2 py-1.5",
          "border-[0.5px] border-foreground/12 bg-sidebar-row-hover/60 text-sidebar-foreground",
        )}
        role="status"
        aria-live="polite"
        data-testid="backsteros-file-task-creating"
        data-preview={isPreview ? "" : undefined}
      >
        <FileTaskAgentBusyAvatar
          agentName={job.agentName}
          contacts={contacts}
          avatarSrcById={avatarSrcById}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium leading-tight text-secondary-label live-status-shine">
            Creating a task
          </div>
          <div className="truncate text-[11px] leading-tight text-sidebar-muted-foreground">
            {job.agentName.trim() || "Agent"} · {projectLabel}
          </div>
        </div>
      </div>
    </BorderBeam>
  );
});

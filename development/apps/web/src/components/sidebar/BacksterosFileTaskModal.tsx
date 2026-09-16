import { BorderBeam } from "border-beam";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { fetchBacksterosContacts, registerBacksterosFileTaskCallback } from "~/backsteros/client";
import { BacksterosEntityAvatarIcon } from "~/backsteros/EntityAvatarIcon";
import {
  DEFAULT_FILE_TASK_ASSIGNEE_ID,
  useBacksterosFileTaskAgentsStore,
} from "~/backsteros/fileTaskAgentsStore";
import { useFileTaskCreatingStore } from "~/backsteros/fileTaskCreatingStore";
import { matchFileTaskAgentContact } from "~/backsteros/fileTask/matchFileTaskAgentContact";
import { isFileTaskSubmitShortcut } from "~/backsteros/fileTask/fileTaskSubmitShortcut";
import {
  fileTaskTabFieldFromDropdownId,
  getNextFileTaskTabField,
  getPreviousFileTaskTabField,
  type FileTaskTabField,
} from "~/backsteros/fileTask/fileTaskTabFlow";
import { wakeFileTaskAgent } from "~/backsteros/fileTask/wakeFileTaskAgent";
import { startFileTaskCallbackWatch } from "~/backsteros/fileTask/watchFileTaskCallback";
import { useBacksterosFileTaskUiStore } from "~/backsteros/fileTaskUiStore";
import { isBacksterosPropertyMenuOpen } from "~/backsteros/isBacksterosPropertyMenuOpen";
import {
  getTaskPropertyDropdownTrigger,
  openTaskPropertyDropdown,
} from "~/backsteros/openTaskPropertyDropdown";
import { ProjectOcticon } from "~/backsteros/ProjectOcticon";
import {
  BacksterosSearchablePropertyMenu,
  type BacksterosSearchablePropertyOption,
} from "~/backsteros/SearchablePropertyMenu";
import type { BacksterosCodebaseProject, BacksterosContact } from "~/backsteros/types";
import { useBacksterosCodebaseProjects } from "~/backsteros/useBacksterosCodebaseProjects";
import { useBacksterosContactAvatarSrcMap } from "~/backsteros/useBacksterosContactAvatars";
import { randomUUID } from "~/lib/utils";
import { toastManager } from "../ui/toast";

import "~/backsteros/backsterosPropertyMenu.css";
import "~/backsteros/backsteros-compose-modal.css";
import "~/backsteros/backsteros-file-task-modal.css";

type FileTaskPhase = "brief" | "error";

function FileTaskSendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BacksterosFileTaskModal() {
  const initialProject = useBacksterosFileTaskUiStore((state) => state.fileTaskProject);
  const openFileTask = useBacksterosFileTaskUiStore((state) => state.openFileTask);
  const closeFileTask = useBacksterosFileTaskUiStore((state) => state.closeFileTask);
  const dialogLabelId = useId();
  const { state: projectsState } = useBacksterosCodebaseProjects(Boolean(initialProject));

  const agents = useBacksterosFileTaskAgentsStore((state) => state.agents);
  const selectedAgentId = useBacksterosFileTaskAgentsStore((state) => state.selectedAgentId);
  const setSelectedAgentId = useBacksterosFileTaskAgentsStore((state) => state.setSelectedAgentId);
  const markCreating = useFileTaskCreatingStore((state) => state.markCreating);

  const [selectedProject, setSelectedProject] = useState<BacksterosCodebaseProject | null>(null);
  const [phase, setPhase] = useState<FileTaskPhase>("brief");
  const [brief, setBrief] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [contacts, setContacts] = useState<readonly BacksterosContact[]>([]);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const wasOpenRef = useRef(false);
  const pendingBriefFocusRef = useRef(false);

  useEffect(() => {
    if (!initialProject) {
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
  }, [initialProject]);

  useEffect(() => {
    if (!initialProject) {
      wasOpenRef.current = false;
      setSelectedProject(null);
      return;
    }

    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      pendingBriefFocusRef.current = true;
      setSelectedProject(initialProject);
      setPhase("brief");
      // Keep any in-progress brief so Escape/close does not wipe the draft.
      setSubmitting(false);
      setErrorMessage(null);
    }
  }, [initialProject]);

  // Focus the brief after the dialog body mounts (selectedProject gates the portal).
  useLayoutEffect(() => {
    if (!initialProject || !selectedProject || !pendingBriefFocusRef.current) return;

    const tryFocus = (): boolean => {
      const el = textareaRef.current;
      if (!el) return false;
      pendingBriefFocusRef.current = false;
      el.focus({ preventScroll: true });
      const len = el.value.length;
      el.setSelectionRange(len, len);
      return true;
    };

    if (tryFocus()) return;

    const frame = window.requestAnimationFrame(() => {
      tryFocus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialProject, selectedProject]);

  const focusBrief = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, []);

  useEffect(() => {
    if (!initialProject) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.repeat) return;

      // Open project/agent menu: search-field Escape closes it and restores brief
      // focus; do not dismiss the modal.
      if (isBacksterosPropertyMenuOpen()) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closeFileTask();
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [closeFileTask, initialProject]);

  const codebaseProjects = useMemo((): readonly BacksterosCodebaseProject[] => {
    if (projectsState.status === "ready") return projectsState.projects;
    return selectedProject ? [selectedProject] : [];
  }, [projectsState, selectedProject]);

  const projectOptions = useMemo((): readonly BacksterosSearchablePropertyOption[] => {
    return codebaseProjects.map((entry) => ({
      value: entry.id,
      label: entry.name,
      searchText: `${entry.key ?? ""} ${entry.name}`,
      icon: (
        <ProjectOcticon
          icon={entry.icon}
          type={entry.type}
          size={14}
          className="shrink-0 opacity-70"
        />
      ),
    }));
  }, [codebaseProjects]);

  const agentContacts = useMemo(
    () =>
      agents
        .map((agent) => matchFileTaskAgentContact(agent.name, contacts))
        .filter((contact): contact is BacksterosContact => contact != null),
    [agents, contacts],
  );
  const agentAvatarSrcById = useBacksterosContactAvatarSrcMap(agentContacts);

  const agentOptions = useMemo((): readonly BacksterosSearchablePropertyOption[] => {
    return agents.map((agent) => {
      const contact = matchFileTaskAgentContact(agent.name, contacts);
      const avatarSrc = contact ? (agentAvatarSrcById[contact.id] ?? null) : null;
      return {
        value: agent.id,
        label: agent.name.trim() || "Unnamed agent",
        searchText: agent.name,
        icon: <BacksterosEntityAvatarIcon src={avatarSrc} size={14} />,
      };
    });
  }, [agentAvatarSrcById, agents, contacts]);

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null;
  const selectedAgentContact = selectedAgent
    ? matchFileTaskAgentContact(selectedAgent.name, contacts)
    : null;
  const selectedAgentAvatarSrc = selectedAgentContact
    ? (agentAvatarSrcById[selectedAgentContact.id] ?? null)
    : null;

  const handleProjectChange = useCallback(
    (projectId: string) => {
      const next = codebaseProjects.find((entry) => entry.id === projectId);
      if (!next) return;
      if (next.id !== selectedProject?.id) {
        setSelectedProject(next);
        openFileTask(next);
      }
      // After Enter/click selection, return to the brief for typing.
      queueMicrotask(() => {
        window.requestAnimationFrame(() => {
          focusBrief();
        });
      });
    },
    [codebaseProjects, focusBrief, openFileTask, selectedProject?.id],
  );

  const handleAgentChange = useCallback(
    (agentId: string) => {
      setSelectedAgentId(agentId);
      window.requestAnimationFrame(() => {
        getTaskPropertyDropdownTrigger("agent", modalRef.current)?.focus({
          preventScroll: true,
        });
      });
    },
    [setSelectedAgentId],
  );

  const hasAgentChip = agents.length > 0;

  const focusFileTaskField = useCallback(
    (field: FileTaskTabField) => {
      const scope = modalRef.current;
      switch (field) {
        case "brief":
          textareaRef.current?.focus();
          return;
        case "project":
          openTaskPropertyDropdown("project", scope);
          return;
        case "agent":
          if (!hasAgentChip) {
            textareaRef.current?.focus();
            return;
          }
          openTaskPropertyDropdown("agent", scope);
          return;
      }
    },
    [hasAgentChip],
  );

  const advanceFileTaskTab = useCallback(
    (from: FileTaskTabField) => {
      const next = getNextFileTaskTabField(from, { hasAgent: hasAgentChip });
      // Wait a frame so a just-closed menu finishes teardown before opening the next.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          focusFileTaskField(next);
        });
      });
    },
    [focusFileTaskField, hasAgentChip],
  );

  const retreatFileTaskTab = useCallback(
    (from: FileTaskTabField) => {
      const previous = getPreviousFileTaskTabField(from, { hasAgent: hasAgentChip });
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          focusFileTaskField(previous);
        });
      });
    },
    [focusFileTaskField, hasAgentChip],
  );

  const canSend =
    brief.trim().length > 0 &&
    !submitting &&
    selectedProject != null &&
    selectedAgent != null &&
    selectedAgent.webhookUrl.trim().length > 0 &&
    selectedAgent.webhookKey.trim().length > 0;

  const handleSend = useCallback(async () => {
    if (!selectedProject || !selectedAgent || !canSend) return;

    const requestId = randomUUID();

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const mailbox = await registerBacksterosFileTaskCallback(requestId);
      await wakeFileTaskAgent({
        webhookUrl: selectedAgent.webhookUrl,
        webhookKey: selectedAgent.webhookKey,
        payload: {
          brief: brief.trim(),
          projectId: selectedProject.id,
          projectKey: selectedProject.key,
          assigneeId: DEFAULT_FILE_TASK_ASSIGNEE_ID,
          priority: 3,
          status: "backlog",
          requestId,
          callbackUrl: mailbox.callbackUrl,
        },
      });

      markCreating({
        requestId,
        agentName: selectedAgent.name.trim() || "Agent",
        projectKey: selectedProject.key,
        projectName: selectedProject.name,
        briefPreview: brief.trim().slice(0, 120),
        startedAt: Date.now(),
      });
      startFileTaskCallbackWatch(requestId);
      setBrief("");
      setErrorMessage(null);
      setPhase("brief");
      closeFileTask();
    } catch (error) {
      const message = error instanceof Error ? error.message : "An error occurred.";
      setPhase("error");
      setErrorMessage(message);
      toastManager.add({
        type: "error",
        title: "Could not file via agent",
        description: message,
      });
    } finally {
      setSubmitting(false);
    }
  }, [brief, canSend, closeFileTask, markCreating, selectedAgent, selectedProject]);

  const handleBriefKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Tab" && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        retreatFileTaskTab("brief");
        return;
      }
      if (!isFileTaskSubmitShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      void handleSend();
    },
    [handleSend, retreatFileTaskTab],
  );

  // ⌘/Ctrl+Enter from anywhere in the modal wakes the webhook only — capture
  // + stopImmediatePropagation so chat kickoff / composer submit cannot fire.
  useEffect(() => {
    if (!initialProject) return;

    function handleSubmitShortcut(event: KeyboardEvent) {
      if (!isFileTaskSubmitShortcut(event)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (canSend) void handleSend();
    }

    window.addEventListener("keydown", handleSubmitShortcut, true);
    return () => window.removeEventListener("keydown", handleSubmitShortcut, true);
  }, [canSend, handleSend, initialProject]);

  // Tab / Shift+Tab between chips when menus are closed (after a selection).
  // Open menus own Tab via their search-field handlers.
  useEffect(() => {
    if (!initialProject) return;

    function handleChipTab(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isBacksterosPropertyMenuOpen()) return;

      const active = document.activeElement;
      if (!(active instanceof Element)) return;

      const field = fileTaskTabFieldFromDropdownId(
        active
          .closest("[data-task-property-dropdown]")
          ?.getAttribute("data-task-property-dropdown"),
      );
      if (!field) return;

      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) {
        retreatFileTaskTab(field);
      } else {
        advanceFileTaskTab(field);
      }
    }

    window.addEventListener("keydown", handleChipTab, true);
    return () => window.removeEventListener("keydown", handleChipTab, true);
  }, [advanceFileTaskTab, initialProject, retreatFileTaskTab]);

  const handleBriefSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void handleSend();
    },
    [handleSend],
  );

  if (!initialProject || !selectedProject || typeof document === "undefined") return null;

  return createPortal(
    <div className="bos-file-task-modal-root" data-blocking-modal="">
      <button
        type="button"
        className="bos-file-task-modal-overlay"
        aria-label="Close file task"
        onClick={() => {
          closeFileTask();
        }}
      />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogLabelId}
        className="bos-file-task-modal-dialog"
        data-file-task-modal=""
      >
        <BorderBeam size="md" colorVariant="ocean" strength={0.7} theme="auto" borderRadius={14}>
          <div className="bos-file-task-modal-shell">
            <span id={dialogLabelId} className="bos-file-task-dialog-label">
              File as BacksterOS task
            </span>

            <form className="bos-compose-modal-body" onSubmit={handleBriefSubmit}>
              <div className="bos-compose-modal-header bos-file-task-header-chips">
                {agents.length > 0 ? (
                  <BacksterosSearchablePropertyMenu
                    label={selectedAgent?.name.trim() || "Agent"}
                    value={selectedAgent?.id ?? ""}
                    options={agentOptions}
                    searchPlaceholder="Set agent…"
                    ariaLabel="Agent"
                    disabled={submitting || agents.length === 0}
                    taskPropertyDropdownId="agent"
                    icon={<BacksterosEntityAvatarIcon src={selectedAgentAvatarSrc} size={12} />}
                    onChange={handleAgentChange}
                    onTabFromSearch={() => advanceFileTaskTab("agent")}
                    onShiftTabFromSearch={() => retreatFileTaskTab("agent")}
                    onEscapeFromSearch={focusBrief}
                  />
                ) : null}
                <BacksterosSearchablePropertyMenu
                  label={selectedProject.name}
                  value={selectedProject.id}
                  options={projectOptions}
                  searchPlaceholder="Set project…"
                  ariaLabel="Project"
                  disabled={submitting}
                  taskPropertyDropdownId="project"
                  icon={
                    <ProjectOcticon
                      icon={selectedProject.icon}
                      type={selectedProject.type}
                      size={12}
                      className="shrink-0 opacity-70"
                    />
                  }
                  onChange={handleProjectChange}
                  onTabFromSearch={() => advanceFileTaskTab("project")}
                  onShiftTabFromSearch={() => retreatFileTaskTab("project")}
                  onEscapeFromSearch={focusBrief}
                />
              </div>

              {agents.length === 0 ? (
                <div className="bos-file-task-warning" role="status">
                  Add a Grok Bot agent under Settings → Integrations (webhook URL + key), then
                  reopen this modal.
                </div>
              ) : null}

              {phase === "error" && errorMessage ? (
                <div className="bos-file-task-warning" role="alert">
                  {errorMessage}
                </div>
              ) : null}

              <div className="bos-file-task-composer-row">
                <textarea
                  ref={textareaRef}
                  className="bos-file-task-textarea"
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  onKeyDown={handleBriefKeyDown}
                  placeholder="Describe the work to file…"
                  rows={5}
                  aria-label="Task brief"
                  disabled={submitting}
                />
                <button
                  type="submit"
                  className="bos-file-task-send"
                  disabled={!canSend}
                  aria-label="Send to agent"
                >
                  <FileTaskSendIcon />
                </button>
              </div>
            </form>
          </div>
        </BorderBeam>
      </div>
    </div>,
    document.body,
  );
}

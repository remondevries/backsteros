"use client";

import { DotScrollLoader, SidebarChevronIcon } from "@backsteros/ui";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { RunApplicationIcon } from "@/components/panel-icons";
import {
  getProjectRunCommand,
  setProjectRunCommand,
} from "@/lib/project-run-commands";

type Props = {
  projectId: string;
  cwd: string | null;
  applicationFullscreen: boolean;
  onToggleFullscreen: () => void;
  onEnterFullscreen: () => void;
};

export function ConsoleRunApplicationButton({
  projectId,
  cwd,
  applicationFullscreen,
  onToggleFullscreen,
  onEnterFullscreen,
}: Props) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draftCommand, setDraftCommand] = useState("");
  const [savedCommand, setSavedCommand] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    const command = getProjectRunCommand(projectId);
    setSavedCommand(command);
    setDraftCommand(command);
    setMenuOpen(false);
    setRunError(null);
  }, [projectId]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node)) return;
      if (!root.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [menuOpen]);

  const saveDraft = useCallback(() => {
    setProjectRunCommand(projectId, draftCommand);
    const next = getProjectRunCommand(projectId);
    setSavedCommand(next);
    setDraftCommand(next);
    setRunError(null);
    setMenuOpen(false);
  }, [draftCommand, projectId]);

  const runSavedCommand = useCallback(async () => {
    const command = savedCommand.trim();
    if (!command) {
      setMenuOpen(true);
      return;
    }
    if (!cwd) {
      setRunError("Set a project working directory first.");
      setMenuOpen(true);
      return;
    }
    if (running) return;

    setRunError(null);
    setRunning(true);
    if (!applicationFullscreen) {
      onEnterFullscreen();
    }

    try {
      const response = await fetch("/api/run-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, cwd }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        ok?: boolean;
      } | null;
      if (!response.ok || payload?.ok === false) {
        setRunError(
          payload?.error?.trim() || `Command failed (${response.status}).`,
        );
        setMenuOpen(true);
      }
    } catch (error) {
      setRunError(
        error instanceof Error ? error.message : "Failed to run command.",
      );
      setMenuOpen(true);
    } finally {
      setRunning(false);
    }
  }, [
    applicationFullscreen,
    cwd,
    onEnterFullscreen,
    running,
    savedCommand,
  ]);

  const showExitLabel = applicationFullscreen && !running;
  const mainLabel = running
    ? "Running…"
    : showExitLabel
      ? "Exit Fullscreen"
      : "Run Application";

  return (
    <div
      ref={rootRef}
      className={`console-run-application-split${menuOpen ? " is-open" : ""}${
        applicationFullscreen ? " is-fullscreen" : ""
      }${running ? " is-running" : ""}`}
    >
      <button
        type="button"
        className="console-run-application-btn console-run-application-btn--split-main"
        onClick={() => {
          if (running) return;
          if (showExitLabel) {
            onToggleFullscreen();
            return;
          }
          void runSavedCommand();
        }}
        disabled={running}
        title={
          running
            ? "Running command…"
            : showExitLabel
              ? "Exit fullscreen"
              : savedCommand.trim()
                ? `Run: ${savedCommand.trim()}`
                : "Run Application — set a command in the menu"
        }
        aria-label={
          running
            ? "Running command"
            : showExitLabel
              ? "Exit fullscreen"
              : "Run Application"
        }
        aria-pressed={applicationFullscreen}
        aria-busy={running || undefined}
      >
        {running ? (
          <DotScrollLoader
            squareDots
            status="working"
            className="console-run-application-loader"
            aria-label="Running command"
          />
        ) : (
          <RunApplicationIcon size={14} />
        )}
        <span>{mainLabel}</span>
      </button>
      <button
        type="button"
        className="console-run-application-split-chevron"
        disabled={running}
        aria-label="Configure run command"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        title="Configure run command"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setMenuOpen((open) => !open);
        }}
      >
        <SidebarChevronIcon pointing="down" expanded={menuOpen} />
      </button>
      {menuOpen ? (
        <div
          id={menuId}
          className="console-run-application-menu"
          role="dialog"
          aria-label="Run command"
        >
          <label
            className="console-run-application-menu-label"
            htmlFor={`${menuId}-command`}
          >
            Build / run command
          </label>
          <textarea
            ref={textareaRef}
            id={`${menuId}-command`}
            className="console-run-application-menu-textarea"
            rows={3}
            spellCheck={false}
            placeholder="e.g. pnpm build"
            value={draftCommand}
            onChange={(event) => setDraftCommand(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                saveDraft();
              }
            }}
          />
          {runError ? (
            <p className="console-run-application-menu-error" role="alert">
              {runError}
            </p>
          ) : null}
          <div className="console-run-application-menu-actions">
            <button
              type="button"
              className="console-run-application-menu-save"
              onClick={saveDraft}
            >
              Save
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

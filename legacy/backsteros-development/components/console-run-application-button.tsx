"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { createPortal } from "react-dom";

import {
  ProjectsSidePanelIcon,
  RunApplicationIcon,
  StopApplicationIcon,
} from "@/components/panel-icons";
import {
  getProjectRunCommand,
  setProjectRunCommand,
} from "@/lib/project-run-commands";
import {
  getProjectRunSession,
  startProjectRunSession,
  stopProjectRunSession,
  subscribeProjectRunSession,
  type ProjectRunExit,
  type ProjectRunSession,
} from "@/lib/project-run-sessions";

export type RunApplicationPanelApi = {
  toggle: () => void;
  close: () => void;
  /**
   * Escape while the run terminal panel is open and a command is running:
   * same as clicking Running → Shut down, then show the build command editor.
   * Returns true when handled (callers should stopImmediatePropagation).
   */
  handleEscape: () => boolean;
};

type Props = {
  projectId: string;
  cwd: string | null;
  /** Optional handle so the shell can toggle this panel (⇧T). */
  panelApiRef?: MutableRefObject<RunApplicationPanelApi | null>;
};

const PANEL_MOTION_MS = 240;
const PANEL_INSET = 12;
const PANEL_WIDTH = 380;

type PanelBounds = {
  top: number;
  right: number;
  bottom: number;
  width: number;
};

export function ConsoleRunApplicationButton({
  projectId,
  cwd,
  panelApiRef,
}: Props) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLPreElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelBounds, setPanelBounds] = useState<PanelBounds | null>(null);
  const [draftCommand, setDraftCommand] = useState("");
  const [savedCommand, setSavedCommand] = useState("");
  const [session, setSession] = useState<ProjectRunSession>(() =>
    getProjectRunSession(projectId),
  );
  const [configError, setConfigError] = useState<string | null>(null);
  /** When false, side panel shows terminal output; when true, the command editor. */
  const [editingCommand, setEditingCommand] = useState(true);
  const [panelShown, setPanelShown] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);
  const [mainHovered, setMainHovered] = useState(false);

  const running = session.running;
  const runOutput = session.output;
  const runExit: ProjectRunExit | null = session.exit;
  const runError = configError ?? session.error;
  const stopped = Boolean(runExit?.aborted);
  const hasOutputSession = Boolean(runOutput) || running || Boolean(runExit);
  // Never show the output/"Stopped" view after a user stop — always the
  // build-command editor. While running, always show the live terminal.
  const showTerminal = stopped
    ? false
    : running
      ? true
      : !editingCommand;
  /** Panel painted on screen (not mid open/close animation). */
  const panelVisible = panelOpen && panelShown && !panelClosing;

  const panelOpenRef = useRef(panelOpen);
  const panelClosingRef = useRef(panelClosing);
  const editingCommandRef = useRef(editingCommand);
  const runningRef = useRef(running);
  panelOpenRef.current = panelOpen;
  panelClosingRef.current = panelClosing;
  editingCommandRef.current = editingCommand;
  runningRef.current = running;

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const sync = () => setSession(getProjectRunSession(projectId));
    sync();
    return subscribeProjectRunSession(projectId, sync);
  }, [projectId]);

  useEffect(() => {
    const command = getProjectRunCommand(projectId);
    const next = getProjectRunSession(projectId);
    setSavedCommand(command);
    setDraftCommand(command);
    setPanelOpen(false);
    setPanelShown(false);
    setPanelClosing(false);
    setPanelBounds(null);
    setConfigError(null);
    // Aborted sessions always open on the editor, never the "Stopped" output.
    setEditingCommand(
      !next.running && (!next.exit || Boolean(next.exit.aborted)),
    );
    setMainHovered(false);
    clearCloseTimer();
  }, [clearCloseTimer, projectId]);

  // Any stop (Escape, Shut down button, abort) → edit-command view.
  useEffect(() => {
    if (stopped && !running) {
      setEditingCommand(true);
      editingCommandRef.current = true;
    }
  }, [running, stopped]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, [clearCloseTimer]);

  const updatePanelBounds = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const chrome =
      root.closest(".console-content-chrome") ??
      root.closest(".console-pane-header");
    const frame =
      root.closest(".console-content-frame") ??
      root.closest(".workspace");
    const chromeRect = chrome?.getBoundingClientRect();
    const frameRect = frame?.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    const contentLeft = frameRect?.left ?? 0;
    const contentRight = frameRect?.right ?? viewportW;
    const contentBottom = frameRect?.bottom ?? viewportH;
    const contentTop = Math.max(
      chromeRect?.bottom ?? frameRect?.top ?? 0,
      frameRect?.top ?? 0,
    );

    const width = Math.min(
      PANEL_WIDTH,
      Math.max(240, contentRight - contentLeft - PANEL_INSET * 2),
    );

    setPanelBounds({
      top: Math.round(contentTop + PANEL_INSET),
      right: Math.round(viewportW - contentRight + PANEL_INSET),
      bottom: Math.round(viewportH - contentBottom + PANEL_INSET),
      width: Math.round(width),
    });
  }, []);

  const finishClose = useCallback(() => {
    clearCloseTimer();
    setPanelOpen(false);
    setPanelShown(false);
    setPanelClosing(false);
    setPanelBounds(null);
  }, [clearCloseTimer]);

  const closePanel = useCallback(() => {
    if (!panelOpen || panelClosing) return;
    setPanelShown(false);
    setPanelClosing(true);
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      finishClose();
    }, PANEL_MOTION_MS + 40);
  }, [clearCloseTimer, finishClose, panelClosing, panelOpen]);

  const openPanel = useCallback(
    (options?: { edit?: boolean }) => {
      clearCloseTimer();
      setPanelClosing(false);
      if (options?.edit != null) {
        setEditingCommand(options.edit);
      }
      setPanelOpen(true);
    },
    [clearCloseTimer],
  );

  const togglePanel = useCallback(() => {
    if (panelOpen) {
      closePanel();
      return;
    }
    if (running) {
      openPanel({ edit: false });
      return;
    }
    // Stopped / aborted → editor. Natural exit with output → output view.
    if (hasOutputSession && !stopped) {
      openPanel({ edit: false });
      return;
    }
    openPanel({ edit: true });
  }, [
    closePanel,
    hasOutputSession,
    openPanel,
    panelOpen,
    running,
    stopped,
  ]);

  useLayoutEffect(() => {
    if (!panelOpen) {
      setPanelShown(false);
      return;
    }
    updatePanelBounds();
    const onReposition = () => updatePanelBounds();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [panelOpen, updatePanelBounds]);

  // Enter slide from the right: paint off-screen first, then show.
  useLayoutEffect(() => {
    if (!panelOpen || panelClosing) {
      return;
    }
    setPanelShown(false);
    let frame2 = 0;
    const frame1 = window.requestAnimationFrame(() => {
      frame2 = window.requestAnimationFrame(() => {
        setPanelShown(true);
      });
    });
    return () => {
      window.cancelAnimationFrame(frame1);
      window.cancelAnimationFrame(frame2);
    };
  }, [panelClosing, panelOpen]);

  const stopRunning = useCallback(() => {
    stopProjectRunSession(projectId);
    // Shut down always returns to the build-command editor (never "Stopped").
    runningRef.current = false;
    editingCommandRef.current = true;
    setEditingCommand(true);
    setConfigError(null);
  }, [projectId]);

  /**
   * Escape → Shut down (same as the Running button) when the right-hand run
   * terminal is open and a build is in progress; then show the command editor.
   */
  const handleEscape = useCallback((): boolean => {
    // Right-hand run panel open on the terminal view, command currently running
    // → same as clicking Running / Shut down, then return to the build editor.
    const terminalOpen =
      panelOpenRef.current &&
      !panelClosingRef.current &&
      (runningRef.current || !editingCommandRef.current);
    if (!terminalOpen || !runningRef.current) {
      return false;
    }
    stopRunning();
    return true;
  }, [stopRunning]);

  useEffect(() => {
    if (!panelApiRef) return;
    panelApiRef.current = {
      toggle: togglePanel,
      close: closePanel,
      handleEscape,
    };
    return () => {
      panelApiRef.current = null;
    };
  }, [closePanel, handleEscape, panelApiRef, togglePanel]);

  useEffect(() => {
    if (!panelOpen || panelClosing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (handleEscape()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      // Editor (or idle output): Escape closes the panel.
      if (editingCommandRef.current || !runningRef.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closePanel();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      if (rootRef.current?.contains(target)) return;
      closePanel();
    };
    // window + capture so we win over document listeners; shell also calls
    // handleEscape early via panelApiRef for other window capture handlers.
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [closePanel, handleEscape, panelClosing, panelOpen]);

  useEffect(() => {
    if (!panelOpen || showTerminal || panelClosing) return;
    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [panelClosing, panelOpen, showTerminal]);

  useEffect(() => {
    const node = outputRef.current;
    if (!node || !showTerminal) return;
    node.scrollTop = node.scrollHeight;
  }, [runOutput, running, panelOpen, showTerminal]);

  const saveDraft = useCallback(() => {
    setProjectRunCommand(projectId, draftCommand);
    const next = getProjectRunCommand(projectId);
    setSavedCommand(next);
    setDraftCommand(next);
    setConfigError(null);
    return next.trim();
  }, [draftCommand, projectId]);

  const runCommand = useCallback(
    async (command: string) => {
      const trimmed = command.trim();
      if (!trimmed) {
        setConfigError("Enter a command to run.");
        openPanel({ edit: true });
        return;
      }
      if (!cwd) {
        setConfigError("Set a project working directory first.");
        openPanel({ edit: true });
        return;
      }
      if (running) return;

      setConfigError(null);
      openPanel({ edit: false });
      const result = await startProjectRunSession({
        projectId,
        command: trimmed,
        cwd,
      });
      if (!result.ok) {
        setConfigError(result.error);
        openPanel({ edit: true });
      }
    },
    [cwd, openPanel, projectId, running],
  );

  const runSavedCommand = useCallback(async () => {
    await runCommand(savedCommand);
  }, [runCommand, savedCommand]);

  const runDraftCommand = useCallback(async () => {
    const command = saveDraft();
    await runCommand(command);
  }, [runCommand, saveDraft]);

  const mainLabel = running
    ? mainHovered
      ? "Shut down..."
      : "Running…"
    : "Run Application";
  const showShutDown = running && mainHovered;
  const displayCommand = session.command || savedCommand;
  const runShortcutLabel =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform)
      ? "⌘↵"
      : "Ctrl↵";

  const panel =
    panelOpen && panelBounds && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className={`console-run-application-panel${
              panelShown ? " is-shown" : ""
            }${panelClosing ? " is-closing" : ""}`}
            role="dialog"
            aria-label={showTerminal ? "Command output" : "Run command"}
            style={{
              top: panelBounds.top,
              right: panelBounds.right,
              bottom: panelBounds.bottom,
              width: panelBounds.width,
            }}
          >
            {showTerminal ? (
              <div
                key="run-terminal"
                className="console-run-application-panel-terminal"
              >
                <div className="console-run-application-menu-chrome">
                  <div className="console-run-application-menu-label-row">
                    <span className="console-run-application-menu-label">
                      {running ? "Running" : "Output"}
                    </span>
                    <code
                      className="console-run-application-menu-command"
                      title={displayCommand}
                    >
                      {displayCommand}
                    </code>
                  </div>
                  <div className="console-run-application-menu-actions">
                    {running ? null : (
                      <button
                        type="button"
                        className="console-run-application-menu-secondary"
                        onClick={() => {
                          setEditingCommand(true);
                          setConfigError(null);
                        }}
                      >
                        Edit command
                      </button>
                    )}
                  </div>
                </div>
                <pre
                  ref={outputRef}
                  className="console-run-application-menu-output"
                  aria-live="polite"
                >
                  {runOutput || (running ? "Starting…" : "No output.")}
                </pre>
                {runError ? (
                  <p
                    className="console-run-application-menu-error"
                    role="alert"
                  >
                    {runError}
                  </p>
                ) : null}
                {runExit ? (
                  <p
                    className={`console-run-application-menu-status${
                      runExit.aborted
                        ? " is-aborted"
                        : runExit.code === 0
                          ? " is-ok"
                          : " is-failed"
                    }`}
                  >
                    {runExit.aborted
                      ? "Stopped"
                      : runExit.code === 0
                        ? "Exited 0"
                        : `Exited ${runExit.code ?? runExit.signal ?? "?"}`}
                  </p>
                ) : null}
              </div>
            ) : (
              <div
                key="run-editor"
                className="console-run-application-panel-editor"
              >
                <textarea
                  ref={textareaRef}
                  id={`${menuId}-command`}
                  className="console-run-application-menu-textarea"
                  rows={8}
                  spellCheck={false}
                  placeholder="e.g. pnpm build"
                  value={draftCommand}
                  onChange={(event) => setDraftCommand(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      (event.metaKey || event.ctrlKey) &&
                      event.key === "Enter"
                    ) {
                      event.preventDefault();
                      void runDraftCommand();
                    }
                  }}
                />
                {runError ? (
                  <p
                    className="console-run-application-menu-error"
                    role="alert"
                  >
                    {runError}
                  </p>
                ) : null}
                <div className="console-run-application-panel-editor-footer">
                  <div className="console-run-application-panel-editor-footer-copy">
                    <span className="console-run-application-panel-editor-hint">
                      Run the command
                    </span>
                    {hasOutputSession && !stopped ? (
                      <button
                        type="button"
                        className="console-run-application-menu-secondary"
                        onClick={() => setEditingCommand(false)}
                      >
                        View output
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="console-run-application-menu-run"
                    onClick={() => {
                      void runDraftCommand();
                    }}
                  >
                    Run
                    <kbd className="console-run-application-menu-run-kbd">
                      {runShortcutLabel}
                    </kbd>
                  </button>
                </div>
              </div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className={`console-run-application-split${panelOpen ? " is-open" : ""}${
        running ? " is-running" : ""
      }`}
    >
      <button
        type="button"
        className={`console-run-application-btn console-run-application-btn--split-main${
          showShutDown ? " is-shut-down" : ""
        }`}
        onClick={() => {
          if (running) {
            stopRunning();
            return;
          }
          void runSavedCommand();
        }}
        onMouseEnter={() => setMainHovered(true)}
        onMouseLeave={() => setMainHovered(false)}
        onFocus={() => setMainHovered(true)}
        onBlur={() => setMainHovered(false)}
        title={
          running
            ? "Shut down..."
            : savedCommand.trim()
              ? `Run: ${savedCommand.trim()}`
              : "Run Application — set a command in the side panel"
        }
        aria-label={running ? "Shut down" : "Run Application"}
        aria-busy={running || undefined}
      >
        {showShutDown ? (
          <StopApplicationIcon
            size={14}
            className="console-run-application-icon is-shut-down"
          />
        ) : (
          <RunApplicationIcon
            size={14}
            className={
              running ? "console-run-application-icon is-running" : undefined
            }
          />
        )}
        <span>{mainLabel}</span>
      </button>
      <button
        type="button"
        className="console-run-application-split-chevron"
        aria-label={
          running || hasOutputSession
            ? "Toggle run side panel"
            : "Configure run command"
        }
        aria-haspopup="dialog"
        aria-expanded={panelVisible}
        aria-controls={panelOpen ? menuId : undefined}
        title={
          running || hasOutputSession
            ? "Toggle run side panel"
            : "Configure run command"
        }
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          togglePanel();
        }}
      >
        <ProjectsSidePanelIcon
          size={14}
          collapsed={!panelVisible}
          rail="end"
        />
      </button>
      {panel}
    </div>
  );
}

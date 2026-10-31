"use client";

import type { Project as ApiProject, ProjectChannel } from "@backsteros/contracts";
import {
  isGrokBotChannelUri,
  normalizeProjectChannel,
  projectChannelDisplayName,
  projectChannelSchemeFromUri,
} from "@backsteros/contracts";
import { LinkExternalIcon, PencilIcon } from "@primer/octicons-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import { XaiMarkIcon } from "../icons/xai-mark-icon.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import { apiErrorMessage } from "./api-error-message.js";
import type { CodebaseRequestJson } from "./codebase-request-json.js";

function parseProjectChannel(project: ApiProject): ProjectChannel | null {
  const raw = (project as { channel?: unknown }).channel;
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return normalizeProjectChannel(JSON.parse(raw) as ProjectChannel);
    } catch {
      return normalizeProjectChannel(raw);
    }
  }
  return normalizeProjectChannel(raw as ProjectChannel);
}

async function openProjectChannelUri(uri: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(uri);
    return;
  } catch {
    // Fall through for web / opener unavailable.
  }
  const anchor = document.createElement("a");
  anchor.href = uri;
  anchor.rel = "noopener noreferrer";
  anchor.target = "_blank";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

const PANEL_WIDTH = 300;
const PANEL_GAP = 6;
const VIEWPORT_PADDING = 8;

export type ProjectChannelFieldProps = {
  project: ApiProject;
  onProjectUpdated: (project: ApiProject) => void;
  requestJson: CodebaseRequestJson;
};

/**
 * Locations → Channel badge. Never shows the raw URI.
 * Click opens the room; pencil opens a paste-link + name popover.
 */
export function ProjectChannelField({
  project,
  onProjectUpdated,
  requestJson,
}: ProjectChannelFieldProps) {
  const channel = parseProjectChannel(project);
  const [editorOpen, setEditorOpen] = useState(false);
  const [uriDraft, setUriDraft] = useState(channel?.uri ?? "");
  const [nameDraft, setNameDraft] = useState(channel?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    visibility: "hidden",
  });

  const triggerId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const uriInputRef = useRef<HTMLInputElement>(null);

  const isGrok = isGrokBotChannelUri(channel?.uri);
  const label = projectChannelDisplayName(channel);
  const scheme = projectChannelSchemeFromUri(channel?.uri);
  const hasChannel = Boolean(channel?.uri);

  useEffect(() => {
    if (!editorOpen) {
      setUriDraft(channel?.uri ?? "");
      setNameDraft(channel?.name ?? "");
      setError(null);
    }
  }, [editorOpen, channel?.uri, channel?.name]);

  useEffect(() => {
    if (!editorOpen) return;
    const frame = window.requestAnimationFrame(() => {
      uriInputRef.current?.focus();
      uriInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editorOpen]);

  const updatePosition = useCallback(() => {
    const trigger = rootRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const rect = trigger.getBoundingClientRect();
    const panelHeight = panel.offsetHeight || 180;
    let top = rect.bottom + PANEL_GAP;
    if (top + panelHeight > window.innerHeight - VIEWPORT_PADDING) {
      top = Math.max(
        VIEWPORT_PADDING,
        rect.top - PANEL_GAP - panelHeight,
      );
    }
    let left = rect.left;
    if (left + PANEL_WIDTH > window.innerWidth - VIEWPORT_PADDING) {
      left = Math.max(
        VIEWPORT_PADDING,
        rect.right - PANEL_WIDTH,
      );
    }
    setPanelStyle({
      position: "fixed",
      top,
      left,
      width: PANEL_WIDTH,
      zIndex: 1200,
      visibility: "visible",
    });
  }, []);

  useLayoutEffect(() => {
    if (!editorOpen) return;
    updatePosition();
  }, [editorOpen, updatePosition]);

  useEffect(() => {
    if (!editorOpen) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setEditorOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setEditorOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [editorOpen, updatePosition]);

  async function saveChannel(next: ProjectChannel | null) {
    setSaving(true);
    setError(null);
    const previous = project;
    try {
      onProjectUpdated({
        ...project,
        channel: next,
        updatedAt: new Date().toISOString(),
      });
      const updated = await requestJson<ApiProject>(
        `/api/v1/projects/${encodeURIComponent(project.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: next }),
        },
      );
      onProjectUpdated({
        ...updated,
        channel: next ?? updated.channel ?? null,
      });
      setEditorOpen(false);
    } catch (err) {
      onProjectUpdated(previous);
      setError(apiErrorMessage(err) || "Could not save Channel.");
    } finally {
      setSaving(false);
    }
  }

  function submitEditor() {
    const uri = uriDraft.trim();
    if (!uri) {
      void saveChannel(null);
      return;
    }
    const next = normalizeProjectChannel({
      uri,
      name: nameDraft.trim() || null,
    });
    if (!next) {
      setError(
        "Paste a valid link (e.g. grokbot://app/v1/agent?id=<uuid>).",
      );
      return;
    }
    void saveChannel(next);
  }

  const icon = isGrok ? (
    <XaiMarkIcon size={14} className="project-channel-badge__mark" />
  ) : (
    <ProjectOcticon icon="comment-discussion" size={14} />
  );

  const panel =
    editorOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            className="searchable-dropdown-panel project-channel-panel"
            style={panelStyle}
            role="dialog"
            aria-label="Edit Channel"
            data-searchable-dropdown-panel=""
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="project-channel-panel__body">
              <label className="project-channel-panel__field">
                <span className="project-channel-panel__label">Link</span>
                <input
                  ref={uriInputRef}
                  type="text"
                  className="project-channel-panel__input"
                  value={uriDraft}
                  placeholder="grokbot://app/v1/agent?id=…"
                  spellCheck={false}
                  autoComplete="off"
                  disabled={saving}
                  onChange={(event) => {
                    setUriDraft(event.target.value);
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitEditor();
                    }
                  }}
                />
              </label>
              <label className="project-channel-panel__field">
                <span className="project-channel-panel__label">Name</span>
                <input
                  type="text"
                  className="project-channel-panel__input"
                  value={nameDraft}
                  placeholder={
                    isGrokBotChannelUri(uriDraft.trim())
                      ? "Grok Bot room"
                      : "Optional display name"
                  }
                  spellCheck={false}
                  autoComplete="off"
                  disabled={saving}
                  onChange={(event) => {
                    setNameDraft(event.target.value);
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitEditor();
                    }
                  }}
                />
              </label>
              {error ? (
                <p className="project-channel-panel__error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="project-channel-panel__actions">
                {hasChannel ? (
                  <button
                    type="button"
                    className="project-channel-panel__clear"
                    disabled={saving}
                    onClick={() => {
                      void saveChannel(null);
                    }}
                  >
                    Clear
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  className="project-channel-panel__save"
                  disabled={saving}
                  onClick={() => {
                    submitEditor();
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  if (!hasChannel) {
    return (
      <div ref={rootRef} className="project-channel-field">
        <button
          type="button"
          id={triggerId}
          className="property-dropdown-trigger property-dropdown-trigger--inline-chip is-muted project-channel-badge"
          aria-haspopup="dialog"
          aria-expanded={editorOpen}
          onClick={() => setEditorOpen(true)}
        >
          <span className="property-dropdown-trigger__icon" aria-hidden="true">
            <ProjectOcticon icon="comment-discussion" size={14} />
          </span>
          <span className="property-dropdown-trigger__label">Set channel…</span>
        </button>
        {panel}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="project-channel-field">
      <div
        className={[
          "project-channel-badge",
          isGrok ? "project-channel-badge--grokbot" : null,
          scheme && !isGrok ? "project-channel-badge--neutral" : null,
          editorOpen ? "is-open" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <button
          type="button"
          className="project-channel-badge__open-btn"
          title={`Open ${label}`}
          aria-label={`Open ${label}`}
          onClick={() => {
            void openProjectChannelUri(channel!.uri);
          }}
        >
          <span className="project-channel-badge__icon" aria-hidden="true">
            {icon}
          </span>
          <span className="project-channel-badge__label">{label}</span>
          <span className="project-channel-badge__affordance" aria-hidden="true">
            <LinkExternalIcon size={12} />
          </span>
        </button>
        <button
          type="button"
          id={triggerId}
          className="project-channel-badge__edit"
          title="Edit channel"
          aria-label="Edit channel"
          aria-haspopup="dialog"
          aria-expanded={editorOpen}
          onClick={() => setEditorOpen((open) => !open)}
        >
          <PencilIcon size={12} />
        </button>
      </div>
      {panel}
    </div>
  );
}

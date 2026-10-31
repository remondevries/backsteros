"use client";

import type { ProjectChannel, ProjectChannelStatus } from "@backsteros/contracts";
import {
  isGrokBotChannelUri,
  isProjectChannelPendingLink,
  normalizeProjectChannel,
} from "@backsteros/contracts";
import { SyncIcon, XIcon } from "@primer/octicons-react";
import { useEffect, useRef, useState } from "react";

import { XaiMarkIcon } from "../icons/xai-mark-icon.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import { apiErrorMessage } from "./api-error-message.js";
import type { CodebaseRequestJson } from "./codebase-request-json.js";
import { startProjectChannelConnect } from "./project-channel-connect.js";

/** Connecting times out to Inactive after 10 minutes with a retry. */
export const CHANNEL_CONNECT_TIMEOUT_MS = 10 * 60 * 1000;

export type ProjectChannelFieldProject = {
  id: string;
  channel?: ProjectChannel | string | null;
  channelStatus?: ProjectChannelStatus | string | null;
  channelPendingLink?: string | null;
  channelRequestedAt?: string | null;
  updatedAt?: string;
};

function parseProjectChannel(
  project: ProjectChannelFieldProject,
): ProjectChannel | null {
  const raw = project.channel;
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

function resolveChannelStatus(
  project: ProjectChannelFieldProject,
  channel: ProjectChannel | null,
): ProjectChannelStatus {
  const raw = project.channelStatus?.trim();
  if (
    raw === "inactive" ||
    raw === "connecting" ||
    raw === "needs_details" ||
    raw === "active"
  ) {
    return raw;
  }
  return channel?.uri ? "active" : "inactive";
}

function isConnectTimedOut(requestedAt: string | null | undefined): boolean {
  if (!requestedAt) return false;
  const ms = Date.parse(requestedAt);
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms >= CHANNEL_CONNECT_TIMEOUT_MS;
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

export type ProjectChannelFieldProps = {
  project: ProjectChannelFieldProject;
  onProjectUpdated: (project: ProjectChannelFieldProject) => void;
  requestJson: CodebaseRequestJson;
  /** Open a chat deep link (`backsteros://chat/…` or `/chat/…`). */
  onOpenChatDeepLink?: ((href: string) => void) | null;
};

/**
 * Locations → Channel connect badge.
 * Inactive → Connecting… → Needs details → Active (pulsing green).
 */
export function ProjectChannelField({
  project,
  onProjectUpdated,
  requestJson,
  onOpenChatDeepLink = null,
}: ProjectChannelFieldProps) {
  const channel = parseProjectChannel(project);
  const status = resolveChannelStatus(project, channel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const timedOutConnecting =
    status === "connecting" && isConnectTimedOut(project.channelRequestedAt);

  useEffect(() => {
    if (status !== "connecting" || timedOutConnecting) return;
    const handle = window.setInterval(() => {
      setNowTick((n) => n + 1);
    }, 15_000);
    return () => window.clearInterval(handle);
  }, [status, timedOutConnecting, project.channelRequestedAt]);

  // Re-read timeout when the interval ticks.
  void nowTick;

  async function patchProject(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    const previous = project;
    try {
      onProjectUpdated({
        ...project,
        ...body,
        updatedAt: new Date().toISOString(),
      } as ProjectChannelFieldProject);
      const updated = await requestJson<ProjectChannelFieldProject>(
        `/api/v1/projects/${encodeURIComponent(project.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      onProjectUpdated({
        ...project,
        ...updated,
      });
    } catch (err) {
      onProjectUpdated(previous);
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function connect() {
    setSaving(true);
    setError(null);
    const previous = project;
    const requestedAt = new Date().toISOString();
    try {
      onProjectUpdated({
        ...project,
        channelStatus: "connecting",
        channelPendingLink: null,
        channelRequestedAt: requestedAt,
        updatedAt: requestedAt,
      });
      const updated = await startProjectChannelConnect(requestJson, project.id);
      onProjectUpdated({
        ...project,
        ...updated,
      });
      if (updated.channelConnectWarning) {
        setError(updated.channelConnectWarning);
      }
    } catch (err) {
      onProjectUpdated(previous);
      setError(apiErrorMessage(err) || "Could not start Channel Connect.");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    try {
      await patchProject({
        channel: null,
        channelStatus: "inactive",
        channelPendingLink: null,
        channelRequestedAt: null,
      });
    } catch (err) {
      setError(apiErrorMessage(err) || "Could not disconnect Channel.");
    }
  }

  async function markInactiveAfterTimeout() {
    try {
      await patchProject({
        channelStatus: "inactive",
        channelPendingLink: null,
        channelRequestedAt: null,
      });
    } catch (err) {
      setError(apiErrorMessage(err) || "Could not reset Channel Connect.");
    }
  }

  const timeoutFlipRef = useRef<string | null>(null);
  useEffect(() => {
    if (!timedOutConnecting || saving) return;
    const key = project.channelRequestedAt ?? project.id;
    if (timeoutFlipRef.current === key) return;
    timeoutFlipRef.current = key;
    void markInactiveAfterTimeout();
  }, [timedOutConnecting, saving, project.channelRequestedAt, project.id]);

  function openPendingLink() {
    const href = project.channelPendingLink?.trim();
    // Only the two chat deep-link forms — never open arbitrary URLs.
    if (!href || !isProjectChannelPendingLink(href)) {
      setError(
        "Channel pending link is invalid (expected backsteros://chat/…?message=… or /chat/…?message=…).",
      );
      return;
    }
    if (onOpenChatDeepLink) {
      onOpenChatDeepLink(href);
      return;
    }
  }

  const errorNode = error ? (
    <span className="project-channel-field__error" role="alert">
      {error}
    </span>
  ) : null;

  if (status === "connecting" && !timedOutConnecting) {
    return (
      <div className="project-channel-field">
        <span
          className="project-channel-badge project-channel-badge--connecting"
          title="Waiting for the Channel Connect agent"
          aria-label="Channel connecting"
        >
          <span
            className="project-channel-badge__icon project-channel-badge__icon--spin"
            aria-hidden="true"
          >
            <SyncIcon size={14} />
          </span>
          <span className="project-channel-badge__label">Connecting…</span>
        </span>
        {errorNode}
      </div>
    );
  }

  if (status === "needs_details") {
    return (
      <div className="project-channel-field">
        <button
          type="button"
          className="project-channel-badge project-channel-badge--needs-details"
          title="Open chat to finish Channel details"
          aria-label="Channel needs details"
          disabled={
            saving || !isProjectChannelPendingLink(project.channelPendingLink)
          }
          onClick={() => openPendingLink()}
        >
          <span
            className="project-channel-badge__icon project-channel-badge__icon--amber"
            aria-hidden="true"
          >
            <XaiMarkIcon size={14} className="project-channel-badge__mark" />
          </span>
          <span className="project-channel-badge__label">Needs details</span>
        </button>
        {errorNode}
      </div>
    );
  }

  if (status === "active" && channel?.uri) {
    const isGrok = isGrokBotChannelUri(channel.uri);
    return (
      <div className="project-channel-field">
        <div className="project-channel-badge project-channel-badge--active">
          <button
            type="button"
            className="project-channel-badge__open-btn"
            title="Open chat room"
            aria-label="Open Active channel"
            disabled={saving}
            onClick={() => {
              void openProjectChannelUri(channel.uri);
            }}
          >
            <span
              className="project-channel-badge__icon project-channel-badge__icon--live"
              aria-hidden="true"
            >
              {isGrok ? (
                <XaiMarkIcon size={14} className="project-channel-badge__mark" />
              ) : (
                <ProjectOcticon icon="comment-discussion" size={14} />
              )}
            </span>
            <span className="project-channel-badge__label">Active</span>
          </button>
          <button
            type="button"
            className="project-channel-badge__disconnect"
            title="Disconnect chat room"
            aria-label="Disconnect Channel"
            disabled={saving}
            onClick={() => {
              void disconnect();
            }}
          >
            <XIcon size={12} />
          </button>
        </div>
        {errorNode}
      </div>
    );
  }

  // inactive (and timed-out connecting after flip)
  return (
    <div className="project-channel-field">
      <button
        type="button"
        className="project-channel-badge project-channel-badge--inactive project-channel-badge--connect"
        title="Connect a chat room"
        aria-label="Channel inactive — Connect"
        disabled={saving}
        onClick={() => {
          void connect();
        }}
      >
        <span
          className="project-channel-badge__icon project-channel-badge__icon--muted"
          aria-hidden="true"
        >
          <XaiMarkIcon size={14} className="project-channel-badge__mark" />
        </span>
        <span className="project-channel-badge__label">
          {saving ? "Connecting…" : "Connect"}
        </span>
      </button>
      {errorNode}
    </div>
  );
}

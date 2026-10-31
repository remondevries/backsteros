"use client";

import type { Project as ApiProject, ProjectChannel } from "@backsteros/contracts";
import {
  isGrokBotChannelUri,
  normalizeProjectChannel,
} from "@backsteros/contracts";
import { useState } from "react";

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

export type ProjectChannelFieldProps = {
  project: ApiProject;
  onProjectUpdated: (project: ApiProject) => void;
  requestJson: CodebaseRequestJson;
};

/**
 * Locations → Channel status badge.
 * Active = Grok Bot (or scheme) icon + pulsing green dot + "Active" (opens room).
 * Inactive = muted status only. Agents set Channel via API — no edit popover.
 */
export function ProjectChannelField({
  project,
  onProjectUpdated,
  requestJson,
}: ProjectChannelFieldProps) {
  const channel = parseProjectChannel(project);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasChannel = Boolean(channel?.uri);
  const isGrok = isGrokBotChannelUri(channel?.uri);

  async function disconnect() {
    setSaving(true);
    setError(null);
    const previous = project;
    try {
      onProjectUpdated({
        ...project,
        channel: null,
        updatedAt: new Date().toISOString(),
      });
      const updated = await requestJson<ApiProject>(
        `/api/v1/projects/${encodeURIComponent(project.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: null }),
        },
      );
      onProjectUpdated({
        ...updated,
        channel: null,
      });
    } catch (err) {
      onProjectUpdated(previous);
      setError(apiErrorMessage(err) || "Could not disconnect Channel.");
    } finally {
      setSaving(false);
    }
  }

  if (!hasChannel) {
    return (
      <div className="project-channel-field">
        <span
          className="project-channel-badge project-channel-badge--inactive"
          title="No chat room linked (agents set Channel via API)"
          aria-label="Channel inactive"
        >
          <span className="project-channel-badge__label">Inactive</span>
        </span>
      </div>
    );
  }

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
            void openProjectChannelUri(channel!.uri);
          }}
        >
          <span className="project-channel-badge__icon" aria-hidden="true">
            {isGrok ? (
              <XaiMarkIcon size={14} className="project-channel-badge__mark" />
            ) : (
              <ProjectOcticon icon="comment-discussion" size={14} />
            )}
          </span>
          <span className="project-channel-badge__status">
            <span className="project-channel-badge__dot" aria-hidden="true" />
            <span className="project-channel-badge__label">Active</span>
          </span>
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
          Disconnect
        </button>
      </div>
      {error ? (
        <span className="project-channel-field__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

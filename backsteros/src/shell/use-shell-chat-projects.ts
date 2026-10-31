import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectChannelStatus } from "@backsteros/contracts";
import type { ChatProjectOption } from "@backsteros/ui";

import { useDesktopWorkspaceProjects } from "../lib/workspace-data";

export type ShellChatProjectChannelOverlay = {
  channelStatus?: ProjectChannelStatus | null;
  channelUri?: string | null;
  channelPendingLink?: string | null;
};

/** Workspace projects for the shell chat `/` Projects group. */
export function useShellChatProjects(): {
  projects: readonly ChatProjectOption[];
  applyChannelOverlay: (
    projectId: string,
    overlay: ShellChatProjectChannelOverlay | null,
  ) => void;
} {
  const { projects } = useDesktopWorkspaceProjects();
  const [overlayById, setOverlayById] = useState<
    Record<string, ShellChatProjectChannelOverlay>
  >({});

  const applyChannelOverlay = useCallback(
    (projectId: string, overlay: ShellChatProjectChannelOverlay | null) => {
      setOverlayById((prev) => {
        if (!overlay) {
          if (!(projectId in prev)) return prev;
          const next = { ...prev };
          delete next[projectId];
          return next;
        }
        return { ...prev, [projectId]: { ...prev[projectId], ...overlay } };
      });
    },
    [],
  );

  // Clear overlays once PowerSync / API caught up past the optimistic state.
  useEffect(() => {
    setOverlayById((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        const live = projects.find((project) => project.id === id);
        if (!live) {
          delete next[id];
          changed = true;
          continue;
        }
        const overlay = next[id];
        if (!overlay) continue;
        if (
          overlay.channelStatus === "connecting" &&
          live.channelStatus != null &&
          live.channelStatus !== "inactive"
        ) {
          // Server accepted connect (connecting / needs_details / active).
          delete next[id];
          changed = true;
          continue;
        }
        if (
          overlay.channelStatus &&
          live.channelStatus === overlay.channelStatus &&
          overlay.channelStatus !== "connecting"
        ) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [projects]);

  const mapped = useMemo(
    () =>
      projects.map((project) => {
        const channelUri =
          typeof project.channel?.uri === "string"
            ? project.channel.uri.trim()
            : "";
        const overlay = overlayById[project.id];
        return {
          id: project.id,
          key: project.key,
          name: project.name,
          icon: project.icon ?? null,
          type: project.type ?? null,
          channelStatus: overlay?.channelStatus ?? project.channelStatus ?? null,
          channelUri:
            overlay?.channelUri !== undefined
              ? overlay.channelUri
              : channelUri || null,
          channelPendingLink:
            overlay?.channelPendingLink !== undefined
              ? overlay.channelPendingLink
              : (project.channelPendingLink ?? null),
        };
      }),
    [overlayById, projects],
  );

  return { projects: mapped, applyChannelOverlay };
}

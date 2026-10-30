import type { ChatThreadPeer } from "../components/chat/chat-thread-header.js";
import {
  matchProjectsBySlashQuery,
  projectCommandSlug,
  type ChatProjectOption,
} from "./chat-project-option.js";
import {
  matchPeersBySlashQuery,
  parsePeerSlashCommand,
  peerCommandSlug,
} from "./chat-peer-slash-command.js";

export type ChatSlashMenuItem =
  | {
      kind: "peer";
      id: string;
      label: string;
      command: string;
      peer: ChatThreadPeer;
    }
  | {
      kind: "project";
      id: string;
      label: string;
      command: string;
      project: ChatProjectOption;
    };

export type ChatSlashMenuSection = {
  id: "agents" | "projects";
  label: string;
  items: ChatSlashMenuItem[];
};

export type ChatSlashResolveResult =
  | { type: "peer"; peer: ChatThreadPeer }
  | { type: "project"; project: ChatProjectOption };

function projectCommandLabel(project: ChatProjectOption): string {
  const slug = projectCommandSlug(project);
  return slug || project.key.toLowerCase();
}

function peerCommandLabel(peer: ChatThreadPeer): string {
  return (peer.name.split(/\s+/)[0] ?? peer.name).toLowerCase();
}

/**
 * Build the composer `/` menu: Agents, then Projects (recent first, then filtered).
 * Switch rooms by picking a peer or project — no leave/exit command.
 */
export function buildChatSlashMenu(input: {
  text: string;
  peers: readonly ChatThreadPeer[];
  projects: readonly ChatProjectOption[];
  recentProjectIds?: readonly string[];
}): ChatSlashMenuSection[] {
  const query = parsePeerSlashCommand(input.text);
  if (query == null) return [];

  // Header strip may include project rooms; Agents group is contacts only.
  const agentPeers = input.peers.filter((peer) => peer.kind === "contact");
  const peers = matchPeersBySlashQuery(agentPeers, query).slice(0, 8);
  const projects = matchProjectsBySlashQuery(
    input.projects,
    query,
    input.recentProjectIds ?? [],
  ).slice(0, 8);

  const sections: ChatSlashMenuSection[] = [];
  if (peers.length > 0) {
    sections.push({
      id: "agents",
      label: "Agents",
      items: peers.map((peer) => ({
        kind: "peer" as const,
        id: peer.id,
        label: peer.name,
        command: peerCommandLabel(peer),
        peer,
      })),
    });
  }
  if (projects.length > 0) {
    sections.push({
      id: "projects",
      label: "Projects",
      items: projects.map((project) => ({
        kind: "project" as const,
        id: project.id,
        label: project.name,
        command: projectCommandLabel(project),
        project,
      })),
    });
  }
  return sections;
}

export function flattenChatSlashMenu(
  sections: readonly ChatSlashMenuSection[],
): ChatSlashMenuItem[] {
  return sections.flatMap((section) => section.items);
}

/**
 * Resolve a submitted `/command`. Peers win exact ties over projects;
 * otherwise unique prefix matches resolve.
 */
export function resolveChatSlashCommand(input: {
  text: string;
  peers: readonly ChatThreadPeer[];
  projects: readonly ChatProjectOption[];
  recentProjectIds?: readonly string[];
}): ChatSlashResolveResult | null {
  const query = parsePeerSlashCommand(input.text);
  if (query == null || query.length === 0) return null;

  const agentPeers = input.peers.filter((peer) => peer.kind === "contact");
  const peers = matchPeersBySlashQuery(agentPeers, query);
  const projects = matchProjectsBySlashQuery(
    input.projects,
    query,
    input.recentProjectIds ?? [],
  );

  const exactPeer = peers.find((peer) => {
    const full = peerCommandSlug(peer.name);
    const first = peerCommandSlug(peer.name.split(/\s+/)[0] ?? "");
    return full === query || first === query;
  });
  if (exactPeer) return { type: "peer", peer: exactPeer };

  const exactProject = projects.find((project) => {
    const keySlug = projectCommandSlug(project);
    const nameSlug = project.name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    return keySlug === query || nameSlug === query;
  });
  if (exactProject) return { type: "project", project: exactProject };

  if (peers.length === 1 && projects.length === 0) {
    return { type: "peer", peer: peers[0]! };
  }
  if (projects.length === 1 && peers.length === 0) {
    return { type: "project", project: projects[0]! };
  }
  return null;
}

import type { ChatThreadPeer } from "../components/chat/chat-thread-header.js";
import {
  CHAT_EXIT_COMMAND,
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
  | { kind: "exit"; id: "exit"; label: string; command: string }
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
  id: "commands" | "agents" | "projects";
  label: string;
  items: ChatSlashMenuItem[];
};

export type ChatSlashResolveResult =
  | { type: "exit" }
  | { type: "peer"; peer: ChatThreadPeer }
  | { type: "project"; project: ChatProjectOption };

function exitMatchesQuery(query: string): boolean {
  return CHAT_EXIT_COMMAND.startsWith(query);
}

function projectCommandLabel(project: ChatProjectOption): string {
  const slug = projectCommandSlug(project);
  return slug || project.key.toLowerCase();
}

function peerCommandLabel(peer: ChatThreadPeer): string {
  return (peer.name.split(/\s+/)[0] ?? peer.name).toLowerCase();
}

/**
 * Build the composer `/` menu: reserved `/exit` (when it matches), then
 * Agents, then Projects (recent first, then filtered).
 */
export function buildChatSlashMenu(input: {
  text: string;
  peers: readonly ChatThreadPeer[];
  projects: readonly ChatProjectOption[];
  recentProjectIds?: readonly string[];
  /** When false, `/exit` is omitted from the menu (command still reserved). */
  showExit?: boolean;
}): ChatSlashMenuSection[] {
  const query = parsePeerSlashCommand(input.text);
  if (query == null) return [];

  const showExit = input.showExit !== false && exitMatchesQuery(query);
  const peers = matchPeersBySlashQuery(input.peers, query).slice(0, 8);
  const projects = matchProjectsBySlashQuery(
    input.projects,
    query,
    input.recentProjectIds ?? [],
  ).slice(0, 8);

  const sections: ChatSlashMenuSection[] = [];
  if (showExit) {
    sections.push({
      id: "commands",
      label: "Commands",
      items: [
        {
          kind: "exit",
          id: "exit",
          label: "Exit project",
          command: CHAT_EXIT_COMMAND,
        },
      ],
    });
  }
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
 * Resolve a submitted `/command`. `/exit` is reserved. Peers win exact ties
 * over projects; otherwise unique prefix matches resolve.
 */
export function resolveChatSlashCommand(input: {
  text: string;
  peers: readonly ChatThreadPeer[];
  projects: readonly ChatProjectOption[];
  recentProjectIds?: readonly string[];
}): ChatSlashResolveResult | null {
  const query = parsePeerSlashCommand(input.text);
  if (query == null || query.length === 0) return null;

  if (query === CHAT_EXIT_COMMAND) {
    return { type: "exit" };
  }

  const peers = matchPeersBySlashQuery(input.peers, query);
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

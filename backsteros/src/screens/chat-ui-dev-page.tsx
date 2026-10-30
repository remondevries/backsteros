import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "@tanstack/react-router";
import type { ApiKey } from "@backsteros/contracts";
import {
  ChatUiDevPreview,
  classifyApiKeyType,
  type ChatThreadPeer,
  type ContactListItem,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import { useDesktopWorkspacePeople } from "../lib/workspace-data";
import { navigateToHref } from "../router/navigate-href";

function findJudithContact(
  contacts: readonly ContactListItem[],
): ContactListItem | null {
  const match = contacts.find((contact) => {
    const name = contact.name.trim().toLowerCase();
    const first = contact.firstName?.trim().toLowerCase() ?? "";
    return name === "judith" || first === "judith" || name.startsWith("judith ");
  });
  return match ?? null;
}

function contactToPeer(
  contact: ContactListItem,
  avatarSrcById: Record<string, string>,
): ChatThreadPeer {
  return {
    id: contact.id,
    kind: "contact",
    name: contact.name,
    avatarSrc: avatarSrcById[contact.id] ?? contact.avatarSrc ?? null,
  };
}

/**
 * Dev-only ChatThread foundation preview at `/dev/chat-ui`.
 * Hidden outside Vite DEV so production builds never expose it.
 *
 * Peers = Judith (when present) + every Settings → API → Agent contact,
 * each with its own thread in the preview.
 */
export function ChatUiDevPage() {
  if (!import.meta.env.DEV) {
    return <Navigate to="/" replace />;
  }
  return <ChatUiDevPageInner />;
}

function ChatUiDevPageInner() {
  const navigate = useNavigate();
  const { client } = useDesktopApi();
  const { contacts } = useDesktopWorkspacePeople();
  const [agentContactIds, setAgentContactIds] = useState<string[]>([]);
  const onNavigate = useCallback(
    (href: string) => {
      navigateToHref(navigate, href);
    },
    [navigate],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const body = await client.requestJson<{ apiKeys: ApiKey[] }>(
          "/api/v1/api-keys",
        );
        if (cancelled) return;
        const ids: string[] = [];
        const seen = new Set<string>();
        for (const key of body.apiKeys) {
          if (classifyApiKeyType(key) !== "agent") continue;
          const contactId = key.contactId?.trim();
          if (!contactId || seen.has(contactId)) continue;
          seen.add(contactId);
          ids.push(contactId);
        }
        setAgentContactIds(ids);
      } catch {
        if (!cancelled) setAgentContactIds([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const judith = useMemo(() => findJudithContact(contacts), [contacts]);

  const peerContacts = useMemo(() => {
    const byId = new Map(contacts.map((contact) => [contact.id, contact]));
    const ordered: ContactListItem[] = [];
    const seen = new Set<string>();

    if (judith) {
      ordered.push(judith);
      seen.add(judith.id);
    }

    const agentContacts = agentContactIds
      .map((id) => byId.get(id))
      .filter((contact): contact is ContactListItem => Boolean(contact))
      .filter((contact) => !seen.has(contact.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const contact of agentContacts) {
      ordered.push(contact);
      seen.add(contact.id);
    }

    return ordered;
  }, [contacts, agentContactIds, judith]);

  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", peerContacts);

  const peers = useMemo((): ChatThreadPeer[] => {
    if (peerContacts.length === 0) {
      return [
        {
          id: "judith-fallback",
          kind: "contact",
          name: "Judith",
        },
      ];
    }
    return peerContacts.map((contact) =>
      contactToPeer(contact, contactAvatarSrc),
    );
  }, [peerContacts, contactAvatarSrc]);

  return <ChatUiDevPreview peers={peers} onNavigate={onNavigate} />;
}

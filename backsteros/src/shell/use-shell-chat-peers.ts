import { useEffect, useMemo, useState } from "react";
import type { ApiKey } from "@backsteros/contracts";
import {
  classifyApiKeyType,
  type ChatThreadPeer,
  type ContactListItem,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import { readAgentApiKeySortOrderIds } from "../lib/shell-agent-order";
import { useDesktopWorkspacePeople } from "../lib/workspace-data";

function findNamedContact(
  contacts: readonly ContactListItem[],
  name: string,
): ContactListItem | null {
  const target = name.trim().toLowerCase();
  const match = contacts.find((contact) => {
    const full = contact.name.trim().toLowerCase();
    const first = contact.firstName?.trim().toLowerCase() ?? "";
    return full === target || first === target || full.startsWith(`${target} `);
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
 * Judith (default general) + Niels (default project agent) + every
 * Settings → API → Agent contact for the shell chat / `/dev/chat-ui`.
 */
export function useShellChatPeers(): readonly ChatThreadPeer[] {
  const { client } = useDesktopApi();
  const { contacts } = useDesktopWorkspacePeople();
  const [agentKeys, setAgentKeys] = useState<
    { id: string; contactId: string }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const body = await client.requestJson<{ apiKeys: ApiKey[] }>(
          "/api/v1/api-keys",
        );
        if (cancelled) return;
        const keys: { id: string; contactId: string }[] = [];
        const seen = new Set<string>();
        for (const key of body.apiKeys) {
          if (classifyApiKeyType(key) !== "agent") continue;
          const contactId = key.contactId?.trim();
          if (!contactId || seen.has(contactId)) continue;
          seen.add(contactId);
          keys.push({ id: key.id, contactId });
        }
        setAgentKeys(keys);
      } catch {
        if (!cancelled) setAgentKeys([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const judith = useMemo(
    () => findNamedContact(contacts, "Judith"),
    [contacts],
  );
  const niels = useMemo(
    () => findNamedContact(contacts, "Niels"),
    [contacts],
  );

  const peerContacts = useMemo(() => {
    const byId = new Map(contacts.map((contact) => [contact.id, contact]));
    const ordered: ContactListItem[] = [];
    const seen = new Set<string>();

    // Judith first (general default). Niels is included when he exists as a
    // real contact/agent — the chat UI only shows him while in a project room.
    for (const preferred of [judith, niels]) {
      if (!preferred || seen.has(preferred.id)) continue;
      ordered.push(preferred);
      seen.add(preferred.id);
    }

    const keyOrder = readAgentApiKeySortOrderIds();
    const keyIndex = new Map(keyOrder.map((id, index) => [id, index]));
    const agentContacts = [...agentKeys]
      .sort((a, b) => {
        const ai = keyIndex.has(a.id) ? keyIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
        const bi = keyIndex.has(b.id) ? keyIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        const ac = byId.get(a.contactId);
        const bc = byId.get(b.contactId);
        return (ac?.name ?? a.contactId).localeCompare(bc?.name ?? b.contactId);
      })
      .map((key) => byId.get(key.contactId))
      .filter((contact): contact is ContactListItem => Boolean(contact))
      .filter((contact) => !seen.has(contact.id));

    for (const contact of agentContacts) {
      ordered.push(contact);
      seen.add(contact.id);
    }

    return ordered;
  }, [contacts, agentKeys, judith, niels]);

  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", peerContacts);

  return useMemo((): readonly ChatThreadPeer[] => {
    const peers: ChatThreadPeer[] = peerContacts.map((contact) =>
      contactToPeer(contact, contactAvatarSrc),
    );
    if (peers.length === 0) {
      return [{ id: "judith-fallback", kind: "contact", name: "Judith" }];
    }
    const hasJudith = peers.some((peer) => {
      const first = peer.name.trim().toLowerCase().split(/\s+/)[0] ?? "";
      return first === "judith";
    });
    if (!hasJudith) {
      peers.unshift({ id: "judith-fallback", kind: "contact", name: "Judith" });
    }
    return peers;
  }, [peerContacts, contactAvatarSrc]);
}

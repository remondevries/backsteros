/**
 * Reply / Reply-all recipient helpers — same rules as desktop
 * `@backsteros/ui` `buildReplyRecipients`.
 */

import { parseReplyToAddress } from "./email-list";

export function splitRecipientField(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function normalizeEmailRecipients(
  value: string | string[] | null | undefined,
): string[] {
  if (value == null) return [];
  const list = Array.isArray(value)
    ? value.flatMap((entry) => splitRecipientField(entry))
    : splitRecipientField(value);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of list) {
    const address = parseReplyToAddress(entry);
    if (!address.includes("@")) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(address);
  }
  return out;
}

export function resolveReplyPartyFromMessage(
  message: { from: string; to?: string[] | null; cc?: string[] | null },
  inboxEmail: string | null | undefined,
  threadMessages?: readonly {
    from: string;
    to?: string[] | null;
    cc?: string[] | null;
  }[],
): string {
  const ours = inboxEmail?.trim().toLowerCase() || null;
  const fromAddr = parseReplyToAddress(message.from).toLowerCase();
  if (ours && fromAddr === ours) {
    for (const raw of message.to ?? []) {
      const addr = parseReplyToAddress(raw).toLowerCase();
      if (addr.includes("@") && addr !== ours) return raw;
    }
    for (const raw of message.cc ?? []) {
      const addr = parseReplyToAddress(raw).toLowerCase();
      if (addr.includes("@") && addr !== ours) return raw;
    }
    for (const entry of threadMessages ?? []) {
      const entryFrom = parseReplyToAddress(entry.from).toLowerCase();
      if (entryFrom.includes("@") && entryFrom !== ours) return entry.from;
      for (const raw of [...(entry.to ?? []), ...(entry.cc ?? [])]) {
        const addr = parseReplyToAddress(raw).toLowerCase();
        if (addr.includes("@") && addr !== ours) return raw;
      }
    }
  }
  return message.from;
}

export type ReplyRecipientsPlan = {
  to: string[];
  cc: string[];
};

export function buildReplyRecipients(input: {
  message: { from: string; to?: string[] | null; cc?: string[] | null };
  inboxEmail: string | null | undefined;
  replyAll?: boolean;
  threadMessages?: readonly {
    from: string;
    to?: string[] | null;
    cc?: string[] | null;
  }[];
}): ReplyRecipientsPlan {
  const replyParty = resolveReplyPartyFromMessage(
    input.message,
    input.inboxEmail,
    input.threadMessages,
  );
  const to = normalizeEmailRecipients(replyParty);
  if (!input.replyAll) {
    return { to, cc: [] };
  }

  const ours = input.inboxEmail?.trim().toLowerCase() || null;
  const seen = new Set(to.map((address) => address.toLowerCase()));
  if (ours) seen.add(ours);
  const cc: string[] = [];
  for (const raw of [
    input.message.from,
    ...(input.message.to ?? []),
    ...(input.message.cc ?? []),
  ]) {
    const address = parseReplyToAddress(raw);
    if (!address.includes("@")) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cc.push(address);
  }
  return { to, cc };
}

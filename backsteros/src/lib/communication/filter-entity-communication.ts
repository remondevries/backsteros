import type { ChatConversation } from "@backsteros/contracts";
import {
  getContactEmailAddresses,
  type ContactEmailInput,
} from "@backsteros/contracts";
import type {
  InboxEmailListItem,
  InboxListItem,
  InboxTaskListItem,
} from "@backsteros/ui";

import {
  matchChatContact,
  type ChatMatchableContact,
} from "../chat/match-chat-contact";

type EntityContactInput = {
  id: string;
  email?: string | null;
  emails?: readonly ContactEmailInput[] | null;
  phone?: string | null;
  phones?: readonly { number?: string | null }[] | null;
};

function addressSet(contact: EntityContactInput): Set<string> {
  return new Set(
    getContactEmailAddresses(contact).map((address) => address.toLowerCase()),
  );
}

function toMatchableContact(contact: EntityContactInput): ChatMatchableContact {
  return {
    id: contact.id,
    email: contact.email,
    emails: getContactEmailAddresses(contact).map((address) => ({ address })),
    phone: contact.phone,
    phones: contact.phones,
  };
}

function emailMatchesContact(
  item: InboxEmailListItem,
  contactId: string,
  addresses: ReadonlySet<string>,
): boolean {
  if (item.contactId?.trim() === contactId) return true;
  if (item.partyContactIds?.some((id) => id === contactId)) return true;
  const haystack = `${item.partyLabel ?? ""} ${item.title ?? ""}`.toLowerCase();
  for (const address of addresses) {
    if (address && haystack.includes(address)) return true;
  }
  return false;
}

export function filterCommunicationForContact(input: {
  contact: EntityContactInput;
  items: readonly InboxListItem[];
  conversations: readonly ChatConversation[];
}): {
  emails: InboxEmailListItem[];
  supportTasks: InboxTaskListItem[];
  conversations: ChatConversation[];
} {
  const addresses = addressSet(input.contact);
  const emails = input.items.filter(
    (item): item is InboxEmailListItem =>
      item.kind === "email" &&
      emailMatchesContact(item, input.contact.id, addresses),
  );
  const supportTasks = input.items.filter(
    (item): item is InboxTaskListItem =>
      item.kind === "task" &&
      item.support === true &&
      item.contactId?.trim() === input.contact.id,
  );
  const matchable = toMatchableContact(input.contact);
  const conversations = input.conversations.filter((conversation) => {
    const matched = matchChatContact([matchable], {
      contactEmail: conversation.contactEmail,
      contactPhone: conversation.contactPhone,
    });
    return matched?.id === input.contact.id;
  });
  return { emails, supportTasks, conversations };
}

export function filterCommunicationForOrganization(input: {
  organizationId: string;
  contactIds: ReadonlySet<string>;
  items: readonly InboxListItem[];
  conversations: readonly ChatConversation[];
  contacts: readonly EntityContactInput[];
}): {
  emails: InboxEmailListItem[];
  supportTasks: InboxTaskListItem[];
  conversations: ChatConversation[];
} {
  const orgId = input.organizationId;
  const emails = input.items.filter(
    (item): item is InboxEmailListItem =>
      item.kind === "email" &&
      (item.organizationId === orgId ||
        Boolean(
          item.contactId?.trim() &&
            input.contactIds.has(item.contactId.trim()),
        )),
  );
  const supportTasks = input.items.filter(
    (item): item is InboxTaskListItem =>
      item.kind === "task" &&
      item.support === true &&
      (item.organizationId === orgId ||
        Boolean(
          item.contactId?.trim() &&
            input.contactIds.has(item.contactId.trim()),
        )),
  );
  const matchableContacts = input.contacts.map(toMatchableContact);
  const conversations = input.conversations.filter((conversation) => {
    const matched = matchChatContact(matchableContacts, {
      contactEmail: conversation.contactEmail,
      contactPhone: conversation.contactPhone,
    });
    if (!matched) return false;
    return input.contactIds.has(matched.id);
  });
  return { emails, supportTasks, conversations };
}

"use client";

import type {
  Contact as ApiContact,
  Organization as ApiOrganization,
} from "@backsteros/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useTransition } from "react";
import { toast } from "sonner";

import { MobileRemoteImage } from "@/components/mobile/mobile-remote-image";
import { ContentSidePanelHeader } from "@/components/shell/content-side-panel-header";
import { ContentSidePanelList } from "@/components/shell/content-side-panel-list";
import { SidePanelPlusIcon } from "@/components/shell/side-panel-plus-icon";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "@/components/shortcuts/list-keyboard-navigation-provider";
import { useApiResource } from "@/lib/api-context";
import { getContactAvatarSrc } from "@/lib/avatars/urls";
import {
  getContactSidePanelHref,
  getContactsHref,
  getSelectedContactSlugFromPathname,
} from "@/lib/contacts/navigation-path";
import { normalizeContact, normalizeOrganization } from "@/lib/entity-normalize";
import { contactMatchesRouteSlug } from "@/lib/entity-route-hrefs";
import { createContactAction } from "@/lib/mutations/contacts";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { keyboardNavItemProps } from "@/lib/shortcuts/keyboard-nav-item";
import { LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL } from "@/lib/shortcuts/list-keyboard-nav-zone";
import { sidePanelItemClass } from "@/lib/side-panel-styles";
import { createLocalContact } from "@/lib/sync/local-contact-mutations";
import { preferLocalOrApi } from "@/lib/sync/prefer-local-or-api";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return output;
}

export function ContactsSidePanel({ pathname }: { pathname: string }) {
  const router = useRouter();
  const listRef = useRef<HTMLElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );
  const [isCreating, startCreateTransition] = useTransition();
  const selectedSlug = getSelectedContactSlugFromPathname(pathname);
  const contactsResource = useApiResource<{ contacts: ApiContact[] }>((client) =>
    client.requestJson("/api/v1/contacts"),
  );
  const orgsResource = useApiResource<{ organizations: ApiOrganization[] }>(
    (client) => client.requestJson("/api/v1/organizations"),
  );
  const localContacts = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM contacts WHERE deleted_at IS NULL ORDER BY updated_at DESC",
  );

  const organizationsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof normalizeOrganization>>();
    for (const organization of orgsResource.data?.organizations ?? []) {
      const normalized = normalizeOrganization(organization);
      map.set(normalized.id, normalized);
    }
    return map;
  }, [orgsResource.data]);

  const contacts = useMemo(() => {
    const rows = preferLocalOrApi(
      localContacts.data?.map((row) => snakeRow(row) as ApiContact),
      contactsResource.data?.contacts,
    );
    return rows
      .map((contact) => normalizeContact(contact))
      .sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, {
          sensitivity: "base",
        }),
      );
  }, [contactsResource.data, localContacts.data]);

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof contacts>();
    for (const contact of contacts) {
      const first = (contact.name || "").trim()[0]?.toUpperCase() ?? "#";
      const key = first >= "A" && first <= "Z" ? first : "#";
      const existing = groups.get(key);
      if (existing) existing.push(contact);
      else groups.set(key, [contact]);
    }
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    });
  }, [contacts]);

  const selectedContactId = useMemo(() => {
    if (!selectedSlug) return null;
    return (
      contacts.find((contact) => contactMatchesRouteSlug(contact, selectedSlug))
        ?.id ?? null
    );
  }, [contacts, selectedSlug]);

  const contactHrefs = useMemo(() => {
    const hrefs = new Map<string, string>();
    for (const contact of contacts) {
      hrefs.set(
        contact.id,
        getContactSidePanelHref(contact, pathname, contacts),
      );
    }
    return hrefs;
  }, [contacts, pathname]);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds: grouped.flatMap(([, entries]) => entries.map((entry) => entry.id)),
    selectedId: selectedContactId,
    onNavigate: (contactId) => {
      const href = contactHrefs.get(contactId);
      if (href && href !== pathname) {
        router.push(href);
      }
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: contacts.length > 0,
  });

  const handleCreateContact = useCallback(() => {
    startCreateTransition(async () => {
      const result = await runEntityPersist(
        () => createLocalContact({ name: "New contact" }),
        () => createContactAction({ name: "New contact" }),
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      router.push(
        getContactsHref({
          number: result.contactNumber,
          key: result.contactKey,
        }),
      );
    });
  }, [router]);

  return (
    <div className="app-content-side-panel app-content-side-panel--contacts flex h-full min-h-0 flex-col">
      <ContentSidePanelHeader
        title="Contacts"
        actions={
          <button
            type="button"
            onClick={handleCreateContact}
            disabled={isCreating}
            className="app-side-panel-section-action"
            aria-label="Create contact"
          >
            <SidePanelPlusIcon />
          </button>
        }
      />
      <div className="app-content-side-panel-main flex min-h-0 flex-1 flex-col">
        {!contacts.length ? (
          <p className="app-content-side-panel-empty">
            No contacts yet. Use the plus button to add one.
          </p>
        ) : (
          <ContentSidePanelList
            ref={listRef}
            aria-label="Contacts"
            {...listContainerProps}
          >
            {grouped.flatMap(([letter, entries]) => [
              <li key={`group-${letter}`} className="px-2 pt-3 pb-1">
                <span className="text-[11px] font-semibold tracking-wide text-foreground/40">
                  {letter}
                </span>
              </li>,
              ...entries.map((contact) => {
                const organization = contact.organizationId
                  ? organizationsById.get(contact.organizationId)
                  : null;
                const isActive = contactMatchesRouteSlug(contact, selectedSlug);
                const href =
                  contactHrefs.get(contact.id) ??
                  getContactSidePanelHref(contact, pathname, contacts);

                return (
                  <li key={contact.id}>
                    <Link
                      href={href}
                      scroll={false}
                      className={sidePanelItemClass({
                        active: isActive,
                        keyboardHighlighted: highlightedId === contact.id,
                      })}
                      aria-current={isActive ? "page" : undefined}
                      {...keyboardNavItemProps(contact.id)}
                    >
                      {contact.avatarStorageKey ? (
                        <span
                          className="app-side-panel-item-icon self-start"
                          aria-hidden="true"
                        >
                          <MobileRemoteImage
                            kind="contact-avatar"
                            entityId={contact.id}
                            storageKey={contact.avatarStorageKey}
                            fallbackSrc={getContactAvatarSrc(
                              contact.id,
                              contact.updatedAt,
                            )}
                            alt=""
                            size={16}
                            className="rounded-full object-cover"
                          />
                        </span>
                      ) : null}
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="app-side-panel-item-label">
                          {contact.name}
                        </span>
                        {organization ? (
                          <span className="truncate text-xs leading-none text-foreground/45">
                            {organization.name}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                );
              }),
            ])}
          </ContentSidePanelList>
        )}
      </div>
    </div>
  );
}

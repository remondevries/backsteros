"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useRef } from "react";

import { AssigneeContactIcon } from "@/components/contacts/assignee-contact-icon";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "@/components/shortcuts/list-keyboard-navigation-provider";
import {
  getOrganizationContactHref,
  getSelectedContactSlugFromPathname,
} from "@/lib/contacts/navigation-path";
import type { Contact } from "@/lib/db/schema";
import { contactMatchesRouteSlug } from "@/lib/entity-route-hrefs";
import { keyboardNavItemProps, keyboardNavListItemClass } from "@/lib/shortcuts/keyboard-nav-item";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "@/lib/shortcuts/list-keyboard-nav-zone";
import { toTimestampMs } from "@/lib/sync/timestamps";

type OrganizationContactsListProps = {
  contacts: Contact[];
  organizationRouteParam: string;
};

export function OrganizationContactsList({
  contacts,
  organizationRouteParam,
}: OrganizationContactsListProps) {
  const pathname = usePathname();
  const router = useRouter();
  const listRef = useRef<HTMLDivElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  const selectedContactId = useMemo(() => {
    const routeSlug = getSelectedContactSlugFromPathname(pathname);
    return (
      contacts.find((contact) => contactMatchesRouteSlug(contact, routeSlug))
        ?.id ?? null
    );
  }, [contacts, pathname]);

  const itemIds = useMemo(
    () => contacts.map((contact) => contact.id),
    [contacts],
  );

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedContactId,
    onNavigate: (contactId) => {
      const contact = contacts.find((entry) => entry.id === contactId);
      if (contact) {
        router.push(
          getOrganizationContactHref(
            organizationRouteParam,
            contact,
            contacts,
          ),
        );
      }
    },
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: contacts.length > 0,
  });

  return (
    <div
      ref={listRef}
      className="m-0 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-0"
      {...listContainerProps}
    >
      {contacts.map((contact) => (
        <Link
          key={contact.id}
          href={getOrganizationContactHref(
            organizationRouteParam,
            contact,
            contacts,
          )}
          className={`flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-white/[0.04] ${keyboardNavListItemClass(highlightedId === contact.id)}`}
          {...keyboardNavItemProps(contact.id)}
        >
          <span className="inline-flex size-[18px] shrink-0 items-center justify-center">
            <AssigneeContactIcon
              contact={{
                id: contact.id,
                avatarStorageKey: contact.avatarStorageKey,
                avatarUpdatedAt: toTimestampMs(contact.updatedAt),
              }}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] leading-snug text-foreground">
              {contact.name}
            </span>
            {contact.email || contact.title ? (
              <span className="block truncate text-[11px] leading-snug text-foreground/45">
                {[contact.title, contact.email].filter(Boolean).join(" · ")}
              </span>
            ) : null}
          </span>
        </Link>
      ))}
    </div>
  );
}

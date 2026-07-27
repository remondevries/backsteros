"use client";

import type { Contact as ApiContact } from "@backsteros/contracts";
import { groupItemsByAlphaLetter } from "@backsteros/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { ListLayoutBreadcrumb } from "@/components/navigation/list-layout-breadcrumb";
import { useApiResource } from "@/lib/api-context";
import { getContactSidePanelHref } from "@/lib/contacts/navigation-path";
import { normalizeContact } from "@/lib/entity-normalize";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { preferLocalOrApi } from "@/lib/sync/prefer-local-or-api";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return output;
}

export function ContactsIndexScreen() {
  const router = useRouter();
  const resource = useApiResource<{ contacts: ApiContact[] }>((client) =>
    client.requestJson("/api/v1/contacts"),
  );
  const local = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM contacts WHERE deleted_at IS NULL ORDER BY updated_at DESC",
  );

  const contacts = useMemo(() => {
    const rows = preferLocalOrApi(
      local.data?.map((row) => snakeRow(row) as ApiContact),
      resource.data?.contacts,
    );
    return rows
      .map((contact) => normalizeContact(contact))
      .sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, {
          sensitivity: "base",
        }),
      );
  }, [local.data, resource.data]);

  // Match side-panel alpha order (not raw API order).
  const first =
    groupItemsByAlphaLetter(contacts).flatMap(([, entries]) => entries)[0] ??
    null;

  useEffect(() => {
    if (!first) return;
    // Match side-panel ordering/href (including remembered section + unique slug).
    router.replace(getContactSidePanelHref(first, "/contacts", contacts));
  }, [contacts, first, router]);

  if (resource.loading && !local.data) {
    return (
      <>
        <ListLayoutBreadcrumb label="Contacts" />
        <div className="loading-list">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} />
          ))}
        </div>
      </>
    );
  }

  if (first) {
    return (
      <>
        <ListLayoutBreadcrumb label="Contacts" />
        <div className="flex h-full items-center justify-center px-6 py-12 text-sm text-foreground/60">
          <p className="max-w-sm text-center">Opening contact…</p>
        </div>
      </>
    );
  }

  return (
    <>
      <ListLayoutBreadcrumb label="Contacts" />
      <div className="flex h-full items-center justify-center px-6 py-12 text-sm text-foreground/60">
        <p className="max-w-sm text-center">
          No contacts yet. Use the plus button in the sidebar to add your first
          contact.
        </p>
      </div>
    </>
  );
}

"use client";

import type {
  Contact as ApiContact,
  Letter as ApiLetter,
} from "@backsteros/contracts";
import Link from "next/link";
import { useMemo } from "react";

import { ContactLayoutBreadcrumb } from "@/components/contacts/contact-layout-breadcrumb";
import { ContactNav } from "@/components/contacts/contact-nav";
import { ScopedLettersList } from "@/components/letters/scoped-letters-list";
import { useOrganizationRouteContext } from "@/hooks/use-organization-route-context";
import { apiErrorMessage, useApiResource } from "@/lib/api-context";
import {
  contactMatchesRouteSlug,
  getCanonicalContactRouteParam,
  getLettersHref,
} from "@/lib/entity-route-hrefs";
import { normalizeContact, normalizeLetter } from "@/lib/entity-normalize";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import {
  findLocalOrApi,
  preferLocalOrApi,
} from "@/lib/sync/prefer-local-or-api";
import type { TaskStatus } from "@/lib/task-status";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return output;
}

function letterComposeHref(
  contact: { id: string; organizationId: string | null },
  status: TaskStatus,
): string {
  const params = new URLSearchParams({
    contactId: contact.id,
    status,
  });
  if (contact.organizationId) {
    params.set("organizationId", contact.organizationId);
  }
  return `/letters/new?${params.toString()}`;
}

export function ContactLettersScreen({
  contactParam,
  organizationRouteParam,
}: {
  contactParam: string;
  organizationRouteParam?: string;
}) {
  const organizationContext = useOrganizationRouteContext(organizationRouteParam);
  const contactsResource = useApiResource<{ contacts: ApiContact[] }>((client) =>
    client.requestJson("/api/v1/contacts"),
  );
  const localContacts = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM contacts WHERE deleted_at IS NULL",
  );

  const contact = useMemo(() => {
    const match = findLocalOrApi(
      localContacts.data?.map((row) => snakeRow(row) as ApiContact),
      contactsResource.data?.contacts,
      (entry) => contactMatchesRouteSlug(entry, contactParam),
    );
    return match ? normalizeContact(match) : null;
  }, [contactParam, contactsResource.data, localContacts.data]);

  const lettersResource = useApiResource<{ letters: ApiLetter[] }>(
    (client) =>
      contact
        ? client.requestJson(
            `/api/v1/letters?contactId=${encodeURIComponent(contact.id)}`,
          )
        : Promise.resolve({ letters: [] as ApiLetter[] }),
    [contact?.id],
  );

  const localLetters = usePowerSyncQuery<Record<string, unknown>>(
    contact
      ? "SELECT * FROM letters WHERE deleted_at IS NULL AND contact_id = ? ORDER BY sort_order, updated_at DESC"
      : null,
    contact ? [contact.id] : [],
  );

  const letters = useMemo(() => {
    const rows = preferLocalOrApi(
      localLetters.data?.map((row) => snakeRow(row) as ApiLetter),
      lettersResource.data?.letters,
    );
    return rows.map(normalizeLetter);
  }, [lettersResource.data, localLetters.data]);

  if (contactsResource.loading && !contact) {
    return (
      <div className="loading-list">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} />
        ))}
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="error-state">
        <strong>Contact not found</strong>
        <p>No contact matches “{contactParam}”.</p>
        <Link href="/contacts">Back to contacts</Link>
      </div>
    );
  }

  const routeParam = getCanonicalContactRouteParam(contact);
  const loading = lettersResource.loading && !localLetters.data;
  const error = !localLetters.data ? lettersResource.error : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ContactLayoutBreadcrumb
        contactRouteParam={routeParam}
        contactName={contact.name}
        organizationContext={organizationContext}
      />
      <ContactNav contactRouteParam={routeParam} />
      <div className="flex min-h-0 flex-1 flex-col p-2">
        {loading ? (
          <div className="loading-list">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} />
            ))}
          </div>
        ) : null}
        {error ? (
          <div className="error-state">
            <strong>Could not load letters</strong>
            <p>{apiErrorMessage(error)}</p>
            <button type="button" onClick={lettersResource.reload}>
              Try again
            </button>
          </div>
        ) : null}
        {!loading && !error ? (
          <ScopedLettersList
            letters={letters}
            resolveHref={(letter) =>
              letter.number != null
                ? getLettersHref(letter.number)
                : `/letters/${letter.id}`
            }
            resolveComposeHref={(status) => letterComposeHref(contact, status)}
          />
        ) : null}
      </div>
    </div>
  );
}

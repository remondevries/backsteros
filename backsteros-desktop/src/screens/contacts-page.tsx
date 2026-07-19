import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  AvatarUpload,
  ContactDetailView,
  ContactTasksListView,
  CONTACT_SECTIONS,
  EntityDetailLayout,
  RegisterEntityDeleteAction,
  RegisterPageTitle,
  ScopedLettersListView,
  buildSourceTaskTrailHref,
  contactMatchesSlug,
  getOrganizationSectionHref,
  getScopedContactBasePath,
  getScopedContactLetterHref,
  getScopedContactSectionHref,
  getScopedContactsListHref,
  groupItemsByAlphaLetter,
  getUniqueListItemRouteParam,
  isContactSectionId,
  parseContactSectionId,
  type ContactOverviewDetails,
  type ContactRouteScope,
  type ContactSectionId,
  type TaskStatus,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import {
  removeDesktopAvatar,
  uploadDesktopAvatar,
} from "../lib/avatar-upload";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDesktopWorkspaceData } from "../lib/workspace-data";

function contactSlug(contact: {
  number?: number | null;
  key?: string | null;
  id: string;
}) {
  return contact.number ?? contact.key ?? contact.id;
}

function normalizeContactSocialAccounts(
  raw: unknown,
): { platform: string; url: string }[] {
  let accounts: unknown = raw ?? [];
  if (typeof accounts === "string") {
    try {
      accounts = JSON.parse(accounts) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(accounts)) return [];
  return accounts
    .filter(
      (entry): entry is { platform: unknown; url: unknown } =>
        entry != null &&
        typeof entry === "object" &&
        "platform" in entry &&
        "url" in entry,
    )
    .map((entry) => ({
      platform: String(entry.platform ?? ""),
      url: String(entry.url ?? ""),
    }))
    .filter((entry) => entry.platform.length > 0 && entry.url.length > 0)
    .slice(0, 20);
}

export type ContactsPageProps = {
  organizationRouteParam?: string;
  organizationName?: string;
};

export function ContactsPage({
  organizationRouteParam,
  organizationName,
}: ContactsPageProps = {}) {
  const navigate = useNavigate();
  const { slug, contactSlug: contactSlugParam, section: sectionParam } =
    useParams<{
      slug?: string;
      contactSlug?: string;
      section?: string;
    }>();
  const routeSlug = contactSlugParam ?? slug;
  const routeScope = useMemo<ContactRouteScope>(
    () =>
      organizationRouteParam
        ? { kind: "organization", organizationRouteParam }
        : { kind: "standalone" },
    [organizationRouteParam],
  );
  const contactsListHref = getScopedContactsListHref(routeScope);
  const workspace = useDesktopWorkspaceData();
  const { client } = useDesktopApi();
  const [avatarOverride, setAvatarOverride] = useState<
    string | null | undefined
  >(undefined);
  const contacts = workspace.contacts;
  const { organizations, allTasks: tasks, letters } = workspace;
  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);

  const selected = routeSlug
    ? contacts.find((contact) => contactMatchesSlug(contact, routeSlug)) ??
      null
    : null;

  const details = selected
    ? workspace.contactDetails[selected.id] ?? null
    : null;

  const activeSection = parseContactSectionId(sectionParam);
  const sectionLabel =
    activeSection === "overview"
      ? null
      : (CONTACT_SECTIONS.find((entry) => entry.id === activeSection)?.label ??
        null);

  const selectedSlugValue = selected ? String(contactSlug(selected)) : null;

  useEffect(() => {
    setAvatarOverride(undefined);
  }, [selected?.id]);

  useEffect(() => {
    if (routeSlug || organizationRouteParam) return;
    // Match side-panel alpha order (not API/sort_order).
    const first =
      groupItemsByAlphaLetter(contacts).flatMap(([, entries]) => entries)[0] ??
      null;
    if (first) {
      const routeParam = getUniqueListItemRouteParam(first, contacts);
      navigate(
        getScopedContactSectionHref(routeParam, "overview"),
        { replace: true },
      );
    }
  }, [contacts, navigate, organizationRouteParam, routeSlug]);

  useEffect(() => {
    if (!selected || !sectionParam || !selectedSlugValue) return;
    if (sectionParam === "overview" || !isContactSectionId(sectionParam)) {
      navigate(
        getScopedContactSectionHref(selectedSlugValue, "overview", routeScope),
        { replace: true },
      );
    }
  }, [navigate, routeScope, sectionParam, selected, selectedSlugValue]);

  useDesktopSectionBreadcrumb(
    selected
      ? organizationRouteParam && organizationName
        ? [
            { label: "Organizations", href: "/organizations" },
            {
              label: organizationName,
              href: getOrganizationSectionHref(
                organizationRouteParam,
                "overview",
              ),
            },
            {
              label: "Contacts",
              href: getOrganizationSectionHref(
                organizationRouteParam,
                "contacts",
              ),
            },
            {
              label: selected.name,
              href:
                activeSection === "overview" || !selectedSlugValue
                  ? undefined
                  : getScopedContactSectionHref(
                      selectedSlugValue,
                      "overview",
                      routeScope,
                    ),
            },
            ...(sectionLabel ? [{ label: sectionLabel }] : []),
          ]
        : [
            { label: "Contacts", href: "/contacts" },
            {
              label: selected.name,
              href:
                activeSection === "overview" || !selectedSlugValue
                  ? undefined
                  : getScopedContactSectionHref(
                      selectedSlugValue,
                      "overview",
                      routeScope,
                    ),
            },
            ...(sectionLabel ? [{ label: sectionLabel }] : []),
          ]
      : [{ label: "Contacts" }],
  );

  const organizationOptions = useMemo(
    () => organizations.map((org) => ({ id: org.id, name: org.name })),
    [organizations],
  );

  const handleDeleteContact = useCallback(async () => {
    if (!selected) {
      return { ok: false as const, error: "Contact is required." };
    }
    try {
      await workspace.softDeleteContact(selected.id);
      navigate(contactsListHref, { replace: true });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Failed to delete contact.",
      };
    }
  }, [contactsListHref, navigate, selected, workspace]);

  const contactLetters = useMemo(() => {
    if (!selected) return [];
    return letters.filter((letter) => {
      if (letter.contactId === selected.id) return true;
      const record = workspace.letterRecords[letter.id];
      return record?.contactId === selected.id;
    });
  }, [letters, selected, workspace.letterRecords]);

  if (!routeSlug) {
    return (
      <EntityDetailLayout
        sectionLabel="Contacts"
        title={null}
        resolving={contacts.length > 0}
      />
    );
  }

  if (!selected || !selectedSlugValue) {
    return (
      <EntityDetailLayout
        sectionLabel="Contacts"
        title={null}
        emptyMessage="Contact not found."
      />
    );
  }

  const contact = selected;
  const contactRouteSlug = selectedSlugValue;

  const syncedAvatarSrc = contactAvatarSrc[contact.id] ?? null;
  const avatarSrc =
    avatarOverride !== undefined ? avatarOverride : syncedAvatarSrc;

  function handleSectionChange(next: ContactSectionId) {
    navigate(getScopedContactSectionHref(contactRouteSlug, next, routeScope), {
      replace: true,
    });
  }

  function renderSection(sectionId: ContactSectionId) {
    if (sectionId === "tasks") {
      return (
        <ContactTasksListView
          contactId={contact.id}
          tasks={tasks}
          onSelectTask={(taskId) => {
            const task = tasks.find((entry) => entry.id === taskId);
            if (!task) {
              navigate(`/tasks/${taskId}`);
              return;
            }
            const contactKey =
              contact.key ??
              (contact.number != null ? `C-${contact.number}` : null);
            navigate(
              buildSourceTaskTrailHref(
                getScopedContactBasePath(contactRouteSlug, routeScope),
                {
                  id: task.id,
                  number: task.number,
                  projectKey: task.projectKey,
                  contactKey,
                },
              ),
            );
          }}
          onStatusChange={(taskId, status: TaskStatus) => {
            void workspace.patchTask(taskId, { status });
          }}
          onPriorityChange={(taskId, priority) => {
            void workspace.patchTask(taskId, { priority });
          }}
          onDueDateChange={(taskId, dueDate) => {
            void workspace.patchTask(taskId, {
              dueDate: dueDate ? dueDate.toISOString() : null,
            });
          }}
        />
      );
    }

    if (sectionId === "letters") {
      return (
        <ScopedLettersListView
          letters={contactLetters}
          onSelectLetter={(letter) =>
            navigate(
              getScopedContactLetterHref(
                contactRouteSlug,
                letter.number,
                routeScope,
              ),
            )
          }
          onStatusChange={(letterId, status: TaskStatus) => {
            void workspace.patchLetter(letterId, { status });
          }}
          onDueDateChange={(letterId, dueDate) => {
            void workspace.patchLetter(letterId, {
              dueDate: dueDate ? dueDate.toISOString() : null,
            });
          }}
          onCompose={(status) => {
            const params = new URLSearchParams({
              contactId: contact.id,
              status,
            });
            if (contact.organizationId) {
              params.set("organizationId", contact.organizationId);
            }
            navigate(
              `${getScopedContactLetterHref(contactRouteSlug, "new", routeScope)}?${params.toString()}`,
            );
          }}
        />
      );
    }

    return null;
  }

  return (
    <>
      <RegisterPageTitle title={contact.name} />
      {activeSection === "overview" ? (
        <RegisterEntityDeleteAction
          entityLabel={`contact "${contact.name}"`}
          onDelete={handleDeleteContact}
        />
      ) : null}
      <EntityDetailLayout sectionLabel="Contacts" title={contact.name}>
        <ContactDetailView
          contact={{
            id: contact.id,
            name: contact.name,
            displayId:
              contact.number != null ? `C-${contact.number}` : contact.key,
            email: details?.email ?? null,
            phone: details?.phone ?? null,
            title: details?.title ?? null,
            address: details?.address ?? null,
            city: details?.city ?? null,
            postalCode: details?.postalCode ?? null,
            country: details?.country ?? null,
            organizationId: contact.organizationId ?? details?.organizationId,
            organizationName: contact.organizationName,
            summary: details?.summary ?? null,
            socialAccounts: normalizeContactSocialAccounts(
              details?.socialAccounts,
            ),
          }}
          organizationOptions={organizationOptions}
          section={activeSection}
          onSectionChange={handleSectionChange}
          renderSection={renderSection}
          overviewHeaderAccessory={
            <AvatarUpload
              displayName={contact.name}
              avatarSrc={avatarSrc}
              onUpload={async (file) => {
                const result = await uploadDesktopAvatar(
                  client,
                  "contact",
                  contact.id,
                  file,
                );
                if (result.ok) {
                  const url = URL.createObjectURL(file);
                  setAvatarOverride((current) => {
                    if (current) URL.revokeObjectURL(current);
                    return url;
                  });
                }
                return result;
              }}
              onRemove={async () => {
                const result = await removeDesktopAvatar(
                  client,
                  "contact",
                  contact.id,
                );
                if (result.ok) {
                  setAvatarOverride((current) => {
                    if (current) URL.revokeObjectURL(current);
                    return null;
                  });
                }
                return result;
              }}
            />
          }
          onSaveName={(name) => {
            void workspace.patchContact(contact.id, { name });
            return { ok: true };
          }}
          onSaveDetails={(patch: ContactOverviewDetails) => {
            void workspace.patchContact(contact.id, patch);
          }}
        />
      </EntityDetailLayout>
    </>
  );
}

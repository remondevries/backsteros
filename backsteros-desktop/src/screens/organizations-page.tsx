import type { Organization as ApiOrganization } from "@backsteros/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  AvatarUpload,
  EntityDetailLayout,
  OrganizationContactsListView,
  OrganizationDetailView,
  ORGANIZATION_SECTIONS,
  ProjectsOverviewView,
  RegisterEntityDeleteAction,
  RegisterPageTitle,
  ScopedLettersListView,
  buildOrganizationProjectsHref,
  getLettersHref,
  getOrganizationContactHref,
  getOrganizationProjectHref,
  getOrganizationSectionHref,
  getOrganizationsHref,
  groupItemsByAlphaLetter,
  getUniqueListItemRouteParam,
  isOrganizationSectionId,
  organizationMatchesSlug,
  parseListBoardViewFromLocation,
  parseOrganizationSectionId,
  persistListBoardView,
  PROJECTS_LIST_BOARD_STORAGE_KEY,
  type ListBoardView,
  type OrganizationOverviewDetails,
  type OrganizationSectionId,
  type ContactListItem,
  type ProjectStatus,
  type TaskStatus,
  projectReorderPatches,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import {
  removeDesktopAvatar,
  uploadDesktopAvatar,
} from "../lib/avatar-upload";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDesktopWorkspaceData } from "../lib/workspace-data";

function orgSlug(org: {
  number?: number | null;
  key?: string | null;
  id: string;
}) {
  return org.number ?? org.key ?? org.id;
}

export function OrganizationsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { slug, section: sectionParam } = useParams<{
    slug?: string;
    section?: string;
  }>();
  const workspace = useDesktopWorkspaceData();
  const { client } = useDesktopApi();
  const { organizations, projects, letters, contacts } = workspace;
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    organizations,
  );
  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);
  const [avatarOverride, setAvatarOverride] = useState<
    string | null | undefined
  >(undefined);

  const selected = slug
    ? organizations.find((org) => organizationMatchesSlug(org, slug)) ?? null
    : null;

  const orgProjectsListView = useMemo(
    () =>
      parseListBoardViewFromLocation(
        location.pathname,
        location.search,
        PROJECTS_LIST_BOARD_STORAGE_KEY,
      ),
    [location.pathname, location.search],
  );

  useEffect(() => {
    setAvatarOverride(undefined);
  }, [selected?.id]);

  const details: ApiOrganization | null = selected
    ? (workspace.organizationDetails[selected.id] ?? null)
    : null;

  const activeSection = parseOrganizationSectionId(sectionParam);
  const sectionLabel =
    activeSection === "overview"
      ? null
      : (ORGANIZATION_SECTIONS.find((entry) => entry.id === activeSection)
          ?.label ?? null);

  const selectedSlugValue = selected ? String(orgSlug(selected)) : null;

  useEffect(() => {
    if (slug) return;
    // Match side-panel alpha order (not API/sort_order).
    const first =
      groupItemsByAlphaLetter(organizations).flatMap(
        ([, entries]) => entries,
      )[0] ?? null;
    if (first) {
      const routeParam = getUniqueListItemRouteParam(first, organizations);
      navigate(getOrganizationsHref(routeParam), { replace: true });
    }
  }, [navigate, organizations, slug]);

  useEffect(() => {
    if (!selected || !sectionParam || !selectedSlugValue) return;
    if (
      sectionParam === "overview" ||
      !isOrganizationSectionId(sectionParam)
    ) {
      navigate(getOrganizationSectionHref(selectedSlugValue, "overview"), {
        replace: true,
      });
    }
  }, [navigate, sectionParam, selected, selectedSlugValue]);

  useDesktopSectionBreadcrumb(
    selected
      ? [
          { label: "Organizations", href: "/organizations" },
          {
            label: selected.name,
            href:
              activeSection === "overview" || !selectedSlugValue
                ? undefined
                : getOrganizationSectionHref(selectedSlugValue, "overview"),
          },
          ...(sectionLabel ? [{ label: sectionLabel }] : []),
        ]
      : [{ label: "Organizations" }],
  );

  const handleDeleteOrganization = useCallback(async () => {
    if (!selected) {
      return { ok: false as const, error: "Organization is required." };
    }
    try {
      await workspace.softDeleteOrganization(selected.id);
      navigate("/organizations", { replace: true });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete organization.",
      };
    }
  }, [navigate, selected, workspace]);

  const orgProjects = useMemo(
    () =>
      selected
        ? projects.filter((project) => project.organizationId === selected.id)
        : [],
    [projects, selected],
  );

  const orgLetters = useMemo(() => {
    if (!selected) return [];
    return letters.filter((letter) => {
      if (letter.organizationId === selected.id) return true;
      const record = workspace.letterRecords[letter.id];
      return record?.organizationId === selected.id;
    });
  }, [letters, selected, workspace.letterRecords]);

  const orgContacts = useMemo(() => {
    if (!selected) return [];
    return contacts
      .filter((contact) => contact.organizationId === selected.id)
      .map((contact) => {
        const detail = workspace.contactDetails[contact.id];
        return {
          ...contact,
          email: contact.email ?? detail?.email ?? null,
          title: contact.title ?? detail?.title ?? null,
          avatarSrc: contactAvatarSrc[contact.id] ?? null,
        } satisfies ContactListItem;
      })
      .sort((left, right) =>
        (left.name || "").localeCompare(right.name || "", undefined, {
          sensitivity: "base",
        }),
      );
  }, [contactAvatarSrc, contacts, selected, workspace.contactDetails]);

  if (!slug) {
    return (
      <EntityDetailLayout
        sectionLabel="Organizations"
        title={null}
        resolving={organizations.length > 0}
      />
    );
  }

  if (!selected || !selectedSlugValue) {
    return (
      <EntityDetailLayout
        sectionLabel="Organizations"
        title={null}
        emptyMessage="Organization not found."
      />
    );
  }

  const organization = selected;
  const organizationSlug = selectedSlugValue;

  function handleSectionChange(next: OrganizationSectionId) {
    navigate(getOrganizationSectionHref(organizationSlug, next), {
      replace: true,
    });
  }

  function renderSection(sectionId: OrganizationSectionId) {
    if (sectionId === "projects") {
      return (
        <ProjectsOverviewView
          projects={orgProjects}
          showAreaFilters={false}
          emptyMessage="No projects linked to this organization."
          view={orgProjectsListView}
          onViewChange={(nextView: ListBoardView) => {
            persistListBoardView(nextView, PROJECTS_LIST_BOARD_STORAGE_KEY);
            navigate(
              buildOrganizationProjectsHref(organizationSlug, {
                view: nextView,
              }),
            );
          }}
          onSelectProject={(key) =>
            navigate(getOrganizationProjectHref(organizationSlug, key))
          }
          onStatusChange={(projectId, status: ProjectStatus) => {
            void workspace.patchProject(projectId, { status });
          }}
          onPriorityChange={(projectId, priority) => {
            void workspace.patchProject(projectId, { priority });
          }}
          onStartDateChange={(projectId, startDate) => {
            void workspace.patchProject(projectId, {
              startDate: startDate ? startDate.toISOString() : null,
            });
          }}
          onDueDateChange={(projectId, dueDate) => {
            void workspace.patchProject(projectId, {
              dueDate: dueDate ? dueDate.toISOString() : null,
            });
          }}
          onCreateProject={async ({ status, name }) => {
            return workspace.createProject({
              name,
              status,
              organizationId: organization.id,
            });
          }}
          onCreatedProject={(_id, key) => {
            if (key) {
              navigate(getOrganizationProjectHref(organizationSlug, key));
            }
          }}
          onReorder={(request) => {
            const patches = projectReorderPatches(orgProjects, request);
            for (const patch of patches) {
              void workspace.patchProject(patch.id, {
                status: patch.status,
                sortOrder: patch.sortOrder,
              });
            }
          }}
        />
      );
    }

    if (sectionId === "letters") {
      return (
        <ScopedLettersListView
          letters={orgLetters}
          onSelectLetter={(letter) => navigate(getLettersHref(letter.number))}
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
              organizationId: organization.id,
              status,
            });
            navigate(`/letters/new?${params.toString()}`);
          }}
        />
      );
    }

    if (sectionId === "contacts") {
      return (
        <OrganizationContactsListView
          contacts={orgContacts}
          onSelectContact={(contact) =>
            navigate(getOrganizationContactHref(organizationSlug, contact))
          }
        />
      );
    }

    return null;
  }

  return (
    <>
      <RegisterPageTitle title={organization.name} />
      {activeSection === "overview" ? (
        <RegisterEntityDeleteAction
          entityLabel={`organization "${organization.name}"`}
          onDelete={handleDeleteOrganization}
        />
      ) : null}
      <OrganizationDetailView
        organization={{
          id: organization.id,
          name: organization.name,
          key: organization.key,
          number: organization.number,
          displayId:
            organization.number != null
              ? `O-${organization.number}`
              : organization.key ?? null,
          phone: details?.phone ?? null,
          email: details?.email ?? null,
          website: details?.website ?? null,
          address: details?.address ?? null,
          city: details?.city ?? null,
          postalCode: details?.postalCode ?? null,
          country: details?.country ?? null,
          summary: details?.summary ?? null,
        }}
        section={activeSection}
        onSectionChange={handleSectionChange}
        renderSection={renderSection}
        overviewHeaderAccessory={
          <AvatarUpload
            displayName={organization.name}
            avatarSrc={
              avatarOverride !== undefined
                ? avatarOverride
                : (organizationAvatarSrc[organization.id] ?? null)
            }
            onUpload={async (file) => {
              const result = await uploadDesktopAvatar(
                client,
                "organization",
                organization.id,
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
                "organization",
                organization.id,
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
          void workspace.patchOrganization(organization.id, { name });
          return { ok: true };
        }}
        onSaveDetails={(patch: OrganizationOverviewDetails) => {
          void workspace.patchOrganization(organization.id, patch);
        }}
      />
    </>
  );
}

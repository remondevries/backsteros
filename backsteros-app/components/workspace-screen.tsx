"use client";

import type {
  Area,
  Contact,
  Document,
  Letter,
  Organization,
  Project,
  Task,
} from "@backsteros/contracts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { apiErrorMessage, useApiResource, useAppApi } from "@/lib/api-context";
import { type RouteFamily, routeCopy } from "@/lib/navigation";
import {
  type SyncedMetadataTable,
  usePowerSync,
  usePowerSyncQuery,
} from "@/lib/powersync-context";
import { preferLocalOrApi } from "@/lib/sync/prefer-local-or-api";

import { InboxScreen } from "./screens/inbox-screen";
import { ContactLettersScreen } from "./screens/contact-letters-screen";
import { ContactOverviewScreen } from "./screens/contact-overview-screen";
import { ContactTasksScreen } from "./screens/contact-tasks-screen";
import { ContactsIndexScreen } from "./screens/contacts-index-screen";
import { KnowledgeIndexScreen } from "./screens/knowledge-index-screen";
import { LetterComposeScreen } from "./screens/letter-compose-screen";
import { LetterDetailScreen } from "./screens/letter-detail-screen";
import { LettersIndexScreen } from "./screens/letters-index-screen";
import { OrganizationContactsScreen } from "./screens/organization-contacts-screen";
import { OrganizationLettersScreen } from "./screens/organization-letters-screen";
import { OrganizationOverviewScreen } from "./screens/organization-overview-screen";
import { OrganizationProjectsScreen } from "./screens/organization-projects-screen";
import { OrganizationsIndexScreen } from "./screens/organizations-index-screen";
import { ProjectDocumentsIndexScreen } from "./screens/project-documents-index-screen";
import { ProjectLettersIndexScreen } from "./screens/project-letters-index-screen";
import { ProjectOverviewScreen } from "./screens/project-overview-screen";
import { ProjectUpdatesScreen } from "./screens/project-updates-screen";
import { ProjectTasksScreen } from "./screens/project-tasks-screen";
import { ProjectsScreen } from "./screens/projects-screen";
import { DocumentDetailScreen } from "./screens/document-detail-screen";
import { TaskDetailScreen } from "./screens/task-detail-screen";
import { TasksScreen } from "./screens/tasks-screen";
import {
  contactMatchesRouteSlug,
  getCanonicalContactRouteParam,
  getCanonicalOrganizationRouteParam,
  getContactHref,
  getLettersHref,
  getOrganizationHref,
  getProjectHref,
  organizationMatchesRouteSlug,
} from "@/lib/entity-route-hrefs";
import { getProjectDocumentHref } from "@/lib/document-navigation-path";
import { getKnowledgeDocumentHref } from "@/lib/knowledge/navigation-path";
import { isTasksDueFilter } from "@/lib/tasks-due-filters";
import { encodeProjectSlug, parseTaskSlug } from "@/lib/entity-slugs";
import { ContactNav } from "@/components/contacts/contact-nav";
import { ContactRouteBreadcrumb } from "@/components/contacts/contact-route-breadcrumb";
import { JournalLayoutBreadcrumb } from "@/components/journal/journal-layout-breadcrumb";
import { JournalDetailSkeleton } from "@/components/journal/journal-detail-skeleton";
import { KnowledgeLayoutBreadcrumb } from "@/components/knowledge/knowledge-layout-breadcrumb";
import { ListLayoutBreadcrumb } from "@/components/navigation/list-layout-breadcrumb";
import { NavigationTrailScreen } from "@/components/navigation/navigation-trail-screen";
import { parseNavigationTrailPath } from "@/lib/navigation-trail/codec";
import { OrganizationLayoutBreadcrumb } from "@/components/organizations/organization-layout-breadcrumb";
import { OrganizationNav } from "@/components/organizations/organization-nav";
import { ProjectNav } from "@/components/projects/project-nav";
import { ProjectRouteBreadcrumb } from "@/components/projects/project-route-breadcrumb";
import { normalizeOrganization } from "@/lib/entity-normalize";
import {
  getProjectRouteScopeFromPathname,
  getScopedProjectLetterHref,
} from "@/lib/project-route-scope";
import {
  projectMatchesRouteParam,
  shouldShowProjectNav,
} from "@/lib/project-sections";
import { AccountSettingsSection } from "@/components/settings/account-settings-section";
import { ApiKeysSettingsSection } from "@/components/settings/api-keys-settings-section";
import { GeneralSettingsSection } from "@/components/settings/general-settings-section";
import { StorageSettingsSection } from "@/components/settings/storage-settings-section";
import { WhoopSettingsSection } from "@/components/settings/whoop-settings-section";
import { SettingsContentHeader } from "@/components/settings/settings-content-header";
import { SyncSettingsSection } from "@/components/settings/sync-settings-section";
import {
  DEFAULT_SETTINGS_TAB,
  getSettingsTabMeta,
  SETTINGS_NAV_TABS,
  type SettingsTabId,
} from "@/lib/settings/tabs";

function isSettingsTabId(value: string | undefined): value is SettingsTabId {
  return SETTINGS_NAV_TABS.some((tab) => tab.id === value);
}

function OrganizationCollectionBreadcrumb({
  organizationRouteParam,
}: {
  organizationRouteParam: string;
}) {
  const resource = useApiResource<{ organizations: Organization[] }>((client) =>
    client.requestJson("/api/v1/organizations"),
  );
  const organization = useMemo(() => {
    const match = (resource.data?.organizations ?? []).find((entry) =>
      organizationMatchesRouteSlug(entry, organizationRouteParam),
    );
    return match ? normalizeOrganization(match) : null;
  }, [organizationRouteParam, resource.data]);

  if (!organization) {
    return null;
  }

  return (
    <OrganizationLayoutBreadcrumb organizationName={organization.name} />
  );
}

type Entity = Project | Task | Organization | Contact | Area | Letter | Document;
type Collection = {
  items: Entity[];
  endpoint: string;
  responseKey: string;
  family: RouteFamily;
  createDefaults?: Record<string, unknown>;
  /** Project key/slug when this collection is scoped under a project section. */
  projectRouteParam?: string;
  projectSection?: "documents" | "letters" | "tasks";
  contactRouteParam?: string;
  organizationRouteParam?: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const humanize = (value: string) => value.replaceAll(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const entityTitle = (item: Entity) => "name" in item ? item.name : item.title;
const entitySubtitle = (item: Entity) => {
  if ("summary" in item && item.summary) return item.summary;
  if ("description" in item && item.description) return item.description;
  if ("email" in item && item.email) return item.email;
  if ("path" in item) return item.path;
  if ("status" in item) return item.status;
  return "Updated " + new Date(item.updatedAt).toLocaleDateString();
};

const familyTables: Partial<Record<RouteFamily, SyncedMetadataTable>> = {
  projects: "projects",
  tasks: "tasks",
  inbox: "tasks",
  organizations: "organizations",
  contacts: "contacts",
  letters: "letters",
  knowledge: "documents",
};

function snakeToCamelRow(row: Record<string, unknown>): Entity {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      key === "inbox" ? Boolean(value) : value;
  }
  return output as Entity;
}

function toLocalFields(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      value,
    ]),
  );
}

function localCollectionQuery(config: Collection): {
  sql: string;
  parameters: unknown[];
} | null {
  const table = familyTables[config.family];
  if (!table) return null;
  const url = new URL(config.endpoint, "https://local.invalid");
  if (url.pathname.endsWith("/tasks/due")) return null;
  const conditions = ["deleted_at IS NULL"];
  const parameters: unknown[] = [];
  const filters: Record<string, string> = {
    projectId: "project_id",
    organizationId: "organization_id",
    contactId: "contact_id",
    assigneeId: "assignee_id",
    status: "status",
    type: "type",
  };
  for (const [queryKey, column] of Object.entries(filters)) {
    const value = url.searchParams.get(queryKey);
    if (value) {
      conditions.push(`${column} = ?`);
      parameters.push(value);
    }
  }
  if (config.family === "inbox") conditions.push("inbox = 1");
  return {
    sql: `SELECT * FROM ${table} WHERE ${conditions.join(" AND ")} ORDER BY sort_order, updated_at DESC`,
    parameters,
  };
}

function collectionFor(segments: string[]): Collection | null {
  const [family, id, section] = segments;
  if (family === "projects" && id && section === "documents") {
    return {
      items: [],
      endpoint: `/api/v1/documents?type=project&projectId=${encodeURIComponent(id)}`,
      responseKey: "documents",
      family: "knowledge",
      createDefaults: { type: "project", projectId: id },
      projectRouteParam: id,
      projectSection: "documents",
    };
  }
  if (family === "projects" && id && section === "tasks") {
    return {
      items: [],
      endpoint: `/api/v1/tasks?projectId=${encodeURIComponent(id)}`,
      responseKey: "tasks",
      family: "tasks",
      createDefaults: { projectId: id },
      projectRouteParam: id,
      projectSection: "tasks",
    };
  }
  if (family === "organizations" && id && section === "contacts" && !segments[3]) {
    return {
      items: [],
      endpoint: `/api/v1/contacts?organizationId=${encodeURIComponent(id)}`,
      responseKey: "contacts",
      family: "contacts",
      createDefaults: { organizationId: id },
      organizationRouteParam: id,
    };
  }
  if (family === "organizations" && id && section === "projects" && !segments[3]) {
    return {
      items: [],
      endpoint: `/api/v1/projects?organizationId=${encodeURIComponent(id)}`,
      responseKey: "projects",
      family: "projects",
      createDefaults: { organizationId: id },
      organizationRouteParam: id,
    };
  }
  // Org-scoped project documents: /organizations/:org/projects/:project/documents
  if (
    family === "organizations" &&
    id &&
    section === "projects" &&
    segments[3] &&
    segments[4] === "documents"
  ) {
    const projectRouteParam = segments[3];
    return {
      items: [],
      endpoint: `/api/v1/documents?type=project&projectId=${encodeURIComponent(projectRouteParam)}`,
      responseKey: "documents",
      family: "knowledge",
      createDefaults: { type: "project", projectId: projectRouteParam },
      projectRouteParam,
      projectSection: "documents",
      organizationRouteParam: id,
    };
  }
  // Org-scoped project letters list: /organizations/:org/projects/:project/letters
  if (
    family === "organizations" &&
    id &&
    section === "projects" &&
    segments[3] &&
    segments[4] === "letters" &&
    !segments[5]
  ) {
    const projectRouteParam = segments[3];
    return {
      items: [],
      endpoint: `/api/v1/letters?projectId=${encodeURIComponent(projectRouteParam)}`,
      responseKey: "letters",
      family: "letters",
      createDefaults: { projectId: projectRouteParam },
      projectRouteParam,
      projectSection: "letters",
      organizationRouteParam: id,
    };
  }
  if (family === "contacts" && id && section === "tasks") {
    return {
      items: [],
      endpoint: `/api/v1/tasks?assigneeId=${encodeURIComponent(id)}`,
      responseKey: "tasks",
      family: "tasks",
      createDefaults: { assigneeId: id },
      contactRouteParam: id,
    };
  }
  if (id && section === "letters" && ["projects", "organizations", "contacts"].includes(family)) {
    const scopeKey = family === "projects" ? "projectId" : family === "organizations" ? "organizationId" : "contactId";
    return {
      items: [],
      endpoint: `/api/v1/letters?${scopeKey}=${encodeURIComponent(id)}`,
      responseKey: "letters",
      family: "letters",
      createDefaults: { [scopeKey]: id },
      ...(family === "projects"
        ? { projectRouteParam: id, projectSection: "letters" as const }
        : family === "organizations"
          ? { organizationRouteParam: id }
          : { contactRouteParam: id }),
    };
  }
  if (family === "inbox") return { items: [], endpoint: "/api/v1/tasks/inbox", responseKey: "tasks", family: "inbox", createDefaults: { inbox: true } };
  if (family === "tasks" && id && ["today", "upcoming", "overdue", "due"].includes(id)) {
    const before = id === "upcoming" ? new Date(Date.now() + 30 * 864e5).toISOString() : new Date(`${today()}T23:59:59.999Z`).toISOString();
    return { items: [], endpoint: `/api/v1/tasks/due?before=${encodeURIComponent(before)}`, responseKey: "tasks", family: "tasks" };
  }
  const map: Record<string, Omit<Collection, "items">> = {
    projects: { endpoint: "/api/v1/projects", responseKey: "projects", family: "projects" },
    areas: { endpoint: "/api/v1/areas", responseKey: "areas", family: "areas" },
    tasks: { endpoint: "/api/v1/tasks", responseKey: "tasks", family: "tasks" },
    organizations: { endpoint: "/api/v1/organizations", responseKey: "organizations", family: "organizations" },
    contacts: { endpoint: "/api/v1/contacts", responseKey: "contacts", family: "contacts" },
    letters: { endpoint: "/api/v1/letters", responseKey: "letters", family: "letters" },
    knowledge: { endpoint: "/api/v1/documents?type=knowledge", responseKey: "documents", family: "knowledge", createDefaults: { type: "knowledge" } },
  };
  return !id && map[family] ? { items: [], ...map[family] } : null;
}

function StateView({ loading, error, retry }: { loading: boolean; error: Error | null; retry: () => void }) {
  if (loading) return <div className="loading-list">{Array.from({ length: 5 }, (_, index) => <div key={index} />)}</div>;
  if (error) return <div className="error-state"><strong>Could not load this view</strong><p>{error.message}</p><button onClick={retry}>Try again</button></div>;
  return null;
}

function CreateForm({
  collection,
  onDone,
}: {
  collection: Collection;
  onDone: () => void;
}) {
  const { client } = useAppApi();
  const sync = usePowerSync();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const isTask = collection.family === "tasks" || collection.family === "inbox";
    const isDocument = collection.family === "knowledge";
    const body = {
      ...collection.createDefaults,
      ...(isTask ? { title: name } : isDocument ? { title: name, path: key || `${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.md`, content: "" } : collection.family === "letters" ? { title: name } : { name, ...(collection.family === "areas" ? {} : { key: key || name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-") }) }),
    };
    try {
      const table = familyTables[collection.family];
      if (table && sync.ready && collection.family !== "knowledge") {
        await sync.createMetadata(table, toLocalFields(body));
      } else {
        await client.requestJson(collection.endpoint.split("?")[0]!, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      }
      toast.success(`${routeCopy[collection.family].singular} created`);
      setName("");
      setKey("");
      setOpen(false);
      onDone();
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (collection.family === "letters") {
    return (
      <Link href="/letters/new" className="primary-action">
        ＋ New letter
      </Link>
    );
  }

  if (!open) return <button className="primary-action" onClick={() => setOpen(true)}>＋ New {routeCopy[collection.family].singular}</button>;
  return (
    <form className="inline-create" onSubmit={submit}>
      <input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder={`${humanize(routeCopy[collection.family].singular)} name`} />
      {!["tasks", "inbox", "letters", "areas"].includes(collection.family) ? <input value={key} onChange={(event) => setKey(event.target.value)} placeholder={collection.family === "knowledge" ? "path/to/document.md" : "key"} /> : null}
      <button disabled={saving}>{saving ? "Creating…" : "Create"}</button>
      <button type="button" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}

function CollectionScreen({ segments, config }: { segments: string[]; config: Collection }) {
  const pathname = usePathname();
  const { client } = useAppApi();
  const sync = usePowerSync();
  const [view, setView] = useState<"list" | "board">("list");
  const resource = useApiResource<{ [key: string]: Entity[] }>((api) => api.requestJson(config.endpoint), [config.endpoint]);
  const localQuery = localCollectionQuery(config);
  const local = usePowerSyncQuery<Record<string, unknown>>(
    localQuery?.sql ?? null,
    localQuery?.parameters ?? [],
  );
  const items = useMemo(
    () =>
      preferLocalOrApi(
        local.data?.map(snakeToCamelRow),
        resource.data?.[config.responseKey],
      ),
    [config.responseKey, local.data, resource.data],
  );
  const isTasks = config.family === "tasks" || config.family === "inbox";
  const title = segments.length > 1 ? humanize(segments.at(-1)!) : routeCopy[config.family].title;

  async function patch(item: Entity, body: Record<string, unknown>) {
    try {
      const base = config.family === "inbox" ? "tasks" : config.family === "knowledge" ? "documents" : config.family;
      const table = familyTables[config.family];
      if (table && sync.ready) {
        await sync.patchMetadata(table, item.id, toLocalFields(body));
      } else {
        await client.requestJson(`/api/v1/${base}/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        resource.reload();
      }
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  }

  async function reorder(index: number, direction: -1 | 1) {
    const next = [...items];
    const target = index + direction;
    if (!next[target]) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    const base = isTasks ? "tasks" : config.family === "knowledge" ? "documents" : null;
    if (!base) return;
    try {
      await client.requestJson(`/api/v1/${base}/reorder`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderedIds: next.map((item) => item.id) }) });
      resource.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  }

  const groups = useMemo(() => {
    if (!isTasks) return [];
    return ["triage", "ready_to_start", "in_progress", "completed"].map((status) => ({ status, items: items.filter((item) => "status" in item && item.status === status) }));
  }, [isTasks, items]);

  return (
    <div className="route-view">
      {config.projectRouteParam ? (
        <ProjectRouteBreadcrumb projectRouteParam={config.projectRouteParam} />
      ) : null}
      {config.contactRouteParam ? (
        <ContactRouteBreadcrumb contactRouteParam={config.contactRouteParam} />
      ) : null}
      {config.organizationRouteParam && !config.contactRouteParam ? (
        <OrganizationCollectionBreadcrumb
          organizationRouteParam={config.organizationRouteParam}
        />
      ) : null}
      {config.family === "knowledge" ? <KnowledgeLayoutBreadcrumb /> : null}
      {config.family === "letters" &&
      !config.projectRouteParam &&
      !config.contactRouteParam &&
      !config.organizationRouteParam ? (
        <ListLayoutBreadcrumb label="Letters" />
      ) : null}
      {config.projectRouteParam &&
      shouldShowProjectNav(pathname, config.projectRouteParam) ? (
        <ProjectNav projectRouteParam={config.projectRouteParam} />
      ) : null}
      {config.contactRouteParam ? (
        <ContactNav contactRouteParam={config.contactRouteParam} />
      ) : null}
      {config.organizationRouteParam && !config.projectRouteParam ? (
        <OrganizationNav
          organizationRouteParam={config.organizationRouteParam}
        />
      ) : null}
      <header className="route-header">
        <div><span className="eyebrow">Backsteros</span><h1>{title}</h1><p>{routeCopy[config.family].description}</p></div>
        <div className="header-actions">
          {isTasks ? <div className="segmented-control"><button className={view === "list" ? "is-active" : ""} onClick={() => setView("list")}>List</button><button className={view === "board" ? "is-active" : ""} onClick={() => setView("board")}>Board</button></div> : null}
          <CreateForm collection={config} onDone={resource.reload} />
        </div>
      </header>
      <StateView loading={local.data === null && resource.loading} error={local.data === null ? resource.error : local.error} retry={() => { resource.reload(); void sync.retry(); }} />
      {!(local.data === null && resource.loading) && !(local.data === null ? resource.error : local.error) && !items.length ? (
        <div className="empty-state">
          <span className="empty-state-mark">B</span>
          <h2>No {title.toLowerCase()} yet</h2>
          <p>Create the first item in this view.</p>
          {config.family === "letters" ? (
            <p>
              <Link href="/letters/new" className="primary-action">
                New letter
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
      {view === "board" && isTasks ? (
        <div className="task-board">{groups.map((group) => <section key={group.status}><h2>{humanize(group.status)} <small>{group.items.length}</small></h2>{group.items.map((item) => <EntityRow key={item.id} item={item} family={config.family} projectRouteParam={config.projectRouteParam} compact onPatch={patch} />)}</section>)}</div>
      ) : (
        <div className="entity-list">{items.map((item, index) => <EntityRow key={item.id} item={item} family={config.family} projectRouteParam={config.projectRouteParam} onPatch={patch} onMove={(direction) => reorder(index, direction)} />)}</div>
      )}
    </div>
  );
}

function EntityRow({
  item,
  family,
  projectRouteParam,
  compact = false,
  onPatch,
  onMove,
}: {
  item: Entity;
  family: RouteFamily;
  projectRouteParam?: string;
  compact?: boolean;
  onPatch: (item: Entity, body: Record<string, unknown>) => void;
  onMove?: (direction: -1 | 1) => void;
}) {
  const pathname = usePathname();
  const projectScope = getProjectRouteScopeFromPathname(pathname);
  const actualFamily = family === "inbox" ? "tasks" : family;
  const href =
    actualFamily === "knowledge" && "path" in item
      ? projectRouteParam
        ? getProjectDocumentHref(
            projectRouteParam,
            item.path || item.id,
            projectScope,
          )
        : getKnowledgeDocumentHref(item.path || item.id)
      : actualFamily === "projects" && "key" in item
        ? getProjectHref({ key: item.key })
        : actualFamily === "contacts"
          ? getContactHref(item as Contact)
          : actualFamily === "organizations"
            ? getOrganizationHref(item as Organization)
            : actualFamily === "letters" && "number" in item
              ? projectRouteParam && (item as Letter).number != null
                ? getScopedProjectLetterHref(
                    projectRouteParam,
                    (item as Letter).number!,
                    projectScope,
                  )
                : getLettersHref((item as Letter).number)
              : `/${actualFamily}/${item.id}`;
  const isTask = "inbox" in item;
  return (
    <article className={`entity-row${compact ? " compact" : ""}`}>
      {isTask ? <button className={`completion${item.status === "completed" ? " is-done" : ""}`} aria-label="Toggle completion" onClick={() => onPatch(item, { status: item.status === "completed" ? "ready_to_start" : "completed" })}>✓</button> : <span className="entity-avatar">{"icon" in item && item.icon ? item.icon : entityTitle(item).slice(0, 1).toUpperCase()}</span>}
      <Link href={href}><strong>{entityTitle(item)}</strong><span>{entitySubtitle(item)}</span></Link>
      {"status" in item ? <span className={`status status-${item.status}`}>{humanize(item.status)}</span> : null}
      {isTask && item.inbox ? <button onClick={() => onPatch(item, { inbox: false, triagedAt: new Date().toISOString() })}>Triage</button> : null}
      {onMove ? <div className="row-actions"><button aria-label="Move up" onClick={() => onMove(-1)}>↑</button><button aria-label="Move down" onClick={() => onMove(1)}>↓</button></div> : null}
    </article>
  );
}

function JournalScreen({ date }: { date: string }) {
  const entry = useApiResource<Document>((api) => api.requestJson(`/api/v1/journal/${date}`), [date]);
  if (entry.loading) {
    return (
      <>
        <JournalLayoutBreadcrumb />
        <JournalDetailSkeleton />
      </>
    );
  }
  if (entry.error) {
    return (
      <div className="route-view">
        <JournalLayoutBreadcrumb />
        <StateView loading={false} error={entry.error} retry={entry.reload} />
      </div>
    );
  }
  return entry.data ? (
    <DocumentDetailScreen
      routeParam={entry.data.id}
      backHref="/journal"
      breadcrumbContext="journal"
      journalDateSlug={date}
    />
  ) : (
    <>
      <JournalLayoutBreadcrumb />
    </>
  );
}

function ResolvedScopedCollectionScreen({
  segments,
  config,
}: {
  segments: string[];
  config: Collection;
}) {
  const parentFamily = segments[0];
  const parentParam = segments[1];
  const nestedProjectParam = segments[3];
  const needsContactResolve = Boolean(config.contactRouteParam);
  const needsOrganizationResolve = Boolean(config.organizationRouteParam);
  const needsProjectResolve = Boolean(
    config.projectRouteParam && config.organizationRouteParam,
  );

  const contactsResource = useApiResource<{ contacts: Contact[] }>(
    (api) =>
      needsContactResolve
        ? api.requestJson("/api/v1/contacts")
        : Promise.resolve({ contacts: [] as Contact[] }),
    [needsContactResolve],
  );
  const orgsResource = useApiResource<{ organizations: Organization[] }>(
    (api) =>
      needsOrganizationResolve
        ? api.requestJson("/api/v1/organizations")
        : Promise.resolve({ organizations: [] as Organization[] }),
    [needsOrganizationResolve],
  );
  const projectsResource = useApiResource<{ projects: Project[] }>(
    (api) =>
      needsProjectResolve
        ? api.requestJson("/api/v1/projects")
        : Promise.resolve({ projects: [] as Project[] }),
    [needsProjectResolve],
  );

  const resolved = useMemo(() => {
    if (!parentParam) return config;

    if (needsContactResolve && parentFamily === "contacts") {
      const contact = (contactsResource.data?.contacts ?? []).find((entry) =>
        contactMatchesRouteSlug(entry, parentParam),
      );
      if (!contact) return null;
      const routeParam = getCanonicalContactRouteParam(contact);
      const endpoint =
        config.family === "letters"
          ? `/api/v1/letters?contactId=${encodeURIComponent(contact.id)}`
          : `/api/v1/tasks?assigneeId=${encodeURIComponent(contact.id)}`;
      return {
        ...config,
        endpoint,
        createDefaults:
          config.family === "letters"
            ? { ...config.createDefaults, contactId: contact.id }
            : { ...config.createDefaults, assigneeId: contact.id },
        contactRouteParam: routeParam,
      } satisfies Collection;
    }

    if (needsOrganizationResolve && parentFamily === "organizations") {
      const organization = (orgsResource.data?.organizations ?? []).find(
        (entry) => organizationMatchesRouteSlug(entry, parentParam),
      );
      if (!organization) return null;
      const routeParam = getCanonicalOrganizationRouteParam(organization);

      if (needsProjectResolve && (config.projectRouteParam || nestedProjectParam)) {
        const projectRoute = config.projectRouteParam || nestedProjectParam!;
        const project = (projectsResource.data?.projects ?? []).find((entry) =>
          projectMatchesRouteParam(entry, projectRoute),
        );
        if (!project) return null;
        const projectKey = encodeProjectSlug(project.key);
        if (config.family === "knowledge" || config.projectSection === "documents") {
          return {
            ...config,
            endpoint: `/api/v1/documents?type=project&projectId=${encodeURIComponent(project.id)}`,
            createDefaults: {
              ...config.createDefaults,
              type: "project",
              projectId: project.id,
              organizationId: organization.id,
            },
            projectRouteParam: projectKey,
            organizationRouteParam: routeParam,
          } satisfies Collection;
        }
        if (config.family === "letters" || config.projectSection === "letters") {
          return {
            ...config,
            endpoint: `/api/v1/letters?projectId=${encodeURIComponent(project.id)}`,
            createDefaults: {
              ...config.createDefaults,
              projectId: project.id,
              organizationId: organization.id,
            },
            projectRouteParam: projectKey,
            organizationRouteParam: routeParam,
          } satisfies Collection;
        }
      }

      const endpoint =
        config.family === "contacts"
          ? `/api/v1/contacts?organizationId=${encodeURIComponent(organization.id)}`
          : config.family === "projects"
            ? `/api/v1/projects?organizationId=${encodeURIComponent(organization.id)}`
            : `/api/v1/letters?organizationId=${encodeURIComponent(organization.id)}`;
      return {
        ...config,
        endpoint,
        createDefaults: {
          ...config.createDefaults,
          organizationId: organization.id,
        },
        organizationRouteParam: routeParam,
      } satisfies Collection;
    }

    return config;
  }, [
    config,
    contactsResource.data,
    needsContactResolve,
    needsOrganizationResolve,
    needsProjectResolve,
    nestedProjectParam,
    orgsResource.data,
    parentFamily,
    parentParam,
    projectsResource.data,
  ]);

  if (
    (needsContactResolve && contactsResource.loading && !resolved) ||
    (needsOrganizationResolve && orgsResource.loading && !resolved) ||
    (needsProjectResolve && projectsResource.loading && !resolved)
  ) {
    return (
      <div className="route-view">
        <StateView
          loading
          error={null}
          retry={() => {
            contactsResource.reload();
            orgsResource.reload();
            projectsResource.reload();
          }}
        />
      </div>
    );
  }

  if (
    (needsContactResolve || needsOrganizationResolve || needsProjectResolve) &&
    !resolved
  ) {
    return (
      <div className="route-view error-state">
        <strong>Not found</strong>
        <p>Could not resolve “{parentParam}”.</p>
      </div>
    );
  }

  return (
    <CollectionScreen segments={segments} config={resolved ?? config} />
  );
}

function SettingsScreen({ tab }: { tab?: string }) {
  const activeTab = isSettingsTabId(tab) ? tab : DEFAULT_SETTINGS_TAB;
  const meta = getSettingsTabMeta(activeTab);
  const settings = useApiResource<{ settings: Record<string, unknown> }>((api) =>
    api.requestJson("/api/v1/settings"),
  );
  const timezone = String(
    settings.data?.settings.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone,
  );

  return (
    <div className="settings-panel">
      <div className="settings-panel-body">
        <div className="settings-content-container">
          {activeTab === "whoop" ? (
            <WhoopSettingsSection
              title={meta.label}
              description={meta.description}
            />
          ) : activeTab === "storage" ? (
            <StorageSettingsSection
              title={meta.label}
              description={meta.description}
            />
          ) : (
            <>
              <SettingsContentHeader
                title={meta.label}
                description={meta.description}
              />
              <StateView
                loading={settings.loading}
                error={settings.error}
                retry={settings.reload}
              />
              {activeTab === "general" ? (
                <GeneralSettingsSection
                  timezone={timezone}
                  onSaved={() => settings.reload()}
                />
              ) : null}
              {activeTab === "account" ? <AccountSettingsSection /> : null}
              {activeTab === "sync" ? <SyncSettingsSection /> : null}
              {activeTab === "api" ? <ApiKeysSettingsSection /> : null}
              {activeTab === "cursor" ? (
                <section className="settings-card">
                  <h2>Cursor</h2>
                  <p>
                    Cursor integration settings are not available yet. This section will
                    cover API keys, agent profiles, and model selection when the feature
                    is ready.
                  </p>
                  <p className="settings-hint">Coming soon</p>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function WorkspaceScreen({ segments }: { segments: string[] }) {
  const trail = parseNavigationTrailPath(`/${segments.join("/")}`);
  if (trail) {
    return <NavigationTrailScreen trail={trail} />;
  }

  const [family, id, section, nestedId] = segments;

  if (family === "inbox") {
    return <InboxScreen selectedTaskId={id} />;
  }

  if (family === "tasks") {
    if (id && isTasksDueFilter(id) && section) {
      return (
        <TaskDetailScreen
          taskRouteParam={section}
          context="tasks"
          backHref={`/tasks/${id}`}
        />
      );
    }

    if (id && !isTasksDueFilter(id) && (parseTaskSlug(id) || /^\d+$/.test(id))) {
      return (
        <TaskDetailScreen
          taskRouteParam={id}
          context="tasks"
          backHref="/tasks"
        />
      );
    }

    const dueSegment = id && isTasksDueFilter(id) ? id : undefined;
    return <TasksScreen dueSegment={dueSegment} />;
  }

  if (family === "projects" && !id) {
    return <ProjectsScreen />;
  }

  if (family === "projects" && id && section === "tasks" && nestedId) {
    return (
      <TaskDetailScreen
        taskRouteParam={nestedId}
        projectRouteParam={id}
        context="project"
        backHref={`/projects/${id}/tasks`}
      />
    );
  }

  if (family === "projects" && id && section === "tasks") {
    return <ProjectTasksScreen projectParam={id} />;
  }

  if (family === "projects" && id && section === "documents" && !nestedId) {
    return <ProjectDocumentsIndexScreen projectParam={id} />;
  }

  if (family === "projects" && id && section === "letters" && !nestedId) {
    return <ProjectLettersIndexScreen projectParam={id} />;
  }

  if (family === "projects" && id && section === "updates") {
    return <ProjectUpdatesScreen projectParam={id} />;
  }

  if (family === "projects" && id && !section) {
    return <ProjectOverviewScreen projectParam={id} />;
  }

  if (family === "contacts" && !id) {
    return <ContactsIndexScreen />;
  }

  if (family === "organizations" && !id) {
    return <OrganizationsIndexScreen />;
  }

  if (family === "contacts" && id && section === "tasks" && nestedId) {
    return (
      <TaskDetailScreen
        taskRouteParam={nestedId}
        context="tasks"
        backHref={`/contacts/${id}/tasks`}
      />
    );
  }

  if (family === "contacts" && id && section === "tasks") {
    return <ContactTasksScreen contactParam={id} />;
  }

  if (family === "contacts" && id && section === "letters" && nestedId) {
    return (
      <LetterDetailScreen
        letterRouteParam={nestedId}
        backHref={`/contacts/${id}/letters`}
      />
    );
  }

  if (family === "contacts" && id && section === "letters" && !nestedId) {
    return <ContactLettersScreen contactParam={id} />;
  }

  if (family === "contacts" && id && !section) {
    return <ContactOverviewScreen contactParam={id} />;
  }

  if (
    family === "organizations" &&
    id &&
    section === "contacts" &&
    nestedId
  ) {
    const nestedSection = segments[4];
    const nestedDetail = segments[5];

    if (nestedSection === "tasks" && nestedDetail) {
      return (
        <TaskDetailScreen
          taskRouteParam={nestedDetail}
          context="tasks"
          backHref={`/organizations/${id}/contacts/${nestedId}/tasks`}
        />
      );
    }

    if (nestedSection === "tasks") {
      return (
        <ContactTasksScreen
          contactParam={nestedId}
          organizationRouteParam={id}
        />
      );
    }

    if (nestedSection === "letters" && nestedDetail) {
      return (
        <LetterDetailScreen
          letterRouteParam={nestedDetail}
          backHref={`/organizations/${id}/contacts/${nestedId}/letters`}
        />
      );
    }

    if (nestedSection === "letters" && !nestedDetail) {
      return (
        <ContactLettersScreen
          contactParam={nestedId}
          organizationRouteParam={id}
        />
      );
    }

    if (!nestedSection) {
      return (
        <ContactOverviewScreen
          contactParam={nestedId}
          organizationRouteParam={id}
        />
      );
    }
  }

  // Org-scoped project detail: /organizations/:org/projects/:project/...
  if (family === "organizations" && id && section === "projects" && nestedId) {
    const projectSection = segments[4];
    const projectDetail = segments[5];
    const orgProjectBase = `/organizations/${id}/projects/${nestedId}`;

    if (projectSection === "tasks" && projectDetail) {
      return (
        <TaskDetailScreen
          taskRouteParam={projectDetail}
          projectRouteParam={nestedId}
          context="project"
          backHref={`${orgProjectBase}/tasks`}
        />
      );
    }

    if (projectSection === "tasks") {
      return (
        <ProjectTasksScreen
          projectParam={nestedId}
          organizationRouteParam={id}
        />
      );
    }

    if (projectSection === "letters" && projectDetail === "new") {
      return <LetterComposeScreen />;
    }

    if (projectSection === "letters" && projectDetail) {
      return (
        <LetterDetailScreen
          letterRouteParam={projectDetail}
          backHref={`${orgProjectBase}/letters`}
        />
      );
    }

    if (projectSection === "documents" && projectDetail) {
      const pathOrId = segments
        .slice(5)
        .map((segment) => decodeURIComponent(segment))
        .join("/");
      return (
        <DocumentDetailScreen
          routeParam={pathOrId || projectDetail}
          backHref={`${orgProjectBase}/documents`}
          projectRouteParam={nestedId}
        />
      );
    }

    if (projectSection === "documents" && !projectDetail) {
      return (
        <ProjectDocumentsIndexScreen
          projectParam={nestedId}
          organizationRouteParam={id}
        />
      );
    }

    if (projectSection === "letters" && !projectDetail) {
      return (
        <ProjectLettersIndexScreen
          projectParam={nestedId}
          organizationRouteParam={id}
        />
      );
    }

    if (projectSection === "updates") {
      return (
        <ProjectUpdatesScreen
          projectParam={nestedId}
          organizationRouteParam={id}
        />
      );
    }

    if (!projectSection) {
      return (
        <ProjectOverviewScreen
          projectParam={nestedId}
          organizationRouteParam={id}
        />
      );
    }
  }

  if (family === "organizations" && id && section === "projects" && !nestedId) {
    return <OrganizationProjectsScreen organizationParam={id} />;
  }

  if (family === "organizations" && id && section === "contacts" && !nestedId) {
    return <OrganizationContactsScreen organizationParam={id} />;
  }

  if (family === "organizations" && id && section === "letters" && !nestedId) {
    return <OrganizationLettersScreen organizationParam={id} />;
  }

  if (family === "organizations" && id && !section) {
    return <OrganizationOverviewScreen organizationParam={id} />;
  }

  if (family === "letters" && id === "new") {
    return <LetterComposeScreen />;
  }

  if (family === "letters" && !id) {
    return <LettersIndexScreen />;
  }

  if (family === "letters" && id) {
    return (
      <LetterDetailScreen letterRouteParam={id} backHref="/letters" />
    );
  }

  if (section === "letters" && nestedId) {
    return (
      <LetterDetailScreen
        letterRouteParam={nestedId}
        backHref={`/${family}/${id}/letters`}
      />
    );
  }

  if (family === "settings") return <SettingsScreen tab={id} />;
  if (family === "journal") return <JournalScreen date={id ?? today()} />;
  if (family === "knowledge" && !id) {
    return <KnowledgeIndexScreen />;
  }
  if (family === "knowledge" && id) {
    const pathOrId = segments
      .slice(1)
      .map((segment) => decodeURIComponent(segment))
      .join("/");
    return <DocumentDetailScreen routeParam={pathOrId} backHref="/knowledge" />;
  }
  if (section === "documents" && nestedId) {
    const pathOrId = segments
      .slice(3)
      .map((segment) => decodeURIComponent(segment))
      .join("/");
    return (
      <DocumentDetailScreen
        routeParam={pathOrId || nestedId}
        backHref={`/${family}/${id}/documents`}
        projectRouteParam={family === "projects" ? id : undefined}
      />
    );
  }
  const collection = collectionFor(segments);
  if (collection) {
    if (collection.contactRouteParam || collection.organizationRouteParam) {
      return (
        <ResolvedScopedCollectionScreen
          segments={segments}
          config={collection}
        />
      );
    }
    return <CollectionScreen segments={segments} config={collection} />;
  }
  return null;
}

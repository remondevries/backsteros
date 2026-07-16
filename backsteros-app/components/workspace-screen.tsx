"use client";

import type {
  ApiKey,
  Area,
  Contact,
  Document,
  DocumentContent,
  Letter,
  Organization,
  Project,
  Task,
} from "@backsteros/contracts";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { apiErrorMessage, useApiResource, useAppApi } from "@/lib/api-context";
import { type RouteFamily, routeCopy } from "@/lib/navigation";
import {
  type SyncedMetadataTable,
  usePowerSync,
  usePowerSyncQuery,
} from "@/lib/powersync-context";

import { MarkdownDocument } from "./markdown-document";
import { PdfPreview } from "./pdf-preview";

type Entity = Project | Task | Organization | Contact | Area | Letter | Document;
type Collection = {
  items: Entity[];
  endpoint: string;
  responseKey: string;
  family: RouteFamily;
  createDefaults?: Record<string, unknown>;
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
    return { items: [], endpoint: `/api/v1/documents?type=project&projectId=${encodeURIComponent(id)}`, responseKey: "documents", family: "knowledge", createDefaults: { type: "project", projectId: id } };
  }
  if (family === "projects" && id && section === "tasks") {
    return { items: [], endpoint: `/api/v1/tasks?projectId=${encodeURIComponent(id)}`, responseKey: "tasks", family: "tasks", createDefaults: { projectId: id } };
  }
  if (family === "organizations" && id && section === "contacts") {
    return { items: [], endpoint: `/api/v1/contacts?organizationId=${encodeURIComponent(id)}`, responseKey: "contacts", family: "contacts", createDefaults: { organizationId: id } };
  }
  if (family === "organizations" && id && section === "projects") {
    return { items: [], endpoint: `/api/v1/projects?organizationId=${encodeURIComponent(id)}`, responseKey: "projects", family: "projects", createDefaults: { organizationId: id } };
  }
  if (family === "contacts" && id && section === "tasks") {
    return { items: [], endpoint: `/api/v1/tasks?contactId=${encodeURIComponent(id)}`, responseKey: "tasks", family: "tasks", createDefaults: { contactId: id } };
  }
  if (id && section === "letters" && ["projects", "organizations", "contacts"].includes(family)) {
    const scopeKey = family === "projects" ? "projectId" : family === "organizations" ? "organizationId" : "contactId";
    return { items: [], endpoint: `/api/v1/letters?${scopeKey}=${encodeURIComponent(id)}`, responseKey: "letters", family: "letters", createDefaults: { [scopeKey]: id } };
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
    () => local.data?.map(snakeToCamelRow) ?? resource.data?.[config.responseKey] ?? [],
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
      <header className="route-header">
        <div><span className="eyebrow">Backsteros</span><h1>{title}</h1><p>{routeCopy[config.family].description}</p></div>
        <div className="header-actions">
          {isTasks ? <div className="segmented-control"><button className={view === "list" ? "is-active" : ""} onClick={() => setView("list")}>List</button><button className={view === "board" ? "is-active" : ""} onClick={() => setView("board")}>Board</button></div> : null}
          <CreateForm collection={config} onDone={resource.reload} />
        </div>
      </header>
      <StateView loading={local.data === null && resource.loading} error={local.data === null ? resource.error : local.error} retry={() => { resource.reload(); void sync.retry(); }} />
      {!(local.data === null && resource.loading) && !(local.data === null ? resource.error : local.error) && !items.length ? <div className="empty-state"><span className="empty-state-mark">B</span><h2>No {title.toLowerCase()} yet</h2><p>Create the first item in this view.</p></div> : null}
      {view === "board" && isTasks ? (
        <div className="task-board">{groups.map((group) => <section key={group.status}><h2>{humanize(group.status)} <small>{group.items.length}</small></h2>{group.items.map((item) => <EntityRow key={item.id} item={item} family={config.family} compact onPatch={patch} />)}</section>)}</div>
      ) : (
        <div className="entity-list">{items.map((item, index) => <EntityRow key={item.id} item={item} family={config.family} onPatch={patch} onMove={(direction) => reorder(index, direction)} />)}</div>
      )}
    </div>
  );
}

function EntityRow({
  item,
  family,
  compact = false,
  onPatch,
  onMove,
}: {
  item: Entity;
  family: RouteFamily;
  compact?: boolean;
  onPatch: (item: Entity, body: Record<string, unknown>) => void;
  onMove?: (direction: -1 | 1) => void;
}) {
  const actualFamily = family === "inbox" ? "tasks" : family;
  const href = actualFamily === "knowledge" ? `/knowledge/${encodeURIComponent(item.id)}` : `/${actualFamily}/${item.id}`;
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

function DocumentScreen({ id, backHref = "/knowledge" }: { id: string; backHref?: string }) {
  const { client } = useAppApi();
  const metadata = useApiResource<Document>((api) => api.requestJson(`/api/v1/documents/${encodeURIComponent(id)}`), [id]);
  const content = useApiResource<DocumentContent>((api) => api.requestJson(`/api/v1/documents/${encodeURIComponent(id)}/content`), [id]);
  const [saving, setSaving] = useState(false);
  async function save(value: string) {
    setSaving(true);
    try {
      await client.requestJson(`/api/v1/documents/${encodeURIComponent(id)}/content`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: value, ifMatchVersion: content.data?.contentVersion }) });
      content.reload();
      toast.success("Document saved");
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="route-view document-route">
      <StateView loading={metadata.loading || content.loading} error={metadata.error ?? content.error} retry={() => { metadata.reload(); content.reload(); }} />
      {metadata.data && content.data ? <>
        <header className="detail-title"><Link href={backHref}>←</Link><div><span className="eyebrow">{metadata.data.type} document</span><h1>{metadata.data.title}</h1><p>{metadata.data.path}</p></div></header>
        <MarkdownDocument key={content.data.contentVersion} value={content.data.content} saving={saving} onSave={save} />
      </> : null}
    </div>
  );
}

function DetailScreen({ family, id }: { family: RouteFamily; id: string }) {
  const { client } = useAppApi();
  const base = family === "inbox" ? "tasks" : family;
  const resource = useApiResource<Entity>((api) => api.requestJson(`/api/v1/${base}/${encodeURIComponent(id)}`), [base, id]);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const item = resource.data;

  async function save() {
    setSaving(true);
    try {
      await client.requestJson(`/api/v1/${base}/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      setDraft({});
      resource.reload();
      toast.success("Changes saved");
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function uploadPdf(file: File) {
    setSaving(true);
    try {
      await client.uploadLetterPdf(id, file, file.name);
      resource.reload();
      toast.success("PDF uploaded");
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="route-view">
      <StateView loading={resource.loading} error={resource.error} retry={resource.reload} />
      {item ? <article className="detail-card">
        <header className="detail-title"><Link href={`/${family}`}>←</Link><span className="entity-avatar">{entityTitle(item)[0]}</span><div><span className="eyebrow">{routeCopy[family].singular}</span><h1>{entityTitle(item)}</h1></div></header>
        <div className="detail-form">
          <label>Title<input value={draft.name ?? draft.title ?? entityTitle(item)} onChange={(event) => setDraft({ ...draft, ["name" in item ? "name" : "title"]: event.target.value })} /></label>
          {"status" in item ? <label>Status<select value={draft.status ?? item.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="triage">Triage</option><option value="ready_to_start">Ready to start</option><option value="in_progress">In progress</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="canceled">Canceled</option></select></label> : null}
          {"dueDate" in item ? <label>Due date<input type="datetime-local" value={(draft.dueDate ?? item.dueDate ?? "").slice(0, 16)} onChange={(event) => setDraft({ ...draft, dueDate: new Date(event.target.value).toISOString() })} /></label> : null}
          {("description" in item || "notes" in item || "context" in item) ? <label className="wide">Notes<textarea rows={9} value={draft.description ?? draft.notes ?? draft.context ?? (("description" in item ? item.description : "notes" in item ? item.notes : item.context) ?? "")} onChange={(event) => setDraft({ ...draft, ["description" in item ? "description" : "notes" in item ? "notes" : "context"]: event.target.value })} /></label> : null}
        </div>
        <div className="detail-actions"><button className="primary-action" disabled={saving || !Object.keys(draft).length} onClick={save}>{saving ? "Saving…" : "Save changes"}</button></div>
        {family === "letters" ? <label className="pdf-upload">Attach PDF<input type="file" accept="application/pdf" disabled={saving} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPdf(file); }} /></label> : null}
        {family === "letters" && "storageKey" in item && item.storageKey ? <PdfPreview letterId={id} /> : null}
      </article> : null}
    </div>
  );
}

function JournalScreen({ date }: { date: string }) {
  const entry = useApiResource<Document>((api) => api.requestJson(`/api/v1/journal/${date}`), [date]);
  if (entry.loading || entry.error) return <div className="route-view"><StateView loading={entry.loading} error={entry.error} retry={entry.reload} /></div>;
  return entry.data ? <DocumentScreen id={entry.data.id} backHref="/journal" /> : null;
}

function SettingsScreen() {
  const { client } = useAppApi();
  const settings = useApiResource<{ settings: Record<string, unknown> }>((api) => api.requestJson("/api/v1/settings"));
  const keys = useApiResource<{ apiKeys: ApiKey[] }>((api) => api.requestJson("/api/v1/api-keys"));
  const [draft, setDraft] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function createKey() {
    setSaving(true);
    try {
      const result = await client.requestJson<{ secret: string }>("/api/v1/api-keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: draft, scopes: ["read", "write"] }) });
      setSecret(result.secret);
      setDraft("");
      keys.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }
  async function saveSettings(value: Record<string, unknown>) {
    setSaving(true);
    try {
      await client.requestJson("/api/v1/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
      settings.reload();
      toast.success("Settings saved");
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return <div className="route-view"><header className="route-header"><div><span className="eyebrow">Backsteros</span><h1>Settings</h1><p>Workspace preferences and API access.</p></div></header>
    <StateView loading={settings.loading || keys.loading} error={settings.error ?? keys.error} retry={() => { settings.reload(); keys.reload(); }} />
    {settings.data ? <section className="settings-card"><h2>General</h2><label>Timezone<input defaultValue={String(settings.data.settings.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)} onBlur={(event) => saveSettings({ ...settings.data!.settings, timezone: event.target.value })} /></label></section> : null}
    <section className="settings-card"><h2>API keys</h2><p>Secrets are shown once. Store them securely.</p>{secret ? <code className="api-secret">{secret}</code> : null}<div className="inline-create"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Key name" /><button disabled={!draft || saving} onClick={createKey}>Create key</button></div>
      <div className="key-list">{keys.data?.apiKeys.map((key) => <div key={key.id}><span><strong>{key.name}</strong><small>{key.prefix}… · {key.scopes.join(", ")}</small></span><button onClick={async () => { await client.requestJson(`/api/v1/api-keys/${key.id}`, { method: "DELETE" }); keys.reload(); }}>Revoke</button></div>)}</div>
    </section>
  </div>;
}

export function WorkspaceScreen({ segments }: { segments: string[] }) {
  const [family, id, section, nestedId] = segments;
  if (family === "settings") return <SettingsScreen />;
  if (family === "journal") return <JournalScreen date={id ?? today()} />;
  if ((family === "knowledge" && id) || section === "documents" && nestedId) return <DocumentScreen id={nestedId ?? id!} backHref={section === "documents" ? `/${family}/${id}/documents` : "/knowledge"} />;
  const collection = collectionFor(segments);
  if (collection) return <CollectionScreen segments={segments} config={collection} />;
  if (id && family in routeCopy) return <DetailScreen family={family as RouteFamily} id={nestedId ?? id} />;
  return null;
}

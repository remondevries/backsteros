"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { adoptRemoteField } from "../../shared/adopt-remote-field.js";
import { getCreateEntityFromQueryLabel } from "../../dropdowns/searchable-dropdown-create-from-query.js";
import { useTitleRenameShortcut } from "../../shortcuts/title-rename-shortcut.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import { OverviewNameEditor } from "../content/overview-name-editor.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { EntityOverviewSubgroup } from "../shared/entity-overview-subgroup.js";
import { TaskDueDateDropdown } from "../tasks/task-due-date-dropdown.js";
import { TaskPriorityIcon } from "../tasks/task-priority-icon.js";
import {
  getTaskPriorityLabel,
  TASK_PRIORITY_ORDER,
} from "../../tasks/task-priority.js";
import {
  getProjectStatusLabel,
  migrateLegacyProjectStatus,
  PROJECT_STATUS_ORDER,
  type ProjectStatus,
} from "../../projects/project-status.js";
import { parseTransipDomainTagsFromIcon, normalizeTransipDomainTags } from "../../projects/transip-domain-tags.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import { ProjectKeyEditor } from "./project-key-editor.js";
import { ProjectOverviewIcon } from "./project-overview-icon.js";
import { ProjectStatusIcon } from "./project-status-icon.js";
import type { ProjectDetailViewProject } from "./project-detail-view.js";
import {
  type DomainRegistrarContact,
  type DomainRegistrarDetail,
} from "./domain-registrar-panel.js";
import { DomainWhoisContactEditor } from "./domain-whois-contact-editor.js";

export type DomainOverviewViewProps = {
  project: ProjectDetailViewProject;
  mode?: "details" | "cloudflare";
  sectionNavSlot?: ReactNode;
  /** Body for the Cloudflare tab (or other future section modes). */
  sectionBody?: ReactNode;
  organizationOptions?: SearchableDropdownOption<string>[];
  /** Known TransIP tags across domains — for the tags dropdown. */
  knownTags?: string[];
  loadDetail: (domainName: string) => Promise<DomainRegistrarDetail>;
  onSaveName?: (
    name: string,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
  onSaveKey?: (
    key: string,
  ) =>
    | Promise<{ ok: true; key?: string } | { ok: false; error: string }>
    | { ok: true; key?: string }
    | { ok: false; error: string };
  onStatusChange?: (status: ProjectStatus) => void;
  onPriorityChange?: (priority: number) => void;
  onOrganizationChange?: (organizationId: string | null) => void;
  onCreateOrganizationFromQuery?: (query: string) => void;
  onIconChange?: (icon: string | null) => void | Promise<void>;
  onTagsChange?: (
    tags: string[],
  ) =>
    | Promise<{ ok: true; tags?: string[] } | { ok: false; error: string }>
    | { ok: true; tags?: string[] }
    | { ok: false; error: string };
  /** Replace the full WHOIS contact set at the registrar (TransIP PUT). */
  onContactsChange?: (
    contacts: DomainRegistrarContact[],
  ) =>
    | Promise<
        | { ok: true; contacts?: DomainRegistrarContact[] }
        | { ok: false; error: string }
      >
    | { ok: true; contacts?: DomainRegistrarContact[] }
    | { ok: false; error: string };
};

function DetailsField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="entity-overview-field">
      {htmlFor ? (
        <label className="entity-overview-field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="entity-overview-field__label">{label}</span>
      )}
      {children}
    </div>
  );
}

function toDate(value: number | Date | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

/** Whole calendar years since registration (local). */
function yearsSinceRegistration(
  start: Date | null,
  now: Date = new Date(),
): number | null {
  if (!start || Number.isNaN(start.getTime())) return null;
  let years = now.getFullYear() - start.getFullYear();
  const monthDelta = now.getMonth() - start.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < start.getDate())) {
    years -= 1;
  }
  return years < 0 ? null : years;
}

function formatDomainYearsLabel(start: Date | null): string | null {
  const years = yearsSinceRegistration(start);
  if (years == null) return null;
  return years === 1 ? "1 year" : `${years} years`;
}

function formatRegistrarStatus(status: string | null | undefined): string {
  const value = status?.trim();
  if (!value) return "Unknown";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Domains profile card body — contacts-style header + Details / Cloudflare.
 */
export function DomainOverviewView({
  project,
  mode = "details",
  sectionNavSlot,
  sectionBody,
  organizationOptions = [],
  knownTags = [],
  loadDetail,
  onSaveName,
  onSaveKey,
  onStatusChange,
  onPriorityChange,
  onOrganizationChange,
  onCreateOrganizationFromQuery,
  onIconChange,
  onTagsChange,
  onContactsChange,
}: DomainOverviewViewProps) {
  const [name, setName] = useState(project.name);
  const [nameSource, setNameSource] = useState(project.name);
  const [organizationId, setOrganizationId] = useState(
    project.organizationId ?? "",
  );
  const [status, setStatus] = useState(() =>
    migrateLegacyProjectStatus(project.status),
  );
  const [priority, setPriority] = useState(project.priority);
  const [renameFocusRequest, setRenameFocusRequest] = useState(0);

  const [detail, setDetail] = useState<DomainRegistrarDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [authRevealed, setAuthRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tags, setTags] = useState<string[]>(() =>
    parseTransipDomainTagsFromIcon(project.icon),
  );
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [tagsSaving, setTagsSaving] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contactsSaving, setContactsSaving] = useState(false);

  const [prevId, setPrevId] = useState(project.id);
  if (project.id !== prevId) {
    setPrevId(project.id);
    setName(project.name);
    setNameSource(project.name);
    setOrganizationId(project.organizationId ?? "");
    setStatus(migrateLegacyProjectStatus(project.status));
    setPriority(project.priority);
    setTags(parseTransipDomainTagsFromIcon(project.icon));
    setTagsError(null);
    setContactsError(null);
  } else {
    adoptRemoteField(project.name, name, nameSource, setName, setNameSource);
  }

  useEffect(() => {
    setOrganizationId(project.organizationId ?? "");
  }, [project.id, project.organizationId]);

  useEffect(() => {
    setStatus(migrateLegacyProjectStatus(project.status));
  }, [project.id, project.status]);

  useEffect(() => {
    setPriority(project.priority);
  }, [project.id, project.priority]);

  useEffect(() => {
    if (detail?.tags) return;
    setTags(parseTransipDomainTagsFromIcon(project.icon));
  }, [project.id, project.icon, detail?.tags]);

  useTitleRenameShortcut(
    useCallback(() => {
      setRenameFocusRequest((count) => count + 1);
    }, []),
    { enabled: true },
  );

  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    setAuthRevealed(false);
    setCopied(false);
    void loadDetail(project.name)
      .then((next) => {
        if (cancelled) return;
        setDetail(next);
        setTags(normalizeTransipDomainTags(next.tags));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDetailError(
          err instanceof Error ? err.message : "Could not load TransIP details",
        );
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.name, loadDetail]);

  const start = toDate(project.startDate);
  const due = toDate(project.dueDate);
  const yearsLabel = formatDomainYearsLabel(start);

  const tagOptions = useMemo(() => {
    const all = new Set<string>([
      ...knownTags,
      ...tags,
    ]);
    return [...all]
      .sort((a, b) => a.localeCompare(b))
      .map((tag) => ({
        value: tag,
        label: tag,
      }));
  }, [knownTags, tags]);

  async function applyTags(next: string[]) {
    const normalized = normalizeTransipDomainTags(next);
    const previous = tags;
    setTags(normalized);
    setTagsError(null);
    if (!onTagsChange) return;
    setTagsSaving(true);
    try {
      const result = await onTagsChange(normalized);
      if (!result.ok) {
        setTags(previous);
        setTagsError(result.error);
        return;
      }
      if (result.tags) {
        setTags(normalizeTransipDomainTags(result.tags));
      }
      setDetail((current) =>
        current
          ? {
              ...current,
              tags: result.tags
                ? normalizeTransipDomainTags(result.tags)
                : normalized,
            }
          : current,
      );
    } catch (error) {
      setTags(previous);
      setTagsError(
        error instanceof Error ? error.message : "Could not update tags",
      );
    } finally {
      setTagsSaving(false);
    }
  }

  async function applyContactAtIndex(
    index: number,
    nextContact: DomainRegistrarContact,
  ) {
    if (!detail || !onContactsChange) return;
    const previous = detail.contacts;
    const nextContacts = previous.map((contact, i) =>
      i === index ? nextContact : contact,
    );
    setDetail((current) =>
      current ? { ...current, contacts: nextContacts } : current,
    );
    setContactsError(null);
    setContactsSaving(true);
    try {
      const result = await onContactsChange(nextContacts);
      if (!result.ok) {
        setDetail((current) =>
          current ? { ...current, contacts: previous } : current,
        );
        setContactsError(result.error);
        return;
      }
      if (result.contacts) {
        setDetail((current) =>
          current ? { ...current, contacts: result.contacts! } : current,
        );
      }
    } catch (error) {
      setDetail((current) =>
        current ? { ...current, contacts: previous } : current,
      );
      setContactsError(
        error instanceof Error ? error.message : "Could not update contacts",
      );
    } finally {
      setContactsSaving(false);
    }
  }

  const statusOptions = useMemo(
    () =>
      PROJECT_STATUS_ORDER.map((value) => ({
        value,
        label: getProjectStatusLabel(value),
        searchTerms: value.replaceAll("_", " "),
        icon: <ProjectStatusIcon status={value} size={14} />,
      })),
    [],
  );

  const priorityOptions = useMemo(
    () =>
      TASK_PRIORITY_ORDER.map((value) => ({
        value: String(value),
        label: getTaskPriorityLabel(value),
        icon: <TaskPriorityIcon priority={value} size={14} />,
      })),
    [],
  );

  const organizationDropdownOptions = useMemo(
    () => [
      {
        value: "__none__",
        label: "No organization",
        searchTerms: "none unassigned",
        icon: <OrganizationIcon size={14} />,
      },
      ...organizationOptions,
    ],
    [organizationOptions],
  );

  async function copyAuthCode() {
    if (!detail?.authCode) return;
    try {
      await navigator.clipboard.writeText(detail.authCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const registrarStatusLabel = detailLoading
    ? "Loading…"
    : formatRegistrarStatus(detail?.status);

  const detailsBody = (
    <section
      className="entity-overview__details domain-overview__details"
      aria-label="Domain details"
    >
      {detailLoading ? (
        <p className="domain-overview__muted">Loading TransIP…</p>
      ) : null}
      {detailError ? (
        <p className="domain-overview__error">{detailError}</p>
      ) : null}

      <EntityOverviewSubgroup title="Registration">
        <DetailsField label="Registrar status">
          <span className="domain-overview__value">{registrarStatusLabel}</span>
        </DetailsField>
        <DetailsField label="Tags">
          <SearchableDropdown
            multiple
            values={tags}
            options={tagOptions}
            onValuesChange={(next) => {
              void applyTags(next);
            }}
            searchPlaceholder="Search or add tags…"
            ariaLabel="Tags"
            emptySelectionLabel="No tags"
            disabled={tagsSaving || detailLoading}
            className="property-dropdown property-dropdown--inline-chip"
            panelAlign="start"
            panelWidth={280}
            createFromQueryLabel={(query) =>
              getCreateEntityFromQueryLabel("tag", query)
            }
            onCreateFromQuery={(query) => {
              void applyTags([...tags, query]);
            }}
          />
          {tagsError ? (
            <p className="domain-overview__error">{tagsError}</p>
          ) : null}
        </DetailsField>
        <DetailsField label="Registered">
          <TaskDueDateDropdown
            dueDate={start}
            status="completed"
            variant="property"
            triggerVariant="inlineChip"
            labelFormat="long"
            allowClear={false}
            disabled
            noDueDateLabel="No start date"
            showIcon
            taskPropertyDropdownId={null}
            searchPlaceholder="Registration date"
            searchShortcutLabel=""
            onDueDateChange={() => {}}
          />
        </DetailsField>
        <DetailsField label="Renews">
          <div className="domain-overview__renews-row">
            <TaskDueDateDropdown
              dueDate={due}
              variant="property"
              triggerVariant="inlineChip"
              labelFormat="long"
              allowClear={false}
              disabled
              noDueDateLabel="No renewal date"
              showIcon
              taskPropertyDropdownId={null}
              searchPlaceholder="Renewal date"
              searchShortcutLabel=""
              onDueDateChange={() => {}}
            />
            {yearsLabel ? (
              <span className="domain-overview__years">{yearsLabel}</span>
            ) : null}
          </div>
        </DetailsField>
        {detail?.isDnsOnly ? (
          <DetailsField label="DNS">
            <span className="domain-overview__value">DNS-only</span>
          </DetailsField>
        ) : null}
      </EntityOverviewSubgroup>

      <EntityOverviewSubgroup title="Auth code">
        <DetailsField label="EPP / auth">
          {detail?.authCode ? (
            <div className="domain-overview__auth-row">
              <code className="domain-overview__auth-code">
                {authRevealed ? detail.authCode : "••••••••••••"}
              </code>
              <button
                type="button"
                className="domain-overview__button"
                onClick={() => setAuthRevealed((value) => !value)}
              >
                {authRevealed ? "Hide" : "Show"}
              </button>
              <button
                type="button"
                className="domain-overview__button"
                onClick={() => {
                  void copyAuthCode();
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <span className="domain-overview__muted">
              {detailLoading
                ? "…"
                : (detail?.authCodeError ?? "Not available for this TLD")}
            </span>
          )}
        </DetailsField>
      </EntityOverviewSubgroup>

      <EntityOverviewSubgroup title="Nameservers">
        {detailLoading ? (
          <p className="domain-overview__muted">…</p>
        ) : !detail || detail.nameservers.length === 0 ? (
          <p className="domain-overview__muted">No nameservers</p>
        ) : (
          <ul className="domain-overview__list">
            {detail.nameservers.map((ns) => (
              <li key={ns.hostname}>
                <span className="domain-overview__ns-host">{ns.hostname}</span>
                {ns.ipv4 || ns.ipv6 ? (
                  <span className="domain-overview__muted">
                    {[ns.ipv4, ns.ipv6].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </EntityOverviewSubgroup>

      {detailLoading ? (
        <EntityOverviewSubgroup title="WHOIS contacts">
          <p className="domain-overview__muted">…</p>
        </EntityOverviewSubgroup>
      ) : !detail || detail.contacts.length === 0 ? (
        <EntityOverviewSubgroup title="WHOIS contacts">
          <p className="domain-overview__muted">No contacts</p>
        </EntityOverviewSubgroup>
      ) : (
        <>
          {contactsError ? (
            <p className="domain-overview__error">{contactsError}</p>
          ) : null}
          {detail.contacts.map((contact, index) => {
            const contactKey = `${contact.type ?? "contact"}-${index}`;
            return (
              <DomainWhoisContactEditor
                key={contactKey}
                contact={contact}
                contactKey={contactKey}
                disabled={!onContactsChange || contactsSaving}
                onCommit={(next) => {
                  void applyContactAtIndex(index, next);
                }}
              />
            );
          })}
        </>
      )}

      <EntityOverviewSubgroup title="Project">
        <DetailsField label="Status">
          <PropertyDropdown
            value={status}
            options={statusOptions}
            onChange={(next) => {
              setStatus(next);
              onStatusChange?.(next);
            }}
            searchPlaceholder="Change status…"
            searchShortcutLabel="S"
            ariaLabel="Status"
            taskPropertyDropdownId="status"
            fallbackIcon={<ProjectStatusIcon status={status} size={14} />}
            fallbackLabel={getProjectStatusLabel(status)}
            triggerVariant="inlineChip"
            panelAlign="start"
          />
        </DetailsField>
        <DetailsField label="Priority">
          <PropertyDropdown
            value={String(priority)}
            options={priorityOptions}
            onChange={(next) => {
              const resolved = Number(next);
              setPriority(resolved);
              void onPriorityChange?.(resolved);
            }}
            searchPlaceholder="Change priority…"
            searchShortcutLabel="P"
            ariaLabel="Priority"
            taskPropertyDropdownId="priority"
            fallbackIcon={
              <TaskPriorityIcon priority={priority} size={14} />
            }
            fallbackLabel={getTaskPriorityLabel(priority)}
            triggerVariant="inlineChip"
            panelAlign="start"
          />
        </DetailsField>
        <DetailsField label="Key">
          {onSaveKey ? (
            <ProjectKeyEditor value={project.key} onSave={onSaveKey} />
          ) : (
            <span className="domain-overview__value">{project.key}</span>
          )}
        </DetailsField>
        <DetailsField label="Organization">
          <PropertyDropdown
            value={organizationId || "__none__"}
            options={organizationDropdownOptions}
            onChange={(next) => {
              const resolved = next === "__none__" ? "" : next;
              setOrganizationId(resolved);
              void onOrganizationChange?.(resolved || null);
            }}
            searchPlaceholder="Search organizations…"
            ariaLabel="Organization"
            fallbackIcon={<OrganizationIcon size={14} />}
            fallbackLabel="No organization"
            mutedFallback
            panelAlign="start"
            panelWidth={280}
            triggerVariant="inlineChip"
            createFromQueryLabel={
              onCreateOrganizationFromQuery
                ? (query) =>
                    getCreateEntityFromQueryLabel("organization", query)
                : undefined
            }
            onCreateFromQuery={onCreateOrganizationFromQuery}
          />
        </DetailsField>
      </EntityOverviewSubgroup>
    </section>
  );

  return (
    <article className="entity-overview contact-overview domain-overview">
      <div className="contact-overview__chrome">
        <header className="entity-overview__header contact-overview__header">
          <div className="contact-overview__avatar">
            <ProjectOverviewIcon
              icon={project.icon}
              type={project.type ?? "domeinname"}
              name={project.name}
              size={64}
              variant="bare"
              onIconChange={onIconChange}
            />
          </div>
          <div className="contact-overview__identity">
            <div className="contact-overview__name-row">
              <OverviewNameEditor
                value={name}
                entityLabel="Domain"
                resetKey={project.id}
                renameFocusRequest={renameFocusRequest}
                fitContent
                onSave={async (next) => {
                  if (!onSaveName) {
                    setName(next);
                    setNameSource(next);
                    return { ok: true };
                  }
                  const result = await onSaveName(next);
                  if (result.ok) {
                    setName(next);
                  }
                  return result;
                }}
              />
            </div>
            <div className="contact-overview__subtitle">
              <span className="domain-overview__registrar-status">
                TransIP
              </span>
              <span className="contact-overview__subtitle-at">·</span>
              <span className="contact-overview__org-dropdown">
                <PropertyDropdown
                  value={organizationId || "__none__"}
                  options={organizationDropdownOptions}
                  onChange={(next) => {
                    const resolved = next === "__none__" ? "" : next;
                    setOrganizationId(resolved);
                    void onOrganizationChange?.(resolved || null);
                  }}
                  searchPlaceholder="Search organizations…"
                  ariaLabel="Organization"
                  fallbackIcon={<OrganizationIcon size={14} />}
                  fallbackLabel="No organization"
                  mutedFallback
                  panelAlign="start"
                  panelWidth={280}
                  createFromQueryLabel={
                    onCreateOrganizationFromQuery
                      ? (query) =>
                          getCreateEntityFromQueryLabel("organization", query)
                      : undefined
                  }
                  onCreateFromQuery={onCreateOrganizationFromQuery}
                />
              </span>
            </div>
          </div>
        </header>

        {sectionNavSlot}
      </div>

      <div className="contact-overview__scroll">
        {mode === "details" ? detailsBody : null}
        {mode === "cloudflare" && sectionBody ? (
          <div className="contact-overview__section-body">{sectionBody}</div>
        ) : null}
      </div>
    </article>
  );
}

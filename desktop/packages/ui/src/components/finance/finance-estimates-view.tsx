"use client";

import type {
  ClientEstimate,
  ClientEstimateStatus,
  UpdateClientEstimateInput,
} from "@backsteros/contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  type SyntheticEvent,
} from "react";

import {
  formatEstimateDisplayId,
  getClientEstimateStatusLabel,
  groupEstimatesByStatus,
  migrateClientEstimateStatus,
  CLIENT_ESTIMATE_STATUS_ORDER,
  type ClientEstimateStatus as UiEstimateStatus,
} from "../../finance/estimate-status.js";
import type { OrganizationListItem } from "../../navigation/entity-routes.js";
import {
  formatDueDateInputValue,
  parseDueDateInputValue,
} from "../../tasks/task-due-date.js";
import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
  useMarkdownDetailEditor,
  type ContentMarkdownViewMode,
} from "../content/content-markdown-view-layout.js";
import { PropertyFieldGroup } from "../content/property-field-group.js";
import {
  deriveDocumentHeadingMinimapItems,
  DOCUMENT_HEADING_MINIMAP_MIN_ITEMS,
  resolveDocumentHeadingMinimapHasPersistentGutter,
  resolveDocumentHeadingMinimapHitStripWidth,
  type DocumentHeadingMinimapItem,
} from "../../documents/document-heading-minimap.js";
import { DocumentHeadingMinimap } from "../documents/document-heading-minimap.js";
import { DocumentHeadingOutlineNav } from "../documents/document-heading-outline-nav.js";
import { DocumentMarkdownEditor } from "../documents/document-markdown-editor.js";
import { DocumentMarkdownPreview } from "../documents/document-markdown-preview.js";
import { useContentSidePanelLayout } from "../shell/content-side-panel-layout-context.js";
import {
  buildOrganizationDropdownOptions,
  DROPDOWN_NONE_VALUE,
  resolveDropdownNone,
} from "../dropdowns/dropdown-options.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { EntityDetailLayout } from "../entity/entity-detail-layout.js";
import { EntityListAvatar } from "../entity/entity-list-avatar.js";
import { EntityPropertiesSection } from "../entity/entity-properties-section.js";
import {
  formatAttendeeNames,
  MeetingAttendeeLabels,
} from "../meetings/meeting-attendee-labels.js";
import { StatusGroupSection } from "../list-nav/status-group-section.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import { FloatingPillToggleDock } from "../shared/floating-pill-toggle-dock.js";
import { SegmentedPillToggle } from "../list-nav/list-board-view-shell.js";
import {
  readStoredPanelWidth,
  ResizableSidePanel,
} from "../shell/resizable-side-panel.js";

const ESTIMATE_PROPERTIES_WIDTH_KEY = "finance-estimate-properties-width";
const ESTIMATE_PROPERTIES_DEFAULT_WIDTH = 300;
const ESTIMATE_PROPERTIES_MIN_WIDTH = 240;
const ESTIMATE_PROPERTIES_MAX_WIDTH = 480;
import { DeferredTaskDueDateDropdown } from "../tasks/deferred-task-due-date-dropdown.js";
import { TaskDueDateDropdown } from "../tasks/task-due-date-dropdown.js";
import { EstimateStatusIcon } from "./estimate-status-icon.js";

export type FinanceEstimatesViewProps = {
  estimates: ClientEstimate[];
  organizations: OrganizationListItem[];
  projects?: Array<{ id: string; name: string; key?: string | null }>;
  contactOptions?: SearchableDropdownOption<string>[];
  /** Maps contact id → organization id for org-scoped "To" options. */
  contactOrganizationById?: Readonly<Record<string, string | null | undefined>>;
  loading?: boolean;
  error?: string | null;
  selectedEstimateId: string | null;
  onSelectedEstimateChange: (id: string | null) => void;
  onCreateEstimate: (input: {
    title: string;
    organizationId?: string;
    projectId?: string;
    authorContactId?: string | null;
    authorName?: string;
    toContactIds?: string[];
    versionLabel?: string;
    documentDate?: string;
    totalAmountCents?: number | null;
    proposalMarkdown?: string;
    estimateMarkdown?: string;
    status?: ClientEstimateStatus;
  }) => Promise<void>;
  onUpdateEstimate?: (
    id: string,
    patch: UpdateClientEstimateInput,
  ) => Promise<void>;
  creating?: boolean;
};

type DocTab = "proposal" | "estimate";

function formatEuroCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/** Prefer ISO / YYYY-MM-DD; legacy free-text labels return null until re-picked. */
function parseEstimateDueDate(
  value: string | null | undefined,
): Date | null {
  if (!value?.trim()) return null;
  const ymd = formatDueDateInputValue(value.trim());
  if (ymd) return parseDueDateInputValue(ymd);
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? parseDueDateInputValue(match[1]!) : null;
}

function serializeEstimateDueDate(date: Date | null): string | null {
  if (!date) return null;
  return formatDueDateInputValue(date) || null;
}

function stopFieldEvent(event: SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function statusOptions() {
  return CLIENT_ESTIMATE_STATUS_ORDER.map((status) => ({
    value: status,
    label: getClientEstimateStatusLabel(status),
    icon: <EstimateStatusIcon status={status} size={14} />,
  }));
}

type EstimateMarkdownSlots = {
  mode: ContentMarkdownViewMode;
  value: string;
  body: ReactNode;
  dock: ReactNode;
};

function EstimateMarkdownPane({
  tab,
  estimateId,
  initialValue,
  onSave,
  children,
}: {
  tab: DocTab;
  estimateId: string;
  initialValue: string;
  onSave: (markdown: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  children: (slots: EstimateMarkdownSlots) => ReactNode;
}) {
  const save = useCallback(
    (markdown: string) => onSave(markdown),
    [onSave],
  );
  const {
    value,
    mode,
    editorActivated,
    editorFocusRequest,
    error,
    handleChange,
    handleBlurSave,
    setViewMode,
    toggleViewMode,
  } = useMarkdownDetailEditor({
    initialValue,
    save,
  });

  return children({
    mode,
    value,
    body: (
      <div className="finance-estimates-view__markdown-shell">
        <ContentMarkdownViewLayout
          mode={mode}
          editorActivated={editorActivated}
          onToggleMode={toggleViewMode}
          editor={
            <DocumentMarkdownEditor
              key={`${tab}-${estimateId}-edit`}
              value={value}
              onChange={handleChange}
              onBlur={handleBlurSave}
              focusRequest={editorFocusRequest}
              scrollWithContent
              ariaLabel={tab === "proposal" ? "Proposal" : "Estimate"}
            />
          }
          preview={
            <ContentMarkdownPreviewColumn includeTopInset={false}>
              {value.trim() ? (
                <DocumentMarkdownPreview
                  body={value}
                  onChange={handleChange}
                />
              ) : (
                <p className="content-markdown-empty-hint">
                  {tab === "proposal"
                    ? "Add proposal markdown…"
                    : "Add estimate markdown…"}
                </p>
              )}
            </ContentMarkdownPreviewColumn>
          }
        />
        {error ? (
          <p className="finance-estimates-view__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    ),
    dock: (
      <FloatingPillToggleDock className="finance-estimate-detail-view-toggle">
        <SegmentedPillToggle
          value={mode}
          options={[
            { value: "edit", label: "Edit" },
            { value: "preview", label: "Preview" },
          ]}
          onChange={setViewMode}
          ariaLabel={
            tab === "proposal" ? "Proposal view mode" : "Estimate view mode"
          }
        />
      </FloatingPillToggleDock>
    ),
  });
}

function FinanceEstimateDetail({
  selected,
  error,
  organizations,
  projects,
  contactOptions,
  contactOrganizationById,
  onUpdateEstimate,
}: {
  selected: ClientEstimate;
  error?: string | null;
  organizations: OrganizationListItem[];
  projects: Array<{ id: string; name: string; key?: string | null }>;
  contactOptions: SearchableDropdownOption<string>[];
  contactOrganizationById: Readonly<
    Record<string, string | null | undefined>
  >;
  onUpdateEstimate?: (
    id: string,
    patch: UpdateClientEstimateInput,
  ) => Promise<void>;
}) {
  const [docTab, setDocTab] = useState<DocTab>("proposal");
  const propertiesPanelRef = useRef<HTMLElement | null>(null);
  const scrollShellRef = useRef<HTMLDivElement | null>(null);
  const scrollportRef = useRef<HTMLDivElement | null>(null);
  const outlineRafRef = useRef<number | null>(null);
  const [inViewIds, setInViewIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [propertiesRailWidth, setPropertiesRailWidth] = useState(() =>
    typeof window === "undefined"
      ? ESTIMATE_PROPERTIES_DEFAULT_WIDTH
      : readStoredPanelWidth(
          ESTIMATE_PROPERTIES_WIDTH_KEY,
          ESTIMATE_PROPERTIES_DEFAULT_WIDTH,
          ESTIMATE_PROPERTIES_MIN_WIDTH,
          ESTIMATE_PROPERTIES_MAX_WIDTH,
        ),
  );

  useEffect(() => {
    const panel = propertiesPanelRef.current;
    if (!panel || typeof ResizeObserver === "undefined") return;
    const syncWidth = () => {
      const next = Math.round(panel.getBoundingClientRect().width);
      if (next > 0) setPropertiesRailWidth(next);
    };
    syncWidth();
    const observer = new ResizeObserver(syncWidth);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const org of organizations) map.set(org.id, org.name);
    return map;
  }, [organizations]);

  const projectById = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; key?: string | null }
    >();
    for (const project of projects) map.set(project.id, project);
    return map;
  }, [projects]);

  const organizationOptions = useMemo(
    () => buildOrganizationDropdownOptions(organizations),
    [organizations],
  );

  const authorOptions = useMemo(
    () => [
      {
        value: DROPDOWN_NONE_VALUE,
        label: "No author",
        searchTerms: "no author none",
        icon: <ContactPersonIcon size={14} className="text-foreground/70" />,
      },
      ...contactOptions.map((option) => ({
        ...option,
        icon:
          option.icon ?? (
            <ContactPersonIcon size={14} className="text-foreground/70" />
          ),
      })),
    ],
    [contactOptions],
  );

  const toContactOptions = useMemo(() => {
    const orgId = selected.organizationId?.trim() || null;
    if (!orgId) return [] as SearchableDropdownOption<string>[];
    return contactOptions.filter(
      (option) =>
        (contactOrganizationById[option.value]?.trim() || null) === orgId,
    );
  }, [contactOptions, contactOrganizationById, selected.organizationId]);

  const toContactIds = selected.toContactIds ?? [];
  const hasToRecipients = toContactIds.length > 0;
  const toAriaLabel = formatAttendeeNames(
    toContactIds,
    toContactOptions,
    selected.organizationId ? "No recipients" : "Select an organization first",
  );
  const toTriggerIcon = (() => {
    if (toContactIds.length > 1) return null;
    if (toContactIds.length === 0) {
      return <ContactPersonIcon size={14} />;
    }
    const option = toContactOptions.find(
      (entry) => entry.value === toContactIds[0],
    );
    if (option?.avatarSrc) {
      return <EntityListAvatar src={option.avatarSrc} size={14} />;
    }
    return <ContactPersonIcon size={14} />;
  })();

  const projectOptions = useMemo(
    () => [
      {
        value: DROPDOWN_NONE_VALUE,
        label: "No project",
        searchTerms: "no project unassigned",
        icon: (
          <DefaultProjectIcon size={14} className="text-foreground/70" />
        ),
      },
      ...projects.map((project) => ({
        value: project.id,
        label: project.name,
        searchTerms: project.key ?? undefined,
        icon: (
          <DefaultProjectIcon size={14} className="text-foreground/70" />
        ),
      })),
    ],
    [projects],
  );

  async function patchSelected(patch: UpdateClientEstimateInput) {
    if (!onUpdateEstimate) return;
    await onUpdateEstimate(selected.id, patch);
  }

  const saveProposal = useCallback(
    async (markdown: string) => {
      if (!onUpdateEstimate) return { ok: true as const };
      try {
        await onUpdateEstimate(selected.id, { proposalMarkdown: markdown });
        return { ok: true as const };
      } catch (err) {
        return {
          ok: false as const,
          error:
            err instanceof Error ? err.message : "Could not save proposal.",
        };
      }
    },
    [onUpdateEstimate, selected.id],
  );

  const saveEstimateDoc = useCallback(
    async (markdown: string) => {
      if (!onUpdateEstimate) return { ok: true as const };
      try {
        await onUpdateEstimate(selected.id, { estimateMarkdown: markdown });
        return { ok: true as const };
      } catch (err) {
        return {
          ok: false as const,
          error:
            err instanceof Error ? err.message : "Could not save estimate.",
        };
      }
    },
    [onUpdateEstimate, selected.id],
  );

  const status = migrateClientEstimateStatus(selected.status);
  const project = selected.projectId
    ? projectById.get(selected.projectId)
    : null;
  const orgName =
    selected.clientLabel ||
    (selected.organizationId
      ? orgNameById.get(selected.organizationId)
      : null);
  const dueDate = parseEstimateDueDate(selected.documentDate);
  const selectedOrgOption = organizationOptions.find(
    (option) => option.value === (selected.organizationId ?? DROPDOWN_NONE_VALUE),
  );
  const selectedAuthorOption = authorOptions.find(
    (option) =>
      option.value === (selected.authorContactId ?? DROPDOWN_NONE_VALUE),
  );

  const propertiesRail = (
    <ResizableSidePanel
      storageKey={ESTIMATE_PROPERTIES_WIDTH_KEY}
      defaultWidth={ESTIMATE_PROPERTIES_DEFAULT_WIDTH}
      minWidth={ESTIMATE_PROPERTIES_MIN_WIDTH}
      maxWidth={ESTIMATE_PROPERTIES_MAX_WIDTH}
      edge="start"
      panelRef={propertiesPanelRef}
      className="detail-properties-panel finance-estimate-properties-rail"
    >
      <div className="detail-properties-panel__inner">
        <div className="task-detail-properties-scroll">
          <EntityPropertiesSection title="Properties">
            <PropertyFieldGroup label="Status">
              <PropertyDropdown
                value={status}
                options={statusOptions()}
                onChange={(next) => {
                  void patchSelected({
                    status: migrateClientEstimateStatus(next),
                  });
                }}
                searchPlaceholder="Change status…"
                ariaLabel="Estimate status"
                fallbackLabel={getClientEstimateStatusLabel(status)}
                fallbackIcon={<EstimateStatusIcon status={status} size={14} />}
                selectedDisplayLabel={getClientEstimateStatusLabel(status)}
                selectedDisplayIcon={
                  <EstimateStatusIcon status={status} size={14} />
                }
              />
            </PropertyFieldGroup>

            <PropertyFieldGroup label="Organization">
              <PropertyDropdown
                value={selected.organizationId ?? DROPDOWN_NONE_VALUE}
                options={organizationOptions}
                onChange={(next) => {
                  const resolved = resolveDropdownNone(next);
                  const nextToIds = resolved
                    ? toContactIds.filter(
                        (id) =>
                          (contactOrganizationById[id]?.trim() || null) ===
                          resolved,
                      )
                    : [];
                  void patchSelected({
                    organizationId: resolved,
                    clientLabel: resolved
                      ? orgNameById.get(resolved) ?? null
                      : null,
                    toContactIds: nextToIds,
                  });
                }}
                searchPlaceholder="Change organization…"
                ariaLabel="Organization"
                fallbackIcon={<OrganizationIcon size={14} />}
                fallbackLabel={orgName || "No organization"}
                mutedFallback={!selected.organizationId}
                selectedDisplayLabel={orgName || "No organization"}
                selectedDisplayIcon={selectedOrgOption?.icon}
              />
            </PropertyFieldGroup>

            <PropertyFieldGroup label="To">
              <SearchableDropdown
                multiple
                values={toContactIds}
                options={toContactOptions}
                onValuesChange={(ids) => {
                  void patchSelected({ toContactIds: ids });
                }}
                disabled={!selected.organizationId || !onUpdateEstimate}
                searchPlaceholder={
                  selected.organizationId
                    ? "Add recipients…"
                    : "Select an organization first…"
                }
                ariaLabel="To"
                emptySelectionLabel={
                  selected.organizationId
                    ? "No recipients"
                    : "Select an organization first"
                }
                className="property-dropdown property-dropdown--stacked-row"
                panelWidth={280}
                panelAlign="start"
                renderTrigger={({
                  open,
                  disabled: isDisabled,
                  triggerId,
                  onToggle,
                }) => (
                  <button
                    type="button"
                    id={triggerId}
                    className={[
                      "property-dropdown-trigger",
                      "property-dropdown-trigger--stacked-row",
                      open ? "is-open" : null,
                      !hasToRecipients ? "is-muted" : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={isDisabled}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-label={toAriaLabel}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggle();
                    }}
                  >
                    {toTriggerIcon ? (
                      <span
                        className="property-dropdown-trigger__icon"
                        aria-hidden="true"
                      >
                        {toTriggerIcon}
                      </span>
                    ) : null}
                    <span className="property-dropdown-trigger__label">
                      <MeetingAttendeeLabels
                        attendeeContactIds={toContactIds}
                        attendeeOptions={toContactOptions}
                        emptyLabel={
                          selected.organizationId
                            ? "No recipients"
                            : "Select an organization first"
                        }
                      />
                    </span>
                  </button>
                )}
              />
            </PropertyFieldGroup>

            <PropertyFieldGroup label="Author">
              <PropertyDropdown
                value={selected.authorContactId ?? DROPDOWN_NONE_VALUE}
                options={authorOptions}
                onChange={(next) => {
                  const resolved = resolveDropdownNone(next);
                  const label = contactOptions.find(
                    (option) => option.value === resolved,
                  )?.label;
                  void patchSelected({
                    authorContactId: resolved,
                    authorName: label ?? null,
                  });
                }}
                searchPlaceholder="Change author…"
                ariaLabel="Author"
                fallbackIcon={<ContactPersonIcon size={14} />}
                fallbackLabel={selected.authorName || "No author"}
                mutedFallback={!selected.authorContactId}
                selectedDisplayLabel={selected.authorName || "No author"}
                selectedDisplayIcon={selectedAuthorOption?.icon}
              />
            </PropertyFieldGroup>

            <PropertyFieldGroup label="Version">
              <input
                className="finance-estimates-view__property-input"
                defaultValue={selected.versionLabel ?? ""}
                key={`version-${selected.id}-${selected.versionLabel ?? ""}`}
                placeholder="1 (concept)"
                onBlur={(event) => {
                  const next = event.target.value.trim() || null;
                  if (next === (selected.versionLabel ?? null)) return;
                  void patchSelected({ versionLabel: next });
                }}
              />
            </PropertyFieldGroup>

            <PropertyFieldGroup label="Due date">
              <TaskDueDateDropdown
                dueDate={dueDate}
                status={
                  status === "approved"
                    ? "completed"
                    : status === "declined"
                      ? "canceled"
                      : null
                }
                variant="property"
                onDueDateChange={(next) => {
                  void patchSelected({
                    documentDate: serializeEstimateDueDate(next),
                  });
                }}
                noDueDateLabel="No due date"
                labelFormat="relative"
              />
            </PropertyFieldGroup>

            <PropertyFieldGroup label="Total amount">
              <input
                className="finance-estimates-view__property-input"
                inputMode="decimal"
                defaultValue={
                  selected.totalAmountCents != null
                    ? (selected.totalAmountCents / 100).toFixed(2)
                    : ""
                }
                key={`amount-${selected.id}-${selected.totalAmountCents ?? "null"}`}
                placeholder="0.00"
                onBlur={(event) => {
                  const raw = event.target.value.trim();
                  if (!raw) {
                    if (selected.totalAmountCents != null) {
                      void patchSelected({ totalAmountCents: null });
                    }
                    return;
                  }
                  const euros = Number.parseFloat(raw.replace(",", "."));
                  if (!Number.isFinite(euros)) return;
                  const cents = Math.round(euros * 100);
                  if (cents === selected.totalAmountCents) return;
                  void patchSelected({ totalAmountCents: cents });
                }}
              />
            </PropertyFieldGroup>

            <PropertyFieldGroup label="Project">
              <PropertyDropdown
                value={selected.projectId ?? DROPDOWN_NONE_VALUE}
                options={projectOptions}
                onChange={(next) => {
                  void patchSelected({
                    projectId: resolveDropdownNone(next),
                  });
                }}
                searchPlaceholder="Change project…"
                ariaLabel="Project"
                fallbackIcon={<DefaultProjectIcon size={14} />}
                fallbackLabel={project?.name || "No project"}
                mutedFallback={!selected.projectId}
                selectedDisplayLabel={project?.name || "No project"}
              />
            </PropertyFieldGroup>
          </EntityPropertiesSection>
        </div>
      </div>
    </ResizableSidePanel>
  );

  const detailHeader = (
    <>
      {error ? (
        <p className="finance-estimates-view__error">{error}</p>
      ) : null}
      <header className="finance-estimates-view__detail-header">
        <div className="finance-estimates-view__detail-id">
          {formatEstimateDisplayId(selected.number)}
        </div>
        <div className="finance-estimates-view__detail-title-row">
          <input
            className="finance-estimates-view__detail-title-input"
            defaultValue={selected.title}
            key={`title-${selected.id}-${selected.title}`}
            aria-label="Subject"
            onBlur={(event) => {
              const next = event.target.value.trim();
              if (!next || next === selected.title) return;
              void patchSelected({ title: next });
            }}
          />
          <SegmentedPillToggle
            value={docTab}
            options={[
              { value: "proposal", label: "Proposal" },
              { value: "estimate", label: "Estimate" },
            ]}
            onChange={setDocTab}
            ariaLabel="Estimate document section"
          />
        </div>
        <input
          className="finance-estimates-view__detail-subtitle-input"
          defaultValue={selected.subtitle ?? ""}
          key={`subtitle-${selected.id}-${selected.subtitle ?? ""}`}
          placeholder="Subtitle"
          aria-label="Subtitle"
          onBlur={(event) => {
            const next = event.target.value.trim() || null;
            if (next === (selected.subtitle ?? null)) return;
            void patchSelected({ subtitle: next });
          }}
        />
      </header>
    </>
  );

  return (
    <EstimateMarkdownPane
      key={`${docTab}-${selected.id}`}
      tab={docTab}
      estimateId={selected.id}
      initialValue={
        docTab === "proposal"
          ? selected.proposalMarkdown
          : selected.estimateMarkdown
      }
      onSave={docTab === "proposal" ? saveProposal : saveEstimateDoc}
    >
      {({ mode, value, body, dock }) => (
        <FinanceEstimateDetailChrome
          mode={mode}
          value={value}
          body={body}
          dock={dock}
          detailHeader={detailHeader}
          propertiesRail={propertiesRail}
          propertiesRailWidth={propertiesRailWidth}
          scrollShellRef={scrollShellRef}
          scrollportRef={scrollportRef}
          outlineRafRef={outlineRafRef}
          inViewIds={inViewIds}
          setInViewIds={setInViewIds}
        />
      )}
    </EstimateMarkdownPane>
  );
}

function FinanceEstimateDetailChrome({
  mode,
  value,
  body,
  dock,
  detailHeader,
  propertiesRail,
  propertiesRailWidth,
  scrollShellRef,
  scrollportRef,
  outlineRafRef,
  inViewIds,
  setInViewIds,
}: {
  mode: ContentMarkdownViewMode;
  value: string;
  body: ReactNode;
  dock: ReactNode;
  detailHeader: ReactNode;
  propertiesRail: ReactNode;
  propertiesRailWidth: number;
  scrollShellRef: RefObject<HTMLDivElement | null>;
  scrollportRef: RefObject<HTMLDivElement | null>;
  outlineRafRef: MutableRefObject<number | null>;
  inViewIds: ReadonlySet<string>;
  setInViewIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
}) {
  const { rail: financeNavRail } = useContentSidePanelLayout();
  const [hasPersistentGutter, setHasPersistentGutter] = useState(false);
  const [hitStripWidth, setHitStripWidth] = useState(0);

  const headingItems = useMemo(() => {
    if (mode !== "preview") return [] as DocumentHeadingMinimapItem[];
    return deriveDocumentHeadingMinimapItems(value);
  }, [mode, value]);

  const hasEnoughHeadings =
    headingItems.length >= DOCUMENT_HEADING_MINIMAP_MIN_ITEMS;

  // Expanded finance nav: tick minimap. Collapsed rail: titled outline list.
  const showHeadingMinimap =
    !financeNavRail && mode === "preview" && hasEnoughHeadings;
  const showHeadingOutline =
    financeNavRail && mode === "preview" && hasEnoughHeadings;
  const trackHeadingInView = showHeadingMinimap || showHeadingOutline;

  const updateHeadingInView = useCallback(() => {
    const scroller = scrollportRef.current;
    if (!scroller || headingItems.length === 0) {
      setInViewIds(new Set());
      return;
    }
    const scrollerRect = scroller.getBoundingClientRect();
    const next = new Set<string>();
    for (const item of headingItems) {
      const section = scroller.querySelector<HTMLElement>(
        `[data-document-heading="${CSS.escape(item.id)}"]`,
      );
      if (!section) continue;
      const rect = section.getBoundingClientRect();
      if (rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom) {
        next.add(item.id);
      }
    }
    setInViewIds((current) => {
      if (current.size === next.size) {
        let same = true;
        for (const id of next) {
          if (!current.has(id)) {
            same = false;
            break;
          }
        }
        if (same) return current;
      }
      return next;
    });
  }, [headingItems, scrollportRef, setInViewIds]);

  const scheduleHeadingInView = useCallback(() => {
    if (outlineRafRef.current != null) return;
    outlineRafRef.current = window.requestAnimationFrame(() => {
      outlineRafRef.current = null;
      updateHeadingInView();
    });
  }, [outlineRafRef, updateHeadingInView]);

  useEffect(() => {
    const shell = scrollShellRef.current;
    if (!shell || !showHeadingMinimap) return;
    const syncGutter = () => {
      const width = shell.getBoundingClientRect().width;
      setHasPersistentGutter(
        resolveDocumentHeadingMinimapHasPersistentGutter(width),
      );
      setHitStripWidth(resolveDocumentHeadingMinimapHitStripWidth(width));
    };
    syncGutter();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(syncGutter);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [scrollShellRef, showHeadingMinimap, value]);

  useEffect(() => {
    const scroller = scrollportRef.current;
    if (!scroller || !trackHeadingInView) {
      setInViewIds(new Set());
      return;
    }
    updateHeadingInView();
    const onScroll = () => scheduleHeadingInView();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const frame = requestAnimationFrame(updateHeadingInView);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      if (outlineRafRef.current != null) {
        cancelAnimationFrame(outlineRafRef.current);
        outlineRafRef.current = null;
      }
    };
  }, [
    outlineRafRef,
    scheduleHeadingInView,
    scrollportRef,
    setInViewIds,
    trackHeadingInView,
    updateHeadingInView,
    value,
  ]);

  const jumpToHeading = useCallback(
    (item: DocumentHeadingMinimapItem) => {
      const scroller = scrollportRef.current;
      if (!scroller) return;
      const section = scroller.querySelector<HTMLElement>(
        `[data-document-heading="${CSS.escape(item.id)}"]`,
      );
      if (!section) return;
      const scrollerRect = scroller.getBoundingClientRect();
      const sectionRect = section.getBoundingClientRect();
      scroller.scrollTop += sectionRect.top - scrollerRect.top - 16;
    },
    [scrollportRef],
  );

  return (
    <div
      className="finance-estimate-detail-split"
      data-content-detail
      data-detail-split=""
      data-content-view-mode={mode}
      data-heading-outline={showHeadingOutline ? "true" : "false"}
      data-heading-minimap={showHeadingMinimap ? "true" : "false"}
    >
      <div
        ref={scrollShellRef}
        className="finance-estimate-detail-scroll-shell"
      >
        {showHeadingMinimap ? (
          <DocumentHeadingMinimap
            items={headingItems}
            hasPersistentGutter={hasPersistentGutter}
            hitStripWidth={hitStripWidth}
            inViewIds={inViewIds}
            onSelect={jumpToHeading}
          />
        ) : null}
        <div
          ref={scrollportRef}
          className="finance-estimate-detail-scrollport"
        >
          <div className="finance-estimate-detail-scroll-row">
            {showHeadingOutline ? (
              <aside className="finance-estimate-detail-outline">
                <DocumentHeadingOutlineNav
                  items={headingItems}
                  inViewIds={inViewIds}
                  onSelect={jumpToHeading}
                />
              </aside>
            ) : null}
            <div className="finance-estimate-detail-main">
              <div className="finance-estimates-view finance-estimates-view--detail">
                {detailHeader}
                {body}
              </div>
            </div>
            {propertiesRail}
          </div>
        </div>
        <div className="finance-estimate-detail-dock-bar">
          <div className="finance-estimate-detail-dock-bar__main">{dock}</div>
          <div
            className="finance-estimate-detail-dock-bar__rail-spacer"
            style={{
              width: propertiesRailWidth,
              flex: `0 0 ${propertiesRailWidth}px`,
            }}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}

export function FinanceEstimatesView({
  estimates,
  organizations,
  projects = [],
  contactOptions = [],
  contactOrganizationById = {},
  loading = false,
  error = null,
  selectedEstimateId,
  onSelectedEstimateChange,
  onCreateEstimate,
  onUpdateEstimate,
  creating = false,
}: FinanceEstimatesViewProps) {
  const [collapsed, setCollapsed] = useState<Set<UiEstimateStatus>>(
    () => new Set(),
  );
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [authorContactId, setAuthorContactId] = useState("");
  const [versionLabel, setVersionLabel] = useState("1 (concept)");
  const [createDueDate, setCreateDueDate] = useState<Date | null>(null);
  const [totalAmountEuros, setTotalAmountEuros] = useState("");
  const [proposalMarkdown, setProposalMarkdown] = useState(
    "# Proposal\n\nDescribe the work here.\n",
  );
  const [estimateMarkdown, setEstimateMarkdown] = useState(
    "# Estimate\n\n| Item | Hours | Amount |\n| --- | --- | --- |\n| Example | 8 | € 760,00 |\n",
  );

  const selected = useMemo(
    () => estimates.find((row) => row.id === selectedEstimateId) ?? null,
    [estimates, selectedEstimateId],
  );

  const groups = useMemo(
    () => groupEstimatesByStatus(estimates, { includeEmpty: true }),
    [estimates],
  );

  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const org of organizations) map.set(org.id, org.name);
    return map;
  }, [organizations]);

  async function handleCreate() {
    const trimmed = title.trim();
    if (!trimmed) return;
    const euros = Number.parseFloat(totalAmountEuros.replace(",", "."));
    const authorOption = contactOptions.find(
      (option) => option.value === authorContactId,
    );
    await onCreateEstimate({
      title: trimmed,
      organizationId: organizationId || undefined,
      projectId: projectId || undefined,
      authorContactId: authorContactId || null,
      authorName: authorOption?.label,
      versionLabel: versionLabel.trim() || undefined,
      documentDate: serializeEstimateDueDate(createDueDate) ?? undefined,
      totalAmountCents: Number.isFinite(euros)
        ? Math.round(euros * 100)
        : null,
      proposalMarkdown,
      estimateMarkdown,
      status: "concept",
    });
    setShowCreate(false);
    setTitle("");
    setOrganizationId("");
    setProjectId("");
    setCreateDueDate(null);
    setTotalAmountEuros("");
  }

  if (selected) {
    return (
      <FinanceEstimateDetail
        selected={selected}
        error={error}
        organizations={organizations}
        projects={projects}
        contactOptions={contactOptions}
        contactOrganizationById={contactOrganizationById}
        onUpdateEstimate={onUpdateEstimate}
      />
    );
  }

  return (
    <EntityDetailLayout sectionLabel="Finance" title="Estimates">
      <div className="finance-estimates-view">
        {error ? <p className="finance-estimates-view__error">{error}</p> : null}
        {loading ? <p className="finance-empty">Loading estimates…</p> : null}

        {showCreate ? (
          <div className="finance-estimates-view__create">
            <div className="finance-estimates-view__toolbar">
              <span className="finance-estimates-view__create-heading">
                New estimate
              </span>
              <button
                type="button"
                className="finance-chrome-actions__button"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
            </div>
            <label className="finance-estimates-view__field">
              <span>Subject</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Website platform"
              />
            </label>
            <div className="finance-estimates-view__row">
              <label className="finance-estimates-view__field">
                <span>Organization</span>
                <select
                  value={organizationId}
                  onChange={(event) => setOrganizationId(event.target.value)}
                >
                  <option value="">Select organization</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="finance-estimates-view__field">
                <span>Project</span>
                <select
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                >
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="finance-estimates-view__row">
              <label className="finance-estimates-view__field">
                <span>Author</span>
                <select
                  value={authorContactId}
                  onChange={(event) => setAuthorContactId(event.target.value)}
                >
                  <option value="">No author</option>
                  {contactOptions.map((contact) => (
                    <option key={contact.value} value={contact.value}>
                      {contact.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="finance-estimates-view__field">
                <span>Version</span>
                <input
                  value={versionLabel}
                  onChange={(event) => setVersionLabel(event.target.value)}
                />
              </label>
              <div className="finance-estimates-view__field">
                <span>Due date</span>
                <TaskDueDateDropdown
                  dueDate={createDueDate}
                  variant="property"
                  onDueDateChange={setCreateDueDate}
                  noDueDateLabel="No due date"
                />
              </div>
              <label className="finance-estimates-view__field">
                <span>Total amount (€)</span>
                <input
                  value={totalAmountEuros}
                  onChange={(event) => setTotalAmountEuros(event.target.value)}
                  placeholder="760.00"
                />
              </label>
            </div>
            <label className="finance-estimates-view__field">
              <span>Proposal markdown</span>
              <textarea
                rows={6}
                value={proposalMarkdown}
                onChange={(event) => setProposalMarkdown(event.target.value)}
              />
            </label>
            <label className="finance-estimates-view__field">
              <span>Estimate markdown</span>
              <textarea
                rows={6}
                value={estimateMarkdown}
                onChange={(event) => setEstimateMarkdown(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="finance-chrome-actions__button"
              disabled={creating || !title.trim()}
              onClick={() => {
                void handleCreate();
              }}
            >
              {creating ? "Creating…" : "Create estimate"}
            </button>
          </div>
        ) : null}

        {!loading && !error && estimates.length === 0 && !showCreate ? (
          <p className="finance-empty">
            No estimates yet. Use + on a status group to create one.
          </p>
        ) : null}

        {!showCreate && estimates.length > 0 ? (
          <ul className="project-tasks-list finance-estimates-view__list">
            {groups.map((group) => {
              const isCollapsed = collapsed.has(group.status);
              return (
                <StatusGroupSection
                  key={group.status}
                  groupKey={group.status}
                  title={group.label}
                  collapsed={isCollapsed}
                  icon={<EstimateStatusIcon status={group.status} size={14} />}
                  onToggle={() =>
                    setCollapsed((current) => {
                      const next = new Set(current);
                      if (next.has(group.status)) next.delete(group.status);
                      else next.add(group.status);
                      return next;
                    })
                  }
                  onAdd={() => {
                    setCollapsed((current) => {
                      const next = new Set(current);
                      next.delete(group.status);
                      return next;
                    });
                    setShowCreate(true);
                  }}
                  addActionLabel="estimate"
                >
                  {isCollapsed
                    ? null
                    : group.estimates.map((estimate) => {
                        const estimateStatus = migrateClientEstimateStatus(
                          estimate.status,
                        );
                        const orgLabel =
                          estimate.clientLabel ||
                          (estimate.organizationId
                            ? orgNameById.get(estimate.organizationId)
                            : null);
                        const rowDue = parseEstimateDueDate(
                          estimate.documentDate,
                        );
                        return (
                          <li key={estimate.id} className="task-item-row-item">
                            <button
                              type="button"
                              className="task-item-row"
                              onClick={() =>
                                onSelectedEstimateChange(estimate.id)
                              }
                            >
                              <span className="task-item-row__id">
                                {formatEstimateDisplayId(estimate.number)}
                              </span>
                              <span
                                className="task-item-row__status"
                                aria-label={getClientEstimateStatusLabel(
                                  estimateStatus,
                                )}
                              >
                                <EstimateStatusIcon
                                  status={estimateStatus}
                                  size={14}
                                />
                              </span>
                              <span
                                className="finance-estimates-view__version"
                                title={estimate.versionLabel ?? undefined}
                              >
                                {estimate.versionLabel?.trim() || "—"}
                              </span>
                              <span className="task-item-row__title-wrap">
                                <span className="task-item-row__title">
                                  {estimate.title}
                                </span>
                              </span>
                              {orgLabel ? (
                                <span className="finance-estimates-view__org">
                                  <OrganizationIcon size={12} />
                                  <span>{orgLabel}</span>
                                </span>
                              ) : null}
                              <span className="task-item-row__properties">
                                <span
                                  className={[
                                    "task-item-row__due",
                                    !rowDue
                                      ? "task-item-row__due--hotkey-only"
                                      : null,
                                    "finance-estimates-view__due",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  onMouseDown={stopFieldEvent}
                                  onClick={stopFieldEvent}
                                >
                                  <DeferredTaskDueDateDropdown
                                    dueDate={rowDue}
                                    status={
                                      estimateStatus === "approved"
                                        ? "completed"
                                        : estimateStatus === "declined"
                                          ? "canceled"
                                          : null
                                    }
                                    variant="list"
                                    labelFormat="relative"
                                    noDueDateLabel="—"
                                    onDueDateChange={(next) => {
                                      void onUpdateEstimate?.(estimate.id, {
                                        documentDate:
                                          serializeEstimateDueDate(next),
                                      });
                                    }}
                                  />
                                </span>
                                <span className="finance-estimates-view__amount">
                                  {formatEuroCents(estimate.totalAmountCents)}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                </StatusGroupSection>
              );
            })}
          </ul>
        ) : null}
      </div>
    </EntityDetailLayout>
  );
}

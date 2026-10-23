"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  COMMUNICATION_CHAT_LIST_FILTER_ALL,
  countCommunicationChatListFilters,
  EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
  encodeCommunicationChatListPartyValue,
  parseCommunicationChatListPartyValue,
  type CommunicationChatListDueFilter,
  type CommunicationChatListFilters,
  type CommunicationChatListKindFilter,
} from "../../communication/communication-chat-list-filters.js";
import {
  CHAT_LIST_STATUS_ORDER,
  getChatListStatusLabel,
  type ChatListStatus,
} from "../../communication/chat-conversation-list-item.js";
import {
  DROPDOWN_NO_PROJECT_VALUE,
  DROPDOWN_NONE_VALUE,
} from "../dropdowns/dropdown-options.js";
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from "../dropdowns/searchable-dropdown.js";
import {
  getTaskPriorityLabel,
  TASK_PRIORITY_ORDER,
} from "../../tasks/task-priority.js";
import {
  getTasksDueFilterLabel,
  TASKS_DUE_FILTERS,
} from "../../tasks/tasks-due-filters.js";

const PANEL_WIDTH = 328;
const PANEL_GAP = 6;
const VIEWPORT_PADDING = 8;

const FILTER_TRIGGER_CLASSNAME =
  "property-dropdown-trigger--compose communication-chat__list-filter-dropdown-trigger";

function ListFilterIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M3.75 7a.75.75 0 0 1 .75-.75h15a.75.75 0 0 1 0 1.5h-15A.75.75 0 0 1 3.75 7m2.5 5a.75.75 0 0 1 .75-.75h10a.75.75 0 0 1 0 1.5H7a.75.75 0 0 1-.75-.75m3 5a.75.75 0 0 1 .75-.75h4a.75.75 0 0 1 0 1.5h-4a.75.75 0 0 1-.75-.75" />
    </svg>
  );
}

function withAnyOption(
  options: readonly SearchableDropdownOption<string>[],
  label: string,
): SearchableDropdownOption<string>[] {
  return [
    {
      value: COMMUNICATION_CHAT_LIST_FILTER_ALL,
      label,
      searchTerms: `any all ${label}`,
    },
    ...options,
  ];
}

export type CommunicationChatListFilterMenuProps = {
  filters: CommunicationChatListFilters;
  onFiltersChange: (next: CommunicationChatListFilters) => void;
  contactOptions?: readonly SearchableDropdownOption<string>[];
  organizationOptions?: readonly SearchableDropdownOption<string>[];
  projectOptions?: readonly SearchableDropdownOption<string>[];
};

export function CommunicationChatListFilterMenu({
  filters,
  onFiltersChange,
  contactOptions = [],
  organizationOptions = [],
  projectOptions = [],
}: CommunicationChatListFilterMenuProps) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    visibility: "hidden",
  });
  const activeCount = countCommunicationChatListFilters(filters);

  const updatePosition = useCallback(() => {
    const anchor = rootRef.current;
    if (!anchor) return;
    const trigger =
      anchor.querySelector("button") ??
      (anchor instanceof HTMLButtonElement ? anchor : null) ??
      anchor;
    const rect = trigger.getBoundingClientRect();
    const width = PANEL_WIDTH;
    const maxLeft = window.innerWidth - width - VIEWPORT_PADDING;
    let left = rect.right - width;
    left = Math.max(VIEWPORT_PADDING, Math.min(left, maxLeft));

    const panelHeight = panelRef.current?.offsetHeight ?? 360;
    const spaceBelow =
      window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_PADDING;
    const openUpward =
      spaceBelow < panelHeight && rect.top > panelHeight + PANEL_GAP;
    const top = openUpward
      ? Math.max(VIEWPORT_PADDING, rect.top - panelHeight - PANEL_GAP)
      : rect.bottom + PANEL_GAP;

    setPanelStyle({
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      zIndex: 80,
      visibility: "visible",
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle({ visibility: "hidden" });
      return;
    }
    updatePosition();
    const frame = window.requestAnimationFrame(() => updatePosition());
    return () => window.cancelAnimationFrame(frame);
  }, [open, updatePosition, activeCount]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        (target.closest("[data-searchable-dropdown-panel]") ||
          target.closest("[data-due-date-calendar-popover]"))
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (
        event.target instanceof Element &&
        event.target.closest("[data-searchable-dropdown-panel]")
      ) {
        return;
      }
      event.preventDefault();
      setOpen(false);
    };
    const onReposition = () => updatePosition();
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updatePosition]);

  const kindOptions = useMemo<SearchableDropdownOption<string>[]>(
    () =>
      withAnyOption(
        [
          { value: "email", label: "Email", searchTerms: "email mail" },
          { value: "chat", label: "Chat", searchTerms: "chat conversation" },
          {
            value: "whatsapp",
            label: "WhatsApp",
            searchTerms: "whatsapp wa message",
          },
          {
            value: "support",
            label: "Support",
            searchTerms: "support ticket helpdesk",
          },
        ],
        "Any type",
      ),
    [],
  );

  const partyOptions = useMemo<SearchableDropdownOption<string>[]>(() => {
    const contacts = contactOptions
      .filter((option) => option.value !== DROPDOWN_NONE_VALUE)
      .map((option) => ({
        ...option,
        value: `contact:${option.value}`,
        group: "Contacts",
        searchTerms: `${option.searchTerms ?? option.label} contact`,
      }));
    const organizations = organizationOptions
      .filter((option) => option.value !== DROPDOWN_NONE_VALUE)
      .map((option) => ({
        ...option,
        value: `organization:${option.value}`,
        group: "Organizations",
        searchTerms: `${option.searchTerms ?? option.label} organization org`,
      }));
    return withAnyOption([...contacts, ...organizations], "Any contact or organization");
  }, [contactOptions, organizationOptions]);

  const statusOptions = useMemo<SearchableDropdownOption<string>[]>(
    () =>
      withAnyOption(
        CHAT_LIST_STATUS_ORDER.map((status) => ({
          value: status,
          label: getChatListStatusLabel(status),
          searchTerms: `${status} ${getChatListStatusLabel(status)}`,
        })),
        "Any status",
      ),
    [],
  );

  const dueOptions = useMemo<SearchableDropdownOption<string>[]>(
    () =>
      withAnyOption(
        [
          ...TASKS_DUE_FILTERS.map((value) => ({
            value,
            label: getTasksDueFilterLabel(value),
            searchTerms: value.replaceAll("-", " "),
          })),
          {
            value: "none",
            label: "No due date",
            searchTerms: "none no due date unset",
          },
        ],
        "Any due date",
      ),
    [],
  );

  const projectFilterOptions = useMemo<SearchableDropdownOption<string>[]>(() => {
    const rows = projectOptions.map((option) =>
      option.value === DROPDOWN_NO_PROJECT_VALUE
        ? { ...option, value: "", searchTerms: "no project unassigned none" }
        : option,
    );
    return withAnyOption(rows, "Any project");
  }, [projectOptions]);

  const priorityOptions = useMemo<SearchableDropdownOption<string>[]>(
    () =>
      withAnyOption(
        TASK_PRIORITY_ORDER.map((value) => ({
          value: String(value),
          label: getTaskPriorityLabel(value),
          searchTerms: getTaskPriorityLabel(value),
        })),
        "Any priority",
      ),
    [],
  );

  function patch(partial: Partial<CommunicationChatListFilters>) {
    onFiltersChange({ ...filters, ...partial });
  }

  const panel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            id={panelId}
            className="communication-chat__list-filter-panel searchable-dropdown-panel"
            style={panelStyle}
            role="dialog"
            aria-label="List filters"
            data-communication-chat-list-filter-panel=""
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="communication-chat__list-filter-panel-header">
              <span>Filters</span>
              {activeCount > 0 ? (
                <button
                  type="button"
                  className="communication-chat__list-filter-clear"
                  onClick={() =>
                    onFiltersChange(EMPTY_COMMUNICATION_CHAT_LIST_FILTERS)
                  }
                >
                  Clear
                </button>
              ) : null}
            </div>
            <div className="communication-chat__list-filter-rows">
              <FilterRow label="Type">
                <SearchableDropdown
                  ariaLabel="Filter by type"
                  className="property-dropdown"
                  triggerClassName={FILTER_TRIGGER_CLASSNAME}
                  value={filters.kind ?? COMMUNICATION_CHAT_LIST_FILTER_ALL}
                  options={kindOptions}
                  searchPlaceholder="Filter type…"
                  panelWidth={220}
                  panelAlign="end"
                  clearExemptValues={[COMMUNICATION_CHAT_LIST_FILTER_ALL]}
                  onChange={(value) =>
                    patch({
                      kind:
                        value === COMMUNICATION_CHAT_LIST_FILTER_ALL
                          ? null
                          : (value as CommunicationChatListKindFilter),
                    })
                  }
                  onClear={() => patch({ kind: null })}
                />
              </FilterRow>
              <FilterRow label="Date range">
                <div className="communication-chat__list-filter-dates">
                  <input
                    type="date"
                    className="communication-chat__list-filter-date"
                    aria-label="Activity from date"
                    value={filters.activityFromYmd ?? ""}
                    onChange={(event) =>
                      patch({
                        activityFromYmd: event.target.value.trim() || null,
                      })
                    }
                  />
                  <span
                    className="communication-chat__list-filter-dates-sep"
                    aria-hidden
                  >
                    –
                  </span>
                  <input
                    type="date"
                    className="communication-chat__list-filter-date"
                    aria-label="Activity to date"
                    value={filters.activityToYmd ?? ""}
                    onChange={(event) =>
                      patch({
                        activityToYmd: event.target.value.trim() || null,
                      })
                    }
                  />
                </div>
              </FilterRow>
              <FilterRow label="Contact / org">
                <SearchableDropdown
                  ariaLabel="Filter by contact or organization"
                  className="property-dropdown"
                  triggerClassName={FILTER_TRIGGER_CLASSNAME}
                  value={encodeCommunicationChatListPartyValue(filters.party)}
                  options={partyOptions}
                  searchPlaceholder="Search contacts or organizations…"
                  panelWidth={280}
                  panelAlign="end"
                  clearExemptValues={[COMMUNICATION_CHAT_LIST_FILTER_ALL]}
                  onChange={(value) =>
                    patch({
                      party: parseCommunicationChatListPartyValue(value),
                    })
                  }
                  onClear={() => patch({ party: null })}
                />
              </FilterRow>
              <FilterRow label="Status">
                <SearchableDropdown
                  ariaLabel="Filter by status"
                  className="property-dropdown"
                  triggerClassName={FILTER_TRIGGER_CLASSNAME}
                  value={filters.status ?? COMMUNICATION_CHAT_LIST_FILTER_ALL}
                  options={statusOptions}
                  searchPlaceholder="Filter status…"
                  panelWidth={220}
                  panelAlign="end"
                  clearExemptValues={[COMMUNICATION_CHAT_LIST_FILTER_ALL]}
                  onChange={(value) =>
                    patch({
                      status:
                        value === COMMUNICATION_CHAT_LIST_FILTER_ALL
                          ? null
                          : (value as ChatListStatus),
                    })
                  }
                  onClear={() => patch({ status: null })}
                />
              </FilterRow>
              <FilterRow label="Due date">
                <SearchableDropdown
                  ariaLabel="Filter by due date"
                  className="property-dropdown"
                  triggerClassName={FILTER_TRIGGER_CLASSNAME}
                  value={filters.due ?? COMMUNICATION_CHAT_LIST_FILTER_ALL}
                  options={dueOptions}
                  searchPlaceholder="Filter due date…"
                  panelWidth={220}
                  panelAlign="end"
                  clearExemptValues={[COMMUNICATION_CHAT_LIST_FILTER_ALL]}
                  onChange={(value) =>
                    patch({
                      due:
                        value === COMMUNICATION_CHAT_LIST_FILTER_ALL
                          ? null
                          : (value as CommunicationChatListDueFilter),
                    })
                  }
                  onClear={() => patch({ due: null })}
                />
              </FilterRow>
              <FilterRow label="Project">
                <SearchableDropdown
                  ariaLabel="Filter by project"
                  className="property-dropdown"
                  triggerClassName={FILTER_TRIGGER_CLASSNAME}
                  value={
                    filters.projectKey == null
                      ? COMMUNICATION_CHAT_LIST_FILTER_ALL
                      : filters.projectKey
                  }
                  options={projectFilterOptions}
                  searchPlaceholder="Filter project…"
                  panelWidth={260}
                  panelAlign="end"
                  clearExemptValues={[COMMUNICATION_CHAT_LIST_FILTER_ALL]}
                  onChange={(value) =>
                    patch({
                      projectKey:
                        value === COMMUNICATION_CHAT_LIST_FILTER_ALL
                          ? null
                          : value,
                    })
                  }
                  onClear={() => patch({ projectKey: null })}
                />
              </FilterRow>
              <FilterRow label="Priority">
                <SearchableDropdown
                  ariaLabel="Filter by priority"
                  className="property-dropdown"
                  triggerClassName={FILTER_TRIGGER_CLASSNAME}
                  value={
                    filters.priority == null
                      ? COMMUNICATION_CHAT_LIST_FILTER_ALL
                      : String(filters.priority)
                  }
                  options={priorityOptions}
                  searchPlaceholder="Filter priority…"
                  panelWidth={220}
                  panelAlign="end"
                  clearExemptValues={[COMMUNICATION_CHAT_LIST_FILTER_ALL]}
                  onChange={(value) =>
                    patch({
                      priority:
                        value === COMMUNICATION_CHAT_LIST_FILTER_ALL
                          ? null
                          : Number(value),
                    })
                  }
                  onClear={() => patch({ priority: null })}
                />
              </FilterRow>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="communication-chat__list-filter" ref={rootRef}>
      <button
        type="button"
        className={[
          "communication-chat__list-filter-trigger",
          open || activeCount > 0 ? "is-active" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={
          activeCount > 0
            ? `Filters, ${activeCount} active`
            : "Filters"
        }
        aria-expanded={open}
        aria-controls={panelId}
        title="Filters"
        onClick={() => setOpen((current) => !current)}
      >
        <ListFilterIcon size={16} />
        {activeCount > 0 ? (
          <span className="communication-chat__list-filter-count" aria-hidden>
            {activeCount}
          </span>
        ) : null}
      </button>
      {panel}
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="communication-chat__list-filter-row">
      <span className="communication-chat__list-filter-row-label">{label}</span>
      <div className="communication-chat__list-filter-row-control">{children}</div>
    </div>
  );
}

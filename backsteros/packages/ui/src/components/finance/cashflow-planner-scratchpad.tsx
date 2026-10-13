"use client";

import type {
  CashflowPlannerEntry,
  CashflowPlannerEntryInput,
  CashflowPlannerEntryType,
} from "@backsteros/contracts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FocusEvent,
} from "react";
import { flushSync } from "react-dom";
import { XIcon } from "@primer/octicons-react";

import {
  formatMoneyInput,
  moneyCentsToInput,
  moneyInputContentWidth,
  parseMoneyInput,
} from "../../finance/money-input.js";
import {
  formatLocalYmd,
  parseYmdLocal,
} from "../../tasks/task-due-date.js";
import { requestCloseSearchableDropdowns } from "../../dropdowns/searchable-dropdown-events.js";
import { TaskDueDateDropdown } from "../tasks/task-due-date-dropdown.js";
import { ProjectTypeGroupSection } from "../projects/project-type-group-section.js";
import { formatMoney } from "./finance-categories-shared.js";

const UNGROUPED_KEY = "";
const DRAG_MIME = "application/x-backsteros-cashflow-planner-entry";

function PlannerEyeIncludedIcon() {
  return (
    <svg
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.55 13.406c-.272-.373-.408-.56-.502-.92a2.5 2.5 0 0 1 0-.971c.094-.361.23-.548.502-.92C4.039 8.55 7.303 5 12 5s7.961 3.55 9.45 5.594c.272.373.408.56.502.92a2.5 2.5 0 0 1 0 .971c-.094.361-.23.548-.502.92C19.961 15.45 16.697 19 12 19s-7.961-3.55-9.45-5.594" />
      <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4" />
    </svg>
  );
}

function PlannerEyeExcludedIcon() {
  return (
    <svg
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.55 13.406c-.272-.373-.408-.56-.502-.92a2.5 2.5 0 0 1 0-.971c.094-.361.23-.548.502-.92C4.039 8.55 7.303 5 12 5s7.961 3.55 9.45 5.594c.272.373.408.56.502.92a2.5 2.5 0 0 1 0 .971c-.094.361-.23.548-.502.92C19.961 15.45 16.697 19 12 19s-7.961-3.55-9.45-5.594" />
      <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4m9-11L3 21" />
    </svg>
  );
}

export type CashflowPlannerScratchpadProps = {
  entries: CashflowPlannerEntry[];
  loading?: boolean;
  pending?: boolean;
  error?: string | null;
  onCreate: (input?: Partial<CashflowPlannerEntryInput>) => Promise<unknown>;
  onUpdate: (
    id: string,
    patch: Partial<CashflowPlannerEntryInput>,
  ) => Promise<unknown>;
  /** Optimistic batch reorder / regroup — UI updates immediately. */
  onReorder?: (
    patches: Array<{ id: string; patch: Partial<CashflowPlannerEntryInput> }>,
  ) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
};

type GroupSection = {
  key: string;
  label: string;
  entries: CashflowPlannerEntry[];
  expenseCents: number;
  incomeCents: number;
  netCents: number;
};

function entryGroupKey(entry: CashflowPlannerEntry): string {
  return entry.groupLabel?.trim() || UNGROUPED_KEY;
}

function formatPlannerAmountInput(entry: CashflowPlannerEntry): string {
  if (entry.amountCents === 0) return "";
  const body = moneyCentsToInput(entry.amountCents, {
    allowZero: true,
    alwaysFraction: true,
  });
  if (!body) return "";
  if (entry.entryType === "expense") {
    return `-${body}`;
  }
  return body;
}

function parsePlannerAmount(
  raw: string,
  fallbackType: CashflowPlannerEntryType = "income",
): {
  amountCents: number;
  entryType: CashflowPlannerEntryType;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { amountCents: 0, entryType: fallbackType };
  }
  const negative = trimmed.startsWith("-");
  const parsed = parseMoneyInput(trimmed, { signed: true }) ?? 0;
  return {
    amountCents: Math.abs(parsed),
    entryType: negative ? "expense" : "income",
  };
}

function computeTotals(entries: CashflowPlannerEntry[]) {
  let expenseCents = 0;
  let incomeCents = 0;
  for (const entry of entries) {
    const amount = Math.max(0, entry.amountCents);
    if (entry.entryType === "income") incomeCents += amount;
    else expenseCents += amount;
  }
  return {
    expenseCents,
    incomeCents,
    netCents: incomeCents - expenseCents,
  };
}

function buildGroupSections(
  entries: CashflowPlannerEntry[],
  extraGroups: string[],
): GroupSection[] {
  const map = new Map<string, CashflowPlannerEntry[]>();
  map.set(UNGROUPED_KEY, []);

  for (const label of extraGroups) {
    const key = label.trim();
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
  }

  for (const entry of entries) {
    const key = entryGroupKey(entry);
    const list = map.get(key) ?? [];
    list.push(entry);
    map.set(key, list);
  }

  const sections: GroupSection[] = [];
  for (const [key, rows] of map) {
    const sorted = [...rows].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });
    let expenseCents = 0;
    let incomeCents = 0;
    for (const entry of sorted) {
      const amount = Math.max(0, entry.amountCents);
      if (entry.entryType === "income") incomeCents += amount;
      else expenseCents += amount;
    }
    sections.push({
      key,
      label: key === UNGROUPED_KEY ? "Ungrouped" : key,
      entries: sorted,
      expenseCents,
      incomeCents,
      netCents: incomeCents - expenseCents,
    });
  }

  return sections.sort((a, b) => {
    if (a.key === UNGROUPED_KEY) return -1;
    if (b.key === UNGROUPED_KEY) return 1;
    return a.label.localeCompare(b.label);
  });
}

function PlannerRow({
  entry,
  pending,
  groupKey,
  dragging = false,
  showInsertBefore = false,
  showInsertAfter = false,
  onUpdate,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOverRow,
  onDragLeaveRow,
  onDropOnRow,
}: {
  entry: CashflowPlannerEntry;
  pending: boolean;
  groupKey: string;
  dragging?: boolean;
  showInsertBefore?: boolean;
  showInsertAfter?: boolean;
  onUpdate: (
    id: string,
    patch: Partial<CashflowPlannerEntryInput>,
  ) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onDragStart: (entryId: string, event: DragEvent) => void;
  onDragEnd: () => void;
  onDragOverRow: (entryId: string, groupKey: string, event: DragEvent) => void;
  onDragLeaveRow: () => void;
  onDropOnRow: (entryId: string, groupKey: string, event: DragEvent) => void;
}) {
  const [name, setName] = useState(entry.name);
  const [amount, setAmount] = useState(() => formatPlannerAmountInput(entry));
  const dueWrapRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(entry.name);
    setAmount(formatPlannerAmountInput(entry));
  }, [entry.amountCents, entry.entryType, entry.name, entry.updatedAt]);

  const focusName = () => {
    requestCloseSearchableDropdowns();
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
  };

  const focusAmount = () => {
    window.requestAnimationFrame(() => {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    });
  };

  const focusDueTrigger = () => {
    window.requestAnimationFrame(() => {
      const trigger = dueWrapRef.current?.querySelector<HTMLButtonElement>(
        'button[aria-haspopup="listbox"]',
      );
      trigger?.focus();
    });
  };

  const commitName = async () => {
    const next = name.trim();
    if (!next || next === entry.name) {
      setName(entry.name);
      return;
    }
    await onUpdate(entry.id, { name: next });
  };

  const commitAmount = async () => {
    const next = parsePlannerAmount(amount, entry.entryType);
    if (
      next.amountCents === entry.amountCents &&
      next.entryType === entry.entryType
    ) {
      setAmount(formatPlannerAmountInput(entry));
      return;
    }
    await onUpdate(entry.id, next);
  };

  const amountTone = (() => {
    const trimmed = amount.trim();
    if (
      !trimmed ||
      trimmed === "-" ||
      trimmed === "0" ||
      trimmed === "0,00"
    ) {
      return "placeholder";
    }
    return trimmed.startsWith("-") ? "expense" : "income";
  })();

  return (
    <li
      className={[
        "cashflow-planner__row",
        dragging ? "cashflow-planner__row--dragging" : null,
        showInsertBefore ? "cashflow-planner__row--insert-before" : null,
        showInsertAfter ? "cashflow-planner__row--insert-after" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      onDragOver={(event) => onDragOverRow(entry.id, groupKey, event)}
      onDragLeave={onDragLeaveRow}
      onDrop={(event) => onDropOnRow(entry.id, groupKey, event)}
    >
      <span
        className="cashflow-planner__drag"
        aria-hidden="true"
        title="Drag to a group"
        draggable={!pending}
        onDragStart={(event) => {
          const row = event.currentTarget.closest("li");
          if (row instanceof HTMLElement) {
            const rect = row.getBoundingClientRect();
            event.dataTransfer.setDragImage(
              row,
              Math.min(24, rect.width / 4),
              Math.min(16, rect.height / 2),
            );
          }
          onDragStart(entry.id, event);
        }}
        onDragEnd={onDragEnd}
      >
        ⋮⋮
      </span>

      <div className="cashflow-planner__due" ref={dueWrapRef}>
        <TaskDueDateDropdown
          dueDate={parseYmdLocal(entry.dueDate)}
          allowClear={false}
          taskPropertyDropdownId={null}
          variant="property"
          triggerVariant="inlineChip"
          disabled={pending}
          searchShortcutLabel=""
          onTabFromSearch={focusName}
          onDueDateChange={(date) => {
            if (!date) return;
            const next = formatLocalYmd(date);
            if (next === entry.dueDate) return;
            void onUpdate(entry.id, { dueDate: next });
          }}
        />
      </div>

      <input
        ref={nameInputRef}
        className="cashflow-planner__input cashflow-planner__input--name"
        aria-label="Name"
        value={name}
        disabled={pending}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => void commitName()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
            return;
          }
          if (event.key === "Tab" && !event.shiftKey) {
            event.preventDefault();
            void commitName().then(() => focusAmount());
            return;
          }
          if (event.key === "Tab" && event.shiftKey) {
            event.preventDefault();
            void commitName().then(() => focusDueTrigger());
          }
        }}
      />

      <label
        className={[
          "cashflow-planner__amount-wrap",
          `cashflow-planner__amount-wrap--${amountTone}`,
        ].join(" ")}
      >
        <span className="cashflow-planner__amount-prefix" aria-hidden="true">
          €
        </span>
        <input
          ref={amountInputRef}
          className="cashflow-planner__input cashflow-planner__input--amount"
          inputMode="decimal"
          aria-label="Amount (use - for expense)"
          title="Use a leading - for expenses"
          placeholder="0,00"
          value={amount}
          disabled={pending}
          {...moneyInputContentWidth(amount || "0,00")}
          onChange={(event) =>
            setAmount(formatMoneyInput(event.target.value, { signed: true }))
          }
          onBlur={() => void commitAmount()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
              return;
            }
            if (event.key === "Tab" && event.shiftKey) {
              event.preventDefault();
              void commitAmount().then(() => {
                nameInputRef.current?.focus();
                nameInputRef.current?.select();
              });
            }
          }}
        />
      </label>

      <button
        type="button"
        className="cashflow-planner__remove"
        aria-label={`Remove ${entry.name}`}
        title="Remove"
        tabIndex={-1}
        disabled={pending}
        onClick={() => void onDelete(entry.id)}
      >
        <XIcon size={12} />
      </button>
    </li>
  );
}

function PlannerComposerRow({
  pending,
  onCreate,
}: {
  pending: boolean;
  onCreate: (input?: Partial<CashflowPlannerEntryInput>) => Promise<unknown>;
}) {
  const [dueDate, setDueDate] = useState(() => formatLocalYmd(new Date()));
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const creatingRef = useRef(false);
  const composerRef = useRef<HTMLDivElement>(null);
  const dueWrapRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);

  const focusName = () => {
    requestCloseSearchableDropdowns();
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
  };

  const focusAmount = () => {
    window.requestAnimationFrame(() => {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    });
  };

  const focusDueTrigger = () => {
    window.requestAnimationFrame(() => {
      const trigger = dueWrapRef.current?.querySelector<HTMLButtonElement>(
        'button[aria-haspopup="listbox"]',
      );
      trigger?.focus();
    });
  };

  const resetComposer = () => {
    setDueDate(formatLocalYmd(new Date()));
    setName("");
    setAmount("");
  };

  const tryCreate = async (options?: { refocus?: boolean }) => {
    const trimmedName = name.trim();
    const parsed = parsePlannerAmount(amount);
    if (!trimmedName && parsed.amountCents === 0) return;
    if (creatingRef.current || pending) return;

    creatingRef.current = true;
    try {
      await onCreate({
        name: trimmedName || "New row",
        entryType: parsed.entryType,
        amountCents: parsed.amountCents,
        dueDate,
        groupLabel: null,
      });
      resetComposer();
      if (options?.refocus !== false) {
        window.requestAnimationFrame(() => {
          nameInputRef.current?.focus();
        });
      }
    } finally {
      creatingRef.current = false;
    }
  };

  const onComposerBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && composerRef.current?.contains(next)) return;
    void tryCreate({ refocus: false });
  };

  const amountTone = (() => {
    const trimmed = amount.trim();
    if (
      !trimmed ||
      trimmed === "-" ||
      trimmed === "0" ||
      trimmed === "0,00"
    ) {
      return "placeholder";
    }
    return trimmed.startsWith("-") ? "expense" : "income";
  })();

  return (
    <div
      ref={composerRef}
      className="cashflow-planner__row cashflow-planner__row--composer"
      onBlur={onComposerBlur}
    >
      <span
        className="cashflow-planner__drag cashflow-planner__drag--spacer"
        aria-hidden="true"
      >
        ⋮⋮
      </span>

      <div className="cashflow-planner__due" ref={dueWrapRef}>
        <TaskDueDateDropdown
          dueDate={parseYmdLocal(dueDate)}
          allowClear={false}
          taskPropertyDropdownId={null}
          variant="property"
          triggerVariant="inlineChip"
          disabled={pending}
          searchShortcutLabel=""
          onTabFromSearch={focusName}
          onDueDateChange={(date) => {
            if (!date) return;
            setDueDate(formatLocalYmd(date));
          }}
        />
      </div>

      <input
        ref={nameInputRef}
        className="cashflow-planner__input cashflow-planner__input--name"
        aria-label="New row name"
        placeholder="Description"
        value={name}
        disabled={pending}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void tryCreate();
            return;
          }
          if (event.key === "Tab" && !event.shiftKey) {
            event.preventDefault();
            focusAmount();
            return;
          }
          if (event.key === "Tab" && event.shiftKey) {
            event.preventDefault();
            focusDueTrigger();
          }
        }}
      />

      <label
        className={[
          "cashflow-planner__amount-wrap",
          `cashflow-planner__amount-wrap--${amountTone}`,
        ].join(" ")}
      >
        <span className="cashflow-planner__amount-prefix" aria-hidden="true">
          €
        </span>
        <input
          ref={amountInputRef}
          className="cashflow-planner__input cashflow-planner__input--amount"
          inputMode="decimal"
          aria-label="New row amount (use - for expense)"
          title="Use a leading - for expenses"
          placeholder="0,00"
          value={amount}
          disabled={pending}
          {...moneyInputContentWidth(amount || "0,00")}
          onChange={(event) =>
            setAmount(formatMoneyInput(event.target.value, { signed: true }))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void tryCreate();
              return;
            }
            if (event.key === "Tab" && event.shiftKey) {
              event.preventDefault();
              nameInputRef.current?.focus();
              nameInputRef.current?.select();
            }
          }}
        />
      </label>

      <span
        className="cashflow-planner__remove cashflow-planner__remove--spacer"
        aria-hidden="true"
      >
        <XIcon size={12} />
      </span>
    </div>
  );
}

function PlannerGroup({
  section,
  pending,
  draggingEntryId = null,
  dropIndicator = null,
  hideHeader = false,
  included = true,
  onToggleIncluded,
  onDragOverRow,
  onDragLeaveRow,
  onDropOnRow,
  onDragOverAppend,
  onDropOnAppend,
  onIndicateAppend,
  onPlaceEntry,
  onRenameGroup,
  onRemoveEmptyGroup,
  onUpdate,
  onDelete,
  onDragStartEntry,
  onDragEndEntry,
}: {
  section: GroupSection;
  pending: boolean;
  draggingEntryId?: string | null;
  dropIndicator?: { groupKey: string; beforeEntryId: string | null } | null;
  hideHeader?: boolean;
  included?: boolean;
  onToggleIncluded?: () => void;
  onDragOverRow: (entryId: string, groupKey: string, event: DragEvent) => void;
  onDragLeaveRow: () => void;
  onDropOnRow: (entryId: string, groupKey: string, event: DragEvent) => void;
  onDragOverAppend: (groupKey: string, event: DragEvent) => void;
  onDropOnAppend: (groupKey: string, event: DragEvent) => void;
  onIndicateAppend: (groupKey: string | null) => void;
  onPlaceEntry: (
    entryId: string,
    groupKey: string,
    beforeEntryId: string | null,
  ) => void;
  onRenameGroup: (groupKey: string, nextLabel: string) => void;
  onRemoveEmptyGroup: (groupKey: string) => void;
  onUpdate: (
    id: string,
    patch: Partial<CashflowPlannerEntryInput>,
  ) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onDragStartEntry: (entryId: string, event: DragEvent) => void;
  onDragEndEntry: () => void;
}) {
  const isUngrouped = section.key === UNGROUPED_KEY;
  const isAppendTarget =
    dropIndicator?.groupKey === section.key &&
    dropIndicator.beforeEntryId === null;
  const lastEntryId = section.entries[section.entries.length - 1]?.id ?? null;
  const [editingLabel, setEditingLabel] = useState(section.label);
  const [isEditing, setIsEditing] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditingLabel(section.label);
  }, [section.label]);

  useEffect(() => {
    if (!isEditing) return;
    const input = renameInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [isEditing]);

  const commitRename = () => {
    const next = editingLabel.trim();
    if (!next || next === section.label) {
      setEditingLabel(section.label);
      setIsEditing(false);
      return;
    }
    onRenameGroup(section.key, next);
    setIsEditing(false);
  };

  const groupItems =
    section.entries.length === 0 ? (
      <li
        className={[
          "cashflow-planner__group-empty",
          isAppendTarget ? "cashflow-planner__group-empty--drop-target" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        onDragOver={(event) => onDragOverAppend(section.key, event)}
        onDragLeave={onDragLeaveRow}
        onDrop={(event) => onDropOnAppend(section.key, event)}
      >
        {isAppendTarget ? "Drop here" : "Drop rows here"}
      </li>
    ) : (
      section.entries.map((entry) => (
        <PlannerRow
          key={entry.id}
          entry={entry}
          pending={pending}
          groupKey={section.key}
          dragging={draggingEntryId === entry.id}
          showInsertBefore={
            dropIndicator?.groupKey === section.key &&
            dropIndicator.beforeEntryId === entry.id
          }
          showInsertAfter={
            isAppendTarget && lastEntryId === entry.id
          }
          onUpdate={onUpdate}
          onDelete={onDelete}
          onDragStart={onDragStartEntry}
          onDragEnd={onDragEndEntry}
          onDragOverRow={onDragOverRow}
          onDragLeaveRow={onDragLeaveRow}
          onDropOnRow={onDropOnRow}
        />
      ))
    );

  if (hideHeader) {
    if (section.entries.length === 0) return null;
    return <>{groupItems}</>;
  }

  const trailing = (
    <span className="cashflow-planner__group-trailing">
      <span
        className={[
          "cashflow-planner__group-net",
          included ? null : "cashflow-planner__group-net--excluded",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {formatMoney(section.netCents)}
      </span>
      {onToggleIncluded ? (
        <button
          type="button"
          className={[
            "cashflow-planner__group-visibility",
            included ? null : "cashflow-planner__group-visibility--excluded",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-pressed={included}
          aria-label={
            included
              ? `Exclude ${section.label} from totals`
              : `Include ${section.label} in totals`
          }
          title={included ? "Exclude from totals" : "Include in totals"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleIncluded();
          }}
        >
          {included ? <PlannerEyeIncludedIcon /> : <PlannerEyeExcludedIcon />}
        </button>
      ) : null}
    </span>
  );

  if (isEditing && !isUngrouped) {
    return (
      <li
        className={[
          "project-type-subgroup",
          included ? null : "cashflow-planner__group--excluded",
          isAppendTarget ? "cashflow-planner__group--drop-target" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        data-type-group={section.label}
        onDragOver={(event) => onDragOverAppend(section.key, event)}
        onDragLeave={onDragLeaveRow}
        onDrop={(event) => onDropOnAppend(section.key, event)}
      >
        <div
          className={[
            "project-type-subgroup__header-row",
            isAppendTarget
              ? "project-type-subgroup__header-row--drop-append"
              : null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div
            className="project-type-subgroup__header"
            data-title-selectable="true"
          >
            <input
              ref={renameInputRef}
              className="cashflow-planner__input cashflow-planner__group-rename"
              aria-label="Group name"
              value={editingLabel}
              disabled={pending}
              onChange={(event) => setEditingLabel(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  setEditingLabel(section.label);
                  setIsEditing(false);
                }
              }}
            />
            <span className="project-type-subgroup__rule" aria-hidden="true" />
          </div>
          <div className="project-type-subgroup__trailing">{trailing}</div>
        </div>
        <ul className="project-type-subgroup__items">{groupItems}</ul>
      </li>
    );
  }

  return (
    <ProjectTypeGroupSection
      title={section.label}
      collapsed={false}
      onToggle={() => {}}
      showCollapseToggle={false}
      onTitleClick={
        isUngrouped || pending
          ? undefined
          : () => {
              setEditingLabel(section.label);
              setIsEditing(true);
            }
      }
      trailing={trailing}
      onDelete={
        !isUngrouped && section.entries.length === 0 && !pending
          ? () => onRemoveEmptyGroup(section.key)
          : undefined
      }
      deleteActionLabel="group"
      dragInsertBeforeKey={
        isAppendTarget ? `cashflow-group:${section.key}` : null
      }
      onDragInsertBeforeKey={(orderKey) => {
        onIndicateAppend(orderKey ? section.key : null);
      }}
      onListDragEnd={onDragEndEntry}
      listDrag={{
        appendOrderKey: `cashflow-group:${section.key}`,
        isActive: (dataTransfer) =>
          dataTransfer.types.includes(DRAG_MIME) ||
          dataTransfer.types.includes("text/plain"),
        onDrop: (dataTransfer) => {
          const entryId =
            dataTransfer.getData(DRAG_MIME) ||
            dataTransfer.getData("text/plain");
          if (!entryId) return;
          onPlaceEntry(entryId, section.key, null);
        },
      }}
    >
      {groupItems}
    </ProjectTypeGroupSection>
  );
}


export function CashflowPlannerScratchpad({
  entries,
  loading = false,
  pending = false,
  error = null,
  onCreate,
  onUpdate,
  onReorder,
  onDelete,
}: CashflowPlannerScratchpadProps) {
  const [extraGroups, setExtraGroups] = useState<string[]>([]);
  const [draggingEntryId, setDraggingEntryId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{
    groupKey: string;
    beforeEntryId: string | null;
  } | null>(null);
  const [excludedGroupKeys, setExcludedGroupKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [optimisticEntries, setOptimisticEntries] = useState<
    CashflowPlannerEntry[] | null
  >(null);

  const liveEntries = optimisticEntries ?? entries;

  useEffect(() => {
    setOptimisticEntries(null);
  }, [entries]);

  const sections = useMemo(
    () => buildGroupSections(liveEntries, extraGroups),
    [liveEntries, extraGroups],
  );
  const totals = useMemo(() => {
    const includedEntries = liveEntries.filter((entry) => {
      const key = entryGroupKey(entry);
      if (key === UNGROUPED_KEY) return true;
      return !excludedGroupKeys.has(key);
    });
    return computeTotals(includedEntries);
  }, [liveEntries, excludedGroupKeys]);

  useEffect(() => {
    const used = new Set(
      liveEntries
        .map((entry) => entry.groupLabel?.trim())
        .filter((label): label is string => Boolean(label)),
    );
    setExtraGroups((prev) => prev.filter((label) => !used.has(label)));
  }, [liveEntries]);

  useEffect(() => {
    const valid = new Set(sections.map((section) => section.key));
    setExcludedGroupKeys((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const key of prev) {
        if (valid.has(key) && key !== UNGROUPED_KEY) {
          next.add(key);
        } else {
          changed = true;
        }
      }
      return changed || next.size !== prev.size ? next : prev;
    });
  }, [sections]);

  const toggleGroupIncluded = (groupKey: string) => {
    if (groupKey === UNGROUPED_KEY) return;
    setExcludedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const addGroup = () => {
    let index = 1;
    let label = "New group";
    const existing = new Set(sections.map((section) => section.label));
    while (existing.has(label)) {
      index += 1;
      label = `New group ${index}`;
    }
    setExtraGroups((prev) => [...prev, label]);
  };

  const renameGroup = (groupKey: string, nextLabel: string) => {
    const trimmed = nextLabel.trim();
    if (!trimmed || groupKey === UNGROUPED_KEY) return;
    if (trimmed === groupKey) return;

    const taken = sections.some(
      (section) => section.key !== groupKey && section.label === trimmed,
    );
    if (taken) return;

    setExtraGroups((prev) =>
      prev.map((label) => (label === groupKey ? trimmed : label)),
    );
    setExcludedGroupKeys((prev) => {
      if (!prev.has(groupKey)) return prev;
      const next = new Set(prev);
      next.delete(groupKey);
      next.add(trimmed);
      return next;
    });

    const toMove = liveEntries.filter((entry) => entryGroupKey(entry) === groupKey);
    for (const entry of toMove) {
      void onUpdate(entry.id, { groupLabel: trimmed });
    }
  };

  const removeEmptyGroup = (groupKey: string) => {
    if (groupKey === UNGROUPED_KEY) return;
    setExtraGroups((prev) => prev.filter((label) => label !== groupKey));
    setExcludedGroupKeys((prev) => {
      if (!prev.has(groupKey)) return prev;
      const next = new Set(prev);
      next.delete(groupKey);
      return next;
    });
  };

  const placeEntry = (
    entryId: string,
    groupKey: string,
    beforeEntryId: string | null,
  ) => {
    const sourceEntries = liveEntries;
    const entry = sourceEntries.find((row) => row.id === entryId);
    if (!entry) return;
    if (beforeEntryId === entryId) return;

    const prevKey = entryGroupKey(entry);
    const nextLabel = groupKey === UNGROUPED_KEY ? null : groupKey;

    if (prevKey !== UNGROUPED_KEY && prevKey !== groupKey) {
      const remaining = sourceEntries.filter(
        (row) => row.id !== entryId && entryGroupKey(row) === prevKey,
      );
      if (remaining.length === 0) {
        setExtraGroups((prev) =>
          prev.includes(prevKey) ? prev : [...prev, prevKey],
        );
      }
    }

    const siblings = sourceEntries
      .filter((row) => row.id !== entryId && entryGroupKey(row) === groupKey)
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name);
      });
    const orderedIds = siblings.map((row) => row.id);
    const at =
      beforeEntryId == null
        ? orderedIds.length
        : orderedIds.indexOf(beforeEntryId);
    orderedIds.splice(at < 0 ? orderedIds.length : at, 0, entryId);

    const patches: Array<{
      id: string;
      patch: Partial<CashflowPlannerEntryInput>;
    }> = [];
    const now = new Date().toISOString();
    const nextEntries = sourceEntries.map((row) => {
      const index = orderedIds.indexOf(row.id);
      if (index < 0) return row;
      const patch: Partial<CashflowPlannerEntryInput> = {};
      if (row.sortOrder !== index) patch.sortOrder = index;
      if (row.id === entryId) {
        const currentLabel = row.groupLabel?.trim() || null;
        if (currentLabel !== nextLabel) patch.groupLabel = nextLabel;
      }
      if (Object.keys(patch).length === 0) return row;
      patches.push({ id: row.id, patch });
      return {
        ...row,
        ...patch,
        updatedAt: now,
      };
    });

    nextEntries.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });

    if (patches.length === 0) return;
    // Commit list order before the browser ends the drag gesture so the row
    // appears in its new place immediately (not after the API round-trip).
    flushSync(() => {
      setOptimisticEntries(nextEntries);
      setDropIndicator(null);
      setDraggingEntryId(null);
    });
    if (onReorder) {
      void onReorder(patches);
      return;
    }
    void Promise.all(patches.map(({ id, patch }) => onUpdate(id, patch)));
  };

  const handleDelete = async (id: string) => {
    const entry = liveEntries.find((row) => row.id === id);
    const prevKey = entry ? entryGroupKey(entry) : UNGROUPED_KEY;
    if (prevKey !== UNGROUPED_KEY) {
      const remaining = liveEntries.filter(
        (row) => row.id !== id && entryGroupKey(row) === prevKey,
      );
      if (remaining.length === 0) {
        setExtraGroups((prev) =>
          prev.includes(prevKey) ? prev : [...prev, prevKey],
        );
      }
    }
    await onDelete(id);
  };

  const resolveDragEntryId = (event: DragEvent) =>
    event.dataTransfer.getData(DRAG_MIME) ||
    event.dataTransfer.getData("text/plain") ||
    draggingEntryId;

  const onDragStartEntry = (entryId: string, event: DragEvent) => {
    setDraggingEntryId(entryId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(DRAG_MIME, entryId);
    event.dataTransfer.setData("text/plain", entryId);
  };

  const onDragEndEntry = () => {
    setDraggingEntryId(null);
    setDropIndicator(null);
  };

  const onDragOverRow = (
    entryId: string,
    groupKey: string,
    event: DragEvent,
  ) => {
    if (!draggingEntryId || draggingEntryId === entryId) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const section = sections.find((item) => item.key === groupKey);
    const rows = section?.entries ?? [];
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const beforeHalf = event.clientY < rect.top + rect.height / 2;
    if (beforeHalf) {
      setDropIndicator({ groupKey, beforeEntryId: entryId });
      return;
    }
    const index = rows.findIndex((row) => row.id === entryId);
    const next = index >= 0 ? rows[index + 1] : null;
    setDropIndicator({
      groupKey,
      beforeEntryId:
        next && next.id !== draggingEntryId ? next.id : null,
    });
  };

  const onDragLeaveRow = () => {
    // Keep indicator until a new target is hit or drag ends.
  };

  const onDropOnRow = (
    entryId: string,
    groupKey: string,
    event: DragEvent,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const indicator = dropIndicator;
    const draggedId = resolveDragEntryId(event);
    if (!draggedId) {
      setDropIndicator(null);
      setDraggingEntryId(null);
      return;
    }
    const beforeEntryId =
      indicator?.groupKey === groupKey
        ? indicator.beforeEntryId
        : entryId;
    placeEntry(draggedId, groupKey, beforeEntryId);
  };

  const onDragOverAppend = (groupKey: string, event: DragEvent) => {
    if (!draggingEntryId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropIndicator({ groupKey, beforeEntryId: null });
  };

  const onIndicateAppend = (groupKey: string | null) => {
    if (!groupKey || !draggingEntryId) {
      setDropIndicator(null);
      return;
    }
    setDropIndicator({ groupKey, beforeEntryId: null });
  };

  const onDropOnAppend = (groupKey: string, event: DragEvent) => {
    event.preventDefault();
    const draggedId = resolveDragEntryId(event);
    if (!draggedId) {
      setDropIndicator(null);
      setDraggingEntryId(null);
      return;
    }
    placeEntry(draggedId, groupKey, null);
  };

  return (
    <section className="cashflow-planner" aria-label="Planning scratchpad">
      <header className="cashflow-planner__header">
        <div className="cashflow-planner__title-block">
          <h2 className="cashflow-planner__title">Planner</h2>
        </div>
        <div className="cashflow-planner__actions">
          <button
            type="button"
            className="cashflow-planner__add cashflow-planner__add--group"
            disabled={pending}
            onClick={addGroup}
          >
            + Group
          </button>
        </div>
      </header>

      {error ? (
        <p className="cashflow-planner__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="cashflow-planner__body">
        {loading && entries.length === 0 && extraGroups.length === 0 ? (
          <p className="cashflow-planner__empty">Loading…</p>
        ) : (
          <>
            <ul
              className="cashflow-planner__groups overview-grouped-list"
              role="list"
            >
              {sections.map((section) => (
                <PlannerGroup
                  key={section.key || "ungrouped"}
                  section={section}
                  pending={pending}
                  draggingEntryId={draggingEntryId}
                  dropIndicator={dropIndicator}
                  hideHeader={section.key === UNGROUPED_KEY}
                  included={!excludedGroupKeys.has(section.key)}
                  onToggleIncluded={
                    section.key === UNGROUPED_KEY
                      ? undefined
                      : () => toggleGroupIncluded(section.key)
                  }
                  onDragOverRow={onDragOverRow}
                  onDragLeaveRow={onDragLeaveRow}
                  onDropOnRow={onDropOnRow}
                  onDragOverAppend={onDragOverAppend}
                  onDropOnAppend={onDropOnAppend}
                  onIndicateAppend={onIndicateAppend}
                  onPlaceEntry={(entryId, groupKey, beforeEntryId) => {
                    setDropIndicator(null);
                    setDraggingEntryId(null);
                    void placeEntry(entryId, groupKey, beforeEntryId);
                  }}
                  onRenameGroup={renameGroup}
                  onRemoveEmptyGroup={removeEmptyGroup}
                  onUpdate={onUpdate}
                  onDelete={handleDelete}
                  onDragStartEntry={onDragStartEntry}
                  onDragEndEntry={onDragEndEntry}
                />
              ))}
            </ul>
            <PlannerComposerRow pending={pending} onCreate={onCreate} />
          </>
        )}
      </div>

      <div className="cashflow-planner__totals" aria-live="polite">
        <div className="cashflow-planner__total">
          <span className="cashflow-planner__total-label">Expenses</span>
          <span className="cashflow-planner__total-value cashflow-planner__total-value--expense">
            {formatMoney(totals.expenseCents)}
          </span>
        </div>
        <div className="cashflow-planner__total">
          <span className="cashflow-planner__total-label">Income</span>
          <span className="cashflow-planner__total-value cashflow-planner__total-value--income">
            {formatMoney(totals.incomeCents)}
          </span>
        </div>
        <div className="cashflow-planner__total">
          <span className="cashflow-planner__total-label">Net</span>
          <span
            className={[
              "cashflow-planner__total-value",
              totals.netCents < 0
                ? "cashflow-planner__total-value--expense"
                : "cashflow-planner__total-value--income",
            ].join(" ")}
          >
            {formatMoney(totals.netCents)}
          </span>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";

import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../keyboard-nav-item.js";
import {
  formatLetterDisplayId,
  groupLettersByStatus,
  type LetterListItem,
} from "../letters.js";
import { flattenGroupedListItemIds } from "../list-keyboard-nav-index.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../list-keyboard-nav-zone.js";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../task-status.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "./list-keyboard-navigation-provider.js";
import { SearchableDropdown } from "./searchable-dropdown.js";
import { StatusGroupSection } from "./status-group-section.js";
import { TaskDueDateDropdown } from "./task-due-date-dropdown.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type ScopedLettersListViewProps = {
  letters: LetterListItem[];
  onSelectLetter?: (letter: LetterListItem) => void;
  onStatusChange?: (letterId: string, status: TaskStatus) => void;
  onDueDateChange?: (letterId: string, dueDate: Date | null) => void;
  onCompose?: (status: TaskStatus) => void;
  /** When false, hide per-group + compose (project side panel). Default true. */
  allowCompose?: boolean;
  selectedLetterId?: string | null;
};

function stopFieldEvent(event: SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Organization / scoped letters list — 1:1 with Next.js `ScopedLettersList`:
 * all status groups (incl. empty), status icon dropdown, L-id, title, due, +.
 */
export function ScopedLettersListView({
  letters,
  onSelectLetter,
  onStatusChange,
  onDueDateChange,
  onCompose,
  allowCompose = true,
  selectedLetterId = null,
}: ScopedLettersListViewProps) {
  const [localLetters, setLocalLetters] = useState(letters);
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(() => new Set());
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  useEffect(() => {
    setLocalLetters(letters);
  }, [letters]);

  const groups = useMemo(
    () => groupLettersByStatus(localLetters, { includeEmpty: true }),
    [localLetters],
  );

  const itemIds = useMemo(
    () =>
      flattenGroupedListItemIds(
        groups.map((group) => ({ key: group.status, items: group.letters })),
        collapsed,
        (letter) => letter.id,
      ),
    [collapsed, groups],
  );

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedLetterId,
    onNavigate: (letterId) => {
      const letter = localLetters.find((entry) => entry.id === letterId);
      if (letter) onSelectLetter?.(letter);
    },
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: itemIds.length > 0,
  });

  const statusOptions = useMemo(
    () =>
      TASK_STATUS_ORDER.map((value) => ({
        value,
        label: getTaskStatusLabel(value),
        searchTerms: value.replaceAll("_", " "),
        icon: <TaskStatusIcon status={value} size={18} />,
      })),
    [],
  );

  function expandGroup(status: TaskStatus) {
    setCollapsed((current) => {
      if (!current.has(status)) return current;
      const next = new Set(current);
      next.delete(status);
      return next;
    });
  }

  function toggleGroup(status: TaskStatus) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function handleStatusChange(letterId: string, status: TaskStatus) {
    setLocalLetters((current) =>
      current.map((letter) =>
        letter.id === letterId ? { ...letter, status } : letter,
      ),
    );
    expandGroup(status);
    onStatusChange?.(letterId, status);
  }

  function handleDueDateChange(letterId: string, dueDate: Date | null) {
    setLocalLetters((current) =>
      current.map((letter) =>
        letter.id === letterId
          ? { ...letter, dueDate: dueDate ? dueDate.getTime() : null }
          : letter,
      ),
    );
    onDueDateChange?.(letterId, dueDate);
  }

  return (
    <div className="scoped-letters-list" aria-label="Letters">
      <ul
        className="scoped-letters-list__groups"
        role="list"
        ref={listRef}
        {...listContainerProps}
      >
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.status);
          return (
            <StatusGroupSection
              key={group.status}
              groupKey={group.status}
              title={group.label}
              collapsed={isCollapsed}
              icon={
                <TaskStatusIcon
                  status={group.status}
                  size={14}
                  title={group.label}
                />
              }
              onToggle={() => toggleGroup(group.status)}
              onAdd={
                allowCompose && onCompose
                  ? () => {
                      expandGroup(group.status);
                      onCompose(group.status);
                    }
                  : undefined
              }
              addActionLabel="letter"
            >
              {group.letters.map((letter) => {
                const status = migrateLegacyTaskStatus(letter.status);
                const due =
                  letter.dueDate == null
                    ? null
                    : letter.dueDate instanceof Date
                      ? letter.dueDate
                      : new Date(letter.dueDate);
                const displayId = formatLetterDisplayId(letter.number);

                return (
                  <li
                    key={letter.id}
                    className="scoped-letter-row-item"
                    {...keyboardNavItemProps(letter.id)}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      className={`scoped-letter-row ${keyboardNavListItemClass(highlightedId === letter.id)}`}
                      onClick={() => onSelectLetter?.(letter)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectLetter?.(letter);
                        }
                      }}
                    >
                      <span
                        className="scoped-letter-row__status"
                        onMouseDown={stopFieldEvent}
                        onClick={stopFieldEvent}
                      >
                        <SearchableDropdown
                          value={status}
                          options={statusOptions}
                          onChange={(next) =>
                            handleStatusChange(letter.id, next)
                          }
                          searchPlaceholder="Change status…"
                          searchShortcutLabel="S"
                          ariaLabel={`Change status: ${getTaskStatusLabel(status)}`}
                          taskPropertyDropdownId="status"
                          className="task-overview-row__dropdown"
                          panelAlign="start"
                          panelWidth={280}
                          renderTrigger={({
                            open,
                            disabled,
                            triggerId,
                            onToggle,
                          }) => (
                            <button
                              type="button"
                              id={triggerId}
                              className="task-overview-row__icon-trigger"
                              title={getTaskStatusLabel(status)}
                              tabIndex={-1}
                              disabled={disabled}
                              aria-haspopup="listbox"
                              aria-expanded={open}
                              aria-label={`Change status: ${getTaskStatusLabel(status)}`}
                              onMouseDown={stopFieldEvent}
                              onClick={(event) => {
                                stopFieldEvent(event);
                                onToggle();
                              }}
                            >
                              <TaskStatusIcon status={status} size={14} />
                            </button>
                          )}
                        />
                      </span>
                      <span className="scoped-letter-row__id">{displayId}</span>
                      <span className="scoped-letter-row__title">
                        {letter.title}
                      </span>
                      <span
                        className="scoped-letter-row__due"
                        onMouseDown={stopFieldEvent}
                        onClick={stopFieldEvent}
                      >
                        <TaskDueDateDropdown
                          dueDate={due}
                          status={status}
                          variant="list"
                          onDueDateChange={(next) =>
                            handleDueDateChange(letter.id, next)
                          }
                        />
                      </span>
                    </div>
                  </li>
                );
              })}
            </StatusGroupSection>
          );
        })}
      </ul>
    </div>
  );
}

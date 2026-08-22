"use client";

import type { Habit } from "@backsteros/contracts";
import {
  useMemo,
  useState,
  type ComponentType,
  type FormEvent,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import {
  getHabitTrackerHref,
  getSelectedHabitIdFromPathname,
  HABIT_TRACKER_ALL_ID,
} from "../../journal/journal-nav.js";
import { fireHabitCompleteConfetti } from "../../habits/habit-complete-confetti.js";
import { keyboardNavItemProps } from "../../list-nav/keyboard-nav-item.js";
import { sidePanelItemClass } from "../../content/side-panel-styles.js";
import { ContentSidePanelHeader } from "../content/content-side-panel-header.js";
import { ContentSidePanelList } from "../content/content-side-panel-list.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import { EntityIconPicker } from "../entity/entity-icon-picker.js";
import { PolishedCheckbox } from "../shared/polished-checkbox.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import { ProjectTypeGroupSection } from "../projects/project-type-group-section.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";

export type HabitSidePanelLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  children: ReactNode;
  onClick?: () => void;
}>;

export type HabitListItem = Habit & {
  checked: boolean;
  todayTaskId: string | null;
};

export type HabitSidePanelViewProps = {
  pathname: string;
  items: HabitListItem[];
  Link: HabitSidePanelLinkComponent;
  onToggleToday?: (habit: HabitListItem, checked: boolean) => void;
  onCreateHabit?: (input: { title: string; icon: string | null }) => Promise<void> | void;
  createDisabled?: boolean;
  createError?: string | null;
  highlightedId?: string | null;
  listRef?: Ref<HTMLElement>;
  listContainerProps?: HTMLAttributes<HTMLElement>;
  /** When true, the Completed group is collapsed. */
  completedCollapsed?: boolean;
  onToggleCompletedGroup?: () => void;
  /** When true, the Inactive for today group is collapsed. */
  inactiveCollapsed?: boolean;
  onToggleInactiveGroup?: () => void;
};

export function HabitSidePanelView({
  pathname,
  items,
  Link,
  onToggleToday,
  onCreateHabit,
  createDisabled = false,
  createError = null,
  highlightedId = null,
  listRef,
  listContainerProps,
  completedCollapsed = false,
  onToggleCompletedGroup,
  inactiveCollapsed = false,
  onToggleInactiveGroup,
}: HabitSidePanelViewProps) {
  const selectedId =
    getSelectedHabitIdFromPathname(pathname) ?? HABIT_TRACKER_ALL_ID;
  const allActive = selectedId === HABIT_TRACKER_ALL_ID;
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localCompletedCollapsed, setLocalCompletedCollapsed] = useState(false);
  const [localInactiveCollapsed, setLocalInactiveCollapsed] = useState(false);

  const collapsed =
    onToggleCompletedGroup != null
      ? completedCollapsed
      : localCompletedCollapsed;
  const toggleCompleted = () => {
    if (onToggleCompletedGroup) onToggleCompletedGroup();
    else setLocalCompletedCollapsed((current) => !current);
  };

  const inactiveGroupCollapsed =
    onToggleInactiveGroup != null
      ? inactiveCollapsed
      : localInactiveCollapsed;
  const toggleInactive = () => {
    if (onToggleInactiveGroup) onToggleInactiveGroup();
    else setLocalInactiveCollapsed((current) => !current);
  };

  const { openHabits, completedHabits, inactiveHabits } = useMemo(() => {
    const open: HabitListItem[] = [];
    const completed: HabitListItem[] = [];
    const inactive: HabitListItem[] = [];
    for (const habit of items) {
      if (!habit.todayTaskId) {
        inactive.push(habit);
        continue;
      }
      if (habit.checked) completed.push(habit);
      else open.push(habit);
    }
    return {
      openHabits: open,
      completedHabits: completed,
      inactiveHabits: inactive,
    };
  }, [items]);

  async function submitNewHabit(event?: FormEvent) {
    event?.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || !onCreateHabit || submitting || createDisabled) return;
    setSubmitting(true);
    try {
      await onCreateHabit({ title: nextTitle, icon });
      setTitle("");
      setIcon(null);
      setAdding(false);
    } finally {
      setSubmitting(false);
    }
  }

  function renderHabitRow(habit: HabitListItem, options?: { inactive?: boolean }) {
    const isActive = selectedId === habit.id;
    const inactive = Boolean(options?.inactive);
    const canToggle = Boolean(!inactive && habit.todayTaskId && onToggleToday);
    return (
      <li
        key={habit.id}
        className={[
          "inbox-list-item",
          "habit-side-panel-item",
          habit.checked ? "is-checked" : null,
          inactive ? "is-inactive-today" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Link
          to={getHabitTrackerHref(habit.id)}
          className={sidePanelItemClass({
            active: isActive,
            keyboardHighlighted: highlightedId === habit.id,
          })}
          aria-current={isActive ? "page" : undefined}
          {...keyboardNavItemProps(habit.id)}
        >
          <span className="habit-side-panel-item__leading">
            <span className="habit-side-panel-item__icon" aria-hidden="true">
              {habit.icon ? (
                <ProjectOcticon icon={habit.icon} size={16} />
              ) : (
                <DefaultProjectIcon size={16} />
              )}
            </span>
            {!inactive ? (
              <span
                className="habit-side-panel-item__check"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
              >
                <PolishedCheckbox
                  checked={habit.checked}
                  disabled={!canToggle}
                  ariaLabel={`Mark ${habit.title} complete`}
                  onCheckedChange={(checked, event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (checked) {
                      fireHabitCompleteConfetti(event.currentTarget);
                    }
                    onToggleToday?.(habit, checked);
                  }}
                />
              </span>
            ) : null}
          </span>
          <span className="app-side-panel-item-label">{habit.title}</span>
        </Link>
      </li>
    );
  }

  return (
    <div className="app-content-side-panel app-content-side-panel--journal">
      <ContentSidePanelHeader
        title="Habit Tracker"
        actions={
          onCreateHabit ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              disabled={createDisabled || submitting}
              className="app-side-panel-section-action"
              aria-label="Add habit"
            >
              <SidePanelPlusIcon />
            </button>
          ) : undefined
        }
      />
      {createError ? (
        <p className="app-content-side-panel-empty" role="alert">
          {createError}
        </p>
      ) : null}
      <div className="app-content-side-panel-main">
        {adding ? (
          <form className="habit-side-panel-compose" onSubmit={submitNewHabit}>
            <button
              type="button"
              className="habit-side-panel-compose__icon"
              aria-label="Choose habit icon"
              onClick={() => setIconPickerOpen(true)}
            >
              {icon ? (
                <ProjectOcticon icon={icon} size={16} />
              ) : (
                <DefaultProjectIcon size={16} />
              )}
            </button>
            <input
              autoFocus
              className="habit-side-panel-compose__title"
              value={title}
              placeholder="Habit title"
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setAdding(false);
                  setTitle("");
                  setIcon(null);
                }
              }}
            />
            <button
              type="submit"
              className="habit-side-panel-compose__submit"
              disabled={!title.trim() || submitting || createDisabled}
            >
              Add
            </button>
          </form>
        ) : null}
        <ContentSidePanelList
          aria-label="Habits"
          ref={listRef}
          {...listContainerProps}
        >
          <li className="inbox-list-item habit-side-panel-item">
            <Link
              to={getHabitTrackerHref()}
              className={sidePanelItemClass({
                active: allActive,
                keyboardHighlighted: highlightedId === HABIT_TRACKER_ALL_ID,
              })}
              aria-current={allActive ? "page" : undefined}
              {...keyboardNavItemProps(HABIT_TRACKER_ALL_ID)}
            >
              <span className="app-side-panel-item-label">All</span>
            </Link>
          </li>
          {openHabits.map((habit) => renderHabitRow(habit))}
          {completedHabits.length > 0 ? (
            <ProjectTypeGroupSection
              title="Completed"
              collapsed={collapsed}
              onToggle={toggleCompleted}
            >
              {completedHabits.map((habit) => renderHabitRow(habit))}
            </ProjectTypeGroupSection>
          ) : null}
          {inactiveHabits.length > 0 ? (
            <ProjectTypeGroupSection
              title="Inactive for today"
              collapsed={inactiveGroupCollapsed}
              onToggle={toggleInactive}
            >
              {inactiveHabits.map((habit) =>
                renderHabitRow(habit, { inactive: true }),
              )}
            </ProjectTypeGroupSection>
          ) : null}
        </ContentSidePanelList>
      </div>
      {iconPickerOpen ? (
        <EntityIconPicker
          open
          value={icon}
          dialogTitle="Choose habit icon"
          onClose={() => setIconPickerOpen(false)}
          onSelect={(next) => {
            setIcon(next);
            setIconPickerOpen(false);
          }}
          defaultOption={{
            label: "Default habit icon",
            preview: <DefaultProjectIcon size={16} />,
          }}
        />
      ) : null}
    </div>
  );
}

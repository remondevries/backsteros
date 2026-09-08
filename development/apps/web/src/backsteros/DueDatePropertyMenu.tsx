import { useEffect, useMemo, useState } from "react";

import { BacksterosTaskDueDateIcon } from "./TaskDueDateIcon";
import {
  BACKSTEROS_NO_DUE_DATE_VALUE,
  BACKSTEROS_PICK_DUE_DATE_VALUE,
  buildTaskDueDateDropdownOptions,
  formatDueDateInputValue,
  formatLocalYmd,
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
  toApiDueDateIso,
} from "./taskDueDate";
import {
  useFocusPropertyMenuSearch,
  usePropertyMenuSearchTyping,
} from "./useFocusPropertyMenuSearch";
import { stopPropertyMenuSearchKeyPropagation } from "./stopPropertyMenuSearchKeyPropagation";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";

function parseQuickDueQuery(query: string): string | null | "clear" | "pick" {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;
  if (
    normalized === "none" ||
    normalized === "clear" ||
    normalized === "no due date" ||
    normalized === "no date"
  ) {
    return "clear";
  }
  if (normalized === "today") return formatLocalYmd(new Date());
  if (normalized === "tomorrow") {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatLocalYmd(tomorrow);
  }
  if (normalized.includes("week") || normalized === "in one week" || normalized === "next week") {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return formatLocalYmd(nextWeek);
  }
  if (normalized.includes("pick") || normalized.includes("calendar")) {
    return "pick";
  }
  return null;
}

export function BacksterosDueDatePropertyMenu(props: {
  readonly dueDate: string | null;
  readonly status?: string | null;
  readonly disabled?: boolean;
  /** Desktop `data-task-property-dropdown` — Shift+D opens due date. */
  readonly taskPropertyDropdownId?: string;
  readonly onChange: (dueDateIso: string | null) => void;
  /** Tab from the open search field (e.g. next compose property). */
  readonly onTabFromSearch?: () => void;
  /** Shift+Tab from the open search field. */
  readonly onShiftTabFromSearch?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useFocusPropertyMenuSearch(open && !pickingDate);
  usePropertyMenuSearchTyping(open && !pickingDate, searchRef, setQuery);
  const dateInputRef = useFocusPropertyMenuSearch(open && pickingDate);
  const ymdValue = formatDueDateInputValue(props.dueDate);
  const hasDueDate = Boolean(ymdValue);
  const urgency = useMemo(
    () => getTaskDueDateUrgency(ymdValue || null, new Date(), { status: props.status }),
    [props.status, ymdValue],
  );
  const displayLabel = ymdValue ? (formatTaskDueMetaLabel(ymdValue) ?? ymdValue) : "No due date";
  const options = useMemo(() => buildTaskDueDateDropdownOptions(ymdValue || null), [ymdValue]);
  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalized));
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      setPickingDate(false);
      setQuery("");
    }
  }, [open]);

  const applyOption = (value: string) => {
    if (value === BACKSTEROS_PICK_DUE_DATE_VALUE) {
      setPickingDate(true);
      return;
    }
    if (value === BACKSTEROS_NO_DUE_DATE_VALUE) {
      props.onChange(null);
      setOpen(false);
      return;
    }
    props.onChange(toApiDueDateIso(value));
    setOpen(false);
  };

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen || pickingDate) return;
        searchRef.current?.focus({ preventScroll: true });
      }}
    >
      <MenuTrigger
        disabled={props.disabled}
        className="bos-task-property-chip"
        aria-label="Change due date"
        data-task-property-dropdown={props.taskPropertyDropdownId ?? "dueDate"}
        style={
          urgency === "overdue"
            ? { color: "#ef4444" }
            : urgency === "due_soon"
              ? { color: "#f59e0b" }
              : undefined
        }
      >
        <span className="bos-task-property-chip__icon">
          <BacksterosTaskDueDateIcon active={hasDueDate} urgency={urgency} size={12} />
        </span>
        <span className="bos-task-property-chip__label">{displayLabel}</span>
      </MenuTrigger>
      <MenuPopup align="start" className="bos-task-property-menu bos-task-property-menu--due">
        {pickingDate ? (
          <div className="bos-task-property-menu__due">
            <div className="bos-task-property-menu__due-label">Pick a date</div>
            <input
              ref={dateInputRef}
              type="date"
              value={ymdValue}
              onChange={(event) => {
                const next = event.target.value.trim();
                props.onChange(next ? toApiDueDateIso(next) : null);
                setOpen(false);
                setPickingDate(false);
              }}
              className="bos-task-property-menu__due-input"
            />
            <MenuItem
              closeOnClick
              className="bos-task-property-menu__option"
              onClick={() => setPickingDate(false)}
            >
              <span className="bos-task-property-menu__option-main">
                <span className="bos-task-property-menu__option-label">Back</span>
              </span>
            </MenuItem>
          </div>
        ) : (
          <>
            <div className="bos-task-property-menu__search">
              <input
                ref={searchRef}
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  stopPropertyMenuSearchKeyPropagation(event);
                  if (event.key === "Tab") {
                    event.preventDefault();
                    setOpen(false);
                    if (event.shiftKey) {
                      props.onShiftTabFromSearch?.();
                    } else {
                      props.onTabFromSearch?.();
                    }
                    return;
                  }
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  const parsed = parseQuickDueQuery(query);
                  if (parsed === "clear") {
                    props.onChange(null);
                    setOpen(false);
                    return;
                  }
                  if (parsed === "pick") {
                    setPickingDate(true);
                    return;
                  }
                  if (typeof parsed === "string") {
                    props.onChange(toApiDueDateIso(parsed));
                    setOpen(false);
                    return;
                  }
                  const first = filteredOptions[0];
                  if (first) applyOption(first.value);
                }}
                onKeyUp={stopPropertyMenuSearchKeyPropagation}
                placeholder="tomorrow, next week, pick a date…"
                className="bos-task-property-menu__search-input"
                aria-label="Search due dates"
              />
            </div>
            <div className="bos-task-property-menu__list">
              {filteredOptions.map((option) => (
                <MenuItem
                  key={option.value}
                  closeOnClick={option.value !== BACKSTEROS_PICK_DUE_DATE_VALUE}
                  className="bos-task-property-menu__option"
                  onClick={() => applyOption(option.value)}
                >
                  <span className="bos-task-property-menu__option-main">
                    <span className="bos-task-property-menu__option-label">{option.label}</span>
                  </span>
                </MenuItem>
              ))}
            </div>
          </>
        )}
      </MenuPopup>
    </Menu>
  );
}

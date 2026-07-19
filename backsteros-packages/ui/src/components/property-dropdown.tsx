"use client";

import type { ReactNode } from "react";

import type { SearchableDropdownMenuApi } from "../searchable-dropdown-menu-api.js";
import type { TaskPropertyDropdownId } from "../task-property-dropdown-keys.js";
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from "./searchable-dropdown.js";

export type PropertyDropdownTriggerVariant = "default" | "composePill";

export type PropertyDropdownProps<T extends string> = {
  value: T | null;
  options: SearchableDropdownOption<T>[];
  onChange?: (value: T) => void;
  searchPlaceholder: string;
  searchShortcutLabel?: string;
  ariaLabel: string;
  fallbackIcon: ReactNode;
  fallbackLabel: string;
  registerOpenMenu?: (api: SearchableDropdownMenuApi | null) => void;
  taskPropertyDropdownId?: TaskPropertyDropdownId;
  disabled?: boolean;
  onQuerySubmit?: (query: string) => boolean;
  queryPreviewLabel?: (query: string) => string | null;
  createFromQueryLabel?: (query: string) => string | null;
  onCreateFromQuery?: (query: string) => void;
  panelWidth?: number;
  panelAlign?: "start" | "end";
  mutedFallback?: boolean;
  /** Fade the trigger when a value is selected (e.g. default / placeholder selection). */
  mutedSelected?: boolean;
  shortcutAnchor?: boolean;
  onTabFromSearch?: () => void;
  onShiftTabFromSearch?: () => void;
  triggerVariant?: PropertyDropdownTriggerVariant;
};

export function PropertyDropdown<T extends string>({
  value,
  options,
  onChange,
  searchPlaceholder,
  searchShortcutLabel,
  ariaLabel,
  fallbackIcon,
  fallbackLabel,
  registerOpenMenu,
  taskPropertyDropdownId,
  disabled = false,
  onQuerySubmit,
  queryPreviewLabel,
  createFromQueryLabel,
  onCreateFromQuery,
  panelWidth = 280,
  panelAlign = "end",
  mutedFallback = false,
  mutedSelected = false,
  shortcutAnchor = false,
  onTabFromSearch,
  onShiftTabFromSearch,
  triggerVariant = "default",
}: PropertyDropdownProps<T>) {
  if (options.length === 0) {
    return (
      <div
        className={[
          "property-dropdown-fallback",
          mutedFallback ? "is-muted" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        data-task-property-dropdown={taskPropertyDropdownId}
      >
        <span className="property-dropdown-trigger__icon" aria-hidden="true">
          {fallbackIcon}
        </span>
        <span className="property-dropdown-trigger__label">{fallbackLabel}</span>
      </div>
    );
  }

  return (
    <SearchableDropdown
      value={value}
      options={options}
      onChange={onChange}
      disabled={disabled}
      searchPlaceholder={searchPlaceholder}
      searchShortcutLabel={searchShortcutLabel}
      ariaLabel={ariaLabel}
      registerOpenMenu={registerOpenMenu}
      taskPropertyDropdownId={taskPropertyDropdownId}
      onQuerySubmit={onQuerySubmit}
      queryPreviewLabel={queryPreviewLabel}
      createFromQueryLabel={createFromQueryLabel}
      onCreateFromQuery={onCreateFromQuery}
      onTabFromSearch={onTabFromSearch}
      onShiftTabFromSearch={onShiftTabFromSearch}
      className={
        shortcutAnchor
          ? "property-dropdown property-dropdown--shortcut-anchor"
          : triggerVariant === "composePill"
            ? "property-dropdown property-dropdown--compose"
            : "property-dropdown"
      }
      panelWidth={panelWidth}
      panelAlign={panelAlign}
      renderTrigger={({ selected, open, disabled: isDisabled, triggerId, onToggle }) => {
        const mutedTrigger =
          (!selected && mutedFallback) || (Boolean(selected) && mutedSelected);
        const label = selected?.label ?? fallbackLabel;
        return (
          <button
            type="button"
            id={triggerId}
            className={[
              "property-dropdown-trigger",
              triggerVariant === "composePill"
                ? "property-dropdown-trigger--compose"
                : null,
              open ? "is-open" : null,
              mutedTrigger ? "is-muted" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            title={label}
            disabled={isDisabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={ariaLabel}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            <span className="property-dropdown-trigger__icon" aria-hidden="true">
              {selected?.icon ?? fallbackIcon}
            </span>
            <span className="property-dropdown-trigger__label">{label}</span>
          </button>
        );
      }}
    />
  );
}

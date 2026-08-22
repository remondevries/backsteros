"use client";

import type { ReactNode } from "react";

import type { SearchableDropdownMenuApi } from "../../dropdowns/searchable-dropdown-menu-api.js";
import type { TaskPropertyDropdownId } from "../../tasks/task-property-dropdown-keys.js";
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from "./searchable-dropdown.js";

export type PropertyDropdownTriggerVariant =
  | "default"
  | "composePill"
  | "inlineChip";

/** Same chrome as the inline-chip dropdown trigger, but not interactive. */
export type PropertyInlineChipProps = {
  icon?: ReactNode;
  label: string;
  ariaLabel?: string;
};

export function PropertyInlineChip({
  icon = null,
  label,
  ariaLabel,
}: PropertyInlineChipProps) {
  return (
    <span
      className="property-dropdown-trigger property-dropdown-trigger--inline-chip property-dropdown-trigger--static"
      title={label}
      aria-label={ariaLabel ?? label}
    >
      {icon != null ? (
        <span className="property-dropdown-trigger__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="property-dropdown-trigger__label">{label}</span>
    </span>
  );
}

export type PropertyDropdownProps<T extends string> = {
  value: T | null;
  options: SearchableDropdownOption<T>[];
  onChange?: (value: T) => void;
  searchPlaceholder: string;
  searchShortcutLabel?: string;
  ariaLabel: string;
  fallbackIcon?: ReactNode;
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
  /**
   * Override label shown on the closed trigger when a value is selected.
   * Menu option labels are unchanged (e.g. contact name in the list, Name (email) on the chip).
   */
  selectedDisplayLabel?: string | null;
  shortcutAnchor?: boolean;
  onTabFromSearch?: () => void;
  onShiftTabFromSearch?: () => void;
  triggerVariant?: PropertyDropdownTriggerVariant;
  /** When true, the trigger shows only the icon; option labels still appear in the menu. */
  hideTriggerLabel?: boolean;
  /** When true, the trigger omits the leading icon (menu options keep theirs). */
  hideTriggerIcon?: boolean;
  /** Open the panel on mount (used by deferred list-row mounts). */
  defaultOpen?: boolean;
  /** Placement for the initial `defaultOpen` (deferred shortcut opens). */
  defaultOpenPlacement?: "anchored" | "center";
};

export function PropertyDropdown<T extends string>({
  value,
  options,
  onChange,
  searchPlaceholder,
  searchShortcutLabel,
  ariaLabel,
  fallbackIcon = null,
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
  selectedDisplayLabel = null,
  shortcutAnchor = false,
  onTabFromSearch,
  onShiftTabFromSearch,
  triggerVariant = "default",
  hideTriggerLabel = false,
  hideTriggerIcon = false,
  defaultOpen = false,
  defaultOpenPlacement,
}: PropertyDropdownProps<T>) {
  if (options.length === 0) {
    return (
      <div
        className={[
          "property-dropdown-fallback",
          mutedFallback ? "is-muted" : null,
          hideTriggerLabel ? "property-dropdown-fallback--icon-only" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        data-task-property-dropdown={taskPropertyDropdownId}
      >
        {!hideTriggerIcon && fallbackIcon != null ? (
          <span className="property-dropdown-trigger__icon" aria-hidden="true">
            {fallbackIcon}
          </span>
        ) : null}
        {!hideTriggerLabel ? (
          <span className="property-dropdown-trigger__label">{fallbackLabel}</span>
        ) : null}
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
      defaultOpen={defaultOpen}
      defaultOpenPlacement={defaultOpenPlacement}
      className={
        shortcutAnchor
          ? "property-dropdown property-dropdown--shortcut-anchor"
          : triggerVariant === "composePill"
            ? "property-dropdown property-dropdown--compose"
            : triggerVariant === "inlineChip"
              ? "property-dropdown property-dropdown--inline-chip"
              : "property-dropdown"
      }
      panelWidth={panelWidth}
      panelAlign={panelAlign}
      renderTrigger={({ selected, open, disabled: isDisabled, triggerId, onToggle }) => {
        const mutedTrigger =
          (!selected && mutedFallback) || (Boolean(selected) && mutedSelected);
        const displayOverride = selectedDisplayLabel?.trim() || null;
        const label =
          selected && displayOverride
            ? displayOverride
            : (selected?.label ?? fallbackLabel);
        const icon = hideTriggerIcon
          ? null
          : (selected?.icon ?? fallbackIcon);
        return (
          <button
            type="button"
            id={triggerId}
            className={[
              "property-dropdown-trigger",
              triggerVariant === "composePill"
                ? "property-dropdown-trigger--compose"
                : null,
              triggerVariant === "inlineChip"
                ? "property-dropdown-trigger--inline-chip"
                : null,
              hideTriggerLabel ? "property-dropdown-trigger--icon-only" : null,
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
            {icon != null ? (
              <span className="property-dropdown-trigger__icon" aria-hidden="true">
                {icon}
              </span>
            ) : null}
            {!hideTriggerLabel ? (
              <span className="property-dropdown-trigger__label">{label}</span>
            ) : null}
          </button>
        );
      }}
    />
  );
}

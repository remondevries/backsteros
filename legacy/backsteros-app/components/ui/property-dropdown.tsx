"use client";

import type { ReactNode } from "react";

import type { SearchableDropdownMenuApi } from "@/components/ui/searchable-dropdown-menu-api";
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from "@/components/ui/searchable-dropdown";
import type { TaskPropertyDropdownId } from "@/lib/shortcuts/task-property-dropdown-keys";

export type PropertyDropdownTriggerVariant = "default" | "composePill";

const COMPOSE_PILL_TRIGGER_BASE =
  "flex w-fit max-w-full min-h-6 items-center gap-2 rounded-full border-[0.5px] border-white/[0.09] bg-white/[0.04] px-2.5 py-1 pl-2 text-left font-inherit text-foreground cursor-pointer transition-[background,border-color] duration-120 hover:border-white/[0.13] hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/25 focus-visible:border-white/[0.18] focus-visible:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-55";

const DEFAULT_TRIGGER_BASE =
  "flex w-fit max-w-full min-h-6 items-center gap-2 rounded-full border-none bg-transparent pl-1 pr-2 py-1 text-left font-inherit text-foreground cursor-pointer disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-1px] focus-visible:outline-white/20";

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
}: {
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
}) {
  if (options.length === 0) {
    return (
      <div
        className="flex min-h-6 w-fit max-w-full items-center gap-2 rounded-md px-1 py-0.5"
        data-task-property-dropdown={taskPropertyDropdownId}
      >
        <span
          className="inline-flex size-[18px] shrink-0 items-center justify-center text-foreground/55"
          aria-hidden="true"
        >
          {fallbackIcon}
        </span>
        <span
          className={`text-[13px] leading-snug ${
            mutedFallback ? "text-foreground/50" : "text-foreground"
          }`}
        >
          {fallbackLabel}
        </span>
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
          ? "pointer-events-none fixed left-0 top-0 z-0 h-6 w-6 overflow-hidden opacity-0"
          : triggerVariant === "composePill"
            ? "shrink-0"
            : "block w-fit max-w-full"
      }
      panelWidth={panelWidth}
      panelAlign={panelAlign}
      renderTrigger={({ selected, open, disabled: isDisabled, triggerId, onToggle }) => {
        const mutedTrigger =
          (!selected && mutedFallback) || (Boolean(selected) && mutedSelected);

        return (
        <button
          type="button"
          id={triggerId}
          className={[
            triggerVariant === "composePill"
              ? COMPOSE_PILL_TRIGGER_BASE
              : DEFAULT_TRIGGER_BASE,
            triggerVariant === "default"
              ? open
                ? "bg-white/[0.04]"
                : "hover:bg-white/[0.04]"
              : open
                ? "border-white/[0.13] bg-white/[0.07]"
                : null,
          ]
            .filter(Boolean)
            .join(" ")}
          disabled={isDisabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          onClick={onToggle}
        >
          <span
            className={`inline-flex size-[18px] shrink-0 items-center justify-center ${
              mutedTrigger ? "text-foreground/40" : "text-foreground/55"
            }`}
            aria-hidden="true"
          >
            {selected?.icon ?? fallbackIcon}
          </span>
          <span
            className={`min-w-0 truncate text-[13px] leading-snug ${
              mutedTrigger ? "text-foreground/50" : "text-foreground"
            }`}
          >
            {selected?.label ?? fallbackLabel}
          </span>
        </button>
        );
      }}
    />
  );
}

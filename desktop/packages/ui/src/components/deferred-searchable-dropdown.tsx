"use client";

import { useId, useMemo, useRef, useState } from "react";

import {
  consumeSearchableDropdownOpenPlacement,
  type SearchableDropdownOpenPlacement,
} from "../searchable-dropdown-open-placement.js";
import {
  SearchableDropdown,
  type SearchableDropdownOption,
  type SearchableDropdownProps,
} from "./searchable-dropdown.js";

/**
 * List-row friendly wrapper: keeps N closed SearchableDropdown roots off the
 * tree until the first click/focus, then mounts and opens the real control.
 *
 * The unmounted placeholder must stay discoverable by the property hotkeys
 * (S/P/A/…) and the dropdown tab chain, so it renders the same root markers
 * (`data-task-property-dropdown`, `data-searchable-dropdown-root`) as the
 * mounted control.
 */
export function DeferredSearchableDropdown<T extends string>(
  props: SearchableDropdownProps<T>,
) {
  const [mounted, setMounted] = useState(false);
  const [openPlacement, setOpenPlacement] =
    useState<SearchableDropdownOpenPlacement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fallbackId = useId();
  const triggerId = `deferred-searchable-dropdown-${fallbackId.replace(/:/g, "")}`;

  const selectedOptions = useMemo(() => {
    if (props.multiple) {
      const values = props.values ?? [];
      return props.options.filter((option) => values.includes(option.value));
    }
    const value = props.value;
    if (value == null) return [] as SearchableDropdownOption<T>[];
    const match = props.options.find((option) => option.value === value);
    return match ? [match] : [];
  }, [props.multiple, props.options, props.value, props.values]);

  if (mounted) {
    return (
      <SearchableDropdown
        {...props}
        defaultOpen
        defaultOpenPlacement={openPlacement ?? undefined}
      />
    );
  }

  const selected = selectedOptions[0] ?? null;
  const disabled = props.disabled ?? false;

  const mount = () => {
    // Shortcut opens mark the root before clicking the trigger; the marked
    // element is replaced on mount, so carry the placement across in state.
    const placement = rootRef.current
      ? consumeSearchableDropdownOpenPlacement(rootRef.current, "anchored")
      : "anchored";
    if (placement === "center") {
      setOpenPlacement("center");
    }
    setMounted(true);
  };

  return (
    <div
      ref={rootRef}
      data-searchable-dropdown-root=""
      data-task-property-dropdown={props.taskPropertyDropdownId}
      className={["searchable-dropdown-root", props.className]
        .filter(Boolean)
        .join(" ")}
    >
      {props.renderTrigger ? (
        props.renderTrigger({
          selected,
          selectedOptions,
          open: false,
          disabled,
          triggerId,
          onToggle: mount,
          canClear: false,
        })
      ) : (
        <button
          type="button"
          id={triggerId}
          className={props.triggerClassName}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={false}
          aria-label={props.ariaLabel}
          onClick={mount}
        >
          {selected?.label ?? props.emptySelectionLabel ?? "Select…"}
        </button>
      )}
    </div>
  );
}

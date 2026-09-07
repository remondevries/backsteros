import { useEffect, useMemo, useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/menu";
import { useFocusPropertyMenuSearch } from "./useFocusPropertyMenuSearch";
import { stopPropertyMenuSearchKeyPropagation } from "./stopPropertyMenuSearchKeyPropagation";

export type BacksterosSearchablePropertyOption<T extends string = string> = {
  readonly value: T;
  readonly label: string;
  readonly searchText?: string;
  readonly icon?: ReactNode;
  /** Renders a separator before this option when it appears in the filtered list. */
  readonly separatorBefore?: boolean;
};

/**
 * Property chip + searchable menu (desktop PropertyDropdown parity).
 * Real search input filters options; panel width matches desktop (280px).
 */
export function BacksterosSearchablePropertyMenu<T extends string>(props: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly value: T;
  readonly options: readonly BacksterosSearchablePropertyOption<T>[];
  readonly searchPlaceholder: string;
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
  readonly muted?: boolean;
  /** Desktop `data-task-property-dropdown` target for S/P/A/… hotkeys. */
  readonly taskPropertyDropdownId?: string;
  readonly onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useFocusPropertyMenuSearch(open);

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return props.options;
    return props.options.filter((option) => {
      const haystack = [option.label, option.searchText ?? ""].join(" ").toLowerCase();
      return haystack.includes(normalized);
    });
  }, [props.options, query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger
        disabled={props.disabled}
        className={cn("bos-task-property-chip", props.muted && "bos-task-property-chip--muted")}
        aria-label={props.ariaLabel ?? props.label}
        {...(props.taskPropertyDropdownId
          ? { "data-task-property-dropdown": props.taskPropertyDropdownId }
          : {})}
      >
        <span className="bos-task-property-chip__icon">{props.icon}</span>
        <span className="bos-task-property-chip__label">{props.label}</span>
      </MenuTrigger>
      <MenuPopup
        align="start"
        className="bos-task-property-menu bos-task-property-menu--searchable"
      >
        <div className="bos-task-property-menu__search">
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              stopPropertyMenuSearchKeyPropagation(event);
              if (event.key !== "Enter") return;
              event.preventDefault();
              const first = filteredOptions[0];
              if (!first) return;
              props.onChange(first.value);
              setOpen(false);
            }}
            onKeyUp={stopPropertyMenuSearchKeyPropagation}
            placeholder={props.searchPlaceholder}
            className="bos-task-property-menu__search-input"
            aria-label={props.searchPlaceholder}
          />
        </div>
        <MenuRadioGroup
          value={props.value}
          onValueChange={(next) => {
            props.onChange(next as T);
            setOpen(false);
          }}
        >
          {filteredOptions.length === 0 ? (
            <div className="bos-task-related-menu__empty">No matches</div>
          ) : (
            filteredOptions.map((option) => (
              <div key={option.value}>
                {option.separatorBefore ? (
                  <MenuSeparator className="bos-task-property-menu__separator" />
                ) : null}
                <MenuRadioItem
                  value={option.value}
                  closeOnClick
                  className="bos-task-property-menu__option"
                >
                  <span className="bos-task-property-menu__option-main">
                    {option.icon != null ? (
                      <span className="bos-task-property-menu__option-icon">{option.icon}</span>
                    ) : null}
                    <span className="bos-task-property-menu__option-label">{option.label}</span>
                  </span>
                </MenuRadioItem>
              </div>
            ))
          )}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

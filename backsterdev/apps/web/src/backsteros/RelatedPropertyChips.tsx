import { XIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { BacksterosContactPersonIcon } from "./ContactPersonIcon";
import { BacksterosEntityAvatarIcon } from "./EntityAvatarIcon";
import {
  decodeBacksterosTaskRelatedValues,
  encodeBacksterosTaskRelatedValue,
  encodeBacksterosTaskRelatedValues,
  type BacksterosTaskRelatedSelection,
} from "./taskRelated";
import type { BacksterosContact, BacksterosOrganization } from "./types";
import {
  useFocusPropertyMenuSearch,
  usePropertyMenuSearchTyping,
} from "./useFocusPropertyMenuSearch";
import { usePropertyMenuListKeyboard } from "./usePropertyMenuListKeyboard";
import { stopPropertyMenuSearchKeyPropagation } from "./stopPropertyMenuSearchKeyPropagation";
import { cn } from "~/lib/utils";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "~/components/ui/menu";

type RelatedOption = {
  readonly value: string;
  readonly label: string;
  readonly searchText: string;
  readonly icon: ReactNode;
};

function SidePanelPlusIcon() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path
        d="M6 2.5V9.5M2.5 6H9.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MultiSelectCheck(props: { readonly checked: boolean }) {
  return (
    <span
      className={["bos-task-related-menu__checkbox", props.checked ? "is-checked" : null]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      {props.checked ? (
        <svg viewBox="0 0 12 12" width="10" height="10">
          <path
            d="M2.5 6.2 4.8 8.5 9.5 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}

/**
 * Related contacts/orgs as individual chips + multi-select add menu.
 * Mirrors BacksterOS desktop `TaskRelatedChips` (inline variant).
 */
export function BacksterosRelatedPropertyChips(props: {
  readonly contactIds: readonly string[];
  readonly organizationIds: readonly string[];
  readonly contacts: readonly BacksterosContact[];
  readonly organizations: readonly BacksterosOrganization[];
  readonly contactAvatarSrcById: Readonly<Record<string, string>>;
  readonly organizationAvatarSrcById: Readonly<Record<string, string>>;
  readonly disabled?: boolean | undefined;
  /** Desktop `data-task-property-dropdown` — R opens related. */
  readonly taskPropertyDropdownId?: string;
  readonly onChange: (next: BacksterosTaskRelatedSelection) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useFocusPropertyMenuSearch(open);
  usePropertyMenuSearchTyping(open, searchRef, setQuery);

  const values = useMemo(
    () => encodeBacksterosTaskRelatedValues(props.contactIds, props.organizationIds),
    [props.contactIds, props.organizationIds],
  );
  const selectedSet = useMemo(() => new Set(values), [values]);

  const options = useMemo((): RelatedOption[] => {
    const contactOptions = props.contacts.map((contact) => ({
      value: encodeBacksterosTaskRelatedValue("contact", contact.id),
      label: contact.name,
      searchText: [contact.name, contact.firstName, contact.lastName, contact.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      icon: (
        <BacksterosEntityAvatarIcon
          src={props.contactAvatarSrcById[contact.id] ?? null}
          size={14}
          kind="contact"
        />
      ),
    }));
    const organizationOptions = props.organizations.map((organization) => ({
      value: encodeBacksterosTaskRelatedValue("organization", organization.id),
      label: organization.name,
      searchText: [organization.name, organization.key].filter(Boolean).join(" ").toLowerCase(),
      icon: (
        <BacksterosEntityAvatarIcon
          src={props.organizationAvatarSrcById[organization.id] ?? null}
          size={14}
          kind="organization"
        />
      ),
    }));
    return [...contactOptions, ...organizationOptions];
  }, [
    props.contactAvatarSrcById,
    props.contacts,
    props.organizationAvatarSrcById,
    props.organizations,
  ]);

  const optionsByValue = useMemo(() => {
    const map = new Map(options.map((option) => [option.value, option]));
    return map;
  }, [options]);

  const selected = useMemo(() => {
    return values.map((value) => {
      const match = optionsByValue.get(value);
      if (match) return match;
      const decoded = decodeBacksterosTaskRelatedValues([value]);
      const isOrg = decoded.organizationIds.length > 0;
      return {
        value,
        label: "Unknown",
        searchText: "",
        icon: isOrg ? (
          <BacksterosEntityAvatarIcon size={14} kind="organization" />
        ) : (
          <BacksterosContactPersonIcon size={14} />
        ),
      } satisfies RelatedOption;
    });
  }, [optionsByValue, values]);

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(normalized) || option.searchText.includes(normalized),
    );
  }, [options, query]);

  const { handleSearchListKeyDown, optionHighlightClass } = usePropertyMenuListKeyboard(
    open,
    filteredOptions.length,
  );

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const commitValues = (nextValues: string[]) => {
    props.onChange(decodeBacksterosTaskRelatedValues(nextValues));
  };

  const toggleValue = (value: string) => {
    if (selectedSet.has(value)) {
      commitValues(values.filter((entry) => entry !== value));
      return;
    }
    commitValues([...values, value]);
  };

  const removeValue = (value: string) => {
    commitValues(values.filter((entry) => entry !== value));
  };

  const addMenu = (
    <Menu
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) return;
        searchRef.current?.focus({ preventScroll: true });
      }}
    >
      <MenuTrigger
        disabled={props.disabled}
        className={
          values.length === 0
            ? "bos-task-property-chip bos-task-property-chip--muted"
            : "bos-task-related-add"
        }
        aria-label={values.length === 0 ? "Related" : "Add related"}
        title={values.length === 0 ? undefined : "Add related"}
        data-task-property-dropdown={props.taskPropertyDropdownId ?? "related"}
      >
        {values.length === 0 ? (
          <>
            <span className="bos-task-property-chip__icon">
              <BacksterosContactPersonIcon size={12} className="opacity-70" />
            </span>
            <span className="bos-task-property-chip__label">Related</span>
          </>
        ) : (
          <SidePanelPlusIcon />
        )}
      </MenuTrigger>
      <MenuPopup align="start" className="bos-task-property-menu bos-task-property-menu--related">
        <div className="bos-task-property-menu__search">
          <input
            ref={searchRef}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              stopPropertyMenuSearchKeyPropagation(event);
              handleSearchListKeyDown(event, {
                query,
                onActivateIndex: (index) => {
                  const option = filteredOptions[index];
                  if (option) toggleValue(option.value);
                },
              });
            }}
            onKeyUp={stopPropertyMenuSearchKeyPropagation}
            placeholder="Add related…"
            className="bos-task-property-menu__search-input"
            aria-label="Search related contacts and organizations"
          />
        </div>
        <div className="bos-task-property-menu__list">
          {filteredOptions.length === 0 ? (
            <div className="bos-task-related-menu__empty">No matches</div>
          ) : (
            filteredOptions.map((option, index) => {
              const prev = filteredOptions[index - 1];
              const showOrgSeparator =
                index > 0 &&
                option.value.startsWith("organization:") &&
                prev != null &&
                prev.value.startsWith("contact:");
              return (
                <div key={option.value}>
                  {showOrgSeparator ? (
                    <MenuSeparator className="bos-task-property-menu__separator" />
                  ) : null}
                  <MenuItem
                    closeOnClick={false}
                    className={cn("bos-task-property-menu__option", optionHighlightClass(index))}
                    onClick={() => toggleValue(option.value)}
                  >
                    <span className="bos-task-property-menu__option-main">
                      <MultiSelectCheck checked={selectedSet.has(option.value)} />
                      <span className="bos-task-property-menu__option-icon">{option.icon}</span>
                      <span className="bos-task-property-menu__option-label">{option.label}</span>
                    </span>
                  </MenuItem>
                </div>
              );
            })
          )}
        </div>
      </MenuPopup>
    </Menu>
  );

  return (
    <div className="bos-task-related-chips" aria-label="Related">
      <div className="bos-task-related-chips__row">
        {selected.map((option) => (
          <div key={option.value} className="bos-task-related-chip">
            <span className="bos-task-related-chip__body" title={option.label}>
              <span className="bos-task-related-chip__icon" aria-hidden="true">
                {option.icon}
              </span>
              <span className="bos-task-related-chip__label">{option.label}</span>
            </span>
            <button
              type="button"
              className="bos-task-related-chip__remove"
              disabled={props.disabled}
              aria-label={`Remove ${option.label}`}
              title="Remove"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                removeValue(option.value);
              }}
            >
              <XIcon className="size-2.5" />
            </button>
          </div>
        ))}
        {addMenu}
      </div>
    </div>
  );
}

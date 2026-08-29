"use client";

import { useMemo, useState } from "react";

import type { ContactRelationshipType } from "@backsteros/contracts";

import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";

const RELATIONSHIP_TYPES: {
  value: ContactRelationshipType;
  label: string;
}[] = [
  { value: "spouse", label: "Spouse" },
  { value: "partner", label: "Partner" },
  { value: "child", label: "Child" },
  { value: "parent", label: "Parent" },
  { value: "sibling", label: "Sibling" },
  { value: "friend", label: "Friend" },
  { value: "colleague", label: "Colleague" },
  { value: "reports_to", label: "Reports to" },
  { value: "other", label: "Other" },
];

export type ContactRelationshipListItemView = {
  id: string;
  typeLabel: string;
  relatedContactId: string;
  relatedContactName: string;
  direction: "outgoing" | "incoming";
  note?: string | null;
};

export type ContactRelationshipsListViewProps = {
  items: ContactRelationshipListItemView[];
  contactOptions: { id: string; name: string }[];
  loading?: boolean;
  error?: string | null;
  onSelectContact?: (contactId: string) => void;
  onAdd?: (input: {
    toContactId: string;
    type: ContactRelationshipType;
  }) => void | Promise<void>;
  onRemove?: (relationshipId: string) => void | Promise<void>;
};

function OverviewDropdownTrigger({
  label,
  muted,
  open,
  disabled,
  triggerId,
  ariaLabel,
  onToggle,
}: {
  label: string;
  muted?: boolean;
  open: boolean;
  disabled: boolean;
  triggerId: string;
  ariaLabel: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      id={triggerId}
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={ariaLabel}
      title={label}
      onClick={onToggle}
      className={[
        "entity-overview-input",
        "entity-overview-dropdown-trigger",
        muted ? "is-muted" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="entity-overview-dropdown-trigger__label">{label}</span>
      <span
        className="entity-overview-dropdown-trigger__chevron"
        aria-hidden="true"
      >
        ▾
      </span>
    </button>
  );
}

/**
 * Contact Relationships tab — directed edges with inverse type labels.
 */
export function ContactRelationshipsListView({
  items,
  contactOptions,
  loading = false,
  error = null,
  onSelectContact,
  onAdd,
  onRemove,
}: ContactRelationshipsListViewProps) {
  const [toContactId, setToContactId] = useState("");
  const [type, setType] = useState<ContactRelationshipType>("friend");
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) =>
        a.relatedContactName.localeCompare(b.relatedContactName),
      ),
    [items],
  );

  const contactDropdownOptions = useMemo(
    () =>
      contactOptions.map((option) => ({
        value: option.id,
        label: option.name,
      })),
    [contactOptions],
  );

  async function handleAdd() {
    if (!onAdd || !toContactId) return;
    setBusy(true);
    try {
      await onAdd({ toContactId, type });
      setToContactId("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="organization-entity-list">
      {onAdd ? (
        <div className="entity-overview__details" style={{ marginBottom: 16 }}>
          <div className="entity-overview-field">
            <span className="entity-overview-field__label">Add relationship</span>
            <div className="entity-overview-address-locality">
              <SearchableDropdown
                value={toContactId || null}
                options={contactDropdownOptions}
                disabled={busy}
                searchPlaceholder="Search contacts…"
                ariaLabel="Related contact"
                panelAlign="start"
                panelWidth="trigger"
                showIcon={false}
                className="entity-overview-dropdown"
                onChange={setToContactId}
                renderTrigger={({ selected, open, disabled, triggerId, onToggle }) => (
                  <OverviewDropdownTrigger
                    label={selected?.label ?? "Select contact…"}
                    muted={!selected}
                    open={open}
                    disabled={disabled}
                    triggerId={triggerId}
                    ariaLabel={`Related contact: ${selected?.label ?? "Select contact"}`}
                    onToggle={onToggle}
                  />
                )}
              />
              <SearchableDropdown
                value={type}
                options={RELATIONSHIP_TYPES}
                disabled={busy}
                searchPlaceholder="Type…"
                ariaLabel="Relationship type"
                panelAlign="start"
                panelWidth="trigger"
                showIcon={false}
                className="entity-overview-dropdown"
                onChange={setType}
                renderTrigger={({ selected, open, disabled, triggerId, onToggle }) => (
                  <OverviewDropdownTrigger
                    label={selected?.label ?? "Friend"}
                    open={open}
                    disabled={disabled}
                    triggerId={triggerId}
                    ariaLabel={`Relationship type: ${selected?.label ?? "Friend"}`}
                    onToggle={onToggle}
                  />
                )}
              />
              <button
                type="button"
                className="task-activity-reply__submit"
                disabled={busy || !toContactId}
                onClick={() => void handleAdd()}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="task-activity__error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="overview-empty">Loading relationships…</p>
      ) : sorted.length === 0 ? (
        <p className="overview-empty">No relationships yet.</p>
      ) : (
        <ul className="organization-entity-list__items">
          {sorted.map((item) => (
            <li key={item.id} className="organization-entity-list__item">
              <button
                type="button"
                className="organization-entity-list__row"
                onClick={() => onSelectContact?.(item.relatedContactId)}
              >
                <span className="organization-entity-list__title">
                  {item.relatedContactName}
                </span>
                <span className="organization-entity-list__meta">
                  {item.typeLabel}
                </span>
              </button>
              {onRemove ? (
                <button
                  type="button"
                  className="task-activity-comment-card__toggle"
                  aria-label={`Remove relationship with ${item.relatedContactName}`}
                  onClick={() => void onRemove(item.id)}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

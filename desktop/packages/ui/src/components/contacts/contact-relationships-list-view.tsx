"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { XIcon } from "@primer/octicons-react";

import type { CrmRelationshipLabel } from "@backsteros/contracts";

import {
  OTHER_RELATIONSHIP_TYPE_VALUE,
  expandRelationshipLabelSides,
  findRelationshipLabelById,
  formatRelationshipTypeLabel,
} from "../../contacts/relationship-types.js";
import { getCreateEntityFromQueryLabel } from "../../dropdowns/searchable-dropdown-create-from-query.js";
import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";
import {
  RelationshipLabelEditModal,
  type RelationshipLabelEditValues,
} from "./relationship-label-edit-modal.js";
import {
  KebabHorizontalIcon,
  RelationshipLabelOverflowMenu,
} from "./relationship-label-overflow-menu.js";

export type ContactRelationshipListItemView = {
  id: string;
  type: string;
  typeLabel: string;
  relatedContactId: string;
  relatedContactName: string;
  direction: "outgoing" | "incoming";
  note?: string | null;
};

export type ContactRelationshipsListViewProps = {
  items: ContactRelationshipListItemView[];
  contactOptions: { id: string; name: string; avatarSrc?: string | null }[];
  /** Workspace bidirectional label catalog. */
  relationshipLabels?: CrmRelationshipLabel[];
  loading?: boolean;
  error?: string | null;
  onSelectContact?: (contactId: string) => void;
  onAdd?: (input: {
    toContactId: string;
    type: string;
  }) => void | Promise<void>;
  onRemove?: (relationshipId: string) => void | Promise<void>;
  onCreateLabel?: (
    input: RelationshipLabelEditValues,
  ) => Promise<CrmRelationshipLabel | void>;
  onUpdateLabel?: (
    id: string,
    input: RelationshipLabelEditValues,
  ) => Promise<CrmRelationshipLabel | void>;
  onDeleteLabel?: (id: string) => Promise<void>;
  /** Chip row for contact Details (default). Legacy list when `"list"`. */
  variant?: "chips" | "list";
};

/**
 * Contact relationships — chip row on Details, or legacy stacked list.
 */
export function ContactRelationshipsListView({
  items,
  contactOptions,
  relationshipLabels = [],
  loading = false,
  error = null,
  onSelectContact,
  onAdd,
  onRemove,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
  variant = "chips",
}: ContactRelationshipsListViewProps) {
  const [toContactId, setToContactId] = useState("");
  const [type, setType] = useState("friend");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [labelModal, setLabelModal] = useState<{
    mode: "create" | "edit";
    labelId: string | null;
    initial: RelationshipLabelEditValues;
    prefillSideSlug?: string;
  } | null>(null);
  const [labelModalError, setLabelModalError] = useState<string | null>(null);
  const [labelModalBusy, setLabelModalBusy] = useState(false);
  const [overflowMenu, setOverflowMenu] = useState<{
    labelId: string;
    x: number;
    y: number;
  } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const toContactIdRef = useRef(toContactId);
  toContactIdRef.current = toContactId;
  const typeRef = useRef(type);
  typeRef.current = type;

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
        avatarSrc: option.avatarSrc ?? null,
        icon: (
          <EntityAvatarIcon
            src={option.avatarSrc}
            size={16}
            kind="contact"
          />
        ),
      })),
    [contactOptions],
  );

  const sideOptions = useMemo(
    () => expandRelationshipLabelSides(relationshipLabels),
    [relationshipLabels],
  );

  const selectedTypeLabel =
    sideOptions.find((option) => option.value === type)?.label ??
    formatRelationshipTypeLabel(type);

  const typeDropdownOptions = useMemo(() => {
    const rows = sideOptions.map((option) => ({
      value: option.value,
      label: option.label,
      searchTerms: option.searchTerms,
      action:
        onUpdateLabel || onDeleteLabel
          ? {
              ariaLabel: `Actions for ${option.label}`,
              icon: <KebabHorizontalIcon />,
              closeOnSelect: false,
              onSelect: (event: ReactMouseEvent<HTMLButtonElement>) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setOverflowMenu({
                  labelId: option.labelId,
                  x: rect.left,
                  y: rect.top,
                });
              },
            }
          : undefined,
    }));
    rows.push({
      value: OTHER_RELATIONSHIP_TYPE_VALUE,
      label: "Other…",
      searchTerms: "other custom new",
      action: undefined,
    });
    return rows;
  }, [onDeleteLabel, onUpdateLabel, sideOptions]);

  useEffect(() => {
    if (!adding) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (editorRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        (target.closest("[data-searchable-dropdown-panel]") ||
          target.closest("[data-relationship-label-overflow-menu]") ||
          target.closest(".relationship-label-modal-backdrop"))
      ) {
        return;
      }
      setAdding(false);
    }
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [adding]);

  async function tryAdd(next?: { type?: string; toContactId?: string }) {
    const nextType = next?.type ?? typeRef.current;
    const nextContactId = next?.toContactId ?? toContactIdRef.current;
    if (
      !onAdd ||
      !nextContactId ||
      !nextType ||
      nextType === OTHER_RELATIONSHIP_TYPE_VALUE ||
      busyRef.current
    ) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await onAdd({ toContactId: nextContactId, type: nextType });
      setToContactId("");
      setType("friend");
      setAdding(false);
    } catch (err) {
      console.warn("[contacts] add relationship failed", err);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function openCreateLabel(prefill = "") {
    setLabelModalError(null);
    setLabelModal({
      mode: "create",
      labelId: null,
      initial: {
        sideALabel: prefill,
        sideBLabel: prefill,
        color: null,
      },
    });
  }

  function openEditLabel(labelId: string) {
    const label = findRelationshipLabelById(relationshipLabels, labelId);
    if (!label) return;
    setLabelModalError(null);
    setLabelModal({
      mode: "edit",
      labelId,
      initial: {
        sideALabel: label.sideALabel,
        sideBLabel: label.sideBLabel,
        color: label.color,
      },
    });
  }

  async function handleDeleteLabel(labelId: string) {
    if (!onDeleteLabel) return;
    setBusy(true);
    try {
      await onDeleteLabel(labelId);
      const still = expandRelationshipLabelSides(
        relationshipLabels.filter((entry) => entry.id !== labelId),
      );
      if (!still.some((option) => option.value === type)) {
        setType(still[0]?.value ?? "friend");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveLabel(values: RelationshipLabelEditValues) {
    if (!labelModal) return;
    setLabelModalBusy(true);
    setLabelModalError(null);
    try {
      if (labelModal.mode === "create") {
        if (!onCreateLabel) return;
        const created = await onCreateLabel(values);
        if (created?.sideASlug) {
          setType(created.sideASlug);
          void tryAdd({ type: created.sideASlug });
        }
      } else if (labelModal.labelId && onUpdateLabel) {
        const updated = await onUpdateLabel(labelModal.labelId, values);
        if (updated?.sideASlug) {
          setType(updated.sideASlug);
        }
      }
      setLabelModal(null);
    } catch (err) {
      setLabelModalError(
        err instanceof Error ? err.message : "Failed to save label",
      );
    } finally {
      setLabelModalBusy(false);
    }
  }

  function renderTypePicker() {
    return (
      <SearchableDropdown
        value={type}
        options={typeDropdownOptions}
        disabled={busy}
        searchPlaceholder="Search types…"
        searchShortcutLabel=""
        ariaLabel="Relationship type"
        panelAlign="start"
        panelWidth={240}
        showIcon={false}
        className="contact-detail-split-chip__dropdown"
        createFromQueryLabel={(query) =>
          onCreateLabel
            ? getCreateEntityFromQueryLabel("type", query)
            : null
        }
        onCreateFromQuery={(query) => {
          openCreateLabel(query.trim());
        }}
        onChange={(nextType) => {
          if (nextType === OTHER_RELATIONSHIP_TYPE_VALUE) {
            openCreateLabel("");
            return;
          }
          setType(nextType);
          void tryAdd({ type: nextType });
        }}
        renderTrigger={({ selected, open, disabled, triggerId, onToggle }) => (
          <button
            type="button"
            id={triggerId}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={`Relationship type: ${selected?.label ?? selectedTypeLabel}`}
            title={selected?.label ?? selectedTypeLabel}
            onClick={onToggle}
            className={[
              "contact-detail-split-chip__label",
              "contact-detail-split-chip__label--muted",
              open ? "is-open" : null,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {selected?.label ?? selectedTypeLabel}
          </button>
        )}
      />
    );
  }

  const labelUi = (
    <>
      <RelationshipLabelOverflowMenu
        open={overflowMenu != null}
        x={overflowMenu?.x ?? 0}
        y={overflowMenu?.y ?? 0}
        onClose={() => setOverflowMenu(null)}
        onEdit={() => {
          if (overflowMenu) openEditLabel(overflowMenu.labelId);
        }}
        onDelete={() => {
          if (overflowMenu) void handleDeleteLabel(overflowMenu.labelId);
        }}
      />
      <RelationshipLabelEditModal
        open={labelModal != null}
        mode={labelModal?.mode ?? "create"}
        initial={
          labelModal?.initial ?? {
            sideALabel: "",
            sideBLabel: "",
            color: null,
          }
        }
        busy={labelModalBusy}
        error={labelModalError}
        onClose={() => {
          if (!labelModalBusy) setLabelModal(null);
        }}
        onSave={handleSaveLabel}
      />
    </>
  );

  if (variant === "chips") {
    return (
      <div className="contact-detail-chips" ref={editorRef}>
        <div className="contact-detail-chips__row">
          {loading ? (
            <span className="contact-detail-chip is-muted">Loading…</span>
          ) : null}
          {!loading &&
            sorted.map((item) => (
              <div
                key={item.id}
                className="contact-detail-relationship-chip"
              >
                <button
                  type="button"
                  className="contact-detail-chip"
                  title={`${item.typeLabel} · ${item.relatedContactName}`}
                  aria-label={`${item.typeLabel}, ${item.relatedContactName}`}
                  onClick={() => onSelectContact?.(item.relatedContactId)}
                >
                  <span className="contact-detail-chip__meta">
                    {item.typeLabel}
                  </span>
                  {item.relatedContactName}
                </button>
                {onRemove ? (
                  <button
                    type="button"
                    className="contact-detail-split-chip__remove"
                    aria-label={`Remove relationship with ${item.relatedContactName}`}
                    title="Remove"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void onRemove(item.id);
                    }}
                  >
                    <XIcon size={10} />
                  </button>
                ) : null}
              </div>
            ))}
          {adding && onAdd ? (
            <div
              className={[
                "contact-detail-split-chip",
                !toContactId ? "is-muted" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {renderTypePicker()}
              <SearchableDropdown
                value={toContactId || null}
                options={contactDropdownOptions}
                disabled={busy}
                searchPlaceholder="Search contacts…"
                searchShortcutLabel=""
                ariaLabel="Related contact"
                panelAlign="start"
                panelWidth={240}
                showIcon={false}
                className="contact-detail-split-chip__dropdown contact-detail-split-chip__dropdown--grow"
                onChange={(nextContactId) => {
                  setToContactId(nextContactId);
                  void tryAdd({ toContactId: nextContactId });
                }}
                renderTrigger={({
                  selected,
                  open,
                  disabled,
                  triggerId,
                  onToggle,
                }) => (
                  <button
                    type="button"
                    id={triggerId}
                    disabled={disabled}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-label={`Related contact: ${selected?.label ?? "Select"}`}
                    title={selected?.label ?? "Select contact"}
                    onClick={onToggle}
                    className={[
                      "contact-detail-split-chip__value",
                      "contact-detail-split-chip__value--button",
                      !selected ? "is-muted" : null,
                      open ? "is-open" : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {selected?.label ?? "Contact…"}
                  </button>
                )}
              />
            </div>
          ) : null}
          {onAdd ? (
            <button
              type="button"
              className={[
                "contact-detail-chips__add",
                adding ? "is-open" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={busy}
              aria-label="Add relationship"
              title="Add relationship"
              onClick={() => {
                setAdding((open) => !open);
                if (adding) {
                  setToContactId("");
                  setType("friend");
                }
              }}
            >
              <SidePanelPlusIcon />
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="task-activity__error" role="alert">
            {error}
          </p>
        ) : null}
        {labelUi}
      </div>
    );
  }

  return (
    <div className="organization-entity-list">
      {onAdd ? (
        <div className="entity-overview__details" style={{ marginBottom: 16 }}>
          <div className="entity-overview-field">
            <span className="entity-overview-field__label">Add relationship</span>
            <div className="entity-overview-address-locality">
              <SearchableDropdown
                value={type}
                options={typeDropdownOptions}
                disabled={busy}
                searchPlaceholder="Search types…"
                searchShortcutLabel=""
                ariaLabel="Relationship type"
                panelAlign="start"
                panelWidth="trigger"
                showIcon={false}
                className="entity-overview-dropdown"
                createFromQueryLabel={(query) =>
                  onCreateLabel
                    ? getCreateEntityFromQueryLabel("type", query)
                    : null
                }
                onCreateFromQuery={(query) => {
                  openCreateLabel(query.trim());
                }}
                onChange={(nextType) => {
                  if (nextType === OTHER_RELATIONSHIP_TYPE_VALUE) {
                    openCreateLabel("");
                    return;
                  }
                  setType(nextType);
                  void tryAdd({ type: nextType });
                }}
                renderTrigger={({
                  selected,
                  open,
                  disabled,
                  triggerId,
                  onToggle,
                }) => (
                  <button
                    type="button"
                    id={triggerId}
                    disabled={disabled}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    className="entity-overview-input entity-overview-dropdown-trigger"
                    onClick={onToggle}
                  >
                    <span className="entity-overview-dropdown-trigger__label">
                      {selected?.label ?? selectedTypeLabel}
                    </span>
                  </button>
                )}
              />
              <SearchableDropdown
                value={toContactId || null}
                options={contactDropdownOptions}
                disabled={busy}
                searchPlaceholder="Search contacts…"
                searchShortcutLabel=""
                ariaLabel="Related contact"
                panelAlign="start"
                panelWidth="trigger"
                showIcon={false}
                className="entity-overview-dropdown"
                onChange={(nextContactId) => {
                  setToContactId(nextContactId);
                  void tryAdd({ toContactId: nextContactId });
                }}
                renderTrigger={({
                  selected,
                  open,
                  disabled,
                  triggerId,
                  onToggle,
                }) => (
                  <button
                    type="button"
                    id={triggerId}
                    disabled={disabled}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    className={[
                      "entity-overview-input",
                      "entity-overview-dropdown-trigger",
                      !selected ? "is-muted" : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={onToggle}
                  >
                    <span className="entity-overview-dropdown-trigger__label">
                      {selected?.label ?? "Select contact…"}
                    </span>
                  </button>
                )}
              />
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
                  {item.typeLabel} · {item.relatedContactName}
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
      {labelUi}
    </div>
  );
}

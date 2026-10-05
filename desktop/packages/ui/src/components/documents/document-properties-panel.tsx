"use client";

import { XIcon } from "@primer/octicons-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { DocumentPropertyType } from "@backsteros/contracts";
import { CORE_DOCUMENT_PROPERTY_TYPE_SEEDS } from "@backsteros/contracts";

import { EntityPropertiesSection } from "../entity/entity-properties-section.js";
import { PropertyFieldGroup } from "../content/property-field-group.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  resolveDropdownNone,
  resolveDropdownProjectKey,
} from "../dropdowns/dropdown-options.js";
import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";

export type DocumentPropertiesPanelModel = {
  docKey: string | null;
  properties: Record<string, unknown>;
  frontMatterValid: boolean;
  contentVersion: number;
  onSave?: (input: {
    properties: Record<string, unknown>;
    ifMatchVersion: number;
  }) => Promise<{ ok: true; contentVersion: number } | { ok: false; error: string }>;
};

export type DocumentPropertiesPanelProps = {
  document: DocumentPropertiesPanelModel;
  types?: DocumentPropertyType[];
  contactOptions?: SearchableDropdownOption<string>[];
  taskOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  /** Extra table rows (e.g. publishable Status / Folder) in the same card. */
  children?: ReactNode;
};

function fallbackTypes(): DocumentPropertyType[] {
  return CORE_DOCUMENT_PROPERTY_TYPE_SEEDS.map((seed) => ({
    id: seed.key,
    key: seed.key,
    label: seed.label,
    kind: seed.kind,
    options: seed.options ?? [],
    multiple: seed.multiple === true,
    projectId: null,
    status: "active" as const,
    seeded: true,
    proposedByContactId: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }));
}

function isProjectPropertyKey(key: string): boolean {
  return key === "project" || key === "projects";
}

function formatValue(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === "string").join(", ");
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

export function DocumentPropertiesPanel({
  document,
  types,
  contactOptions = [],
  taskOptions = [],
  projectOptions = [],
  children,
}: DocumentPropertiesPanelProps) {
  const definitions = types?.length ? types : fallbackTypes();
  const byKey = useMemo(
    () =>
      new Map(
        definitions
          .filter((type) => type.status === "active")
          .map((type) => [type.key, type]),
      ),
    [definitions],
  );
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(document.contentVersion);

  useEffect(() => {
    setVersion(document.contentVersion);
  }, [document.contentVersion]);

  const propertyKeys = [
    ...Object.keys(document.properties).filter(
      (key) => key !== "docKey" && document.properties[key] != null,
    ),
    ...(pendingKey && !(pendingKey in document.properties) ? [pendingKey] : []),
  ];
  const unusedTypes = definitions.filter(
    (type) =>
      type.status === "active" &&
      !propertyKeys.includes(type.key) &&
      type.key !== pendingKey,
  );
  const addOptions = unusedTypes.map((type) => ({
    value: type.key,
    label: type.label,
    searchTerms: `${type.key} ${type.label} ${type.kind}`,
  }));

  async function savePatch(patch: Record<string, unknown>) {
    if (!document.onSave || !document.frontMatterValid) return;
    setSaving(true);
    setError(null);
    const result = await document.onSave({
      properties: patch,
      ifMatchVersion: version,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setVersion(result.contentVersion);
    setPendingKey(null);
  }

  function addType(key: string) {
    const type = byKey.get(key);
    if (!type) return;
    if (type.kind === "checkbox") {
      void savePatch({ [type.key]: false });
      return;
    }
    if (type.kind === "select" && type.options[0]) {
      void savePatch({ [type.key]: type.options[0].value });
      return;
    }
    if (type.kind === "multi-select") {
      void savePatch({ [type.key]: [] });
      return;
    }
    setPendingKey(type.key);
  }

  const disabled = !document.frontMatterValid || !document.onSave || saving;

  return (
    <EntityPropertiesSection title="Properties">
      {!document.frontMatterValid ? (
        <p className="document-properties-panel__error" role="alert">
          Fix invalid YAML front matter before editing properties.
        </p>
      ) : null}
      <div className="document-properties-table">
        {children ? (
          <div className="document-properties-table__defaults">{children}</div>
        ) : null}
        {children ? (
          <div
            className="document-properties-table__rule"
            role="separator"
          />
        ) : null}
        <div className="document-properties-table__document">
          {document.docKey ? (
            <PropertyFieldGroup label="Key">
              <span className="document-properties-table__static">
                {document.docKey}
              </span>
            </PropertyFieldGroup>
          ) : null}
          {propertyKeys.map((key) => {
            const type = byKey.get(key);
            const unknown = !type;
            const removable = key !== "project";
            return (
              <div
                key={key}
                className={[
                  "document-properties-table__row",
                  unknown ? "is-unknown" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                title={unknown ? "Unknown property type" : undefined}
              >
                <DocumentPropertyEditor
                  propertyKey={key}
                  type={type}
                  value={document.properties[key]}
                  disabled={disabled}
                  contactOptions={contactOptions}
                  taskOptions={taskOptions}
                  projectOptions={projectOptions}
                  onChange={(next) => void savePatch({ [key]: next })}
                />
                {removable ? (
                  <button
                    type="button"
                    className="document-properties-table__remove"
                    disabled={disabled}
                    aria-label={`Remove ${type?.label ?? key}`}
                    onClick={() => {
                      if (pendingKey === key) {
                        setPendingKey(null);
                        return;
                      }
                      void savePatch({ [key]: null });
                    }}
                  >
                    <XIcon size={12} />
                  </button>
                ) : (
                  <span className="document-properties-table__remove-spacer" />
                )}
              </div>
            );
          })}
          {addOptions.length > 0 ? (
            <div className="document-properties-table__add">
              <SearchableDropdown
                value={null}
                options={addOptions}
                onChange={(next) => addType(next)}
                disabled={disabled}
                searchPlaceholder="Add property…"
                ariaLabel="Add property"
                emptySelectionLabel="Add property"
                panelWidth={280}
                panelAlign="start"
                renderTrigger={({
                  open,
                  disabled: isDisabled,
                  triggerId,
                  onToggle,
                }) => (
                  <button
                    type="button"
                    id={triggerId}
                    className={[
                      "contact-detail-chips__add",
                      open ? "is-open" : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={isDisabled}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-label="Add property"
                    title="Add property"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggle();
                    }}
                  >
                    <SidePanelPlusIcon />
                  </button>
                )}
              />
            </div>
          ) : null}
        </div>
      </div>
      {error ? (
        <p className="document-properties-panel__error" role="alert">
          {error}
        </p>
      ) : null}
    </EntityPropertiesSection>
  );
}

function DocumentPropertyEditor({
  propertyKey,
  type,
  value,
  disabled,
  contactOptions,
  taskOptions,
  projectOptions,
  onChange,
}: {
  propertyKey: string;
  type?: DocumentPropertyType;
  value: unknown;
  disabled: boolean;
  contactOptions: SearchableDropdownOption<string>[];
  taskOptions: SearchableDropdownOption<string>[];
  projectOptions: SearchableDropdownOption<string>[];
  onChange: (value: unknown) => void;
}) {
  const label = type?.label ?? propertyKey;
  const kind = type?.kind ?? "text";
  const multiple = type?.multiple === true || kind === "multi-select";

  if (kind === "select") {
    const current = typeof value === "string" ? value : "";
    return (
      <PropertyFieldGroup label={label}>
        <PropertyDropdown
          value={current || DROPDOWN_NONE_VALUE}
          options={[
            { value: DROPDOWN_NONE_VALUE, label: "—" },
            ...(type?.options ?? []).map((option) => ({
              value: option.value,
              label: option.label,
            })),
          ]}
          onChange={(next) => onChange(resolveDropdownNone(next))}
          searchPlaceholder={`Set ${label.toLowerCase()}…`}
          ariaLabel={label}
          fallbackLabel="—"
          disabled={disabled}
        />
      </PropertyFieldGroup>
    );
  }

  if (kind === "multi-select") {
    return (
      <PropertyFieldGroup label={label}>
        <SearchableDropdown
          multiple
          values={asStringList(value)}
          options={(type?.options ?? []).map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          onValuesChange={(next) => onChange(next)}
          searchPlaceholder={`Set ${label.toLowerCase()}…`}
          ariaLabel={label}
          emptySelectionLabel="—"
          disabled={disabled}
        />
      </PropertyFieldGroup>
    );
  }

  if (kind === "contact" && contactOptions.length > 0) {
    if (multiple) {
      return (
        <PropertyFieldGroup label={label}>
          <SearchableDropdown
            multiple
            values={asStringList(value)}
            options={contactOptions}
            onValuesChange={(next) => onChange(next)}
            searchPlaceholder="Add contacts…"
            ariaLabel={label}
            emptySelectionLabel="—"
            disabled={disabled}
          />
        </PropertyFieldGroup>
      );
    }
    const current = typeof value === "string" ? value : DROPDOWN_NONE_VALUE;
    return (
      <PropertyFieldGroup label={label}>
        <PropertyDropdown
          value={current || DROPDOWN_NONE_VALUE}
          options={[
            { value: DROPDOWN_NONE_VALUE, label: "—" },
            ...contactOptions,
          ]}
          onChange={(next) => onChange(resolveDropdownNone(next))}
          searchPlaceholder="Set owner…"
          ariaLabel={label}
          fallbackLabel="—"
          disabled={disabled}
        />
      </PropertyFieldGroup>
    );
  }

  if (kind === "task" && taskOptions.length > 0) {
    return (
      <PropertyFieldGroup label={label}>
        <SearchableDropdown
          multiple={multiple}
          values={multiple ? asStringList(value) : undefined}
          value={multiple ? undefined : typeof value === "string" ? value : ""}
          options={taskOptions}
          onValuesChange={multiple ? (next) => onChange(next) : undefined}
          onChange={multiple ? undefined : (next) => onChange(next)}
          searchPlaceholder="Link tasks…"
          ariaLabel={label}
          emptySelectionLabel="—"
          disabled={disabled}
        />
      </PropertyFieldGroup>
    );
  }

  if (isProjectPropertyKey(propertyKey) && projectOptions.length > 0) {
    const current = typeof value === "string" ? value : "";
    return (
      <PropertyFieldGroup label={label}>
        <PropertyDropdown
          value={current || DROPDOWN_NO_PROJECT_VALUE}
          options={projectOptions}
          onChange={(next) => onChange(resolveDropdownProjectKey(next))}
          searchPlaceholder="Set project…"
          ariaLabel={label}
          fallbackLabel="No project"
          disabled={disabled}
        />
      </PropertyFieldGroup>
    );
  }

  if (kind === "checkbox") {
    return (
      <PropertyFieldGroup label={label}>
        <input
          type="checkbox"
          checked={value === true}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
      </PropertyFieldGroup>
    );
  }

  if (kind === "number") {
    return (
      <PropertyFieldGroup label={label}>
        <input
          className="property-field-input"
          type="number"
          value={typeof value === "number" ? String(value) : formatValue(value)}
          disabled={disabled}
          onBlur={(event) => {
            const raw = event.target.value.trim();
            onChange(raw ? Number(raw) : null);
          }}
          onChange={() => undefined}
        />
      </PropertyFieldGroup>
    );
  }

  return (
    <PropertyFieldGroup label={label}>
      <input
        className="property-field-input"
        type={kind === "date" ? "date" : "text"}
        defaultValue={formatValue(value)}
        disabled={disabled}
        onBlur={(event) => {
          const next = event.target.value.trim();
          onChange(next.length ? next : null);
        }}
      />
    </PropertyFieldGroup>
  );
}

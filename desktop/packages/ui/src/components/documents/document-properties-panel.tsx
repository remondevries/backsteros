"use client";

import { useEffect, useMemo, useState } from "react";

import type { DocumentPropertyType } from "@backsteros/contracts";
import { CORE_DOCUMENT_PROPERTY_TYPE_SEEDS } from "@backsteros/contracts";

import { EntityPropertiesSection } from "../entity/entity-properties-section.js";
import { PropertyFieldGroup } from "../content/property-field-group.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import {
  DROPDOWN_NONE_VALUE,
  resolveDropdownNone,
} from "../dropdowns/dropdown-options.js";
import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";

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
}: DocumentPropertiesPanelProps) {
  const definitions = types?.length ? types : fallbackTypes();
  const byKey = useMemo(
    () => new Map(definitions.filter((type) => type.status === "active").map((type) => [type.key, type])),
    [definitions],
  );
  const [addingKey, setAddingKey] = useState("");
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

  const disabled = !document.frontMatterValid || !document.onSave || saving;

  return (
    <EntityPropertiesSection title="Properties">
      {document.docKey ? (
        <p className="document-properties-panel__doc-key">{document.docKey}</p>
      ) : null}
      {!document.frontMatterValid ? (
        <p className="document-properties-panel__error" role="alert">
          Fix invalid YAML front matter before editing properties.
        </p>
      ) : null}
      <div className="entity-properties-stack">
        {propertyKeys.map((key) => {
          const type = byKey.get(key);
          const unknown = !type;
          return (
            <div key={key} className="document-properties-panel__row">
              <DocumentPropertyEditor
                propertyKey={key}
                type={type}
                value={document.properties[key]}
                disabled={disabled}
                contactOptions={contactOptions}
                taskOptions={taskOptions}
                onChange={(next) => void savePatch({ [key]: next })}
              />
              {unknown ? (
                <p className="document-properties-panel__flag">Unknown type</p>
              ) : null}
              <button
                type="button"
                className="document-properties-panel__remove"
                disabled={disabled || key === "project"}
                onClick={() => void savePatch({ [key]: null })}
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
      {unusedTypes.length > 0 ? (
        <div className="document-properties-panel__add">
          <select
            className="property-field-input"
            value={addingKey}
            disabled={disabled}
            onChange={(event) => setAddingKey(event.target.value)}
            aria-label="Property type to add"
          >
            <option value="">Add property…</option>
            {unusedTypes.map((type) => (
              <option key={type.id} value={type.key}>
                {type.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn--primary"
            disabled={disabled || !addingKey}
            onClick={() => {
              const type = byKey.get(addingKey);
              if (!type) return;
              setAddingKey("");
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
            }}
          >
            Add
          </button>
        </div>
      ) : null}
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
  onChange,
}: {
  propertyKey: string;
  type?: DocumentPropertyType;
  value: unknown;
  disabled: boolean;
  contactOptions: SearchableDropdownOption<string>[];
  taskOptions: SearchableDropdownOption<string>[];
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

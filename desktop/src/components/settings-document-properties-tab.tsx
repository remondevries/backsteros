import { useMemo, useState } from "react";

import { ApiClientError } from "@backsteros/api-client";
import type {
  DocumentPropertyType,
  DocumentPropertyTypeKind,
} from "@backsteros/contracts";
import { DOCUMENT_PROPERTY_TYPE_KINDS } from "@backsteros/contracts";

import { useDesktopApi } from "../lib/api-context";
import { useDocumentPropertyTypes } from "../lib/use-document-property-types";

function kindLabel(kind: DocumentPropertyTypeKind): string {
  if (kind === "multi-select") return "Multi-select";
  if (kind === "task") return "Task";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function SettingsDocumentPropertiesTab() {
  const { client } = useDesktopApi();
  const { types, reload } = useDocumentPropertyTypes();
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<DocumentPropertyTypeKind>("text");
  const [optionsText, setOptionsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const proposed = useMemo(
    () => types.filter((type) => type.status === "proposed"),
    [types],
  );
  const active = useMemo(
    () => types.filter((type) => type.status === "active"),
    [types],
  );

  async function createType() {
    setSaving(true);
    setError(null);
    try {
      const options = optionsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [value, name] = line.split("|").map((part) => part.trim());
          return { value: value ?? "", label: name || value || "" };
        })
        .filter((option) => option.value && option.label);
      await client.requestJson("/api/v1/document-property-types", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key,
          label,
          kind,
          options: options.length ? options : undefined,
          multiple: kind === "multi-select",
        }),
      });
      setKey("");
      setLabel("");
      setOptionsText("");
      await reload();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create type.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function patchType(
    type: DocumentPropertyType,
    body: Record<string, unknown>,
  ) {
    setError(null);
    try {
      await client.requestJson(
        `/api/v1/document-property-types/${encodeURIComponent(type.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      await reload();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not update type.",
      );
    }
  }

  async function removeType(type: DocumentPropertyType, confirm = false) {
    setError(null);
    try {
      const query = confirm ? "?confirm=true" : "";
      await client.requestJson(
        `/api/v1/document-property-types/${encodeURIComponent(type.id)}${query}`,
        { method: "DELETE" },
      );
      await reload();
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.status === 409) {
        const usage =
          reason.body &&
          typeof reason.body === "object" &&
          "usageCount" in reason.body &&
          typeof reason.body.usageCount === "number"
            ? reason.body.usageCount
            : 0;
        const ok = window.confirm(
          `${type.label} is used on ${usage} document${usage === 1 ? "" : "s"}. Remove the type anyway? Values on documents will be kept.`,
        );
        if (ok) await removeType(type, true);
        return;
      }
      setError(
        reason instanceof Error ? reason.message : "Could not remove type.",
      );
    }
  }

  return (
    <div className="settings-document-properties">
      <p className="settings-hint">
        Property types appear on document rails. Agents can only propose new
        types; you approve them here.
      </p>
      {error ? (
        <p className="settings-hint" role="alert">
          {error}
        </p>
      ) : null}
      {proposed.length > 0 ? (
        <section className="settings-document-properties__section">
          <h3>Proposed by agents</h3>
          <ul>
            {proposed.map((type) => (
              <li key={type.id}>
                <strong>{type.label}</strong> ({type.key}, {kindLabel(type.kind)})
                <button
                  type="button"
                  onClick={() =>
                    void client
                      .requestJson(
                        `/api/v1/document-property-types/${encodeURIComponent(type.id)}/approve`,
                        { method: "POST" },
                      )
                      .then(() => reload())
                  }
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void client
                      .requestJson(
                        `/api/v1/document-property-types/${encodeURIComponent(type.id)}/reject`,
                        { method: "POST" },
                      )
                      .then(() => reload())
                  }
                >
                  Reject
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="settings-document-properties__section">
        <h3>Active types</h3>
        <ul>
          {active.map((type) => (
            <li key={type.id}>
              <input
                defaultValue={type.label}
                aria-label={`Label for ${type.key}`}
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (next && next !== type.label) {
                    void patchType(type, { label: next });
                  }
                }}
              />
              <span>
                {type.key} · {kindLabel(type.kind)}
                {type.seeded ? " · core" : ""}
              </span>
              <button type="button" onClick={() => void removeType(type)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="settings-document-properties__section">
        <h3>Add type</h3>
        <div className="settings-field">
          <span>Key</span>
          <input
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="camelCase"
          />
        </div>
        <div className="settings-field">
          <span>Label</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <div className="settings-field">
          <span>Kind</span>
          <select
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as DocumentPropertyTypeKind)
            }
          >
            {DOCUMENT_PROPERTY_TYPE_KINDS.map((entry) => (
              <option key={entry} value={entry}>
                {kindLabel(entry)}
              </option>
            ))}
          </select>
        </div>
        {kind === "select" || kind === "multi-select" ? (
          <div className="settings-field">
            <span>Options (one per line, value|Label)</span>
            <textarea
              value={optionsText}
              onChange={(event) => setOptionsText(event.target.value)}
              rows={4}
            />
          </div>
        ) : null}
        <button
          type="button"
          className="btn btn--primary"
          disabled={saving || !key.trim() || !label.trim()}
          onClick={() => void createType()}
        >
          Create type
        </button>
      </section>
    </div>
  );
}

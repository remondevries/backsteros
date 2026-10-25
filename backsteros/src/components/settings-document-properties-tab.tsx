import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { ApiClientError } from "@backsteros/api-client";
import type {
  DocumentPropertyType,
  DocumentPropertyTypeKind,
} from "@backsteros/contracts";
import { DOCUMENT_PROPERTY_TYPE_KINDS } from "@backsteros/contracts";
import { SearchableDropdown } from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import { useDocumentPropertyTypes } from "../lib/use-document-property-types";

type Box = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

function boxOf(element: HTMLElement): Box {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function kindLabel(kind: DocumentPropertyTypeKind): string {
  if (kind === "multi-select") return "Multi-select";
  if (kind === "task") return "Task";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

const KIND_OPTIONS = DOCUMENT_PROPERTY_TYPE_KINDS.map((entry) => ({
  value: entry,
  label: kindLabel(entry),
}));

function statusLabel(type: DocumentPropertyType): string {
  if (type.status === "proposed") return "Proposed";
  if (type.status === "rejected") return "Rejected";
  if (type.seeded) return "Core";
  return "Active";
}

function formatCreated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime()) || date.getFullYear() < 2000) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function byName(a: DocumentPropertyType, b: DocumentPropertyType): number {
  return a.label.localeCompare(b.label);
}

function matchesQuery(type: DocumentPropertyType, query: string): boolean {
  if (!query) return true;
  return (
    type.label.toLowerCase().includes(query) ||
    type.key.toLowerCase().includes(query) ||
    kindLabel(type.kind).toLowerCase().includes(query)
  );
}

function Floating({
  box,
  align,
  className,
  children,
}: {
  box: Box;
  align: "start" | "end";
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    top: box.bottom + 6,
    left: align === "start" ? box.left : box.right,
    zIndex: 40,
  });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    let top = box.bottom + 6;
    if (top + rect.height > window.innerHeight - 8) {
      top = Math.max(8, box.top - 6 - rect.height);
    }
    let left = align === "start" ? box.left : box.right - rect.width;
    if (left + rect.width > window.innerWidth - 8) {
      left = window.innerWidth - 8 - rect.width;
    }
    if (left < 8) left = 8;
    setStyle({ position: "fixed", top, left, zIndex: 40 });
  }, [align, box]);

  return (
    <div ref={ref} className={className} style={style} data-doc-prop-popover="">
      {children}
    </div>
  );
}

export function SettingsDocumentPropertiesTab() {
  const { client } = useDesktopApi();
  const { types, reload } = useDocumentPropertyTypes();
  const [query, setQuery] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<DocumentPropertyTypeKind>("text");
  const [optionsText, setOptionsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [menu, setMenu] = useState<{ id: string; box: Box } | null>(null);
  const cancelEdit = useRef(false);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = types
      .filter((type) => type.status !== "rejected")
      .filter((type) => matchesQuery(type, needle))
      .slice()
      .sort((a, b) => {
        if (a.status === "proposed" && b.status !== "proposed") return -1;
        if (b.status === "proposed" && a.status !== "proposed") return 1;
        return byName(a, b);
      });
    return visible;
  }, [query, types]);

  useEffect(() => {
    if (!menu) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-doc-prop-popover]")) return;
      setMenu(null);
    }
    function close() {
      setMenu(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  function openComposer() {
    setComposerOpen(true);
    setKey("");
    setLabel("");
    setKind("text");
    setOptionsText("");
    setMenu(null);
    setError(null);
  }

  function commitRename(type: DocumentPropertyType) {
    if (cancelEdit.current) {
      cancelEdit.current = false;
      return;
    }
    const next = renameDraft.trim().replace(/\s+/g, " ");
    setRenamingId(null);
    if (!next || next === type.label) return;
    void patchType(type, { label: next });
  }

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
      setComposerOpen(false);
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

  async function approveType(type: DocumentPropertyType) {
    setError(null);
    try {
      await client.requestJson(
        `/api/v1/document-property-types/${encodeURIComponent(type.id)}/approve`,
        { method: "POST" },
      );
      await reload();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not approve type.",
      );
    }
  }

  async function rejectType(type: DocumentPropertyType) {
    setError(null);
    try {
      await client.requestJson(
        `/api/v1/document-property-types/${encodeURIComponent(type.id)}/reject`,
        { method: "POST" },
      );
      await reload();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not reject type.",
      );
    }
  }

  async function removeType(type: DocumentPropertyType, confirm = false) {
    setError(null);
    try {
      const queryParam = confirm ? "?confirm=true" : "";
      await client.requestJson(
        `/api/v1/document-property-types/${encodeURIComponent(type.id)}${queryParam}`,
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

  const menuType = menu
    ? types.find((entry) => entry.id === menu.id) ?? null
    : null;

  return (
    <div className="task-label-settings">
      <div className="task-label-settings__toolbar">
        <label className="task-label-settings__filter">
          <SearchIcon />
          <input
            type="search"
            value={query}
            placeholder="Filter by name…"
            aria-label="Filter by name"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="task-label-settings__actions">
          <button
            type="button"
            className="task-label-settings__button task-label-settings__button--primary"
            disabled={saving}
            onClick={() => openComposer()}
          >
            New type
          </button>
        </div>
      </div>

      {error ? <p className="task-label-settings__error">{error}</p> : null}

      <form
        id="document-property-composer"
        className="task-label-settings__composer-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!key.trim() || !label.trim()) return;
          void createType();
        }}
      />

      <table className="task-label-table">
        <thead>
          <tr>
            <th scope="col">
              Name <span aria-hidden="true">↓</span>
            </th>
            <th scope="col">Key</th>
            <th scope="col">Kind</th>
            <th scope="col">Status</th>
            <th scope="col">Created</th>
            <th scope="col" className="task-label-table__menu-col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {composerOpen ? (
            <>
              <tr className="task-label-table__composer-row">
                <td>
                  <div className="task-label-table__name">
                    <input
                      form="document-property-composer"
                      className="task-label-table__edit"
                      autoFocus
                      value={label}
                      disabled={saving}
                      placeholder="Label"
                      aria-label="Label"
                      onChange={(event) => setLabel(event.target.value)}
                    />
                  </div>
                </td>
                <td>
                  <input
                    form="document-property-composer"
                    className="task-label-table__edit"
                    value={key}
                    disabled={saving}
                    placeholder="Key (camelCase)"
                    aria-label="Key"
                    onChange={(event) => setKey(event.target.value)}
                  />
                </td>
                <td className="task-label-table__kind">
                  <SearchableDropdown
                    value={kind}
                    options={KIND_OPTIONS}
                    disabled={saving}
                    searchPlaceholder="Filter kinds…"
                    ariaLabel="Kind"
                    triggerClassName="task-label-table__kind-trigger"
                    onChange={setKind}
                  />
                </td>
                <td
                  colSpan={3}
                  className="task-label-table__composer-actions-cell"
                >
                  <div className="task-label-table__composer-actions">
                    <button
                      form="document-property-composer"
                      type="submit"
                      className="task-label-settings__button task-label-settings__button--primary"
                      disabled={saving || !key.trim() || !label.trim()}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      className="task-label-settings__button"
                      disabled={saving}
                      onClick={() => setComposerOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
              {kind === "select" || kind === "multi-select" ? (
                <tr className="task-label-table__composer-row">
                  <td colSpan={6}>
                    <textarea
                      form="document-property-composer"
                      className="task-label-settings__composer-options"
                      value={optionsText}
                      disabled={saving}
                      placeholder="Options — one per line, value|Label"
                      aria-label="Options"
                      rows={3}
                      onChange={(event) => setOptionsText(event.target.value)}
                    />
                  </td>
                </tr>
              ) : null}
            </>
          ) : null}
          {!composerOpen && rows.length === 0 ? (
            <tr>
              <td className="task-label-table__empty" colSpan={6}>
                {types.filter((type) => type.status !== "rejected").length === 0
                  ? "No property types yet."
                  : "No types match that filter."}
              </td>
            </tr>
          ) : null}
          {rows.map((type) => {
            const renaming = renamingId === type.id;
            return (
              <tr
                key={type.id}
                className={
                  type.status === "proposed" ? "is-proposed" : undefined
                }
              >
                <td>
                  <div className="task-label-table__name">
                    {renaming ? (
                      <input
                        className="task-label-table__edit"
                        autoFocus
                        value={renameDraft}
                        disabled={saving}
                        aria-label={`Rename ${type.label}`}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onBlur={() => commitRename(type)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.currentTarget.blur();
                          }
                          if (event.key === "Escape") {
                            cancelEdit.current = true;
                            setRenamingId(null);
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="task-label-table__name-text"
                        onClick={() => {
                          cancelEdit.current = false;
                          setRenamingId(type.id);
                          setRenameDraft(type.label);
                          setMenu(null);
                        }}
                      >
                        {type.label}
                      </button>
                    )}
                  </div>
                </td>
                <td className="task-label-table__meta">
                  <code className="task-label-table__key">{type.key}</code>
                </td>
                <td className="task-label-table__kind">
                  <SearchableDropdown
                    value={type.kind}
                    options={KIND_OPTIONS}
                    disabled={saving}
                    searchPlaceholder="Filter kinds…"
                    ariaLabel={`Kind for ${type.label}`}
                    triggerClassName="task-label-table__kind-trigger"
                    onChange={(next) => {
                      if (next === type.kind) return;
                      void patchType(type, {
                        kind: next,
                        multiple: next === "multi-select",
                      });
                    }}
                  />
                </td>
                <td>
                  <span
                    className={[
                      "task-label-table__status",
                      type.status === "proposed"
                        ? "task-label-table__status--proposed"
                        : type.seeded
                          ? "task-label-table__status--core"
                          : "task-label-table__status--active",
                    ].join(" ")}
                  >
                    {statusLabel(type)}
                  </span>
                </td>
                <td className="task-label-table__meta">
                  {formatCreated(type.createdAt)}
                </td>
                <td className="task-label-table__menu-col">
                  <button
                    type="button"
                    className="task-label-table__more"
                    aria-label={`${type.label} actions`}
                    data-doc-prop-popover=""
                    onClick={(event) => {
                      const box = boxOf(event.currentTarget);
                      setMenu((current) =>
                        current?.id === type.id ? null : { id: type.id, box },
                      );
                    }}
                  >
                    <EllipsisIcon />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {menu && menuType ? (
        <Floating box={menu.box} align="end" className="task-label-table__menu">
          <button
            type="button"
            onClick={() => {
              cancelEdit.current = false;
              setRenamingId(menuType.id);
              setRenameDraft(menuType.label);
              setMenu(null);
            }}
          >
            Rename
          </button>
          {menuType.status === "proposed" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setMenu(null);
                  void approveType(menuType);
                }}
              >
                Approve
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={() => {
                  setMenu(null);
                  void rejectType(menuType);
                }}
              >
                Reject
              </button>
            </>
          ) : (
            <button
              type="button"
              className="is-danger"
              onClick={() => {
                setMenu(null);
                if (
                  !window.confirm(
                    menuType.seeded
                      ? `Remove core type “${menuType.label}”?`
                      : `Remove “${menuType.label}”?`,
                  )
                ) {
                  return;
                }
                void removeType(menuType);
              }}
            >
              Remove
            </button>
          )}
        </Floating>
      ) : null}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M9.2 9.2 12 12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EllipsisIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="7" r="1.15" />
      <circle cx="7" cy="7" r="1.15" />
      <circle cx="11" cy="7" r="1.15" />
    </svg>
  );
}

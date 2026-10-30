"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  buildContactDropdownOptions,
  DROPDOWN_NONE_VALUE,
  type AssigneeDropdownContact,
} from "../dropdowns/dropdown-options.js";
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from "../dropdowns/searchable-dropdown.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { ApplicationsIcon } from "../icons/applications-icon.js";
import { ContactsSyncIcon } from "../icons/contacts-sync-icon.js";
import { LaptopIcon } from "../icons/laptop-icon.js";
import { TvIcon } from "../icons/tv-icon.js";
import {
  SegmentedPillToggle,
  type SegmentedPillToggleOption,
} from "../list-nav/list-board-view-shell.js";
import { PolishedCheckbox } from "../shared/polished-checkbox.js";
import { formatRelativeAgeLabel } from "../../shared/format-relative-age.js";
import { ApiKeyDetailView } from "./api-key-detail-view.js";
import {
  AGENT_API_KEY_SCOPES,
  AGENT_KEY_SCOPES,
  classifyApiKeyType,
  scopesForApiKeyTab,
  type ApiKeyTypeTab,
} from "./api-key-type.js";
import { SettingsContentHeader } from "./settings-content-header.js";

export {
  AGENT_API_KEY_SCOPES,
  AGENT_KEY_SCOPES,
  APPLICATION_API_KEY_SCOPE,
  CARDDAV_API_KEY_SCOPE,
  TV_API_KEY_SCOPE,
  classifyApiKeyType,
  type ApiKeyTypeTab,
} from "./api-key-type.js";

export type SettingsApiKeyItem = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  contactId: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedAddress: string | null;
  createdAt: string;
  /** Full secret can be revealed for copy (new keys with ciphertext). */
  hasRecoverableSecret?: boolean;
};

export type SettingsApiKeyAuditLogItem = {
  id: string;
  apiKeyId: string | null;
  apiKeyName: string;
  action: "created" | "revoked" | "rotated" | "expiry_updated";
  actorKind: string | null;
  address: string | null;
  createdAt: string;
};

export type SettingsApiKeyRequestLogItem = {
  id: string;
  apiKeyId: string | null;
  apiKeyName: string;
  method: string;
  path: string;
  status: number;
  address: string | null;
  createdAt: string;
};

type SettingsApiKeyActivityItem =
  | ({ kind: "lifecycle" } & SettingsApiKeyAuditLogItem)
  | ({ kind: "request" } & SettingsApiKeyRequestLogItem);

export type SettingsApiKeyContactOption = AssigneeDropdownContact;

export type ApiKeyExpiryPreset = "never" | "30d" | "90d" | "1y";

export type ApiKeysSettingsPanel = "keys" | "logs";

/** Non-agent key kinds kept reachable while Agents is the primary API surface (OS-154). */
export const PARKED_API_KEY_TABS: readonly ApiKeyTypeTab[] = [
  "access",
  "applications",
  "tv",
  "carddav",
] as const;

export type ApiKeysSettingsSectionViewProps = {
  title?: string;
  description?: string;
  apiKeys: SettingsApiKeyItem[];
  auditLogs?: SettingsApiKeyAuditLogItem[];
  requestLogs?: SettingsApiKeyRequestLogItem[];
  contacts?: SettingsApiKeyContactOption[];
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  /**
   * OS-154: hide nested Agent/Applications/… pills and Keys|Logs pills.
   * Shows a flat list of non-agent keys; create picks kind from a dropdown.
   * Logs stay reachable via a plain header link.
   */
  flattenChrome?: boolean;
  /** Reveal full secret for copy; null if unavailable (legacy keys need rotate). */
  onRevealSecret?: (id: string) => Promise<string | null>;
  onCreate?: (
    name: string,
    contactId: string | null,
    expiresAt: string | null,
    scopes: readonly string[],
    kind: ApiKeyTypeTab,
  ) => Promise<{ id: string; secret: string } | null>;
  onRename?: (id: string, name: string) => Promise<boolean>;
  onSetContact?: (id: string, contactId: string | null) => Promise<boolean>;
  onSetExpiry?: (id: string, expiresAt: string | null) => Promise<boolean>;
  onRotate?: (id: string) => Promise<string | null>;
  onRevoke?: (id: string) => Promise<boolean>;
};

function ApiKeyEditIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M14.678 3.272a3.483 3.483 0 0 1 4.928-.001l1.127 1.127a3.483 3.483 0 0 1 0 4.925L9.33 20.729a3.48 3.48 0 0 1-2.463 1.021H3a.75.75 0 0 1-.75-.75v-3.844a3.48 3.48 0 0 1 1.019-2.461zm3.867 1.06a1.983 1.983 0 0 0-2.806 0l-.896.897 3.931 3.931.898-.898a1.983 1.983 0 0 0 0-2.804z" />
    </svg>
  );
}

function ApiKeyRefreshIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75a9.72 9.72 0 0 0 6.894-2.856.75.75 0 0 0-1.06-1.06A8.25 8.25 0 1 1 12 3.75c2.556 0 4.422 1.168 6.168 2.833L16.25 8.5c0 .414.336.75.75.75h4a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 0-.75-.75l-1.77 1.77c-1.9-1.815-4.135-3.27-7.23-3.27" />
    </svg>
  );
}

function ApiKeyDeleteIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m15.241 3.721.293 2.029H19.5a.75.75 0 0 1 0 1.5h-.769l-.873 10.185c-.053.62-.096 1.13-.165 1.542-.07.429-.177.813-.386 1.169a3.25 3.25 0 0 1-1.401 1.287c-.372.177-.764.25-1.198.284-.417.033-.928.033-1.55.033h-2.316c-.622 0-1.133 0-1.55-.033-.434-.034-.826-.107-1.198-.284a3.25 3.25 0 0 1-1.401-1.287c-.21-.356-.315-.74-.386-1.169-.069-.413-.112-.922-.165-1.542L5.269 7.25H4.5a.75.75 0 0 1 0-1.5h3.966l.293-2.029.011-.061c.182-.79.86-1.41 1.71-1.41h3.04c.85 0 1.528.62 1.71 1.41zM9.981 5.75h4.037l-.256-1.776c-.048-.167-.17-.224-.243-.224h-3.038c-.073 0-.195.057-.243.224zm1.269 4.75a.75.75 0 0 0-1.5 0v5a.75.75 0 0 0 1.5 0zm3 0a.75.75 0 0 0-1.5 0v5a.75.75 0 0 0 1.5 0z" />
    </svg>
  );
}

function ApiKeyCopyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8.354 4.25a2.75 2.75 0 0 1 2.646-2h2a2.75 2.75 0 0 1 2.646 2H17A2.75 2.75 0 0 1 19.75 7v12A2.75 2.75 0 0 1 17 21.75H7A2.75 2.75 0 0 1 4.25 19V7A2.75 2.75 0 0 1 7 4.25zM11 3.75c-.69 0-1.25.56-1.25 1.25v1.25h4.5V5c0-.69-.56-1.25-1.25-1.25z" />
    </svg>
  );
}

function ApiKeyCopiedIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18.577 6.183a1 1 0 0 1 .24 1.394l-5.666 8.02c-.36.508-.665.94-.94 1.269-.287.34-.61.658-1.038.86a2.83 2.83 0 0 1-2.03.153c-.456-.137-.82-.406-1.149-.702-.315-.285-.672-.668-1.09-1.116l-1.635-1.753a1 1 0 1 1 1.462-1.364l1.606 1.722c.455.487.754.806.998 1.027.24.216.344.259.385.271.196.06.405.045.598-.046.046-.022.149-.085.36-.338.216-.257.473-.62.863-1.171l5.642-7.986a1 1 0 0 1 1.394-.24" />
    </svg>
  );
}

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const time = Date.parse(expiresAt);
  return Number.isFinite(time) && time <= Date.now();
}

export function expiryPresetToIso(preset: ApiKeyExpiryPreset): string | null {
  if (preset === "never") return null;
  const days = preset === "30d" ? 30 : preset === "90d" ? 90 : 365;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** @deprecated Kept for callers; display now uses `prefix…` ellipsis. */
export const API_KEY_SECRET_DISPLAY_LENGTH = 40;

/** Show the stored prefix with an ellipsis — the rest of the secret isn’t listed. */
export function formatMaskedApiKey(prefix: string): string {
  const visible = prefix.trim();
  if (!visible) return "…";
  return `${visible}…`;
}

function tabLabel(tab: ApiKeyTypeTab): string {
  switch (tab) {
    case "agent":
      return "Agent";
    case "access":
      return "Access";
    case "applications":
      return "Applications";
    case "tv":
      return "TV";
    case "carddav":
      return "Contacts sync";
  }
}

function identityColumnLabel(tab: ApiKeyTypeTab): string {
  switch (tab) {
    case "agent":
      return "Contact";
    case "access":
      return "Name";
    case "applications":
      return "Application";
    case "tv":
      return "TV";
    case "carddav":
      return "Device";
  }
}

function ApiKeyContactDropdown({
  value,
  options,
  disabled,
  ariaLabel,
  searchPlaceholder,
  onChange,
}: {
  value: string | null;
  options: SearchableDropdownOption<string>[];
  disabled?: boolean;
  ariaLabel: string;
  searchPlaceholder: string;
  onChange: (contactId: string | null) => void;
}) {
  return (
    <SearchableDropdown
      value={value ?? DROPDOWN_NONE_VALUE}
      options={options}
      onChange={(next) => {
        onChange(next === DROPDOWN_NONE_VALUE ? null : next);
      }}
      disabled={disabled}
      searchPlaceholder={searchPlaceholder}
      ariaLabel={ariaLabel}
    />
  );
}

const API_KEY_EXPIRY_PRESET_OPTIONS: SearchableDropdownOption<ApiKeyExpiryPreset>[] =
  [
    { value: "never", label: "Never" },
    { value: "30d", label: "30 days from now" },
    { value: "90d", label: "90 days from now" },
    { value: "1y", label: "1 year from now" },
  ];

function ApiKeyExpiryDropdown({
  expiresAt,
  disabled,
  ariaLabel,
  onChange,
}: {
  expiresAt: string | null;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (expiresAt: string | null) => void;
}) {
  const options = useMemo(() => {
    const next: SearchableDropdownOption<string>[] = [
      ...API_KEY_EXPIRY_PRESET_OPTIONS,
    ];
    if (expiresAt) {
      next.push({
        value: "custom",
        label: formatDateTime(expiresAt),
      });
    }
    return next;
  }, [expiresAt]);

  return (
    <SearchableDropdown
      value={expiresAt ? "custom" : "never"}
      options={options}
      onChange={(next) => {
        if (next === "custom") return;
        onChange(expiryPresetToIso(next as ApiKeyExpiryPreset));
      }}
      disabled={disabled}
      searchPlaceholder="Set expiry…"
      ariaLabel={ariaLabel}
      className="api-key-expiry-dropdown"
      panelWidth={240}
    />
  );
}

function ApiKeyExpiryPresetDropdown({
  value,
  disabled,
  ariaLabel,
  onChange,
}: {
  value: ApiKeyExpiryPreset;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (value: ApiKeyExpiryPreset) => void;
}) {
  return (
    <SearchableDropdown
      value={value}
      options={API_KEY_EXPIRY_PRESET_OPTIONS}
      onChange={(next) => onChange(next)}
      disabled={disabled}
      searchPlaceholder="Set expiry…"
      ariaLabel={ariaLabel}
      className="api-key-expiry-dropdown"
      panelWidth={240}
    />
  );
}

function ApiKeyDeleteConfirmModal({
  keyName,
  deleting = false,
  error = null,
  onConfirm,
  onCancel,
}: {
  keyName: string;
  deleting?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (!deleting) onCancel();
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [deleting, onCancel]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="entity-delete-modal-root"
      data-blocking-modal=""
      data-entity-delete-modal=""
    >
      <button
        type="button"
        aria-label="Cancel delete"
        className="entity-delete-modal-backdrop"
        disabled={deleting}
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="entity-delete-modal"
      >
        <h2 id={titleId} className="entity-delete-modal-title">
          Delete API key {keyName}?
        </h2>
        <p className="entity-delete-modal-body">
          This key will stop working immediately. Any agents or devices using it
          will lose access. This cannot be undone.
        </p>
        {error ? (
          <p className="entity-delete-modal-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="entity-delete-modal-actions">
          <button
            type="button"
            disabled={deleting}
            onClick={onCancel}
            className="entity-delete-modal-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onConfirm}
            className="entity-delete-modal-confirm"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ApiKeyRow({
  apiKey,
  contacts,
  expanded,
  onToggleExpanded,
  pendingSecret,
  onDismissPendingSecret,
  onRevealSecret,
  onRename,
  onSetContact,
  onSetExpiry,
  onRotate,
  onRevoke,
}: {
  apiKey: SettingsApiKeyItem;
  contacts: SettingsApiKeyContactOption[];
  expanded: boolean;
  onToggleExpanded: () => void;
  pendingSecret?: string | null;
  onDismissPendingSecret?: () => void;
  onRevealSecret?: (id: string) => Promise<string | null>;
  onRename?: (id: string, name: string) => Promise<boolean>;
  onSetContact?: (id: string, contactId: string | null) => Promise<boolean>;
  onSetExpiry?: (id: string, expiresAt: string | null) => Promise<boolean>;
  onRotate?: (id: string) => Promise<string | null>;
  onRevoke?: (id: string) => Promise<boolean>;
}) {
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotatedSecret, setRotatedSecret] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [prefixCopied, setPrefixCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [name, setName] = useState(apiKey.name);
  const [renaming, setRenaming] = useState(false);
  const nameRef = useRef(name);
  const renamingRef = useRef(false);
  const wasExpandedRef = useRef(expanded);
  const expired = isExpired(apiKey.expiresAt);
  const contact = contacts.find((entry) => entry.id === apiKey.contactId);
  const keyType = classifyApiKeyType(apiKey);
  const showContactEdit =
    expanded && keyType === "agent" && contacts.length > 0 && Boolean(onSetContact);
  const showNameEdit = expanded && keyType !== "agent" && Boolean(onRename);
  const contactOptions = useMemo(
    () =>
      buildContactDropdownOptions(contacts).filter(
        (option) => option.value !== DROPDOWN_NONE_VALUE,
      ),
    [contacts],
  );
  const freshSecret = pendingSecret ?? rotatedSecret;
  const maskedKey = freshSecret ?? formatMaskedApiKey(apiKey.prefix);

  nameRef.current = name;
  renamingRef.current = renaming;

  useEffect(() => {
    setName(apiKey.name);
  }, [apiKey.name]);

  useEffect(() => {
    if (!prefixCopied) return;
    const timer = window.setTimeout(() => setPrefixCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [prefixCopied]);

  async function saveName(nextValue?: string) {
    if (!onRename || renamingRef.current) return;
    const nextName = (nextValue ?? nameRef.current).trim();
    if (!nextName) {
      setName(apiKey.name);
      return;
    }
    if (nextName === apiKey.name) return;
    setRenaming(true);
    setRowError(null);
    const ok = await onRename(apiKey.id, nextName);
    setRenaming(false);
    if (!ok) {
      setName(apiKey.name);
      setRowError("Couldn’t rename this key. Try again.");
    }
  }

  const saveNameRef = useRef(saveName);
  saveNameRef.current = saveName;

  // Auto-save name while typing — no Save button in the row.
  useEffect(() => {
    if (!showNameEdit || !onRename) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === apiKey.name) return;
    const timer = window.setTimeout(() => {
      void saveNameRef.current(trimmed);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [name, showNameEdit, apiKey.name, apiKey.id, onRename]);

  // Flush pending name when collapsing edit mode.
  useEffect(() => {
    const wasExpanded = wasExpandedRef.current;
    wasExpandedRef.current = expanded;
    if (wasExpanded && !expanded && keyType !== "agent") {
      void saveNameRef.current();
    }
  }, [expanded, keyType]);

  async function changeContact(contactId: string | null) {
    // Agent keys always require a contact; name follows that contact.
    if (!onSetContact || !contactId) return;
    const nextContact = contacts.find((entry) => entry.id === contactId);
    const nextName = nextContact?.name.trim() ?? "";
    setRowError(null);
    const ok = await onSetContact(apiKey.id, contactId);
    if (!ok) {
      setRowError("Couldn’t update the contact for this key. Try again.");
      return;
    }
    if (nextName && nextName !== apiKey.name && onRename) {
      setRenaming(true);
      const renamed = await onRename(apiKey.id, nextName);
      setRenaming(false);
      if (!renamed) {
        setRowError("Couldn’t rename this key to match the contact. Try again.");
      } else {
        setName(nextName);
      }
    }
  }

  async function changeExpiry(expiresAt: string | null) {
    if (!onSetExpiry) return;
    setRowError(null);
    const ok = await onSetExpiry(apiKey.id, expiresAt);
    if (!ok) {
      setRowError("Couldn’t update expiry for this key. Try again.");
    }
  }

  async function copyApiKey() {
    if (copying) return;
    setCopying(true);
    setRowError(null);
    try {
      if (freshSecret) {
        await navigator.clipboard.writeText(freshSecret);
        setPrefixCopied(true);
        return;
      }
      if (!onRevealSecret) {
        setRowError(
          "Full key isn’t available to copy. Rotate this key to store a recoverable secret.",
        );
        return;
      }
      const secret = await onRevealSecret(apiKey.id);
      if (!secret) {
        setRowError(
          "Full key isn’t stored for this key yet. Rotate it once, then copy the new secret.",
        );
        return;
      }
      await navigator.clipboard.writeText(secret);
      setPrefixCopied(true);
    } catch {
      setRowError("Couldn’t copy this key. Try again.");
    } finally {
      setCopying(false);
    }
  }

  function dismissFreshSecret() {
    if (pendingSecret) onDismissPendingSecret?.();
    if (rotatedSecret) setRotatedSecret(null);
  }

  async function revokeKey() {
    if (!onRevoke) return;
    setRevoking(true);
    setRowError(null);
    const ok = await onRevoke(apiKey.id);
    setRevoking(false);
    if (ok) {
      setConfirmRevoke(false);
    } else {
      setRowError("Couldn’t delete this key. Try again.");
    }
  }

  async function rotateKey() {
    if (!onRotate) return;
    setRotating(true);
    setRowError(null);
    const secret = await onRotate(apiKey.id);
    setRotating(false);
    if (secret) {
      setRotatedSecret(secret);
      setConfirmRotate(false);
    } else {
      setRowError("Couldn’t refresh this key. Try again.");
    }
  }

  const rowClassName = [
    "api-key-table-row",
    expired ? "api-key-table-row-expired" : "",
    expanded ? "api-key-table-row--expanded" : "",
    freshSecret ? "api-key-table-row--fresh-secret" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Fragment>
      <tr
        className={rowClassName}
        role={freshSecret ? "status" : undefined}
      >
        <td>
          <div className="api-key-table-identity">
            {expanded ? null : (
              <span
                className={
                  keyType === "applications"
                    ? "api-key-table-avatar api-key-table-avatar--applications"
                    : keyType === "access"
                      ? "api-key-table-avatar api-key-table-avatar--access"
                      : keyType === "tv"
                        ? "api-key-table-avatar api-key-table-avatar--tv"
                        : keyType === "carddav"
                          ? "api-key-table-avatar api-key-table-avatar--carddav"
                          : "api-key-table-avatar"
                }
                aria-hidden="true"
              >
                {keyType === "tv" ? (
                  <TvIcon size={20} />
                ) : keyType === "carddav" ? (
                  <ContactsSyncIcon size={20} />
                ) : keyType === "applications" ? (
                  <ApplicationsIcon size={20} />
                ) : keyType === "access" ? (
                  <LaptopIcon size={20} />
                ) : (
                  <EntityAvatarIcon
                    src={contact?.avatarSrc}
                    size={36}
                    kind="contact"
                  />
                )}
              </span>
            )}
            <div className="api-key-table-identity-copy">
              {expanded ? (
                <div className="api-key-name-edit-row">
                  {showContactEdit ? (
                    <ApiKeyContactDropdown
                      value={apiKey.contactId}
                      options={contactOptions}
                      ariaLabel={`Contact for ${apiKey.name}`}
                      searchPlaceholder="Set contact…"
                      onChange={(next) => void changeContact(next)}
                    />
                  ) : null}
                  {showNameEdit ? (
                    <input
                      className="api-key-name-input"
                      value={name}
                      disabled={!onRename}
                      onChange={(event) => setName(event.target.value)}
                      onBlur={() => void saveName()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void saveName();
                          (event.currentTarget as HTMLInputElement).blur();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setName(apiKey.name);
                          (event.currentTarget as HTMLInputElement).blur();
                        }
                      }}
                      aria-label="API key name"
                      autoComplete="off"
                    />
                  ) : null}
                </div>
              ) : (
                <strong className="api-key-name">
                  {apiKey.name}
                  {expired ? (
                    <span className="api-key-expired-badge">Expired</span>
                  ) : null}
                </strong>
              )}
              {!expanded || freshSecret ? (
                <div
                  className={
                    prefixCopied
                      ? "api-key-prefix-row api-key-prefix-row--copied"
                      : "api-key-prefix-row"
                  }
                >
                  <button
                    type="button"
                    className={
                      freshSecret
                        ? "api-key-prefix api-key-prefix--fresh-secret"
                        : "api-key-prefix"
                    }
                    aria-label={prefixCopied ? "Copied" : "Copy API key"}
                    title={prefixCopied ? "Copied" : "Copy API key"}
                    disabled={copying}
                    onClick={() => void copyApiKey()}
                  >
                    {maskedKey}
                  </button>
                  <button
                    type="button"
                    className="api-key-prefix-copy"
                    aria-label={prefixCopied ? "Copied" : "Copy API key"}
                    title={prefixCopied ? "Copied" : "Copy API key"}
                    tabIndex={-1}
                    disabled={copying}
                    onClick={() => void copyApiKey()}
                  >
                    {prefixCopied ? <ApiKeyCopiedIcon /> : <ApiKeyCopyIcon />}
                  </button>
                  {freshSecret ? (
                    <button
                      type="button"
                      className="api-key-dismiss-secret"
                      onClick={dismissFreshSecret}
                    >
                      Done
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          {rowError ? (
            <p className="api-key-row-error" role="alert">
              {rowError}
            </p>
          ) : null}
        </td>
        <td>
          {expanded && onSetExpiry ? (
            <ApiKeyExpiryDropdown
              expiresAt={apiKey.expiresAt}
              ariaLabel={`Expiry for ${apiKey.name}`}
              onChange={(next) => void changeExpiry(next)}
            />
          ) : (
            <span className="api-key-table-muted">
              {apiKey.expiresAt ? formatDateTime(apiKey.expiresAt) : "Never"}
            </span>
          )}
        </td>
        <td>
          <span className="api-key-table-muted">
            {formatDateTime(apiKey.createdAt)}
          </span>
        </td>
        <td>
          <span className="api-key-table-muted">
            {apiKey.lastUsedAt
              ? formatDateTime(apiKey.lastUsedAt)
              : "Never"}
          </span>
        </td>
        <td>
          <div className="api-key-row-actions">
            {confirmRotate ? (
              <>
                <span className="api-key-revoke-prompt">
                  Refresh? Old secret stops working.
                </span>
                <button
                  type="button"
                  className="api-key-action-btn"
                  disabled={rotating}
                  onClick={() => void rotateKey()}
                >
                  {rotating ? "Refreshing…" : "Refresh"}
                </button>
                <button
                  type="button"
                  className="api-key-action-btn"
                  disabled={rotating}
                  onClick={() => setConfirmRotate(false)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="api-key-action-btn api-key-action-btn--icon"
                  aria-label={expanded ? "Hide details" : "Edit"}
                  aria-expanded={expanded}
                  title={expanded ? "Hide details" : "Edit"}
                  onClick={onToggleExpanded}
                >
                  <ApiKeyEditIcon />
                </button>
                <button
                  type="button"
                  className="api-key-action-btn api-key-action-btn--icon"
                  aria-label="Refresh"
                  title="Refresh"
                  disabled={rotating || !onRotate}
                  onClick={() => {
                    setConfirmRevoke(false);
                    setConfirmRotate(true);
                    setRowError(null);
                  }}
                >
                  <ApiKeyRefreshIcon />
                </button>
                <button
                  type="button"
                  className="api-key-action-btn api-key-action-btn--icon api-key-action-btn-danger"
                  aria-label="Delete"
                  title="Delete"
                  disabled={!onRevoke}
                  onClick={() => {
                    setConfirmRotate(false);
                    setConfirmRevoke(true);
                    setRowError(null);
                  }}
                >
                  <ApiKeyDeleteIcon />
                </button>
              </>
            )}
          </div>
          {confirmRevoke ? (
            <ApiKeyDeleteConfirmModal
              keyName={apiKey.name}
              deleting={revoking}
              error={rowError}
              onConfirm={() => void revokeKey()}
              onCancel={() => {
                if (revoking) return;
                setConfirmRevoke(false);
                setRowError(null);
              }}
            />
          ) : null}
        </td>
      </tr>
      {expanded ? (
        <tr className="api-key-table-expand-row">
          <td colSpan={5}>
            <ApiKeyDetailView apiKey={apiKey} embedded />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function auditActionLabel(action: SettingsApiKeyAuditLogItem["action"]): string {
  switch (action) {
    case "created":
      return "Created";
    case "revoked":
      return "Revoked";
    case "rotated":
      return "Rotated";
    case "expiry_updated":
      return "Expiry updated";
  }
}

function mergeApiKeyActivity(
  auditLogs: SettingsApiKeyAuditLogItem[],
  requestLogs: SettingsApiKeyRequestLogItem[],
): SettingsApiKeyActivityItem[] {
  const lifecycle: SettingsApiKeyActivityItem[] = auditLogs.map((entry) => ({
    kind: "lifecycle",
    ...entry,
  }));
  const requests: SettingsApiKeyActivityItem[] = requestLogs.map((entry) => ({
    kind: "request",
    ...entry,
  }));
  return [...lifecycle, ...requests].sort((left, right) => {
    const delta =
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    if (delta !== 0) return delta;
    return right.id.localeCompare(left.id);
  });
}

const TAB_OPTIONS: readonly SegmentedPillToggleOption<ApiKeyTypeTab>[] = [
  { value: "access", label: "Access" },
  { value: "agent", label: "Agent" },
  { value: "applications", label: "Applications" },
  { value: "tv", label: "TV" },
  { value: "carddav", label: "Contacts sync" },
];

const PARKED_TAB_OPTIONS: readonly SegmentedPillToggleOption<ApiKeyTypeTab>[] =
  TAB_OPTIONS.filter((option) => option.value !== "agent");

const PANEL_OPTIONS: readonly SegmentedPillToggleOption<ApiKeysSettingsPanel>[] =
  [
    { value: "keys", label: "API Keys" },
    { value: "logs", label: "Logs" },
  ];

export function ApiKeysSettingsSectionView({
  title,
  description,
  apiKeys,
  auditLogs = [],
  requestLogs = [],
  contacts = [],
  loading = false,
  errorMessage,
  onRetry,
  flattenChrome = false,
  onRevealSecret,
  onCreate,
  onRename,
  onSetContact,
  onSetExpiry,
  onRotate,
  onRevoke,
}: ApiKeysSettingsSectionViewProps) {
  const [panel, setPanel] = useState<ApiKeysSettingsPanel>("keys");
  const [tab, setTab] = useState<ApiKeyTypeTab>("access");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftContactId, setDraftContactId] = useState<string | null>(null);
  const [draftExpiry, setDraftExpiry] = useState<ApiKeyExpiryPreset>("never");
  const [draftScopes, setDraftScopes] = useState<string[]>(() => [
    ...scopesForApiKeyTab("access"),
  ]);
  const [freshSecret, setFreshSecret] = useState<{
    id: string;
    secret: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [auditQuery, setAuditQuery] = useState("");

  const contactOptions = useMemo(
    () => buildContactDropdownOptions(contacts),
    [contacts],
  );

  const keysByTab = useMemo(() => {
    const grouped: Record<ApiKeyTypeTab, SettingsApiKeyItem[]> = {
      agent: [],
      access: [],
      applications: [],
      tv: [],
      carddav: [],
    };
    for (const key of apiKeys) {
      const type = classifyApiKeyType(key);
      if (type) grouped[type].push(key);
    }
    return grouped;
  }, [apiKeys]);

  /** Flat non-agent list when chrome is flattened (OS-154). */
  const filteredKeys = useMemo(() => {
    if (!flattenChrome) return keysByTab[tab];
    return PARKED_API_KEY_TABS.flatMap((kind) => keysByTab[kind]);
  }, [flattenChrome, keysByTab, tab]);

  useEffect(() => {
    if (flattenChrome && tab === "agent") setTab("access");
  }, [flattenChrome, tab]);

  const activityItems = useMemo(
    () => mergeApiKeyActivity(auditLogs, requestLogs),
    [auditLogs, requestLogs],
  );

  const filteredActivity = useMemo(() => {
    const q = auditQuery.trim().toLowerCase();
    if (!q) return activityItems;
    return activityItems.filter((entry) => {
      if (entry.apiKeyName.toLowerCase().includes(q)) return true;
      if (entry.address?.toLowerCase().includes(q)) return true;
      if (entry.kind === "lifecycle") {
        return (
          entry.action.toLowerCase().includes(q) ||
          (entry.actorKind?.toLowerCase().includes(q) ?? false) ||
          auditActionLabel(entry.action).toLowerCase().includes(q)
        );
      }
      return (
        entry.method.toLowerCase().includes(q) ||
        entry.path.toLowerCase().includes(q) ||
        String(entry.status).includes(q)
      );
    });
  }, [activityItems, auditQuery]);

  useEffect(() => {
    setDraftScopes([...scopesForApiKeyTab(tab)]);
    setDraftContactId(null);
    setCreateError(null);
    setExpandedId(null);
  }, [tab]);

  useEffect(() => {
    if (expandedId && !filteredKeys.some((key) => key.id === expandedId)) {
      setExpandedId(null);
    }
  }, [expandedId, filteredKeys]);

  function toggleAgentScope(scope: string) {
    setDraftScopes((current) =>
      current.includes(scope)
        ? current.filter((entry) => entry !== scope)
        : [...current, scope],
    );
  }

  async function createKey() {
    if (!onCreate) return;

    // Access keys always mint the full owner set — never a scoped-down subset.
    // Agent scopes never include settings:write (server also strips it).
    const scopes =
      tab === "agent"
        ? draftScopes.filter((scope) =>
            AGENT_KEY_SCOPES.includes(scope as (typeof AGENT_KEY_SCOPES)[number]),
          )
        : tab === "access"
          ? [...AGENT_API_KEY_SCOPES]
          : [...scopesForApiKeyTab(tab)];

    let name = draft.trim();
    if (tab === "agent") {
      if (!draftContactId) {
        setCreateError("Agent keys require a contact.");
        return;
      }
      if (scopes.length === 0) {
        setCreateError("Pick at least one scope.");
        return;
      }
      const contactName = contacts
        .find((entry) => entry.id === draftContactId)
        ?.name.trim();
      if (!contactName) {
        setCreateError("Pick a contact with a name.");
        return;
      }
      name = contactName;
    } else if (!name) {
      return;
    }

    setSaving(true);
    setCreateError(null);
    const created = await onCreate(
      name,
      tab === "agent" ? draftContactId : null,
      expiryPresetToIso(draftExpiry),
      scopes,
      tab,
    );
    setSaving(false);
    if (created) {
      setFreshSecret(created);
      setDraft("");
      setDraftContactId(null);
      setDraftExpiry("never");
      setDraftScopes([...scopesForApiKeyTab(tab)]);
      setCreateOpen(false);
      setExpandedId(null);
    } else {
      setCreateError("Couldn’t create this key. Try again.");
    }
  }

  return (
    <div
      className={
        panel === "logs"
          ? "settings-api-keys settings-api-keys--logs-fill"
          : "settings-api-keys"
      }
    >
      {title && description ? (
        <SettingsContentHeader
          title={title}
          description={description}
          hideRule
          trailing={
            flattenChrome ? (
              <div className="api-keys-plain-switch" role="group" aria-label="API keys or audit log">
                <button
                  type="button"
                  className={
                    panel === "keys"
                      ? "button-link api-keys-plain-switch__active"
                      : "button-link"
                  }
                  onClick={() => {
                    setPanel("keys");
                    setFreshSecret(null);
                    setCreateOpen(false);
                    setCreateError(null);
                    setExpandedId(null);
                  }}
                >
                  Keys
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  className={
                    panel === "logs"
                      ? "button-link api-keys-plain-switch__active"
                      : "button-link"
                  }
                  onClick={() => {
                    setPanel("logs");
                    setFreshSecret(null);
                    setCreateOpen(false);
                    setCreateError(null);
                    setExpandedId(null);
                  }}
                >
                  Logs
                </button>
              </div>
            ) : (
              <SegmentedPillToggle
                value={panel}
                options={PANEL_OPTIONS}
                onChange={(next) => {
                  setPanel(next);
                  setFreshSecret(null);
                  setCreateOpen(false);
                  setCreateError(null);
                  setExpandedId(null);
                }}
                ariaLabel="API keys or audit log"
              />
            )
          }
        />
      ) : null}

      {panel === "keys" ? (
      <section className="settings-card api-keys-members-block">
        <div className="api-keys-type-tabs">
          {flattenChrome ? (
            <p className="settings-hint api-keys-flat-hint">
              Access, Applications, TV, and Contacts sync keys. Agent personas
              live in the Agents list above.
            </p>
          ) : (
            <SegmentedPillToggle
              value={tab}
              options={TAB_OPTIONS}
              onChange={(next) => {
                setTab(next);
                setFreshSecret(null);
                setCreateOpen(false);
                setCreateError(null);
                setExpandedId(null);
              }}
              ariaLabel="API key type"
            />
          )}
          <button
            type="button"
            className="api-key-create-btn"
            disabled={!onCreate}
            onClick={() => {
              setCreateOpen((open) => !open);
              setCreateError(null);
              setExpandedId(null);
              setFreshSecret(null);
            }}
          >
            {createOpen ? "Cancel" : "Create key"}
          </button>
        </div>

        {loading && apiKeys.length === 0 ? (
          <p className="settings-hint">Loading keys…</p>
        ) : null}

        {errorMessage ? (
          <div className="api-key-error">
            <p className="settings-hint">{errorMessage}</p>
            {onRetry ? (
              <button type="button" onClick={onRetry}>
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {!loading &&
        !errorMessage &&
        !createOpen &&
        filteredKeys.length === 0 ? (
          <p className="settings-hint">
            {flattenChrome
              ? "No Access / Applications / TV / Contacts sync keys yet."
              : apiKeys.length === 0
                ? "No API keys yet."
                : `No ${tabLabel(tab).toLowerCase()} keys yet.`}
          </p>
        ) : null}

        {createOpen || filteredKeys.length > 0 ? (
          <div className="api-key-table-wrap">
            <table className="api-key-table">
              <thead>
                <tr>
                  <th scope="col">
                    {flattenChrome ? "Name" : identityColumnLabel(tab)}
                  </th>
                  <th scope="col">Expires</th>
                  <th scope="col">Created</th>
                  <th scope="col">Last used</th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {createOpen ? (
                  <Fragment>
                    <tr className="api-key-table-row api-key-table-row--expanded api-key-create-row">
                      <td>
                        <div className="api-key-table-identity">
                          <div className="api-key-table-identity-copy">
                            <div className="api-key-name-edit-row">
                              {flattenChrome ? (
                                <>
                                  <label className="api-key-create-kind">
                                    <span className="settings-field__label">
                                      Kind
                                    </span>
                                    <select
                                      className="settings-field__input"
                                      value={tab}
                                      disabled={saving || !onCreate}
                                      aria-label="API key kind"
                                      onChange={(event) => {
                                        const next = event.target
                                          .value as ApiKeyTypeTab;
                                        if (
                                          !(PARKED_API_KEY_TABS as readonly string[]).includes(
                                            next,
                                          )
                                        ) {
                                          return;
                                        }
                                        setTab(next);
                                        setDraftScopes([
                                          ...scopesForApiKeyTab(next),
                                        ]);
                                        setCreateError(null);
                                      }}
                                    >
                                      {PARKED_TAB_OPTIONS.map((option) => (
                                        <option
                                          key={option.value}
                                          value={option.value}
                                        >
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <input
                                    className="api-key-name-input"
                                    value={draft}
                                    onChange={(event) =>
                                      setDraft(event.target.value)
                                    }
                                    placeholder={
                                      tab === "access"
                                        ? "Desktop"
                                        : tab === "applications"
                                          ? "Backster Meet"
                                          : tab === "tv"
                                            ? "Office TV"
                                            : "Contacts sync"
                                    }
                                    autoComplete="off"
                                    disabled={saving || !onCreate}
                                    aria-label="API key name"
                                  />
                                </>
                              ) : tab === "agent" ? (
                                contacts.length > 0 ? (
                                  <ApiKeyContactDropdown
                                    value={draftContactId}
                                    options={contactOptions.filter(
                                      (option) =>
                                        option.value !== DROPDOWN_NONE_VALUE,
                                    )}
                                    disabled={saving || !onCreate}
                                    ariaLabel="Contact for this API key"
                                    searchPlaceholder="Set contact…"
                                    onChange={setDraftContactId}
                                  />
                                ) : (
                                  <p className="settings-hint">
                                    Add a contact before creating an agent key.
                                  </p>
                                )
                              ) : (
                                <input
                                  className="api-key-name-input"
                                  value={draft}
                                  onChange={(event) =>
                                    setDraft(event.target.value)
                                  }
                                  placeholder={
                                    tab === "access"
                                      ? "Desktop"
                                      : tab === "applications"
                                        ? "Backster Meet"
                                        : tab === "tv"
                                          ? "Office TV"
                                          : "Contacts sync"
                                  }
                                  autoComplete="off"
                                  disabled={saving || !onCreate}
                                  aria-label="API key name"
                                />
                              )}
                            </div>
                            {createError ? (
                              <p className="api-key-row-error" role="alert">
                                {createError}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td>
                        <ApiKeyExpiryPresetDropdown
                          value={draftExpiry}
                          disabled={saving || !onCreate}
                          ariaLabel="Expiry for new API key"
                          onChange={setDraftExpiry}
                        />
                      </td>
                      <td>
                        <span className="api-key-table-muted">—</span>
                      </td>
                      <td>
                        <span className="api-key-table-muted">—</span>
                      </td>
                      <td aria-hidden="true" />
                    </tr>
                    <tr className="api-key-table-expand-row">
                      <td colSpan={5}>
                        <div className="api-key-expand-panel">
                          {tab === "agent" || tab === "access" ? (
                            <div className="settings-field api-key-detail-field api-key-detail-scopes">
                              <div className="api-key-detail-scopes-label">
                                <span>
                                  {tab === "access"
                                    ? "Full owner access"
                                    : "Scopes"}
                                </span>
                              </div>
                              <div
                                className="api-key-scope-grid"
                                role="group"
                                aria-label={
                                  tab === "access"
                                    ? "Full owner access scopes"
                                    : "Scopes"
                                }
                              >
                                {(tab === "access"
                                  ? AGENT_API_KEY_SCOPES
                                  : AGENT_KEY_SCOPES
                                ).map((scope) => {
                                  const checked =
                                    tab === "access"
                                      ? true
                                      : draftScopes.includes(scope);
                                  const disabled =
                                    tab === "access" ||
                                    saving ||
                                    !onCreate;
                                  return (
                                    <label
                                      key={scope}
                                      className="api-key-scope-option"
                                    >
                                      <PolishedCheckbox
                                        checked={checked}
                                        disabled={disabled}
                                        ariaLabel={`Scope ${scope}`}
                                        onCheckedChange={() => {
                                          if (tab === "agent") {
                                            toggleAgentScope(scope);
                                          }
                                        }}
                                      />
                                      <span>{scope}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                          <div className="api-key-create-actions">
                            <button
                              type="button"
                              className="api-key-create-cancel"
                              disabled={saving}
                              onClick={() => {
                                setCreateOpen(false);
                                setCreateError(null);
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="api-key-create-btn"
                              disabled={
                                saving ||
                                !onCreate ||
                                (tab === "agent"
                                  ? !draftContactId || draftScopes.length === 0
                                  : !draft.trim())
                              }
                              onClick={() => void createKey()}
                            >
                              {saving ? "Creating…" : "Create"}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                ) : null}
                {filteredKeys.map((apiKey) => (
                  <ApiKeyRow
                    key={apiKey.id}
                    apiKey={apiKey}
                    contacts={contacts}
                    expanded={expandedId === apiKey.id}
                    onToggleExpanded={() =>
                      setExpandedId((current) =>
                        current === apiKey.id ? null : apiKey.id,
                      )
                    }
                    pendingSecret={
                      freshSecret?.id === apiKey.id ? freshSecret.secret : null
                    }
                    onDismissPendingSecret={() => setFreshSecret(null)}
                    onRevealSecret={onRevealSecret}
                    onRename={onRename}
                    onSetContact={onSetContact}
                    onSetExpiry={onSetExpiry}
                    onRotate={onRotate}
                    onRevoke={onRevoke}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      ) : (
      <section className="settings-card api-key-logs-block">
        <label className="settings-field api-keys-search-field">
          <input
            value={auditQuery}
            onChange={(event) => setAuditQuery(event.target.value)}
            placeholder="Filter by key, path, status…"
            aria-label="Filter log events"
            autoComplete="off"
          />
        </label>
        <div className="api-key-audit-scroll">
          {filteredActivity.length === 0 ? (
            <p className="settings-hint">
              {activityItems.length === 0
                ? "No log events yet."
                : "No events match this filter."}
            </p>
          ) : (
            <ul className="api-key-audit-list">
              {filteredActivity.map((entry) => (
                <li
                  key={`${entry.kind}-${entry.id}`}
                  className="api-key-audit-row"
                >
                  <time
                    className="api-key-audit-time"
                    dateTime={entry.createdAt}
                    title={formatDateTime(entry.createdAt)}
                  >
                    {formatRelativeAgeLabel(entry.createdAt) ||
                      formatDateTime(entry.createdAt)}
                  </time>
                  <span aria-hidden="true">·</span>
                  {entry.kind === "lifecycle" ? (
                    <>
                      <strong>{auditActionLabel(entry.action)}</strong>
                      <span>{entry.apiKeyName}</span>
                      {entry.actorKind ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{entry.actorKind}</span>
                        </>
                      ) : null}
                      {entry.address ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{entry.address}</span>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <strong>
                        {entry.method} {entry.path}
                      </strong>
                      <span className="api-key-request-status">
                        {entry.status}
                      </span>
                      <span>{entry.apiKeyName}</span>
                      {entry.address ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{entry.address}</span>
                        </>
                      ) : null}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      )}
    </div>
  );
}

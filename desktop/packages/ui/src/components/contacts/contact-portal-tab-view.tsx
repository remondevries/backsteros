"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  coerceContactLanguages,
  DEFAULT_CONTACT_PORTAL_SETTINGS,
  parseBareEmailAddress,
  type ContactLanguage,
  type ContactPortalSettings,
} from "@backsteros/contracts";

import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import { EntityOverviewSubgroup } from "../shared/entity-overview-subgroup.js";
import { SwitchToggle } from "../shared/switch-toggle.js";
import { ContactLanguagesEditor } from "./contact-languages-editor.js";
import {
  CheckIcon,
  CopyIcon,
} from "@primer/octicons-react";

export type ContactPortalProjectOption = {
  id: string;
  name: string;
  key?: string | null;
};

export type ContactPortalEmailOption = {
  address: string;
  label?: string | null;
};

export type ContactPortalPersistInput = {
  settings: ContactPortalSettings;
  portalUsername: string | null;
  /** `null` = leave password unchanged; `""` = clear; otherwise set. */
  portalPassword: string | null;
};

export type ContactPortalTabViewProps = {
  settings: ContactPortalSettings | null | undefined;
  portalUsername: string | null | undefined;
  portalPasswordSet: boolean;
  projects: readonly ContactPortalProjectOption[];
  /** Email addresses from the contact Details tab (username choices). */
  emails?: readonly ContactPortalEmailOption[];
  error?: string | null;
  onSave: (input: ContactPortalPersistInput) => void | Promise<void>;
};

function SettingToggleRow({
  label,
  description,
  ariaLabel: ariaLabelProp,
  checked,
  onChange,
}: {
  label: ReactNode;
  description?: string;
  ariaLabel?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const ariaLabel =
    ariaLabelProp ??
    (typeof label === "string"
      ? label
      : description?.trim() || "Toggle setting");
  return (
    <div className="contact-portal-tab__toggle-row">
      <span className="contact-portal-tab__toggle-copy">
        <span className="contact-portal-tab__toggle-label">{label}</span>
        {description ? (
          <span className="contact-portal-tab__toggle-description">
            {description}
          </span>
        ) : null}
      </span>
      <SwitchToggle
        checked={checked}
        ariaLabel={ariaLabel}
        onCheckedChange={onChange}
      />
    </div>
  );
}

function ProjectToggleLabel({
  name,
  projectKey,
}: {
  name: string;
  projectKey?: string | null;
}) {
  const key = projectKey?.trim();
  return (
    <span className="contact-portal-tab__project-line">
      {key ? (
        <span className="contact-portal-tab__project-key" title="Project ID">
          {key}
        </span>
      ) : null}
      <span className="contact-portal-tab__project-name">{name}</span>
    </span>
  );
}

function normalizePortalLanguages(
  settings: ContactPortalSettings | null | undefined,
): ContactLanguage[] {
  if (!settings) return [];
  if (Array.isArray(settings.languages)) {
    return coerceContactLanguages(settings.languages);
  }
  const legacy = (settings as { language?: unknown }).language;
  return coerceContactLanguages(
    typeof legacy === "string" ? [legacy] : [],
  );
}

function normalizePortalSettings(
  settings: ContactPortalSettings | null | undefined,
): ContactPortalSettings {
  return {
    ...DEFAULT_CONTACT_PORTAL_SETTINGS,
    ...(settings ?? {}),
    languages: normalizePortalLanguages(settings),
    enabledProjectIds:
      settings?.enabledProjectIds === undefined
        ? null
        : settings.enabledProjectIds,
  };
}

/**
 * Contact card "Portal" tab — ACL toggles + login credentials for Clients contacts.
 * Changes persist immediately (same live-save pattern as Details).
 */
export function ContactPortalTabView({
  settings,
  portalUsername,
  portalPasswordSet,
  projects,
  emails = [],
  error = null,
  onSave,
}: ContactPortalTabViewProps) {
  const initial = useMemo(
    () => normalizePortalSettings(settings),
    [settings],
  );
  const [draft, setDraft] = useState<ContactPortalSettings>(initial);
  const [username, setUsername] = useState(portalUsername ?? "");
  const [password, setPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [usernameCopied, setUsernameCopied] = useState(false);
  const usernameCopiedTimerRef = useRef<number | null>(null);
  const passwordSavedTimerRef = useRef<number | null>(null);
  const draftRef = useRef(draft);
  const usernameRef = useRef(username);
  /** Optimistic username while REST/PowerSync props catch up — avoids revert flicker. */
  const pendingUsernameRef = useRef<string | null>(null);
  const portalUsernamePropRef = useRef(portalUsername ?? "");

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  useEffect(() => {
    portalUsernamePropRef.current = portalUsername ?? "";
  }, [portalUsername]);

  // Settings object identity changes often (PowerSync). Never reset username here.
  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  useEffect(() => {
    const incoming = portalUsername ?? "";
    if (pendingUsernameRef.current !== null) {
      if (incoming === pendingUsernameRef.current) {
        pendingUsernameRef.current = null;
        setUsername(incoming);
      }
      // Still waiting for the saved value to appear on the contact prop.
      return;
    }
    setUsername(incoming);
  }, [portalUsername]);

  useEffect(() => {
    return () => {
      if (usernameCopiedTimerRef.current != null) {
        window.clearTimeout(usernameCopiedTimerRef.current);
      }
      if (passwordSavedTimerRef.current != null) {
        window.clearTimeout(passwordSavedTimerRef.current);
      }
    };
  }, []);

  async function copyUsernameToClipboard(value: string) {
    const text = value.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setUsernameCopied(true);
      if (usernameCopiedTimerRef.current != null) {
        window.clearTimeout(usernameCopiedTimerRef.current);
      }
      usernameCopiedTimerRef.current = window.setTimeout(() => {
        setUsernameCopied(false);
        usernameCopiedTimerRef.current = null;
      }, 1500);
    } catch {
      setUsernameCopied(false);
    }
  }

  const allProjectIds = useMemo(
    () => projects.map((project) => project.id),
    [projects],
  );

  const enabledSet = useMemo(() => {
    if (draft.enabledProjectIds == null) {
      return new Set(allProjectIds);
    }
    return new Set(draft.enabledProjectIds);
  }, [allProjectIds, draft.enabledProjectIds]);

  const emailOptions = useMemo(() => {
    const options: {
      value: string;
      label: string;
      searchTerms?: string;
    }[] = [];
    const seen = new Set<string>();
    for (const entry of emails) {
      const address = entry.address.trim();
      if (!address) continue;
      const key = parseBareEmailAddress(address);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const kind = entry.label?.trim();
      options.push({
        value: address,
        label: address,
        searchTerms: kind ? `${address} ${kind}` : address,
      });
    }
    const current = username.trim();
    if (current) {
      const key = parseBareEmailAddress(current);
      if (!seen.has(key || current.toLowerCase())) {
        options.unshift({
          value: current,
          label: current,
          searchTerms: current,
        });
      }
    }
    return options;
  }, [emails, username]);

  function persist(input: {
    settings?: ContactPortalSettings;
    portalUsername?: string | null;
    portalPassword?: string | null;
  }): Promise<void> {
    const nextSettings = input.settings ?? draftRef.current;
    const nextUsername =
      input.portalUsername !== undefined
        ? input.portalUsername
        : usernameRef.current.trim() ||
          portalUsernamePropRef.current.trim() ||
          null;
    if (input.settings) {
      setDraft(input.settings);
      draftRef.current = input.settings;
    }
    if (input.portalUsername !== undefined) {
      const display = input.portalUsername ?? "";
      pendingUsernameRef.current = display;
      setUsername(display);
      usernameRef.current = display;
    }
    return Promise.resolve(
      onSave({
        settings: nextSettings,
        portalUsername: nextUsername,
        portalPassword:
          input.portalPassword !== undefined ? input.portalPassword : null,
      }),
    ).catch((error) => {
      if (input.portalUsername !== undefined) {
        pendingUsernameRef.current = null;
        const revert = portalUsernamePropRef.current;
        setUsername(revert);
        usernameRef.current = revert;
      }
      throw error;
    });
  }

  function patchSettings(
    patch: Partial<ContactPortalSettings> | ((current: ContactPortalSettings) => ContactPortalSettings),
  ) {
    const next =
      typeof patch === "function"
        ? patch(draftRef.current)
        : { ...draftRef.current, ...patch };
    void persist({ settings: next }).catch(() => {
      // Error rendered via `error` prop from parent.
    });
  }

  function toggleProject(projectId: string, enabled: boolean) {
    patchSettings((current) => {
      const baseIds =
        current.enabledProjectIds == null
          ? allProjectIds
          : current.enabledProjectIds;
      const next = new Set(baseIds);
      if (enabled) next.add(projectId);
      else next.delete(projectId);
      const selected = [...next];
      const enabledProjectIds =
        selected.length === 0
          ? []
          : allProjectIds.length > 0 &&
              allProjectIds.every((id) => next.has(id))
            ? null
            : selected;
      return { ...current, enabledProjectIds };
    });
  }

  async function commitPassword() {
    const next = password.trim();
    if (!next || next.length < 8 || passwordSaving) return;
    setPasswordSaving(true);
    setPasswordSaved(false);
    try {
      await persist({ portalPassword: next });
      setPassword("");
      setPasswordSaved(true);
      if (passwordSavedTimerRef.current != null) {
        window.clearTimeout(passwordSavedTimerRef.current);
      }
      passwordSavedTimerRef.current = window.setTimeout(() => {
        setPasswordSaved(false);
        passwordSavedTimerRef.current = null;
      }, 2000);
    } catch {
      // Parent surfaces `error`; keep the draft so the user can retry.
    } finally {
      setPasswordSaving(false);
    }
  }

  const passwordDraft = password.trim();
  const canConfirmPassword = passwordDraft.length >= 8 && !passwordSaving;

  return (
    <div className="contact-portal-tab entity-overview__details flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <EntityOverviewSubgroup title="Language">
        <ContactLanguagesEditor
          languages={draft.languages}
          onChange={(next) => {
            setDraft((current) => ({
              ...current,
              languages: coerceContactLanguages(next),
            }));
          }}
          onSave={(next) => {
            patchSettings({ languages: coerceContactLanguages(next) });
          }}
        />
      </EntityOverviewSubgroup>

      <EntityOverviewSubgroup title="Projects">
        <p className="contact-portal-tab__hint">
          Projects linked to this contact&apos;s organization.
        </p>
        {projects.length === 0 ? (
          <p className="contact-portal-tab__hint">No organization projects yet.</p>
        ) : (
          <ul className="contact-portal-tab__list">
            {projects.map((project) => (
              <li key={project.id}>
                <SettingToggleRow
                  label={
                    <ProjectToggleLabel
                      name={project.name}
                      projectKey={project.key}
                    />
                  }
                  ariaLabel={project.name}
                  checked={enabledSet.has(project.id)}
                  onChange={(checked) => toggleProject(project.id, checked)}
                />
              </li>
            ))}
          </ul>
        )}
      </EntityOverviewSubgroup>

      <EntityOverviewSubgroup title="Access">
        <p className="contact-portal-tab__hint">
          What parts of the portal can the user have access to.
        </p>
        <div className="contact-portal-tab__list">
          <SettingToggleRow
            label="Financials"
            checked={draft.financials}
            onChange={(checked) => patchSettings({ financials: checked })}
          />
          <SettingToggleRow
            label="Support"
            checked={draft.support}
            onChange={(checked) => patchSettings({ support: checked })}
          />
          <SettingToggleRow
            label="Allow tickets"
            checked={draft.canAddTickets}
            onChange={(checked) => patchSettings({ canAddTickets: checked })}
          />
          <SettingToggleRow
            label="Allow tasks"
            checked={draft.canAddTasks}
            onChange={(checked) => patchSettings({ canAddTasks: checked })}
          />
        </div>
      </EntityOverviewSubgroup>

      <EntityOverviewSubgroup title="Login">
        <div className="contact-portal-tab__field">
          <span className="contact-portal-tab__field-label">Username</span>
          {emailOptions.length === 0 ? (
            <p className="contact-portal-tab__hint">
              Add an email on Details to use as the portal username.
            </p>
          ) : (
            <div
              className={[
                "contact-portal-tab__credential",
                username.trim() ? "has-action" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <SearchableDropdown
                value={username.trim() || null}
                options={emailOptions}
                onChange={(next) => {
                  void persist({ portalUsername: next.trim() || null }).catch(
                    () => {
                      // Error rendered via `error` prop from parent.
                    },
                  );
                }}
                searchPlaceholder="Search emails…"
                ariaLabel="Portal username"
                panelAlign="start"
                panelWidth="trigger"
                className="entity-overview-dropdown contact-portal-tab__username-dropdown"
                renderTrigger={({
                  selected,
                  open,
                  disabled,
                  triggerId,
                  onToggle,
                }) => {
                  const label = selected?.label ?? "Select email…";
                  return (
                    <button
                      type="button"
                      id={triggerId}
                      disabled={disabled}
                      aria-haspopup="listbox"
                      aria-expanded={open}
                      aria-label={
                        selected
                          ? `Portal username: ${selected.label}`
                          : "Select portal username email"
                      }
                      title={label}
                      onClick={onToggle}
                      className={[
                        "entity-overview-input",
                        "entity-overview-dropdown-trigger",
                        "contact-portal-tab__credential-control",
                        selected ? null : "is-muted",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span className="entity-overview-dropdown-trigger__label">
                        {label}
                      </span>
                    </button>
                  );
                }}
              />
              {username.trim() ? (
                <div className="contact-portal-tab__credential-actions">
                  <button
                    type="button"
                    className="contact-portal-tab__credential-action"
                    aria-label={
                      usernameCopied ? "Username copied" : "Copy username"
                    }
                    title={usernameCopied ? "Copied" : "Copy username"}
                    onClick={() => {
                      void copyUsernameToClipboard(username);
                    }}
                  >
                    {usernameCopied ? (
                      <CheckIcon size={14} />
                    ) : (
                      <CopyIcon size={14} />
                    )}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
        <div className="contact-portal-tab__field">
          <span className="contact-portal-tab__field-label">Password</span>
          <div
            className={[
              "contact-portal-tab__credential",
              "contact-portal-tab__password",
              passwordDraft || passwordSaved ? "has-confirm" : null,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <input
              type="text"
              autoComplete="new-password"
              spellCheck={false}
              className="entity-overview-input contact-portal-tab__credential-control contact-portal-tab__password-input"
              value={password}
              disabled={passwordSaving}
              onChange={(event) => {
                setPasswordSaved(false);
                setPassword(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitPassword();
                }
              }}
              placeholder={portalPasswordSet ? "••••••••" : "Set a password"}
            />
            {passwordDraft ? (
              <div className="contact-portal-tab__credential-actions">
                <button
                  type="button"
                  className="contact-portal-tab__password-confirm"
                  disabled={!canConfirmPassword}
                  aria-label="Confirm password"
                  title={
                    passwordSaving
                      ? "Saving…"
                      : canConfirmPassword
                        ? "Save password"
                        : "Password must be at least 8 characters"
                  }
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={() => {
                    void commitPassword();
                  }}
                >
                  {passwordSaving ? "Saving…" : "Confirm"}
                </button>
              </div>
            ) : passwordSaved ? (
              <div className="contact-portal-tab__credential-actions">
                <span
                  className="contact-portal-tab__password-saved"
                  role="status"
                  aria-label="Password saved"
                  title="Password saved"
                >
                  <CheckIcon size={14} />
                </span>
              </div>
            ) : null}
          </div>
          {passwordDraft && !canConfirmPassword ? (
            <p className="contact-portal-tab__hint">
              Password must be at least 8 characters.
            </p>
          ) : null}
        </div>
      </EntityOverviewSubgroup>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

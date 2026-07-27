import { useCallback, useEffect, useState } from "react";
import type { CursorSettings } from "@backsteros/contracts";
import { SegmentedPillToggle } from "@backsteros/ui";

import { forgetLivePtySession } from "./desktop-terminal-panel";
import { useDesktopApi } from "../lib/api-context";
import {
  killPtySession,
  listPtySessions,
  type PtySessionInfo,
} from "../lib/pty";

function formatStartedAt(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function activityLabel(session: PtySessionInfo): string {
  if (session.lastActivity === "working") return "working";
  if (session.lastActivity === "idle") return "idle";
  return "unknown";
}

type CursorModelOption = { id: string; displayName?: string };
type CursorSubTab = "api-key" | "spellcheck" | "research" | "agents";

const CURSOR_SUB_TABS: { value: CursorSubTab; label: string }[] = [
  { value: "api-key", label: "API key" },
  { value: "spellcheck", label: "Spellcheck" },
  { value: "research", label: "Research" },
  { value: "agents", label: "Agents" },
];

export function SettingsCursorTab() {
  const { client } = useDesktopApi();
  const [subTab, setSubTab] = useState<CursorSubTab>("api-key");

  const [cursorSettings, setCursorSettings] = useState<CursorSettings | null>(
    null,
  );
  const [models, setModels] = useState<CursorModelOption[]>([]);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [instructionsDraft, setInstructionsDraft] = useState("");
  const [researchInstructionsDraft, setResearchInstructionsDraft] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [savingResearchInstructions, setSavingResearchInstructions] =
    useState(false);

  const [sessions, setSessions] = useState<PtySessionInfo[]>([]);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [killingId, setKillingId] = useState<string | null>(null);

  const loadCursorSettings = useCallback(async () => {
    try {
      const body = await client.requestJson<CursorSettings>(
        "/api/v1/settings/cursor",
      );
      setCursorSettings(body);
      setInstructionsDraft(body.spellcheckInstructions);
      setResearchInstructionsDraft(body.researchInstructions);
      setSettingsError(null);
      return body;
    } catch (err) {
      setSettingsError(
        err instanceof Error
          ? err.message
          : "Could not load Cursor settings.",
      );
      return null;
    }
  }, [client]);

  const loadModels = useCallback(
    async (configured: boolean) => {
      if (!configured) {
        setModels([{ id: "auto", displayName: "Auto" }]);
        return;
      }
      try {
        const body = await client.requestJson<{ models: CursorModelOption[] }>(
          "/api/v1/settings/cursor/models",
        );
        const list = body.models.length
          ? body.models
          : [{ id: "auto", displayName: "Auto" }];
        if (!list.some((m) => m.id === "auto")) {
          list.unshift({ id: "auto", displayName: "Auto" });
        }
        setModels(list);
      } catch {
        setModels([{ id: "auto", displayName: "Auto" }]);
      }
    },
    [client],
  );

  useEffect(() => {
    void (async () => {
      const settings = await loadCursorSettings();
      if (settings) await loadModels(settings.apiKeyConfigured);
    })();
  }, [loadCursorSettings, loadModels]);

  const patchCursorSettings = async (
    patch: Record<string, unknown>,
  ): Promise<CursorSettings | null> => {
    setSavingSettings(true);
    setSettingsError(null);
    try {
      const body = await client.requestJson<CursorSettings>(
        "/api/v1/settings/cursor",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      setCursorSettings(body);
      if (patch.spellcheckInstructions !== undefined) {
        setInstructionsDraft(body.spellcheckInstructions);
      }
      if (patch.researchInstructions !== undefined) {
        setResearchInstructionsDraft(body.researchInstructions);
      }
      return body;
    } catch (err) {
      setSettingsError(
        err instanceof Error
          ? err.message
          : "Could not save Cursor settings.",
      );
      return null;
    } finally {
      setSavingSettings(false);
    }
  };

  const onSaveApiKey = async () => {
    const value = apiKeyDraft.trim();
    if (!value) return;
    setSavingKey(true);
    const body = await patchCursorSettings({ apiKey: value });
    setSavingKey(false);
    if (body) {
      setApiKeyDraft("");
      await loadModels(body.apiKeyConfigured);
    }
  };

  const onClearApiKey = async () => {
    setSavingKey(true);
    const body = await patchCursorSettings({ apiKey: "" });
    setSavingKey(false);
    if (body) {
      setApiKeyDraft("");
      await loadModels(false);
    }
  };

  const instructionsDirty =
    Boolean(cursorSettings) &&
    instructionsDraft !== (cursorSettings?.spellcheckInstructions ?? "");

  const onSaveInstructions = async () => {
    setSavingInstructions(true);
    const body = await patchCursorSettings({
      spellcheckInstructions: instructionsDraft,
    });
    setSavingInstructions(false);
    if (body) {
      setInstructionsDraft(body.spellcheckInstructions);
    }
  };

  const onResetInstructions = async () => {
    setSavingInstructions(true);
    const body = await patchCursorSettings({
      spellcheckInstructions: "",
    });
    setSavingInstructions(false);
    if (body) {
      setInstructionsDraft(body.spellcheckInstructions);
    }
  };

  const researchInstructionsDirty =
    Boolean(cursorSettings) &&
    researchInstructionsDraft !==
      (cursorSettings?.researchInstructions ?? "");

  const onSaveResearchInstructions = async () => {
    setSavingResearchInstructions(true);
    const body = await patchCursorSettings({
      researchInstructions: researchInstructionsDraft,
    });
    setSavingResearchInstructions(false);
    if (body) {
      setResearchInstructionsDraft(body.researchInstructions);
    }
  };

  const onResetResearchInstructions = async () => {
    setSavingResearchInstructions(true);
    const body = await patchCursorSettings({
      researchInstructions: "",
    });
    setSavingResearchInstructions(false);
    if (body) {
      setResearchInstructionsDraft(body.researchInstructions);
    }
  };

  const refresh = useCallback(async () => {
    const result = await listPtySessions({ kind: "agent" });
    if (!result.ok) {
      setOffline(Boolean(result.offline));
      setError(result.error);
      setSessions([]);
      return;
    }
    setOffline(false);
    setError(null);
    setSessions(result.sessions);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const onKill = async (sessionId: string) => {
    setKillingId(sessionId);
    setError(null);
    const result = await killPtySession(sessionId);
    if (result.ok) {
      forgetLivePtySession(sessionId);
      await refresh();
    } else {
      setError(result.error);
    }
    setKillingId(null);
  };

  const withSelectedModel = (selected: string | undefined) => {
    if (selected && !models.some((m) => m.id === selected)) {
      return [{ id: selected, displayName: selected }, ...models];
    }
    return models;
  };
  const spellcheckModelOptions = withSelectedModel(
    cursorSettings?.spellcheckModel,
  );
  const researchModelOptions = withSelectedModel(cursorSettings?.researchModel);

  return (
    <>
      <div className="settings-cursor-subtabs">
        <SegmentedPillToggle
          ariaLabel="Cursor settings sections"
          value={subTab}
          onChange={setSubTab}
          options={CURSOR_SUB_TABS}
        />
      </div>

      {subTab === "api-key" ? (
        <section className="settings-card">
          <h2>API key</h2>
          <p>
            Create an API key in the Cursor dashboard and store it here (kept in
            core, not synced via PowerSync). Used for spellcheck and other
            Cursor SDK features.
          </p>

          <label className="settings-field">
            Cursor API key
            <input
              type="password"
              autoComplete="off"
              placeholder={
                cursorSettings?.apiKeyConfigured
                  ? `Configured (${cursorSettings.apiKeyPreview ?? "••••"})`
                  : "cursor_…"
              }
              value={apiKeyDraft}
              onChange={(event) => setApiKeyDraft(event.target.value)}
            />
          </label>
          <div className="settings-cursor-key-actions">
            <button
              type="button"
              disabled={savingKey || !apiKeyDraft.trim()}
              onClick={() => void onSaveApiKey()}
            >
              {savingKey ? "Saving…" : "Save key"}
            </button>
            <button
              type="button"
              disabled={savingKey || !cursorSettings?.apiKeyConfigured}
              onClick={() => void onClearApiKey()}
            >
              Clear key
            </button>
          </div>
          {cursorSettings?.apiKeyConfigured ? (
            <p className="settings-hint">
              Key on file: {cursorSettings.apiKeyPreview}
            </p>
          ) : (
            <p className="settings-hint">
              No API key stored. Spellcheck stays unavailable until you save
              one.
            </p>
          )}
          {settingsError ? (
            <p className="settings-cursor-error">{settingsError}</p>
          ) : null}
        </section>
      ) : null}

      {subTab === "spellcheck" ? (
        <section className="settings-card">
          <h2>Spellcheck</h2>
          <p>
            Use the Cursor SDK to fix spelling and light formatting on task
            titles and descriptions.
          </p>

          <label className="settings-field settings-cursor-toggle-row">
            <span>Enable spellcheck</span>
            <input
              type="checkbox"
              checked={cursorSettings?.spellcheckEnabled ?? false}
              disabled={!cursorSettings || savingSettings}
              onChange={(event) => {
                void patchCursorSettings({
                  spellcheckEnabled: event.target.checked,
                });
              }}
            />
          </label>

          <label className="settings-field">
            Model
            <select
              value={cursorSettings?.spellcheckModel ?? "auto"}
              disabled={!cursorSettings || savingSettings}
              onChange={(event) => {
                void patchCursorSettings({
                  spellcheckModel: event.target.value,
                });
              }}
            >
              {spellcheckModelOptions.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName || model.id}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            Spellcheck instructions
            <textarea
              value={instructionsDraft}
              disabled={!cursorSettings || savingInstructions}
              spellCheck={false}
              rows={8}
              onChange={(event) => setInstructionsDraft(event.target.value)}
            />
          </label>
          <p className="settings-hint">
            Sent to the Cursor agent before the task title and description. Keep
            the JSON response shape requirement so results can be applied.
          </p>
          <div className="settings-cursor-key-actions">
            <button
              type="button"
              disabled={
                savingInstructions || !cursorSettings || !instructionsDirty
              }
              onClick={() => void onSaveInstructions()}
            >
              {savingInstructions ? "Saving…" : "Save instructions"}
            </button>
            <button
              type="button"
              disabled={savingInstructions || !cursorSettings}
              onClick={() => void onResetInstructions()}
            >
              Reset to default
            </button>
          </div>
          {settingsError ? (
            <p className="settings-cursor-error">{settingsError}</p>
          ) : null}
        </section>
      ) : null}

      {subTab === "research" ? (
        <section className="settings-card">
          <h2>Research</h2>
          <p>
            Use the Cursor SDK to research the task topic and enrich the title
            and description with findings.
          </p>

          <label className="settings-field settings-cursor-toggle-row">
            <span>Enable research</span>
            <input
              type="checkbox"
              checked={cursorSettings?.researchEnabled ?? false}
              disabled={!cursorSettings || savingSettings}
              onChange={(event) => {
                void patchCursorSettings({
                  researchEnabled: event.target.checked,
                });
              }}
            />
          </label>

          <label className="settings-field">
            Model
            <select
              value={cursorSettings?.researchModel ?? "auto"}
              disabled={!cursorSettings || savingSettings}
              onChange={(event) => {
                void patchCursorSettings({
                  researchModel: event.target.value,
                });
              }}
            >
              {researchModelOptions.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName || model.id}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            Research instructions
            <textarea
              value={researchInstructionsDraft}
              disabled={!cursorSettings || savingResearchInstructions}
              spellCheck={false}
              rows={8}
              onChange={(event) =>
                setResearchInstructionsDraft(event.target.value)
              }
            />
          </label>
          <p className="settings-hint">
            Sent to the Cursor agent before the task title and description.
            Keep the JSON response shape requirement so results can be applied.
          </p>
          <div className="settings-cursor-key-actions">
            <button
              type="button"
              disabled={
                savingResearchInstructions ||
                !cursorSettings ||
                !researchInstructionsDirty
              }
              onClick={() => void onSaveResearchInstructions()}
            >
              {savingResearchInstructions ? "Saving…" : "Save instructions"}
            </button>
            <button
              type="button"
              disabled={savingResearchInstructions || !cursorSettings}
              onClick={() => void onResetResearchInstructions()}
            >
              Reset to default
            </button>
          </div>
          {settingsError ? (
            <p className="settings-cursor-error">{settingsError}</p>
          ) : null}
        </section>
      ) : null}

      {subTab === "agents" ? (
        <section className="settings-card">
          <h2>Active agents</h2>
          <p>
            Local Cursor agent processes owned by the PTY sidecar. Leaving a
            task only detaches the viewer; Kill stops that process. The
            task&apos;s <code>agentChatId</code> in core is left alone so View
            can resume later.
          </p>

          {offline ? (
            <p className="settings-cursor-status">
              PTY sidecar unreachable. Run <code>pnpm pty</code>.
            </p>
          ) : null}

          {!offline && sessions.length === 0 ? (
            <p className="settings-cursor-status">No agent sessions running.</p>
          ) : null}

          {sessions.length > 0 ? (
            <ul className="settings-cursor-sessions">
              {sessions.map((session) => {
                const title =
                  session.label?.trim() ||
                  (session.taskId
                    ? `Task ${session.taskId.slice(0, 8)}`
                    : "Agent");
                return (
                  <li
                    key={session.sessionId}
                    className="settings-cursor-session"
                  >
                    <div className="settings-cursor-session-main">
                      <div className="settings-cursor-session-title">
                        {title}
                      </div>
                      <div className="settings-cursor-session-meta">
                        <span>{activityLabel(session)}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {session.uiAttached ? "attached" : "background"}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          started {formatStartedAt(session.createdAt)}
                        </span>
                      </div>
                      {session.cwd ? (
                        <div
                          className="settings-cursor-session-cwd"
                          title={session.cwd}
                        >
                          {session.cwd}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="settings-cursor-kill"
                      disabled={killingId === session.sessionId}
                      onClick={() => void onKill(session.sessionId)}
                    >
                      {killingId === session.sessionId ? "Killing…" : "Kill"}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {error && !offline ? (
            <p className="settings-cursor-error">{error}</p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

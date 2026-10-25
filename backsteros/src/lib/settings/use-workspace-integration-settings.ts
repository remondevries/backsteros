import { useCallback, useEffect, useRef, useState } from "react";

import { useDesktopApi } from "../api-context";

export type IntegrationTestConnectionResult = {
  ok: boolean;
  error?: string | null;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Load / patch / test-connection state for one `/api/v1/settings/{id}`
 * integration. `initialSettings` (already fetched by the integrations
 * overview) skips the first GET; `onLoaded` runs for every settings body the
 * hook applies, including `initialSettings`.
 */
export function useWorkspaceIntegrationSettings<TSettings, TPatch>({
  basePath,
  label,
  initialSettings,
  onLoaded,
}: {
  /** e.g. `/api/v1/settings/cloudflare` */
  basePath: string;
  /** Used in fallback error copy, e.g. "Could not load {label} settings." */
  label: string;
  initialSettings?: TSettings | null;
  onLoaded?: (settings: TSettings) => void;
}) {
  const { client } = useDesktopApi();
  const [settings, setSettings] = useState<TSettings | null>(
    initialSettings ?? null,
  );
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const pendingInitialRef = useRef(initialSettings ?? null);

  const applySettings = useCallback((body: TSettings) => {
    setSettings(body);
    onLoadedRef.current?.(body);
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const body = await client.requestJson<TSettings>(basePath);
      applySettings(body);
      setSettingsError(null);
      return body;
    } catch (error) {
      setSettingsError(
        errorMessage(error, `Could not load ${label} settings.`),
      );
      return null;
    }
  }, [applySettings, basePath, client, label]);

  useEffect(() => {
    const initial = pendingInitialRef.current;
    if (initial) {
      pendingInitialRef.current = null;
      applySettings(initial);
      return;
    }
    void loadSettings();
  }, [applySettings, loadSettings]);

  /**
   * Runs a request that resolves to fresh settings (PATCH, sync, disconnect…).
   * Failures surface in `settingsError` and are rethrown with `cause`.
   */
  const runSettingsRequest = useCallback(
    async (request: () => Promise<TSettings>, failMessage: string) => {
      setSaving(true);
      setSettingsError(null);
      try {
        const body = await request();
        applySettings(body);
        return body;
      } catch (error) {
        const message = errorMessage(error, failMessage);
        setSettingsError(message);
        throw new Error(message, { cause: error });
      } finally {
        setSaving(false);
      }
    },
    [applySettings],
  );

  const patchSettings = useCallback(
    (patch: TPatch) =>
      runSettingsRequest(
        () =>
          client.requestJson<TSettings>(basePath, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          }),
        `Could not save ${label} settings.`,
      ),
    [basePath, client, label, runSettingsRequest],
  );

  /** GET `{basePath}/test`, reload settings, throw when the probe fails. */
  const testConnection = useCallback(
    async (failMessage: string) => {
      const result = await client.requestJson<IntegrationTestConnectionResult>(
        `${basePath}/test`,
      );
      await loadSettings();
      if (!result.ok) throw new Error(result.error ?? failMessage);
      return result;
    },
    [basePath, client, loadSettings],
  );

  return {
    client,
    settings,
    settingsError,
    setSettingsError,
    saving,
    loadSettings,
    patchSettings,
    runSettingsRequest,
    testConnection,
  };
}

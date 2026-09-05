import { useEffect, useState } from "react";

import {
  DEFAULT_BACKSTEROS_API_URL,
  useBacksterosSettingsStore,
} from "~/backsteros/settingsStore";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export function BacksterosConnectionSetting() {
  const apiUrl = useBacksterosSettingsStore((state) => state.apiUrl);
  const apiKey = useBacksterosSettingsStore((state) => state.apiKey);
  const setConnection = useBacksterosSettingsStore((state) => state.setConnection);
  const [draftUrl, setDraftUrl] = useState(apiUrl);
  const [draftKey, setDraftKey] = useState(apiKey);

  useEffect(() => {
    setDraftUrl(apiUrl);
    setDraftKey(apiKey);
  }, [apiKey, apiUrl]);

  const isDirty = draftUrl.trim() !== apiUrl.trim() || draftKey !== apiKey;
  const canReset =
    apiUrl.trim() !== DEFAULT_BACKSTEROS_API_URL || apiKey.trim().length > 0 || isDirty;

  const save = () => {
    setConnection({
      apiUrl: draftUrl.trim() || DEFAULT_BACKSTEROS_API_URL,
      apiKey: draftKey.trim(),
    });
  };

  const reset = () => {
    setDraftUrl(DEFAULT_BACKSTEROS_API_URL);
    setDraftKey("");
    setConnection({ apiUrl: DEFAULT_BACKSTEROS_API_URL, apiKey: "" });
  };

  return (
    <SettingsRow
      {...searchableSetting("backsteros-connection")}
      description="Used by the sidebar BacksterOS project list. Packaged desktop needs the API key here (or BACKSTEROS_API_KEY in the process env). The key stays on this device."
      resetAction={
        canReset ? <SettingResetButton label="BacksterOS connection" onClick={reset} /> : null
      }
    >
      <div className="grid max-w-lg gap-3 pb-3">
        <div className="grid gap-1.5">
          <Label htmlFor="backsteros-api-url">API URL</Label>
          <Input
            id="backsteros-api-url"
            autoComplete="off"
            spellCheck={false}
            placeholder={DEFAULT_BACKSTEROS_API_URL}
            value={draftUrl}
            onChange={(event) => setDraftUrl(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="backsteros-api-key">API key</Label>
          <Input
            id="backsteros-api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk_live_…"
            value={draftKey}
            onChange={(event) => setDraftKey(event.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button type="button" size="xs" disabled={!isDirty} onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </SettingsRow>
  );
}

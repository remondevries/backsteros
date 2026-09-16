import { useMemo, useState } from "react";

import {
  createEmptyFileTaskAgent,
  useBacksterosFileTaskAgentsStore,
  type BacksterosFileTaskAgent,
} from "~/backsteros/fileTaskAgentsStore";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

function AgentEditor(props: {
  readonly agent: BacksterosFileTaskAgent;
  readonly onChange: (agent: BacksterosFileTaskAgent) => void;
  readonly onRemove: () => void;
}) {
  const { agent, onChange, onRemove } = props;
  return (
    <div className="grid gap-2 rounded-lg border border-border/60 p-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`file-task-agent-name-${agent.id}`}>Display name</Label>
        <Input
          id={`file-task-agent-name-${agent.id}`}
          autoComplete="off"
          spellCheck={false}
          placeholder="Sander"
          value={agent.name}
          onChange={(event) => onChange({ ...agent, name: event.target.value })}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`file-task-agent-url-${agent.id}`}>Webhook URL</Label>
        <Input
          id={`file-task-agent-url-${agent.id}`}
          autoComplete="off"
          spellCheck={false}
          placeholder="https://…"
          value={agent.webhookUrl}
          onChange={(event) => onChange({ ...agent, webhookUrl: event.target.value })}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`file-task-agent-key-${agent.id}`}>Webhook key / Authorization</Label>
        <Input
          id={`file-task-agent-key-${agent.id}`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste from Grok Bot routine"
          value={agent.webhookKey}
          onChange={(event) => onChange({ ...agent, webhookKey: event.target.value })}
        />
      </div>
      <div className="flex justify-end">
        <Button type="button" size="xs" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
  );
}

export function BacksterosFileTaskAgentsSetting() {
  const agents = useBacksterosFileTaskAgentsStore((state) => state.agents);
  const selectedAgentId = useBacksterosFileTaskAgentsStore((state) => state.selectedAgentId);
  const callbackBaseUrl = useBacksterosFileTaskAgentsStore((state) => state.callbackBaseUrl);
  const upsertAgent = useBacksterosFileTaskAgentsStore((state) => state.upsertAgent);
  const removeAgent = useBacksterosFileTaskAgentsStore((state) => state.removeAgent);
  const setSelectedAgentId = useBacksterosFileTaskAgentsStore((state) => state.setSelectedAgentId);
  const setCallbackBaseUrl = useBacksterosFileTaskAgentsStore((state) => state.setCallbackBaseUrl);
  const setAgents = useBacksterosFileTaskAgentsStore((state) => state.setAgents);

  const [draftBase, setDraftBase] = useState(callbackBaseUrl);
  const baseDirty = draftBase.trim() !== callbackBaseUrl.trim();

  const canReset = useMemo(
    () => agents.length > 0 || callbackBaseUrl.trim().length > 0 || selectedAgentId != null,
    [agents.length, callbackBaseUrl, selectedAgentId],
  );

  const reset = () => {
    setAgents([]);
    setSelectedAgentId(null);
    setCallbackBaseUrl("");
    setDraftBase("");
  };

  return (
    <>
      <SettingsRow
        {...searchableSetting("backsteros-file-task-agents")}
        description="Grok Bot agents for File as BacksterOS task. Paste the webhook URL and key from the routine (e.g. Task creation / bdv-dig-then-file). Payload shape is fixed — not configurable here."
        resetAction={
          canReset ? <SettingResetButton label="File-task agents" onClick={reset} /> : null
        }
      >
        <div className="grid max-w-lg gap-3 pb-3">
          {agents.map((agent) => (
            <AgentEditor
              key={agent.id}
              agent={agent}
              onChange={upsertAgent}
              onRemove={() => removeAgent(agent.id)}
            />
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => upsertAgent(createEmptyFileTaskAgent())}
            >
              Add agent
            </Button>
            {agents.length > 0 ? (
              <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                <span className="shrink-0 text-muted-foreground">Default</span>
                <select
                  className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
                  value={selectedAgentId ?? agents[0]?.id ?? ""}
                  onChange={(event) => setSelectedAgentId(event.target.value || null)}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name.trim() || "Unnamed agent"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="file-task-callback-base">Cloud Core mailbox URL (optional)</Label>
            <Input
              id="file-task-callback-base"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://agent.backsteros.com"
              value={draftBase}
              onChange={(event) => setDraftBase(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Empty uses <code className="text-[11px]">https://agent.backsteros.com</code>. The
              agent POSTs the result there; Development polls the same mailbox. Override only for a
              local cloud-core.
            </p>
            <div className="flex justify-end">
              <Button
                type="button"
                size="xs"
                disabled={!baseDirty}
                onClick={() => setCallbackBaseUrl(draftBase)}
              >
                Save callback base
              </Button>
            </div>
          </div>
        </div>
      </SettingsRow>
    </>
  );
}

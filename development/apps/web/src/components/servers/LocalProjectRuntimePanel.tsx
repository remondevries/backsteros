import { PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  fetchLocalRuntime,
  mutateLocalRuntime,
  type LocalRuntimeContainer,
  type LocalRuntimeResponse,
  type RuntimeAttachment,
} from "./hetznerApi";
import { SoftStartIcon, SoftStartingIcon, SoftStopIcon } from "./SoftStopIcon";

type DraftAttachment = {
  readonly id: string;
  readonly kind: "compose" | "command";
  readonly label: string;
  readonly composeFile: string;
  readonly composeProjectName: string;
  readonly startCommand: string;
  readonly stopCommand: string;
  readonly cwd: string;
};

function attachmentToDraft(attachment: RuntimeAttachment): DraftAttachment {
  return {
    id: attachment.id,
    kind: attachment.kind,
    label: attachment.label,
    composeFile: attachment.composeFile ?? "",
    composeProjectName: attachment.composeProjectName ?? "",
    startCommand: attachment.startCommand ?? "",
    stopCommand: attachment.stopCommand ?? "",
    cwd: attachment.cwd ?? "",
  };
}

function draftToPayload(draft: DraftAttachment): Partial<RuntimeAttachment> {
  return {
    id: draft.id,
    kind: draft.kind,
    label: draft.label.trim() || (draft.kind === "compose" ? "Compose" : "Command"),
    composeFile: draft.composeFile.trim() || null,
    composeProjectName: draft.composeProjectName.trim() || null,
    startCommand: draft.startCommand.trim() || null,
    stopCommand: draft.stopCommand.trim() || null,
    cwd: draft.cwd.trim() || null,
  };
}

function newDraft(kind: "compose" | "command", composeFile = ""): DraftAttachment {
  return {
    id: `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    kind,
    label: kind === "compose" ? "Compose stack" : "Dev command",
    composeFile,
    composeProjectName: "",
    startCommand: kind === "command" ? "npm run dev" : "",
    stopCommand: "",
    cwd: "",
  };
}

function stateBadgeVariant(
  state: LocalRuntimeContainer["state"],
): "default" | "secondary" | "outline" | "destructive" {
  if (state === "running") return "default";
  if (state === "exited") return "secondary";
  return "outline";
}

/**
 * Local project → Development: Docker/OrbStack containers + start/stop attachments.
 */
export function LocalProjectRuntimePanel({ projectId }: { readonly projectId: string }) {
  const [overview, setOverview] = useState<LocalRuntimeResponse | null>(null);
  const [drafts, setDrafts] = useState<readonly DraftAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showAllHint, setShowAllHint] = useState(false);

  const applyOverview = useCallback((data: LocalRuntimeResponse) => {
    setOverview(data);
    setDrafts((data.attachments ?? []).map(attachmentToDraft));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLocalRuntime(projectId);
      if (!data.ok && data.error) {
        setError(data.error);
        setOverview(data);
        return;
      }
      applyOverview(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load local runtime");
    } finally {
      setLoading(false);
    }
  }, [applyOverview, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runMutation = useCallback(
    async (key: string, body: Parameters<typeof mutateLocalRuntime>[0]): Promise<boolean> => {
      setBusyKey(key);
      setError(null);
      setStatus(null);
      try {
        const data = await mutateLocalRuntime(body);
        if (!data.ok) {
          setError(data.error ?? data.message ?? "Action failed");
          if (data.containers) applyOverview(data);
          return false;
        }
        applyOverview(data);
        if (data.message) setStatus(data.message);
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Action failed");
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [applyOverview],
  );

  const saveAttachments = useCallback(async () => {
    return runMutation("save", {
      projectId,
      action: "setAttachments",
      attachments: drafts.map(draftToPayload),
    });
  }, [drafts, projectId, runMutation]);

  const startOrStopAttachment = useCallback(
    async (attachmentId: string, action: "startAttachment" | "stopAttachment") => {
      const key =
        action === "startAttachment" ? `a:start:${attachmentId}` : `a:stop:${attachmentId}`;
      setBusyKey(key);
      setError(null);
      setStatus(null);
      try {
        // Persist drafts first so Start/Stop works on newly added rows.
        const saved = await mutateLocalRuntime({
          projectId,
          action: "setAttachments",
          attachments: drafts.map(draftToPayload),
        });
        if (!saved.ok) {
          setError(saved.error ?? saved.message ?? "Failed to save attachments");
          if (saved.containers) applyOverview(saved);
          return;
        }
        applyOverview(saved);
        const data = await mutateLocalRuntime({
          projectId,
          action,
          attachmentId,
        });
        if (!data.ok) {
          setError(data.error ?? data.message ?? "Action failed");
          if (data.containers) applyOverview(data);
          return;
        }
        applyOverview(data);
        if (data.message) setStatus(data.message);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Action failed");
      } finally {
        setBusyKey(null);
      }
    },
    [applyOverview, drafts, projectId],
  );

  const containers = overview?.containers ?? [];
  const dockerAvailable = overview?.dockerAvailable ?? false;
  const suggested = overview?.suggestedComposeFiles ?? [];
  const runningContainers = containers.filter((container) => container.state === "running");
  const shouldStopStack = runningContainers.length > 0;

  const toggleStack = useCallback(async () => {
    await runMutation("stack", {
      projectId,
      action: shouldStopStack ? "stopProject" : "startProject",
    });
  }, [projectId, runMutation, shouldStopStack]);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
          <div className="min-w-0">
            <h3 className="text-base font-medium text-foreground">Local runtime</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Docker / OrbStack for this project
              {overview?.composeFile
                ? overview.composeSource === "auto"
                  ? " — compose auto-detected near the working directory."
                  : " — using attached compose."
                : ". Add docker-compose.yml near the cwd or attach a service below."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dockerAvailable && (containers.length > 0 || overview?.canStart) ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  loading ||
                  busyKey != null ||
                  (shouldStopStack
                    ? !overview?.canStop && runningContainers.length === 0
                    : !overview?.canStart)
                }
                onClick={() => void toggleStack()}
              >
                {busyKey === "stack" ? (
                  <SoftStartingIcon />
                ) : shouldStopStack ? (
                  <SoftStopIcon />
                ) : (
                  <SoftStartIcon />
                )}
                {busyKey === "stack"
                  ? shouldStopStack
                    ? "Stopping…"
                    : "Starting…"
                  : shouldStopStack
                    ? "Stop"
                    : "Start"}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || busyKey != null}
              onClick={() => void refresh()}
            >
              <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {error ? (
          <div className="border-b border-border/60 px-6 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {status ? (
          <div className="border-b border-border/60 px-6 py-3 text-sm text-muted-foreground">
            {status}
          </div>
        ) : null}

        {!dockerAvailable ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Docker / OrbStack not available</p>
            <p className="mt-2 max-w-md mx-auto leading-relaxed">
              {overview?.dockerError ??
                "Install OrbStack or Docker Desktop and ensure `docker` is on PATH for the T3 server."}
            </p>
          </div>
        ) : loading && containers.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            Loading containers…
          </div>
        ) : containers.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            <p>No containers matched this project.</p>
            <p className="mt-2 leading-relaxed">
              Matching uses compose working dir vs project cwd, compose project name, or an explicit
              attachment below.
              {(overview?.unmatchedRunningCount ?? 0) > 0 ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-foreground"
                    onClick={() => setShowAllHint((value) => !value)}
                  >
                    {overview?.unmatchedRunningCount} other running container
                    {overview?.unmatchedRunningCount === 1 ? "" : "s"} on this Mac
                  </button>
                  {showAllHint ? " — attach a compose file or project name to claim them." : "."}
                </>
              ) : null}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {containers.map((container) => {
              const running = container.state === "running";
              return (
                <li key={container.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-mono text-sm text-foreground">
                        {container.name}
                      </span>
                      <Badge variant={stateBadgeVariant(container.state)} className="capitalize">
                        {container.state}
                      </Badge>
                      {container.composeService ? (
                        <span className="text-xs text-muted-foreground">
                          {container.composeProject
                            ? `${container.composeProject} / ${container.composeService}`
                            : container.composeService}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {container.image}
                      {container.ports ? ` · ${container.ports}` : ""}
                      {container.status ? ` · ${container.status}` : ""}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {dockerAvailable && overview?.dockerEngine ? (
          <div className="border-t border-border/60 px-6 py-3 text-xs text-muted-foreground">
            Engine: {overview.dockerEngine}
            {overview.localWorkingDirectory ? ` · cwd ${overview.localWorkingDirectory}` : null}
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
          <div className="min-w-0">
            <h3 className="text-base font-medium text-foreground">Attached services</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Compose files or shell start/stop commands stored for this project
              (~/.config/backsteros/local-runtime.json).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busyKey != null}
              onClick={() =>
                setDrafts((prev) => [
                  ...prev,
                  newDraft("compose", suggested[0] ?? "docker-compose.yml"),
                ])
              }
            >
              <PlusIcon className="size-3.5" />
              Compose
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busyKey != null}
              onClick={() => setDrafts((prev) => [...prev, newDraft("command")])}
            >
              <PlusIcon className="size-3.5" />
              Command
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busyKey != null}
              onClick={() => void saveAttachments()}
            >
              {busyKey === "save" ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        {suggested.length > 0 && drafts.length === 0 ? (
          <div className="border-b border-border/60 px-6 py-3 text-sm text-muted-foreground">
            Suggested compose file
            {suggested.length === 1 ? "" : "s"}:{" "}
            {suggested.map((file) => (
              <button
                key={file}
                type="button"
                className="mr-2 font-mono text-xs underline underline-offset-2 hover:text-foreground"
                onClick={() => setDrafts((prev) => [...prev, newDraft("compose", file)])}
              >
                {file}
              </button>
            ))}
          </div>
        ) : null}

        {drafts.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            No attachments yet. Add a compose file (path + optional project name) or a start/stop
            command pair.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {drafts.map((draft, index) => {
              const busyStart = busyKey === `a:start:${draft.id}`;
              const busyStop = busyKey === `a:stop:${draft.id}`;
              return (
                <li key={draft.id} className="space-y-3 px-6 py-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {draft.kind}
                    </Badge>
                    <Input
                      className="h-8 max-w-xs"
                      value={draft.label}
                      onChange={(event) => {
                        const label = event.target.value;
                        setDrafts((prev) =>
                          prev.map((row, i) => (i === index ? { ...row, label } : row)),
                        );
                      }}
                      placeholder="Label"
                    />
                    <div className="ml-auto flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyKey != null}
                        onClick={() => void startOrStopAttachment(draft.id, "startAttachment")}
                      >
                        {busyStart ? <SoftStartingIcon /> : <SoftStartIcon />}
                        {busyStart ? "…" : "Start"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyKey != null}
                        onClick={() => void startOrStopAttachment(draft.id, "stopAttachment")}
                      >
                        {busyStop ? <SoftStartingIcon /> : <SoftStopIcon />}
                        {busyStop ? "…" : "Stop"}
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Remove attachment"
                        disabled={busyKey != null}
                        onClick={() => setDrafts((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  {draft.kind === "compose" ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="space-y-1 text-xs text-muted-foreground">
                        Compose file
                        <Input
                          className="h-8 font-mono text-xs"
                          value={draft.composeFile}
                          onChange={(event) => {
                            const composeFile = event.target.value;
                            setDrafts((prev) =>
                              prev.map((row, i) => (i === index ? { ...row, composeFile } : row)),
                            );
                          }}
                          placeholder="docker-compose.yml or absolute path"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-muted-foreground">
                        Compose project name
                        <Input
                          className="h-8 font-mono text-xs"
                          value={draft.composeProjectName}
                          onChange={(event) => {
                            const composeProjectName = event.target.value;
                            setDrafts((prev) =>
                              prev.map((row, i) =>
                                i === index ? { ...row, composeProjectName } : row,
                              ),
                            );
                          }}
                          placeholder="optional — matches com.docker.compose.project"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="space-y-1 text-xs text-muted-foreground">
                        Start command
                        <Input
                          className="h-8 font-mono text-xs"
                          value={draft.startCommand}
                          onChange={(event) => {
                            const startCommand = event.target.value;
                            setDrafts((prev) =>
                              prev.map((row, i) => (i === index ? { ...row, startCommand } : row)),
                            );
                          }}
                          placeholder="npm run dev"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-muted-foreground">
                        Stop command
                        <Input
                          className="h-8 font-mono text-xs"
                          value={draft.stopCommand}
                          onChange={(event) => {
                            const stopCommand = event.target.value;
                            setDrafts((prev) =>
                              prev.map((row, i) => (i === index ? { ...row, stopCommand } : row)),
                            );
                          }}
                          placeholder="optional shell stop"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
                        Working directory
                        <Input
                          className="h-8 font-mono text-xs"
                          value={draft.cwd}
                          onChange={(event) => {
                            const cwd = event.target.value;
                            setDrafts((prev) =>
                              prev.map((row, i) => (i === index ? { ...row, cwd } : row)),
                            );
                          }}
                          placeholder="defaults to project working directory"
                        />
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

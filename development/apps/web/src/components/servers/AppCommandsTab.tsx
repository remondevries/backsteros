import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  CornerDownLeftIcon,
  EllipsisIcon,
  EyeIcon,
  InfoIcon,
  RotateCcwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
import {
  deleteAppCommand,
  fetchAppCommand,
  fetchAppCommands,
  runAppCommand,
  type AppCommandRecord,
} from "./hetznerApi";

function formatRelative(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return iso;
  const deltaSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(deltaSec);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return formatter.format(deltaSec, "second");
  const minutes = Math.round(deltaSec / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return formatter.format(days, "day");
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return formatter.format(months, "month");
  return formatter.format(Math.round(days / 365), "year");
}

function CommandsCard({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
      <div className="border-b border-border/60 px-6 py-5">
        <h3 className="text-base font-medium text-foreground">{title}</h3>
        {description ? (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ status }: { readonly status: AppCommandRecord["status"] }) {
  if (status === "running") {
    return (
      <Badge variant="secondary" className="shrink-0 gap-1">
        Running
      </Badge>
    );
  }
  if (status === "finished") {
    return (
      <Badge variant="secondary" className="shrink-0 gap-1 bg-[#3d9a6a]/15 text-[#3d9a6a]">
        <CheckIcon className="size-3.5" />
        Finished
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="shrink-0 gap-1 bg-destructive/15 text-destructive">
      <XIcon className="size-3.5" />
      Failed
    </Badge>
  );
}

function ActorAvatar({ initials }: { readonly initials: string }) {
  return (
    <span
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-violet-500/25 text-[10px] font-semibold text-violet-200"
      aria-hidden
    >
      {initials}
    </span>
  );
}

function CommandDetailsView({
  command,
  running,
  onBack,
  onDelete,
  onRunAgain,
}: {
  readonly command: AppCommandRecord;
  readonly running: boolean;
  readonly onBack: () => void;
  readonly onDelete: () => void;
  readonly onRunAgain: () => void;
}) {
  const ranLabel =
    command.status === "running" ? "Running now" : `Ran ${formatRelative(command.createdAt)}`;

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Back to commands
        </button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">Command details</h2>
          <p className="mt-3 font-mono text-sm text-foreground">{command.command}</p>
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2.5 text-sm text-muted-foreground">
            <StatusBadge status={command.status} />
            <span>{ranLabel} by</span>
            <ActorAvatar initials={command.actorInitials} />
            <span className="text-foreground/90">{command.actorName}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            disabled={command.id.startsWith("pending-") || running}
            onClick={onDelete}
          >
            <Trash2Icon className="size-4" />
            Delete
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            disabled={running}
            onClick={onRunAgain}
          >
            <RotateCcwIcon className="size-4" />
            Run again
          </Button>
        </div>
      </div>

      <CommandsCard title="Command output">
        {command.status === "running" ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Running…</p>
            <p className="mt-1">Output will appear here when the command finishes.</p>
          </div>
        ) : command.output.trim() ? (
          <div className="max-h-[min(36rem,60vh)] overflow-auto px-6 py-5">
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-muted-foreground">
              {command.output}
            </pre>
          </div>
        ) : (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">No output available</p>
            <p className="mt-1">
              Command may not have any output, or output file is missing on the server.
            </p>
          </div>
        )}
      </CommandsCard>
    </div>
  );
}

export function AppCommandsTab({
  serverId,
  service,
  commandId = null,
}: {
  readonly serverId: string;
  readonly service: string;
  readonly commandId?: string | null;
}) {
  const navigate = useNavigate();
  const [commands, setCommands] = useState<readonly AppCommandRecord[]>([]);
  const [commandInput, setCommandInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AppCommandRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [runningOptimisticId, setRunningOptimisticId] = useState<string | null>(null);
  const [detailOverride, setDetailOverride] = useState<AppCommandRecord | null>(null);
  const runAbortRef = useRef<AbortController | null>(null);

  const openDetails = useCallback(
    (id: string, options?: { readonly replace?: boolean }) => {
      void navigate({
        to: "/servers/$serverId/apps/$service",
        params: { serverId, service },
        search: { tab: "commands", commandId: id },
        ...(options?.replace ? { replace: true } : {}),
      });
    },
    [navigate, serverId, service],
  );

  const closeDetails = useCallback(() => {
    setDetailOverride(null);
    void navigate({
      to: "/servers/$serverId/apps/$service",
      params: { serverId, service },
      search: { tab: "commands" },
    });
  }, [navigate, serverId, service]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAppCommands(serverId, service);
      if (!data.ok && data.error) {
        setError(data.error);
        setCommands([]);
        return;
      }
      setCommands(data.commands ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load commands");
      setCommands([]);
    } finally {
      setLoading(false);
    }
  }, [serverId, service]);

  useEffect(() => {
    void refresh();
    return () => {
      runAbortRef.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    if (!commandId || commandId.startsWith("pending-")) {
      return;
    }
    const existing = commands.find((entry) => entry.id === commandId);
    if (existing) {
      setDetailOverride(null);
      return;
    }
    let cancelled = false;
    void fetchAppCommand(serverId, service, commandId)
      .then((data) => {
        if (cancelled) return;
        if (data.ok && data.command) {
          setDetailOverride(data.command);
          setCommands((prev) => {
            if (prev.some((entry) => entry.id === data.command!.id)) return prev;
            return [data.command!, ...prev];
          });
        } else {
          setError(data.error ?? "Command not found");
          closeDetails();
        }
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Failed to load command");
        closeDetails();
      });
    return () => {
      cancelled = true;
    };
  }, [closeDetails, commandId, commands, serverId, service]);

  const selectedCommand =
    (commandId
      ? detailOverride?.id === commandId
        ? detailOverride
        : commands.find((entry) => entry.id === commandId)
      : null) ?? null;

  async function executeCommand(commandText: string) {
    const command = commandText.trim();
    if (!command || running) return;

    const optimisticId = `pending-${crypto.randomUUID()}`;
    const optimistic: AppCommandRecord = {
      id: optimisticId,
      serverId,
      service,
      command,
      directory: "/",
      user: "container",
      containerName: null,
      status: "running",
      exitCode: null,
      output: "",
      actorName: "Remon de Vries",
      actorInitials: "RV",
      createdAt: new Date().toISOString(),
      finishedAt: null,
    };

    const controller = new AbortController();
    runAbortRef.current = controller;
    setRunning(true);
    setRunningOptimisticId(optimisticId);
    setError(null);
    setCommandInput("");
    setDetailOverride(optimistic);
    setCommands((prev) => [optimistic, ...prev]);
    openDetails(optimisticId);

    try {
      const data = await runAppCommand({
        serverId,
        service,
        command,
        signal: controller.signal,
      });
      if (!data.ok || !data.command) {
        setError(data.error ?? "Failed to run command");
        setCommands((prev) => prev.filter((entry) => entry.id !== optimisticId));
        setDetailOverride(null);
        closeDetails();
        void refresh();
        return;
      }
      setCommands((prev) => [data.command!, ...prev.filter((entry) => entry.id !== optimisticId)]);
      setDetailOverride(data.command);
      openDetails(data.command.id, { replace: true });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setCommands((prev) => prev.filter((entry) => entry.id !== optimisticId));
        setDetailOverride(null);
        closeDetails();
        void refresh();
        return;
      }
      setError(cause instanceof Error ? cause.message : "Failed to run command");
      setCommands((prev) => prev.filter((entry) => entry.id !== optimisticId));
      setDetailOverride(null);
      closeDetails();
      void refresh();
    } finally {
      if (runAbortRef.current === controller) runAbortRef.current = null;
      setRunningOptimisticId((current) => (current === optimisticId ? null : current));
      setRunning(false);
    }
  }

  function cancelRunning() {
    runAbortRef.current?.abort();
  }

  async function onDeleteConfirmed() {
    if (!pendingDelete || deleting) return;
    const target = pendingDelete;
    setDeleting(true);
    setError(null);
    try {
      const data = await deleteAppCommand({
        serverId,
        service,
        commandId: target.id,
      });
      if (!data.ok) {
        setError(data.error ?? "Failed to delete command");
        return;
      }
      setCommands((prev) => prev.filter((entry) => entry.id !== target.id));
      setPendingDelete(null);
      if (commandId === target.id) closeDetails();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete command");
    } finally {
      setDeleting(false);
    }
  }

  if (commandId && selectedCommand) {
    return (
      <>
        {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
        <CommandDetailsView
          command={selectedCommand}
          running={running}
          onBack={closeDetails}
          onDelete={() => setPendingDelete(selectedCommand)}
          onRunAgain={() => void executeCommand(selectedCommand.command)}
        />
        <AlertDialog
          open={pendingDelete != null}
          onOpenChange={(open) => {
            if (!open && !deleting) setPendingDelete(null);
          }}
        >
          <AlertDialogPopup>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete command?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this command? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="outline" disabled={deleting} />}>
                Cancel
              </AlertDialogClose>
              <Button
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => void onDeleteConfirmed()}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogPopup>
        </AlertDialog>
      </>
    );
  }

  if (commandId && !selectedCommand) {
    return (
      <div className="rounded-xl border border-border/70 bg-card/40 px-6 py-12 text-center text-sm text-muted-foreground">
        Loading command…
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground">Commands</h2>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <CommandsCard
        title="Run new command"
        description="Execute a shell command inside this app's container. Commands run from the container workdir and may run for two minutes before timing out."
      >
        <div className="space-y-4 px-6 py-5">
          <div className="flex gap-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100/90">
            <InfoIcon className="mt-0.5 size-4 shrink-0 text-sky-300" />
            <p>
              Commands run via <span className="font-mono">docker exec</span> in the app container
              over SSH. Combined stdout and stderr are captured in the history below.
            </p>
          </div>
          <div className="relative">
            <Input
              value={commandInput}
              onChange={(event) => setCommandInput(event.target.value)}
              placeholder="ls -la"
              disabled={running}
              className="pr-36 font-mono"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void executeCommand(commandInput);
                }
              }}
            />
            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CornerDownLeftIcon className="size-3.5" />
              <span>Return to run</span>
            </div>
          </div>
        </div>
      </CommandsCard>

      <CommandsCard title="Recent commands">
        {loading ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">Loading commands…</div>
        ) : commands.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            No commands have been run yet.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {commands.map((entry) => {
              const isOptimisticRunning =
                entry.status === "running" && entry.id === runningOptimisticId;
              return (
                <div key={entry.id} className="flex items-center gap-3 px-6 py-4">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      if (!entry.id.startsWith("pending-")) openDetails(entry.id);
                    }}
                  >
                    <div className="truncate font-mono text-sm text-foreground">
                      {entry.command}
                    </div>
                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {entry.status === "running" ? (
                        <span>Running… · {entry.actorName} · Just now</span>
                      ) : (
                        <>
                          <ActorAvatar initials={entry.actorInitials} />
                          <span className="truncate">
                            {entry.actorName} · {formatRelative(entry.createdAt)}
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                  {entry.status === "running" && isOptimisticRunning ? (
                    <Button type="button" variant="outline" size="sm" onClick={cancelRunning}>
                      Cancel
                    </Button>
                  ) : (
                    <>
                      <StatusBadge status={entry.status} />
                      <Menu>
                        <MenuTrigger
                          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label={`Actions for ${entry.command}`}
                          disabled={running && entry.status === "running"}
                        >
                          <EllipsisIcon className="size-4" />
                        </MenuTrigger>
                        <MenuPopup align="end">
                          <MenuItem
                            disabled={entry.id.startsWith("pending-")}
                            onClick={() => openDetails(entry.id)}
                          >
                            <EyeIcon className="size-4" />
                            View output
                          </MenuItem>
                          <MenuItem
                            disabled={running}
                            onClick={() => void executeCommand(entry.command)}
                          >
                            <RotateCcwIcon className="size-4" />
                            Run again
                          </MenuItem>
                          <MenuItem
                            onClick={() => {
                              void writeTextToClipboard(entry.command, "command");
                            }}
                          >
                            <CopyIcon className="size-4" />
                            Copy command
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem
                            variant="destructive"
                            disabled={entry.id.startsWith("pending-")}
                            onClick={() => setPendingDelete(entry)}
                          >
                            <Trash2Icon className="size-4" />
                            Delete
                          </MenuItem>
                        </MenuPopup>
                      </Menu>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CommandsCard>

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete command?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this command? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" disabled={deleting} />}>
              Cancel
            </AlertDialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void onDeleteConfirmed()}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}

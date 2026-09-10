import { Link } from "@tanstack/react-router";
import {
  CheckCircle2Icon,
  EllipsisIcon,
  FileTextIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { ScrollArea } from "../ui/scroll-area";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import {
  createBackgroundProcess,
  createScheduledJob,
  deleteBackgroundProcess,
  deleteScheduledJob,
  fetchBackgroundProcessLog,
  fetchBackgroundProcesses,
  fetchScheduledJobs,
  fetchServerProcessUsers,
  restartBackgroundProcess,
  type BackgroundProcess,
  type ScheduleFrequency,
  type ScheduledJob,
  type StopSignal,
} from "./hetznerApi";
import type { StaticServerProfile } from "./staticServerProfiles";

export type ProcessesSectionId = "background" | "scheduler";

export function isProcessesSectionId(value: unknown): value is ProcessesSectionId {
  return value === "background" || value === "scheduler";
}

const PROCESSES_NAV = [
  { id: "background", label: "Background processes" },
  { id: "scheduler", label: "Scheduler" },
] as const;

const FREQUENCY_OPTIONS: readonly {
  readonly value: ScheduleFrequency;
  readonly label: string;
}[] = [
  { value: "every_minute", label: "Every minute" },
  { value: "every_hour", label: "Every hour" },
  { value: "every_night", label: "Every night" },
  { value: "every_week", label: "Every week" },
  { value: "every_month", label: "Every month" },
];

const STOP_SIGNAL_OPTIONS: readonly StopSignal[] = [
  "TERM",
  "INT",
  "QUIT",
  "KILL",
  "HUP",
  "USR1",
  "USR2",
];

function frequencyLabel(value: ScheduleFrequency): string {
  return FREQUENCY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

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

function ProcessesCard({
  title,
  description,
  action,
  children,
}: {
  readonly title: string;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly children?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
        <div className="min-w-0">
          <h3 className="text-base font-medium text-foreground">{title}</h3>
          {description ? (
            <div className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly onAction: () => void;
}) {
  return (
    <div className="px-6 py-6">
      <div className="flex flex-col items-center justify-center rounded-xl border border-border/60 bg-background/40 px-6 py-16 text-center">
        <p className="text-base font-medium text-foreground">{title}</p>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
        <Button type="button" variant="outline" className="mt-6 gap-1.5" onClick={onAction}>
          <PlusIcon className="size-4" />
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

function NewBackgroundProcessDialog({
  open,
  onOpenChange,
  serverId,
  service = null,
  users,
  onCreated,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly serverId: string;
  readonly service?: string | null;
  readonly users: readonly string[];
  readonly onCreated: (process: BackgroundProcess) => void;
}) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [directory, setDirectory] = useState("/root");
  const [user, setUser] = useState("root");
  const [processes, setProcesses] = useState("1");
  const [startSeconds, setStartSeconds] = useState("1");
  const [stopSeconds, setStopSeconds] = useState("15");
  const [stopSignal, setStopSignal] = useState<StopSignal>("TERM");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setCommand("");
    setDirectory("/root");
    setUser(users[0] ?? "root");
    setProcesses("1");
    setStartSeconds("1");
    setStopSeconds("15");
    setStopSignal("TERM");
    setAdvancedOpen(false);
    setSubmitError(null);
    setSubmitting(false);
  }, [open, users]);

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const data = await createBackgroundProcess({
        serverId,
        service,
        name,
        command,
        user,
        directory,
        processes: Number(processes),
        startSeconds: Number(startSeconds),
        stopSeconds: Number(stopSeconds),
        stopSignal,
      });
      if (!data.ok || !data.process) {
        setSubmitError(data.error ?? "Failed to create background process");
        return;
      }
      onCreated(data.process);
      onOpenChange(false);
    } catch (cause) {
      setSubmitError(
        cause instanceof Error ? cause.message : "Failed to create background process",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>New background process</DialogTitle>
          <DialogDescription>
            Create a new background process that will be restarted if it crashes or the server
            restarts.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="daemon-name">Name</Label>
            <Input
              id="daemon-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Horizon"
            />
            <p className="text-xs text-muted-foreground">
              Add a custom display name for the background process.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="daemon-command">Command</Label>
            <Textarea
              id="daemon-command"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="php artisan horizon"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              The command that should run for this background process.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="daemon-directory">Working Directory</Label>
            <Input
              id="daemon-directory"
              value={directory}
              onChange={(event) => setDirectory(event.target.value)}
              placeholder="/root"
            />
          </div>
          <div className="space-y-2">
            <Label>User</Label>
            <Select
              value={user}
              onValueChange={(value) => {
                if (typeof value === "string") setUser(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{user}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {users.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {entry}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>

          <div className="rounded-lg border border-border/60 bg-background/40 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                Processes: {processes} · Start: {startSeconds}s · Stop: {stopSeconds}s · Signal: SIG
                {stopSignal}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setAdvancedOpen((value) => !value)}
              >
                {advancedOpen ? "Hide" : "Edit"}
              </Button>
            </div>
            {advancedOpen ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="daemon-processes">Processes</Label>
                  <Input
                    id="daemon-processes"
                    type="number"
                    min={1}
                    max={32}
                    value={processes}
                    onChange={(event) => setProcesses(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="daemon-start">Start seconds</Label>
                  <Input
                    id="daemon-start"
                    type="number"
                    min={0}
                    value={startSeconds}
                    onChange={(event) => setStartSeconds(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="daemon-stop">Stop seconds</Label>
                  <Input
                    id="daemon-stop"
                    type="number"
                    min={1}
                    value={stopSeconds}
                    onChange={(event) => setStopSeconds(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Stop signal</Label>
                  <Select
                    value={stopSignal}
                    onValueChange={(value) => {
                      if (typeof value === "string") setStopSignal(value as StopSignal);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>SIG{stopSignal}</SelectValue>
                    </SelectTrigger>
                    <SelectPopup>
                      {STOP_SIGNAL_OPTIONS.map((signal) => (
                        <SelectItem key={signal} value={signal}>
                          SIG{signal}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </div>
              </div>
            ) : null}
          </div>

          {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}
        </DialogPanel>
        <DialogFooter variant="bare">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={submitting} onClick={() => void submit()}>
            {submitting ? "Creating…" : "Create background process"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function NewScheduledJobDialog({
  open,
  onOpenChange,
  serverId,
  service = null,
  serverName,
  users,
  onCreated,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly serverId: string;
  readonly service?: string | null;
  readonly serverName: string;
  readonly users: readonly string[];
  readonly onCreated: (job: ScheduledJob) => void;
}) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [user, setUser] = useState("root");
  const [frequency, setFrequency] = useState<ScheduleFrequency>("every_hour");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setCommand("");
    setUser(users[0] ?? "root");
    setFrequency("every_hour");
    setSubmitError(null);
    setSubmitting(false);
  }, [open, users]);

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const data = await createScheduledJob({
        serverId,
        service,
        name,
        command,
        user,
        frequency,
      });
      if (!data.ok || !data.job) {
        setSubmitError(data.error ?? "Failed to create scheduled job");
        return;
      }
      onCreated(data.job);
      onOpenChange(false);
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "Failed to create scheduled job");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>New scheduled job</DialogTitle>
          <DialogDescription>
            Create a new scheduled job for the <span className="text-foreground">{serverName}</span>{" "}
            server.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="job-name">Name</Label>
            <Input
              id="job-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My scheduled job"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="job-command">Command</Label>
            <Textarea
              id="job-command"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="/usr/local/bin/composer self-update"
              rows={3}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Commands should use fully qualified paths.
            </p>
          </div>
          <div className="space-y-2">
            <Label>User</Label>
            <Select
              value={user}
              onValueChange={(value) => {
                if (typeof value === "string") setUser(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{user}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {users.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {entry}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select
              value={frequency}
              onValueChange={(value) => {
                if (typeof value === "string") setFrequency(value as ScheduleFrequency);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{frequencyLabel(frequency)}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {FREQUENCY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
          {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}
        </DialogPanel>
        <DialogFooter variant="bare">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={submitting} onClick={() => void submit()}>
            {submitting ? "Creating…" : "Create scheduled job"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function ProcessLogDialog({
  open,
  onOpenChange,
  title,
  lines,
  loading,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly lines: readonly string[];
  readonly loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-3xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Recent Supervisor output for this process.</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="max-h-[min(60vh,28rem)] overflow-auto rounded-lg bg-[#0b0b0b] px-4 py-3 font-mono text-[12px] leading-5 text-foreground/90">
            {loading ? (
              <div className="text-muted-foreground">Loading log…</div>
            ) : lines.length === 0 ? (
              <div className="text-muted-foreground">No log output yet.</div>
            ) : (
              <pre className="whitespace-pre-wrap break-all">{lines.join("\n")}</pre>
            )}
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

export function BackgroundProcessesPanel({
  profile,
  users,
  service = null,
  variant = "card",
}: {
  readonly profile: StaticServerProfile;
  readonly users: readonly string[];
  /** Kamal service name for app-scoped daemons; null for server-level. */
  readonly service?: string | null;
  readonly variant?: "card" | "section";
}) {
  const [processes, setProcesses] = useState<readonly BackgroundProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logTitle, setLogTitle] = useState("");
  const [logLines, setLogLines] = useState<readonly string[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBackgroundProcesses(profile.id, { service });
      if (!data.ok && data.error) {
        setError(data.error);
        setProcesses([]);
        return;
      }
      setProcesses(data.processes ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load background processes");
      setProcesses([]);
    } finally {
      setLoading(false);
    }
  }, [profile.id, service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function showLog(process: BackgroundProcess) {
    setLogTitle(process.name);
    setLogOpen(true);
    setLogLoading(true);
    setLogLines([]);
    try {
      const data = await fetchBackgroundProcessLog(profile.id, process.id);
      setLogLines(data.lines ?? []);
    } catch {
      setLogLines(["Failed to load log."]);
    } finally {
      setLogLoading(false);
    }
  }

  async function restart(process: BackgroundProcess) {
    try {
      const data = await restartBackgroundProcess(profile.id, process.id);
      if (!data.ok || !data.process) {
        setError(data.error ?? "Failed to restart process");
        return;
      }
      setProcesses((current) =>
        current.map((entry) => (entry.id === process.id ? data.process! : entry)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to restart process");
    }
  }

  async function remove(process: BackgroundProcess) {
    try {
      const data = await deleteBackgroundProcess(profile.id, process.id);
      if (!data.ok) {
        setError(data.error ?? "Failed to delete process");
        return;
      }
      setProcesses((current) => current.filter((entry) => entry.id !== process.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete process");
    }
  }

  const addButton =
    variant === "section" ? (
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="text-muted-foreground"
        onClick={() => setDialogOpen(true)}
        aria-label="Add background process"
      >
        <PlusIcon className="size-4" />
      </Button>
    ) : processes.length > 0 ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setDialogOpen(true)}
      >
        <PlusIcon className="size-4" />
        Add background process
      </Button>
    ) : null;

  const body = loading ? (
    <div
      className={cn(
        "text-sm text-muted-foreground",
        variant === "section" ? "px-4 py-8" : "px-6 py-8",
      )}
    >
      Loading background processes…
    </div>
  ) : error ? (
    <div
      className={cn("text-sm text-destructive", variant === "section" ? "px-4 py-8" : "px-6 py-8")}
    >
      {error}
    </div>
  ) : processes.length === 0 ? (
    variant === "section" ? (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        No background processes yet
      </div>
    ) : (
      <EmptyState
        title="No background processes yet"
        description="Get started and create your first background process."
        actionLabel="Add background process"
        onAction={() => setDialogOpen(true)}
      />
    )
  ) : (
    <div className="divide-y divide-border/60">
      {variant === "card" ? (
        <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_6rem_7rem_7rem_2.5rem] gap-3 px-6 py-2 text-xs text-muted-foreground sm:grid">
          <div>Name</div>
          <div>Command</div>
          <div>User</div>
          <div>Status</div>
          <div>Created</div>
          <div />
        </div>
      ) : null}
      {processes.map((process) => (
        <div
          key={process.id}
          className={cn(
            "grid gap-2 sm:items-center sm:gap-3",
            variant === "section"
              ? "grid-cols-[minmax(0,1fr)_auto] px-4 py-3"
              : "px-6 py-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_6rem_7rem_7rem_2.5rem]",
          )}
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{process.name}</div>
            {variant === "section" ? (
              <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                {process.command}
              </div>
            ) : (
              <div className="mt-1 text-xs text-muted-foreground sm:hidden">
                {process.user} · {process.processes} process{process.processes === 1 ? "" : "es"}
              </div>
            )}
          </div>
          {variant === "card" ? (
            <>
              <div className="truncate font-mono text-xs text-muted-foreground">
                {process.command}
              </div>
              <div className="hidden text-sm text-muted-foreground sm:block">{process.user}</div>
              <div>
                <Badge
                  variant="secondary"
                  className={cn(
                    "gap-1.5",
                    process.status === "running"
                      ? "bg-[#3d9a6a]/15 text-[#3d9a6a]"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      process.status === "running" ? "bg-[#3d9a6a]" : "bg-muted-foreground",
                    )}
                  />
                  {process.status === "running" ? "Active" : process.statusLabel}
                </Badge>
              </div>
              <div className="hidden text-sm text-muted-foreground sm:block">
                {formatRelative(process.createdAt)}
              </div>
            </>
          ) : (
            <Badge
              variant="secondary"
              className={cn(
                "gap-1.5 justify-self-end",
                process.status === "running"
                  ? "bg-[#3d9a6a]/15 text-[#3d9a6a]"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  process.status === "running" ? "bg-[#3d9a6a]" : "bg-muted-foreground",
                )}
              />
              {process.status === "running" ? "Active" : process.statusLabel}
            </Badge>
          )}
          {variant === "card" ? (
            <Menu>
              <MenuTrigger
                className="inline-flex size-7 shrink-0 items-center justify-center justify-self-end rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`Actions for ${process.name}`}
              >
                <EllipsisIcon className="size-4" />
              </MenuTrigger>
              <MenuPopup align="end">
                <MenuItem onClick={() => void showLog(process)}>
                  <FileTextIcon className="size-4" />
                  Show log
                </MenuItem>
                <MenuItem onClick={() => void restart(process)}>
                  <RefreshCwIcon className="size-4" />
                  Restart process
                </MenuItem>
                <MenuItem variant="destructive" onClick={() => void remove(process)}>
                  <Trash2Icon className="size-4" />
                  Delete process
                </MenuItem>
              </MenuPopup>
            </Menu>
          ) : null}
        </div>
      ))}
    </div>
  );

  return (
    <>
      {variant === "section" ? (
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-muted-foreground">Background processes</h3>
            {addButton}
          </div>
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
            {body}
          </div>
        </section>
      ) : (
        <ProcessesCard
          title="Background processes"
          description={
            <>
              Background processes are managed using Supervisor, which monitors your processes and
              automatically restarts them if they crash or stop unexpectedly.
            </>
          }
          action={addButton}
        >
          {body}
        </ProcessesCard>
      )}

      <NewBackgroundProcessDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        serverId={profile.id}
        service={service}
        users={users}
        onCreated={(process) => setProcesses((current) => [process, ...current])}
      />
      <ProcessLogDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        title={logTitle}
        lines={logLines}
        loading={logLoading}
      />
    </>
  );
}

export function SchedulerPanel({
  profile,
  users,
  service = null,
  variant = "card",
}: {
  readonly profile: StaticServerProfile;
  readonly users: readonly string[];
  readonly service?: string | null;
  readonly variant?: "card" | "section";
}) {
  const [jobs, setJobs] = useState<readonly ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchScheduledJobs(profile.id, { service });
      if (!data.ok && data.error) {
        setError(data.error);
        setJobs([]);
        return;
      }
      setJobs(data.jobs ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load scheduled jobs");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [profile.id, service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function remove(job: ScheduledJob) {
    try {
      const data = await deleteScheduledJob(profile.id, job.id);
      if (!data.ok) {
        setError(data.error ?? "Failed to delete scheduled job");
        return;
      }
      setJobs((current) => current.filter((entry) => entry.id !== job.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete scheduled job");
    }
  }

  const addButton =
    variant === "section" ? (
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="text-muted-foreground"
        onClick={() => setDialogOpen(true)}
        aria-label="Add scheduled job"
      >
        <PlusIcon className="size-4" />
      </Button>
    ) : jobs.length > 0 ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setDialogOpen(true)}
      >
        <PlusIcon className="size-4" />
        Add scheduled task
      </Button>
    ) : null;

  const body = loading ? (
    <div
      className={cn(
        "text-sm text-muted-foreground",
        variant === "section" ? "px-4 py-8" : "px-6 py-8",
      )}
    >
      Loading scheduled jobs…
    </div>
  ) : error ? (
    <div
      className={cn("text-sm text-destructive", variant === "section" ? "px-4 py-8" : "px-6 py-8")}
    >
      {error}
    </div>
  ) : jobs.length === 0 ? (
    variant === "section" ? (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        No scheduled jobs yet
      </div>
    ) : (
      <EmptyState
        title="No scheduled tasks yet"
        description="Get started and create your first scheduled task."
        actionLabel="Add scheduled task"
        onAction={() => setDialogOpen(true)}
      />
    )
  ) : (
    <div className="divide-y divide-border/60">
      {jobs.map((job) => (
        <div
          key={job.id}
          className={cn(
            "flex items-start gap-3",
            variant === "section" ? "px-4 py-3" : "px-6 py-4",
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">{job.name}</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {job.user} · <span className="font-mono">{job.command}</span>
            </div>
          </div>
          {variant === "card" ? (
            <>
              <div className="hidden shrink-0 text-sm text-muted-foreground sm:block">
                {frequencyLabel(job.frequency)}
              </div>
              <Badge
                variant="secondary"
                className="hidden shrink-0 gap-1 bg-[#3d9a6a]/15 text-[#3d9a6a] sm:inline-flex"
              >
                <CheckCircle2Icon className="size-3.5" />
                Installed
              </Badge>
              <Menu>
                <MenuTrigger
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={`Actions for ${job.name}`}
                >
                  <EllipsisIcon className="size-4" />
                </MenuTrigger>
                <MenuPopup align="end">
                  <MenuItem variant="destructive" onClick={() => void remove(job)}>
                    <Trash2Icon className="size-4" />
                    Delete job
                  </MenuItem>
                </MenuPopup>
              </Menu>
            </>
          ) : (
            <div className="shrink-0 text-xs text-muted-foreground">
              {frequencyLabel(job.frequency)}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <>
      {variant === "section" ? (
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-muted-foreground">Scheduled jobs</h3>
            {addButton}
          </div>
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
            {body}
          </div>
        </section>
      ) : (
        <ProcessesCard
          title="Scheduler"
          description="The scheduler is used to run tasks periodically at fixed times, dates, or intervals. It is equivalent to a cron job."
          action={addButton}
        >
          {body}
        </ProcessesCard>
      )}

      <NewScheduledJobDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        serverId={profile.id}
        service={service}
        serverName={profile.name}
        users={users}
        onCreated={(job) => setJobs((current) => [job, ...current])}
      />
    </>
  );
}

export function ServerProcessesTab({
  profile,
  section,
  service = null,
  layout = "page",
}: {
  readonly profile: StaticServerProfile;
  readonly section: ProcessesSectionId;
  /** When set, scopes processes/jobs to a Kamal app (Forge site-style). */
  readonly service?: string | null;
  readonly layout?: "page" | "embedded";
}) {
  const [users, setUsers] = useState<readonly string[]>(["root", "deploy", "www-data"]);

  useEffect(() => {
    void fetchServerProcessUsers(profile.id).then((data) => {
      if (data.users?.length) setUsers(data.users);
    });
  }, [profile.id]);

  const body = (
    <div className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] xl:gap-14">
      <aside className="min-w-0">
        <h2 className="px-2 text-3xl font-semibold tracking-tight text-foreground">Processes</h2>
        <nav aria-label="Processes" className="mt-6 flex flex-col gap-1.5">
          {PROCESSES_NAV.map((item) => {
            const active = item.id === section;
            return service ? (
              <Link
                key={item.id}
                to="/servers/$serverId/apps/$service"
                params={{ serverId: profile.id, service }}
                search={{ tab: "processes", section: item.id }}
                className={cn(
                  "rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            ) : (
              <Link
                key={item.id}
                to="/servers/$serverId"
                params={{ serverId: profile.id }}
                search={{ tab: "processes", section: item.id }}
                className={cn(
                  "rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0">
        {section === "background" ? (
          <BackgroundProcessesPanel profile={profile} users={users} service={service} />
        ) : null}
        {section === "scheduler" ? (
          <SchedulerPanel profile={profile} users={users} service={service} />
        ) : null}
      </div>
    </div>
  );

  if (layout === "embedded") return body;

  return (
    <ScrollArea className="min-h-0 flex-1">
      <WorkspacePageContainer width="expanded" className="gap-10 py-8">
        {body}
      </WorkspacePageContainer>
    </ScrollArea>
  );
}

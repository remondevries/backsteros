import { Link } from "@tanstack/react-router";
import {
  CopyIcon,
  EyeIcon,
  GitBranchIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import {
  fetchAppDeploy,
  fetchAppEnv,
  fetchAppSettings,
  updateAppDeploy,
  updateAppEnv,
  updateAppSettings,
  type AppDeploySettings,
  type AppFramework,
  type AppSettingsRecord,
  type AppSiteNote,
  type DiscoveredSite,
} from "./hetznerApi";
import { WordpressComponentsSettings } from "./WordpressComponentsSettings";
import { NotificationsSettings } from "./NotificationsSettings";

export type SettingsSectionId =
  | "general"
  | "deployments"
  | "environment"
  | "notifications"
  | "integrations";

export function isSettingsSectionId(value: unknown): value is SettingsSectionId {
  return (
    value === "general" ||
    value === "deployments" ||
    value === "environment" ||
    value === "notifications" ||
    value === "integrations"
  );
}

const SETTINGS_NAV = [
  { id: "general", label: "General" },
  { id: "deployments", label: "Deployments" },
  { id: "environment", label: "Environment" },
  { id: "notifications", label: "Notifications" },
  { id: "integrations", label: "Integrations" },
] as const;

const FRAMEWORK_OPTIONS: readonly { readonly value: AppFramework; readonly label: string }[] = [
  { value: "docker", label: "Docker / Kamal" },
  { value: "wordpress", label: "WordPress" },
  { value: "laravel", label: "Laravel" },
  { value: "nodejs", label: "Node.js" },
  { value: "static", label: "Static" },
  { value: "generic", label: "Generic" },
];

const COLOR_SWATCHES = [
  "#5b8def",
  "#3d9a6a",
  "#c4922a",
  "#7c5cbf",
  "#c45c5c",
  "#e0b44e",
  "#5cb8d6",
  "#e8e8e8",
  null,
] as const;

function SettingsCard({
  title,
  description,
  danger,
  children,
}: {
  readonly title: string;
  readonly description?: React.ReactNode;
  readonly danger?: boolean;
  readonly children?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border bg-card/40",
        danger ? "border-destructive/40" : "border-border/70",
      )}
    >
      <div className="border-b border-border/60 px-6 py-5">
        <h3
          className={cn("text-base font-medium", danger ? "text-destructive" : "text-foreground")}
        >
          {title}
        </h3>
        {description ? (
          <div className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SettingsRow({
  label,
  description,
  children,
}: {
  readonly label: string;
  readonly description: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 sm:max-w-[55%]">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="flex w-full shrink-0 justify-start sm:w-auto sm:min-w-[14rem] sm:justify-end">
        {children}
      </div>
    </div>
  );
}

function DirectoryField({
  base,
  value,
  disabled,
  onChange,
  onBlur,
}: {
  readonly base: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
  readonly onBlur: () => void;
}) {
  return (
    <div className="flex w-full max-w-md overflow-hidden rounded-lg border border-border/70 bg-background/60">
      <div className="flex max-w-[55%] items-center truncate border-r border-border/70 bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
        {base}
      </div>
      <Input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className="rounded-none border-0 bg-transparent font-mono shadow-none focus-visible:ring-0"
      />
    </div>
  );
}

function PlaceholderSection({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <SettingsCard title={title} description={description}>
      <div className="px-6 py-10 text-center text-sm text-muted-foreground">
        This section is not wired yet for Kamal apps.
      </div>
    </SettingsCard>
  );
}

function EnvironmentSettings({
  serverId,
  service,
}: {
  readonly serverId: string;
  readonly service: string;
}) {
  const [content, setContent] = useState("");
  const [draft, setDraft] = useState("");
  const [remotePath, setRemotePath] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAppEnv(serverId, service);
      if (!data.ok) {
        setError(data.error ?? "Failed to load environment");
        setContent("");
        setDraft("");
        return;
      }
      const next = data.content ?? "";
      setContent(next);
      setDraft(next);
      setRemotePath(data.remotePath ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load environment");
      setContent("");
      setDraft("");
    } finally {
      setLoading(false);
    }
  }, [serverId, service]);

  useEffect(() => {
    setRevealed(false);
    void refresh();
  }, [refresh]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const data = await updateAppEnv({ serverId, service, content: draft });
      if (!data.ok) throw new Error(data.error ?? "Failed to update environment");
      const next = data.content ?? draft;
      setContent(next);
      setDraft(next);
      if (data.remotePath) setRemotePath(data.remotePath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to update environment");
    } finally {
      setBusy(false);
    }
  }

  const dirty = draft !== content;
  const previewLines =
    draft.trim().length > 0
      ? draft
      : "APP_NAME=example\nAPP_ENV=production\nAPP_KEY=\nDB_CONNECTION=mysql\n";

  return (
    <div className="flex min-w-0 flex-col gap-8">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <SettingsCard
        title="Environment"
        description={
          <>
            Below you may edit the{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              .env
            </code>{" "}
            file for your application, which is a standard default environment file that
            applications typically load. If the application is uninstalled, the environment file
            will also be removed.
          </>
        }
      >
        <div className="border-b border-border/60 px-6 py-5">
          <div className="text-sm font-medium text-foreground">Environment variables</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Your application&apos;s environment variables
            {remotePath ? (
              <>
                {" "}
                · synced to{" "}
                <code className="font-mono text-xs text-foreground/80">{remotePath}</code>
              </>
            ) : null}
            .
          </p>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-sm text-muted-foreground">Loading environment…</div>
        ) : (
          <>
            <div className="relative mx-6 my-5 overflow-hidden rounded-xl border border-border/70 bg-background/70">
              {!revealed ? (
                <>
                  <pre
                    aria-hidden
                    className="max-h-80 min-h-56 overflow-hidden whitespace-pre-wrap break-all p-4 font-mono text-xs leading-relaxed text-muted-foreground blur-[7px] select-none"
                  >
                    {previewLines}
                  </pre>
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/20 px-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      Environment variables should not be shared publicly.
                    </p>
                    <Button type="button" className="gap-1.5" onClick={() => setRevealed(true)}>
                      <EyeIcon className="size-4" />
                      Reveal
                    </Button>
                  </div>
                </>
              ) : (
                <Textarea
                  value={draft}
                  disabled={busy}
                  spellCheck={false}
                  className="min-h-56 resize-y rounded-none border-0 bg-transparent font-mono text-xs leading-relaxed shadow-none focus-visible:ring-0"
                  onChange={(event) => setDraft(event.target.value)}
                />
              )}
            </div>

            {revealed ? (
              <div className="flex justify-end border-t border-border/60 px-6 py-4">
                <Button type="button" disabled={busy || !dirty} onClick={() => void save()}>
                  {busy ? "Updating…" : "Update Environment"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </SettingsCard>
    </div>
  );
}

function DeploymentsSettings({
  serverId,
  service,
}: {
  readonly serverId: string;
  readonly service: string;
}) {
  const [settings, setSettings] = useState<AppDeploySettings | null>(null);
  const [hookUrl, setHookUrl] = useState("");
  const [sitePublicKey, setSitePublicKey] = useState<string | null>(null);
  const [scriptDraft, setScriptDraft] = useState("");
  const [healthPath, setHealthPath] = useState("/up");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const [isWordpress, setIsWordpress] = useState(false);

  const applyPayload = useCallback(
    (data: {
      readonly settings?: AppDeploySettings;
      readonly hookUrl?: string;
      readonly sitePublicKey?: string | null;
      readonly lastDeployStatus?: string | null;
    }) => {
      if (data.settings) {
        setSettings(data.settings);
        setScriptDraft(data.settings.deployScript);
        setHealthPath(data.settings.healthCheckPath);
      }
      if (data.hookUrl) setHookUrl(data.hookUrl);
      if ("sitePublicKey" in data) setSitePublicKey(data.sitePublicKey ?? null);
      if ("lastDeployStatus" in data) setLastStatus(data.lastDeployStatus ?? null);
    },
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, general] = await Promise.all([
        fetchAppDeploy(serverId, service),
        fetchAppSettings(serverId, service),
      ]);
      const wordpress =
        general.ok &&
        (general.runtime === "wordpress" || general.settings?.framework === "wordpress");
      setIsWordpress(Boolean(wordpress));
      if (!data.ok || !data.settings) {
        setError(data.error ?? "Failed to load deployment settings");
        setSettings(null);
        return;
      }
      applyPayload(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load deployment settings");
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, [applyPayload, serverId, service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const data = await updateAppDeploy({ serverId, service, ...body });
      if (!data.ok || !data.settings) {
        throw new Error(data.error ?? "Failed to save deployment settings");
      }
      applyPayload(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save deployment settings");
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  if (loading || !settings) {
    return (
      <div className="rounded-xl border border-border/70 bg-card/40 px-6 py-10 text-sm text-muted-foreground">
        {error ?? "Loading deployment settings…"}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-8">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {isWordpress ? <WordpressComponentsSettings serverId={serverId} service={service} /> : null}

      <SettingsCard
        title="Deployments"
        description={
          isWordpress
            ? "Legacy whole-site script (optional). Prefer component deploys above for theme/plugin paths."
            : "Manage build and deployment settings. Scripts run on the app host over SSH (Forge-style adapter for Kamal and future WordPress/Compose sites)."
        }
      >
        <div className="divide-y divide-border/60">
          <div className="px-6 py-5">
            <div className="text-sm font-medium text-foreground">Deploy script</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Commands run to deploy this application. Deployments are limited to 10 minutes.
            </p>
            <Textarea
              value={scriptDraft}
              disabled={busy}
              spellCheck={false}
              className="mt-4 min-h-64 font-mono text-xs leading-relaxed"
              onChange={(event) => setScriptDraft(event.target.value)}
              onBlur={() => {
                if (scriptDraft !== settings.deployScript) {
                  void patch({ deployScript: scriptDraft });
                }
              }}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={settings.injectEnv}
                  disabled={busy}
                  onCheckedChange={(checked) => {
                    void patch({ injectEnv: checked === true });
                  }}
                />
                Make host environment variables available to deployment script
              </label>
              {lastStatus ? (
                <span className="text-xs text-muted-foreground">Last deploy: {lastStatus}</span>
              ) : null}
            </div>
          </div>

          <SettingsRow
            label="Deploy hook"
            description="Configure CI to GET or POST this URL after commits or successful tests to trigger a deployment."
          >
            <div className="flex w-full max-w-xl items-center gap-2">
              <Input readOnly value={hookUrl} className="min-w-0 flex-1 font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={busy}
                aria-label="Rotate deploy hook token"
                onClick={() => void patch({ rotateHookToken: true })}
              >
                <RefreshCwIcon className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Copy deploy hook"
                onClick={() => void writeTextToClipboard(hookUrl, "deploy hook")}
              >
                <CopyIcon className="size-4" />
              </Button>
            </div>
          </SettingsRow>

          <SettingsRow
            label="Health checks"
            description="After deploying, ping a URL on this site to ensure it is still available."
          >
            <div className="flex flex-col items-end gap-2">
              <Switch
                checked={settings.healthChecksEnabled}
                disabled={busy}
                onCheckedChange={(checked) => {
                  void patch({ healthChecksEnabled: checked });
                }}
              />
              {settings.healthChecksEnabled ? (
                <Input
                  value={healthPath}
                  disabled={busy}
                  className="w-40 font-mono text-xs"
                  placeholder="/up"
                  onChange={(event) => setHealthPath(event.target.value)}
                  onBlur={() => {
                    if (healthPath !== settings.healthCheckPath) {
                      void patch({ healthCheckPath: healthPath });
                    }
                  }}
                />
              ) : null}
            </div>
          </SettingsRow>
        </div>
        <div className="flex justify-end border-t border-border/60 px-6 py-4">
          <Button type="button" disabled={busy} onClick={() => void patch({ action: "trigger" })}>
            {busy ? "Working…" : "Deploy now"}
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard title="Keys" description="Your site's public SSH keys.">
        <SettingsRow
          label="Site public key"
          description="Typically added to GitHub or GitLab for private repos. Copy it here if you need to add it manually."
        >
          <div className="flex w-full max-w-xl items-center gap-2">
            <Input
              readOnly
              value={sitePublicKey ?? "No public key found on the server yet"}
              className="min-w-0 flex-1 font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!sitePublicKey}
              aria-label="Copy public key"
              onClick={() => {
                if (sitePublicKey) void writeTextToClipboard(sitePublicKey, "public key");
              }}
            >
              <CopyIcon className="size-4" />
            </Button>
          </div>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}

function GeneralSettings({
  service: _service,
  site,
  directoryBase,
  settings,
  busy,
  onPatch,
  onDeleteSite,
}: {
  readonly serverId: string;
  readonly service: string;
  readonly site: DiscoveredSite;
  readonly directoryBase: string;
  readonly settings: AppSettingsRecord;
  readonly busy: boolean;
  readonly onPatch: (patch: Record<string, unknown>) => Promise<void>;
  readonly onDeleteSite: () => void;
}) {
  const [framework, setFramework] = useState(settings.framework);
  const [runtimeVersion, setRuntimeVersion] = useState(settings.runtimeVersion);
  const [tags, setTags] = useState(settings.tags);
  const [rootDirectory, setRootDirectory] = useState(settings.rootDirectory);
  const [webDirectory, setWebDirectory] = useState(settings.webDirectory);
  const [gitRepository, setGitRepository] = useState(settings.gitRepository);
  const [gitBranch, setGitBranch] = useState(settings.gitBranch);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFramework(settings.framework);
    setRuntimeVersion(settings.runtimeVersion);
    setTags(settings.tags);
    setRootDirectory(settings.rootDirectory);
    setWebDirectory(settings.webDirectory);
    setGitRepository(settings.gitRepository);
    setGitBranch(settings.gitBranch);
  }, [settings]);

  const accent = settings.accent ?? site.accent;
  const initial = settings.initial || site.initial;

  async function saveNote() {
    if (!noteBody.trim()) return;
    await onPatch({ action: "add_note", body: noteBody.trim() });
    setNoteBody("");
    setNoteOpen(false);
  }

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <SettingsCard title="Settings" description="Configure your site's basic settings.">
        <div className="divide-y divide-border/60">
          <SettingsRow
            label="Framework"
            description="The framework used by the installed application. Changing the framework does not modify proxy configuration."
          >
            <Select
              value={framework}
              onValueChange={(value) => {
                if (!value) return;
                const next = value as AppFramework;
                setFramework(next);
                void onPatch({ framework: next });
              }}
              disabled={busy}
            >
              <SelectTrigger className="w-full min-w-[12rem] sm:w-56">
                <SelectValue>
                  {FRAMEWORK_OPTIONS.find((option) => option.value === framework)?.label ??
                    framework}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {FRAMEWORK_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </SettingsRow>

          <SettingsRow
            label="Runtime version"
            description="Label for the app runtime or image tag. Update deployment scripts and processes if the real runtime changes."
          >
            <Input
              value={runtimeVersion}
              disabled={busy}
              className="w-full sm:w-56"
              onChange={(event) => setRuntimeVersion(event.target.value)}
              onBlur={() => {
                if (runtimeVersion !== settings.runtimeVersion) {
                  void onPatch({ runtimeVersion });
                }
              }}
            />
          </SettingsRow>

          <SettingsRow
            label="Tags"
            description="Tags are used to help you organize and find your sites."
          >
            <Input
              value={tags}
              disabled={busy}
              placeholder="production, blog"
              className="w-full sm:w-56"
              onChange={(event) => setTags(event.target.value)}
              onBlur={() => {
                if (tags !== settings.tags) void onPatch({ tags });
              }}
            />
          </SettingsRow>

          <SettingsRow label="Avatar" description="Click on the avatar to upload a custom one.">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex size-14 items-center justify-center overflow-hidden rounded-xl text-lg font-semibold text-white"
                style={{ backgroundColor: accent }}
                aria-label="Upload avatar"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                {settings.avatarDataUrl ? (
                  <img src={settings.avatarDataUrl} alt="" className="size-full object-cover" />
                ) : (
                  initial
                )}
              </button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                Upload image
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  if (file.size > 400_000) {
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    const result = typeof reader.result === "string" ? reader.result : null;
                    if (result) void onPatch({ avatarDataUrl: result });
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </div>
          </SettingsRow>

          <SettingsRow
            label="Color"
            description="Select a color to identify your site in the control plane."
          >
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_SWATCHES.map((color) => {
                const selected =
                  color === null ? settings.accent == null : settings.accent === color;
                return (
                  <button
                    key={color ?? "none"}
                    type="button"
                    disabled={busy}
                    aria-label={color ?? "No color"}
                    className={cn(
                      "size-7 rounded-full border border-border/70 transition-transform",
                      selected && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                    )}
                    style={{
                      backgroundColor: color ?? "transparent",
                      backgroundImage:
                        color == null
                          ? "linear-gradient(135deg, transparent 46%, #888 48%, #888 52%, transparent 54%)"
                          : undefined,
                    }}
                    onClick={() => void onPatch({ accent: color })}
                  />
                );
              })}
            </div>
          </SettingsRow>

          <SettingsRow
            label="Notes"
            description="You may add notes to your site to help you remember important information about it."
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setNoteOpen(true)}
            >
              Add note
            </Button>
          </SettingsRow>
        </div>
        {settings.notes.length > 0 ? (
          <div className="divide-y divide-border/60 border-t border-border/60">
            {settings.notes.map((note: AppSiteNote) => (
              <div key={note.id} className="flex items-start gap-3 px-6 py-4">
                <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-foreground">
                  {note.body}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground"
                  disabled={busy}
                  aria-label="Delete note"
                  onClick={() => void onPatch({ action: "delete_note", noteId: note.id })}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </SettingsCard>

      <SettingsCard
        title="Directories"
        description="Configure your site's directory settings. If you have queue workers, background processes or scheduled jobs configured for this site, you will need to re-create them after updating the directories."
      >
        <div className="divide-y divide-border/60">
          <SettingsRow
            label="Root directory"
            description="The root directory for your site. This is where your application code lives."
          >
            <DirectoryField
              base={directoryBase}
              value={rootDirectory}
              disabled={busy}
              onChange={setRootDirectory}
              onBlur={() => {
                if (rootDirectory !== settings.rootDirectory) {
                  void onPatch({ rootDirectory });
                }
              }}
            />
          </SettingsRow>
          <SettingsRow
            label="Web directory"
            description="The publicly accessible directory served by the app container."
          >
            <DirectoryField
              base={directoryBase}
              value={webDirectory}
              disabled={busy}
              onChange={setWebDirectory}
              onBlur={() => {
                if (webDirectory !== settings.webDirectory) {
                  void onPatch({ webDirectory });
                }
              }}
            />
          </SettingsRow>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Git"
        description={
          framework === "wordpress"
            ? "Optional metadata only. WordPress sites deploy per component (Settings → Deployments) — not from a single site remote."
            : "Configure your site's Git settings."
        }
      >
        <div className="divide-y divide-border/60">
          <SettingsRow
            label="Repository"
            description={
              framework === "wordpress"
                ? "Not used for component deploys. Prefer the components table under Deployments."
                : "Configure the Git repository that should be deployed."
            }
          >
            <div className="relative w-full sm:w-72">
              <GitBranchIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={gitRepository}
                disabled={busy || framework === "wordpress"}
                className="pl-9 font-mono text-xs"
                placeholder={
                  framework === "wordpress"
                    ? "See Deployments → components"
                    : "git@github.com:org/repo.git"
                }
                onChange={(event) => setGitRepository(event.target.value)}
                onBlur={() => {
                  if (gitRepository !== settings.gitRepository) {
                    void onPatch({ gitRepository });
                  }
                }}
              />
            </div>
          </SettingsRow>
          <SettingsRow
            label="Branch"
            description={
              framework === "wordpress"
                ? "Per-component refs are configured on each component."
                : "Configure the Git branch that should be deployed."
            }
          >
            <Input
              value={gitBranch}
              disabled={busy || framework === "wordpress"}
              className="w-full font-mono sm:w-56"
              onChange={(event) => setGitBranch(event.target.value)}
              onBlur={() => {
                if (gitBranch !== settings.gitBranch) {
                  void onPatch({ gitBranch });
                }
              }}
            />
          </SettingsRow>
        </div>
      </SettingsCard>

      <SettingsCard title="Danger" description="Destructive actions that cannot be undone." danger>
        <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 sm:max-w-[70%]">
            <div className="text-sm font-medium text-foreground">Delete site</div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Deleting a site removes it from Kamal Proxy and stops its containers on{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                {site.domain}
              </code>
              . Docker volumes are kept.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10"
            disabled={busy}
            onClick={onDeleteSite}
          >
            <Trash2Icon className="size-4" />
            Delete site
          </Button>
        </div>
      </SettingsCard>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogPopup className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Add note</DialogTitle>
            <DialogDescription>
              Notes are stored in the control plane for this app.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-2">
            <Textarea
              value={noteBody}
              onChange={(event) => setNoteBody(event.target.value)}
              placeholder="Remember to rotate the DB password…"
              rows={5}
              disabled={busy}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || !noteBody.trim()}
              onClick={() => void saveNote()}
            >
              <PlusIcon className="size-4" />
              Save note
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}

export function AppSettingsTab({
  serverId,
  service,
  site,
  section = "general",
  onAppearanceChange,
  onDeleteSite,
}: {
  readonly serverId: string;
  readonly service: string;
  readonly site: DiscoveredSite;
  readonly section?: SettingsSectionId;
  readonly onAppearanceChange?: (appearance: {
    readonly accent: string;
    readonly initial: string;
    readonly avatarDataUrl: string | null;
  }) => void;
  readonly onDeleteSite: () => void;
}) {
  const [settings, setSettings] = useState<AppSettingsRecord | null>(null);
  const [directoryBase, setDirectoryBase] = useState("/app");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publishAppearance = useCallback(
    (next: AppSettingsRecord) => {
      onAppearanceChange?.({
        accent: next.accent ?? site.accent,
        initial: next.initial || site.initial,
        avatarDataUrl: next.avatarDataUrl,
      });
    },
    [onAppearanceChange, site.accent, site.initial],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAppSettings(serverId, service);
      if (!data.ok || !data.settings) {
        setError(data.error ?? "Failed to load settings");
        setSettings(null);
        return;
      }
      setSettings(data.settings);
      setDirectoryBase(data.directoryBase ?? "/app");
      publishAppearance(data.settings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load settings");
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, [publishAppearance, serverId, service]);

  useEffect(() => {
    if (section !== "general") return;
    void refresh();
  }, [refresh, section]);

  async function onPatch(patch: Record<string, unknown>) {
    setBusy(true);
    setError(null);

    // Optimistic appearance update for color / avatar / initial.
    if (settings) {
      const optimistic: AppSettingsRecord = {
        ...settings,
        ...(typeof patch.accent === "string" || patch.accent === null
          ? { accent: patch.accent as string | null }
          : {}),
        ...(typeof patch.initial === "string" ? { initial: patch.initial } : {}),
        ...(typeof patch.avatarDataUrl === "string" || patch.avatarDataUrl === null
          ? { avatarDataUrl: patch.avatarDataUrl as string | null }
          : {}),
      };
      if ("accent" in patch || "initial" in patch || "avatarDataUrl" in patch) {
        setSettings(optimistic);
        publishAppearance(optimistic);
      }
    }

    try {
      const data = await updateAppSettings({
        serverId,
        service,
        action: typeof patch.action === "string" ? patch.action : "update",
        ...patch,
      });
      if (!data.ok || !data.settings) {
        throw new Error(data.error ?? "Failed to save settings");
      }
      setSettings(data.settings);
      if (data.directoryBase) setDirectoryBase(data.directoryBase);
      publishAppearance(data.settings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save settings");
      void refresh();
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] xl:gap-14">
      <aside className="min-w-0">
        <h2 className="px-2 text-3xl font-semibold tracking-tight text-foreground">Settings</h2>
        <nav aria-label="Settings" className="mt-6 flex flex-col gap-1.5">
          {SETTINGS_NAV.map((item) => {
            const active = item.id === section;
            return (
              <Link
                key={item.id}
                to="/servers/$serverId/apps/$service"
                params={{ serverId, service }}
                search={{ tab: "settings", section: item.id }}
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

      <div className="min-w-0 space-y-4">
        {section === "deployments" ? (
          <DeploymentsSettings serverId={serverId} service={service} />
        ) : null}
        {section === "general" && error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
        {section === "general" && (loading || !settings) ? (
          <div className="rounded-xl border border-border/70 bg-card/40 px-6 py-10 text-sm text-muted-foreground">
            Loading settings…
          </div>
        ) : null}
        {section === "general" && settings ? (
          <GeneralSettings
            serverId={serverId}
            service={service}
            site={site}
            directoryBase={directoryBase}
            settings={settings}
            busy={busy}
            onPatch={onPatch}
            onDeleteSite={onDeleteSite}
          />
        ) : null}
        {section === "environment" ? (
          <EnvironmentSettings serverId={serverId} service={service} />
        ) : null}
        {section === "notifications" ? (
          <NotificationsSettings serverId={serverId} service={service} />
        ) : null}
        {section === "integrations" ? (
          <PlaceholderSection
            title="Integrations"
            description="Connect source control and third-party services."
          />
        ) : null}
      </div>
    </div>
  );
}

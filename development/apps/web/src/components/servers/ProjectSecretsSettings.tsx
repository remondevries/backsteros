import { CloudUploadIcon, EyeIcon, FolderKeyIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchBacksterosCodebaseProjects } from "../../backsteros/client";
import { ProjectOcticon } from "../../backsteros/ProjectOcticon";
import {
  BacksterosSearchablePropertyMenu,
  type BacksterosSearchablePropertyOption,
} from "../../backsteros/SearchablePropertyMenu";
import type { BacksterosCodebaseProject } from "../../backsteros/types";
import "../../backsteros/backsterosPropertyMenu.css";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import {
  fetchAppProjectLink,
  fetchProjectSecrets,
  pushProjectSecretsToInfisical,
  saveProjectSecrets,
  type ProjectInfisicalConfig,
  type ProjectSecretsFileInfo,
} from "./hetznerApi";

function SettingsCard({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: React.ReactNode;
  readonly children?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
      <div className="border-b border-border/60 px-6 py-5">
        <h3 className="text-base font-medium text-foreground">{title}</h3>
        {description ? (
          <div className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Settings → Secrets: edit local ~/.config/secrets/environments/<projectId>/ files.
 * Source of truth is the host disk; Infisical push is optional backup only.
 */
export function ProjectSecretsSettings({
  serverId,
  service,
}: {
  readonly serverId: string;
  readonly service: string;
}) {
  const [projects, setProjects] = useState<readonly BacksterosCodebaseProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [linkHint, setLinkHint] = useState<string | null>(null);

  const [files, setFiles] = useState<readonly ProjectSecretsFileInfo[]>([]);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [fileName, setFileName] = useState(".env");
  const [content, setContent] = useState("");
  const [draft, setDraft] = useState("");
  const [infisical, setInfisical] = useState<ProjectInfisicalConfig | null>(null);
  const [infisicalConfigured, setInfisicalConfigured] = useState(false);
  const [pullHint, setPullHint] = useState<string | null>(null);

  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projectId, projects],
  );

  const projectOptions = useMemo((): readonly BacksterosSearchablePropertyOption[] => {
    return projects.map((project) => ({
      value: project.id,
      label: project.key ? `${project.name} (${project.key})` : project.name,
      searchText: [project.name, project.key, project.id].filter(Boolean).join(" "),
      icon: <ProjectOcticon icon={project.icon} type={project.type} size={14} />,
    }));
  }, [projects]);

  useEffect(() => {
    let cancelled = false;
    setProjectsLoading(true);
    void Promise.all([
      fetchBacksterosCodebaseProjects().catch(() => [] as BacksterosCodebaseProject[]),
      fetchAppProjectLink(serverId, service).catch(() => null),
    ]).then(([rows, linkData]) => {
      if (cancelled) return;
      setProjects(rows);
      const linkedId = linkData?.ok ? (linkData.link?.projectId ?? null) : null;
      if (linkedId) {
        setProjectId(linkedId);
        setLinkHint(null);
      } else {
        setLinkHint(
          "No project linked on this app — pick one below, or link it under Overview → Details.",
        );
      }
      setProjectsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [serverId, service]);

  const refresh = useCallback(async (nextProjectId: string, nextFileName: string) => {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const data = await fetchProjectSecrets(nextProjectId, { fileName: nextFileName });
      if (!data.ok) {
        setError(data.error ?? "Failed to load project secrets");
        setFiles([]);
        setContent("");
        setDraft("");
        return;
      }
      setFolderPath(data.folderPath ?? null);
      setFiles(data.files ?? []);
      setFileName(data.fileName ?? nextFileName);
      const next = data.content ?? "";
      setContent(next);
      setDraft(next);
      setInfisical(data.infisical ?? null);
      setInfisicalConfigured(Boolean(data.infisicalConfigured));
      setPullHint(data.pullHint ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load project secrets");
      setFiles([]);
      setContent("");
      setDraft("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setRevealed(false);
    if (!projectId) {
      setFiles([]);
      setFolderPath(null);
      setContent("");
      setDraft("");
      setInfisical(null);
      setInfisicalConfigured(false);
      return;
    }
    void refresh(projectId, ".env");
  }, [projectId, refresh]);

  async function save() {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const data = await saveProjectSecrets({
        projectId,
        fileName,
        content: draft,
      });
      if (!data.ok) throw new Error(data.error ?? "Failed to save");
      const next = data.content ?? draft;
      setContent(next);
      setDraft(next);
      setFiles(data.files ?? files);
      setFolderPath(data.folderPath ?? folderPath);
      setStatus(`Saved ${fileName} (mode 0600)`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function push() {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const data = await pushProjectSecretsToInfisical({ projectId, fileName });
      setInfisical(data.infisical ?? null);
      setInfisicalConfigured(Boolean(data.infisicalConfigured));
      setPullHint(data.pullHint ?? pullHint);
      if (!data.ok || data.push?.ok === false) {
        throw new Error(data.error ?? data.push?.message ?? "Infisical push failed");
      }
      setStatus(data.push?.message ?? "Pushed to Infisical");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Infisical push failed");
    } finally {
      setBusy(false);
    }
  }

  const dirty = draft !== content;
  const previewLines =
    draft.trim().length > 0
      ? draft
      : "# Local project secrets (source of truth on this machine)\n# FOO=bar\n";

  const projectLabel = selectedProject
    ? selectedProject.key
      ? `${selectedProject.name} · ${selectedProject.key}`
      : selectedProject.name
    : projectId
      ? projectId
      : "Select a project";

  return (
    <div className="flex min-w-0 flex-col gap-8">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
      {linkHint && !projectId ? <p className="text-sm text-muted-foreground">{linkHint}</p> : null}

      <SettingsCard
        title="Local project secrets"
        description={
          <>
            Plaintext files under{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              ~/.config/secrets/environments/&lt;projectId&gt;/
            </code>
            . Folder name is the BacksterOS project id; the key is shown as the label. Never synced
            to cloud-core, PowerSync, or git — FileVault +{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">0600</code> only.
          </>
        }
      >
        <div className="divide-y divide-border/60">
          <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">Project</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Secrets folder is keyed by project id
                {selectedProject?.key ? (
                  <>
                    {" "}
                    · key{" "}
                    <code className="font-mono text-xs text-foreground/80">
                      {selectedProject.key}
                    </code>
                  </>
                ) : null}
                .
              </p>
            </div>
            <BacksterosSearchablePropertyMenu
              label={projectsLoading ? "Loading projects…" : projectLabel}
              icon={
                selectedProject ? (
                  <ProjectOcticon
                    icon={selectedProject.icon}
                    type={selectedProject.type}
                    size={14}
                  />
                ) : (
                  <FolderKeyIcon className="size-3.5 opacity-70" />
                )
              }
              value={projectId ?? ""}
              options={projectOptions}
              searchPlaceholder="Search projects…"
              ariaLabel="BacksterOS project for secrets"
              disabled={busy || projectsLoading || projectOptions.length === 0}
              muted={!projectId}
              onChange={(value) => {
                setProjectId(value || null);
              }}
            />
          </div>

          {!projectId ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              Select a BacksterOS project to open its secrets folder.
            </div>
          ) : loading ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">Loading secrets…</div>
          ) : (
            <>
              <div className="px-6 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  {files.map((file) => {
                    const active = file.name === fileName;
                    return (
                      <button
                        key={file.name}
                        type="button"
                        disabled={busy}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors",
                          active
                            ? "border-foreground/30 bg-muted font-medium text-foreground"
                            : "border-border/70 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        )}
                        onClick={() => {
                          setRevealed(false);
                          setFileName(file.name);
                          void refresh(projectId, file.name);
                        }}
                      >
                        {file.name}
                      </button>
                    );
                  })}
                </div>
                {folderPath ? (
                  <p className="mt-3 truncate font-mono text-[11px] text-muted-foreground">
                    {folderPath}/{fileName}
                  </p>
                ) : null}
              </div>

              <div className="relative mx-6 mb-5 overflow-hidden rounded-xl border border-border/70 bg-background/70">
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
                        Local secrets stay on this machine. Reveal to edit.
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
                <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 px-6 py-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    className="gap-1.5"
                    onClick={() => void refresh(projectId, fileName)}
                  >
                    <RefreshCwIcon className="size-4" />
                    Reload
                  </Button>
                  <Button type="button" disabled={busy || !dirty} onClick={() => void save()}>
                    {busy ? "Saving…" : "Save locally"}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </SettingsCard>

      {projectId ? (
        <SettingsCard
          title="Infisical backup"
          description={
            infisicalConfigured && infisical ? (
              <>
                Push the current local file to Infisical as a backup. Mapping: project{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {infisical.infisicalProjectId.slice(0, 8)}…
                </code>
                , path{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {infisical.path}
                </code>
                , env{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {infisical.env}
                </code>
                .
              </>
            ) : (
              <>
                Not configured. Add{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  infisical.json
                </code>{" "}
                in this project folder with{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  infisicalProjectId
                </code>
                , optional{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">path</code> and{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">env</code>. Local
                files remain the daily source of truth.
              </>
            )
          }
        >
          <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-sm text-muted-foreground">
              {pullHint ??
                "Pull: use infisical export into the local .env, or refresh-secrets for machine-wide caches."}
            </p>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 gap-1.5"
              disabled={busy || !infisicalConfigured || dirty}
              title={
                dirty
                  ? "Save locally before pushing"
                  : !infisicalConfigured
                    ? "Add infisical.json first"
                    : "Push to Infisical"
              }
              onClick={() => void push()}
            >
              <CloudUploadIcon className="size-4" />
              {busy ? "Pushing…" : "Push to Infisical"}
            </Button>
          </div>
        </SettingsCard>
      ) : null}
    </div>
  );
}

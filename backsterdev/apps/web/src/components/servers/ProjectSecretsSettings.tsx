import {
  CloudUploadIcon,
  EyeIcon,
  EyeOffIcon,
  FolderKeyIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchBacksterosCodebaseProjects } from "../../backsteros/client";
import { ProjectOcticon } from "../../backsteros/ProjectOcticon";
import { buildBacksterosProjectPickerOptions } from "../../backsteros/projectPickerOptions";
import {
  BacksterosSearchablePropertyMenu,
  type BacksterosSearchablePropertyOption,
} from "../../backsteros/SearchablePropertyMenu";
import type { BacksterosCodebaseProject } from "../../backsteros/types";
import "../../backsteros/backsterosPropertyMenu.css";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import {
  dotenvEntriesEqual,
  parseDotenv,
  serializeDotenv,
  type DotenvEntry,
} from "./dotenvEntries";
import {
  fetchAppProjectLink,
  fetchProjectSecrets,
  pushProjectSecretsToInfisical,
  saveProjectSecrets,
  updateAppProjectLink,
  type ProjectInfisicalConfig,
} from "./hetznerApi";

type SecretRow = {
  readonly id: string;
  readonly key: string;
  readonly value: string;
};

let rowSeq = 0;
function nextRowId(): string {
  rowSeq += 1;
  return `secret-row-${rowSeq}`;
}

function entriesToRows(entries: readonly DotenvEntry[]): SecretRow[] {
  return entries.map((entry) => ({
    id: nextRowId(),
    key: entry.key,
    value: entry.value,
  }));
}

function rowsToEntries(rows: readonly SecretRow[]): DotenvEntry[] {
  return rows
    .map((row) => ({ key: row.key.trim(), value: row.value }))
    .filter((entry) => entry.key.length > 0);
}

function maskValue(value: string): string {
  if (!value) return "· · ·";
  if (value.length <= 4) return "••••";
  return `${"•".repeat(Math.min(12, value.length))} (${value.length})`;
}

/**
 * Settings → Secrets / Local project secrets:
 * edit ~/.config/secrets/environments/<projectId>/ files.
 */
export function ProjectSecretsSettings({
  serverId,
  service,
  fixedProjectId,
  hideProjectPicker = false,
}: {
  readonly serverId?: string;
  readonly service?: string;
  /** When set, lock to this BacksterOS project (Local sidebar). */
  readonly fixedProjectId?: string;
  readonly hideProjectPicker?: boolean;
}) {
  const [projects, setProjects] = useState<readonly BacksterosCodebaseProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(fixedProjectId ?? null);
  const [linkHint, setLinkHint] = useState<string | null>(null);

  const [fileName, setFileName] = useState(".env");
  const [savedEntries, setSavedEntries] = useState<readonly DotenvEntry[]>([]);
  const [rows, setRows] = useState<readonly SecretRow[]>([]);
  const [infisical, setInfisical] = useState<ProjectInfisicalConfig | null>(null);
  const [infisicalConfigured, setInfisicalConfigured] = useState(false);

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
    return buildBacksterosProjectPickerOptions(projects, {
      keepIds: [projectId],
    }).map((option) => {
      const project = projects.find((entry) => entry.id === option.value);
      if (!project?.key) return option;
      return {
        ...option,
        label: `${project.name} (${project.key})`,
        searchText: [project.name, project.key, project.id].filter(Boolean).join(" "),
      };
    });
  }, [projectId, projects]);

  const applyContent = useCallback((content: string) => {
    const entries = parseDotenv(content);
    setSavedEntries(entries);
    setRows(entriesToRows(entries));
  }, []);

  useEffect(() => {
    if (fixedProjectId) {
      setProjectId(fixedProjectId);
      setLinkHint(null);
      setProjectsLoading(true);
      void fetchBacksterosCodebaseProjects()
        .catch(() => [] as BacksterosCodebaseProject[])
        .then((projectRows) => {
          setProjects(projectRows);
          setProjectsLoading(false);
        });
      return;
    }

    if (!serverId || !service) {
      setProjectsLoading(false);
      return;
    }

    let cancelled = false;
    setProjectsLoading(true);
    void Promise.all([
      fetchBacksterosCodebaseProjects().catch(() => [] as BacksterosCodebaseProject[]),
      fetchAppProjectLink(serverId, service).catch(() => null),
    ]).then(([projectRows, linkData]) => {
      if (cancelled) return;
      setProjects(projectRows);
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
  }, [serverId, service, fixedProjectId]);

  const refresh = useCallback(
    async (nextProjectId: string, nextFileName: string) => {
      setLoading(true);
      setError(null);
      setStatus(null);
      try {
        const data = await fetchProjectSecrets(nextProjectId, { fileName: nextFileName });
        if (!data.ok) {
          setError(data.error ?? "Failed to load project secrets");
          applyContent("");
          return;
        }
        setFileName(data.fileName ?? nextFileName);
        applyContent(data.content ?? "");
        setInfisical(data.infisical ?? null);
        setInfisicalConfigured(Boolean(data.infisicalConfigured));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to load project secrets");
        applyContent("");
      } finally {
        setLoading(false);
      }
    },
    [applyContent],
  );

  useEffect(() => {
    setRevealed(false);
    if (!projectId) {
      applyContent("");
      setInfisical(null);
      setInfisicalConfigured(false);
      return;
    }
    void refresh(projectId, ".env");
  }, [projectId, refresh, applyContent]);

  async function selectProject(nextId: string) {
    if (fixedProjectId) return;
    const project = projects.find((entry) => entry.id === nextId) ?? null;
    setProjectId(nextId || null);
    setLinkHint(null);
    if (!nextId || !serverId || !service) return;

    setBusy(true);
    setError(null);
    try {
      const data = await updateAppProjectLink({
        serverId,
        service,
        projectId: nextId,
        projectName: project?.name ?? null,
        projectKey: project?.key ?? null,
      });
      if (!data.ok) {
        throw new Error(data.error ?? "Failed to save project link");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save project link");
    } finally {
      setBusy(false);
    }
  }

  function updateRow(id: string, patch: Partial<Pick<SecretRow, "key" | "value">>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  function addRow() {
    setRows((prev) => [...prev, { id: nextRowId(), key: "", value: "" }]);
    setRevealed(true);
  }

  async function save() {
    if (!projectId) return;
    const entries = rowsToEntries(rows);
    const blankKeys = rows.some((row) => row.key.trim() === "" && row.value.trim() !== "");
    if (blankKeys) {
      setError("Every value needs a key name (or clear the value / remove the row).");
      return;
    }
    const invalid = entries.find((entry) => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(entry.key));
    if (invalid) {
      setError(`Invalid key "${invalid.key}" — use letters, numbers, and underscores.`);
      return;
    }
    const draft = serializeDotenv(entries);
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
      applyContent(data.content ?? draft);
      setStatus(`Saved ${fileName} (${entries.length} keys, mode 0600)`);
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

  const dirty = !dotenvEntriesEqual(rowsToEntries(rows), savedEntries);
  const projectLabel = selectedProject
    ? selectedProject.key
      ? `${selectedProject.name} · ${selectedProject.key}`
      : selectedProject.name
    : projectId
      ? projectId
      : "Select a project";

  const localPath = projectId ? `~/.config/secrets/environments/${projectId}/${fileName}` : null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
      {linkHint && !projectId ? <p className="text-sm text-muted-foreground">{linkHint}</p> : null}

      <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
        {hideProjectPicker ? null : (
          <div className="flex flex-col gap-3 border-b border-border/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-base font-medium text-foreground">Secrets</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Local dotenv for this app&apos;s linked project
                {selectedProject?.key ? (
                  <>
                    {" "}
                    (
                    <code className="font-mono text-xs text-foreground/80">
                      {selectedProject.key}
                    </code>
                    )
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
              disabled={
                busy || projectsLoading || projectOptions.length === 0 || Boolean(fixedProjectId)
              }
              muted={!projectId}
              onChange={(value) => {
                void selectProject(value);
              }}
            />
          </div>
        )}

        {!projectId ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            Select a BacksterOS project to open its secrets folder.
          </div>
        ) : loading ? (
          <div className="px-6 py-10 text-sm text-muted-foreground">Loading secrets…</div>
        ) : (
          <>
            <div className="border-b border-border/60 px-6 py-4">
              {infisicalConfigured && infisical ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <dl className="grid min-w-0 flex-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <div className="min-w-0">
                      <dt className="text-muted-foreground">Infisical project</dt>
                      <dd className="truncate font-mono text-xs text-foreground">
                        {infisical.infisicalProjectId}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-muted-foreground">Environment</dt>
                      <dd className="font-mono text-xs text-foreground">{infisical.env}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-muted-foreground">Secret path</dt>
                      <dd className="font-mono text-xs text-foreground">{infisical.path}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-muted-foreground">Local path</dt>
                      <dd
                        className="truncate font-mono text-xs text-foreground"
                        title={localPath ?? undefined}
                      >
                        {localPath}
                      </dd>
                    </div>
                  </dl>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 gap-1.5"
                    disabled={busy || dirty}
                    title={dirty ? "Save locally before pushing" : "Push to Infisical"}
                    onClick={() => void push()}
                  >
                    <CloudUploadIcon className="size-4" />
                    {busy ? "Pushing…" : "Push to Infisical"}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Infisical backup not configured — add{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      infisical.json
                    </code>{" "}
                    in the project folder.
                  </p>
                  <Button type="button" variant="outline" className="shrink-0 gap-1.5" disabled>
                    <CloudUploadIcon className="size-4" />
                    Push to Infisical
                  </Button>
                </div>
              )}
            </div>

            <div className="px-6 py-5">
              <div className="overflow-hidden rounded-xl border border-border/70 bg-background/70">
                {!revealed ? (
                  <div className="relative">
                    <div
                      aria-hidden
                      className="max-h-80 min-h-40 select-none divide-y divide-border/40 blur-[6px]"
                    >
                      {(rows.length > 0 ? rows : [{ id: "ph", key: "EXAMPLE_KEY", value: "••••" }])
                        .slice(0, 8)
                        .map((row) => (
                          <div
                            key={row.id}
                            className="grid grid-cols-[minmax(8rem,14rem)_1fr] gap-3 px-4 py-3"
                          >
                            <div className="font-mono text-xs text-muted-foreground">
                              {row.key || "KEY"}
                            </div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {maskValue(row.value)}
                            </div>
                          </div>
                        ))}
                    </div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/30 px-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        {rows.length === 0
                          ? "No keys yet — reveal to add secrets."
                          : `${rows.length} keys hidden. Reveal to edit.`}
                      </p>
                      <Button type="button" className="gap-1.5" onClick={() => setRevealed(true)}>
                        <EyeIcon className="size-4" />
                        Reveal
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    <div className="hidden grid-cols-[minmax(8rem,14rem)_1fr_auto] gap-3 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                      <span>Key</span>
                      <span>Value</span>
                      <span className="sr-only">Actions</span>
                    </div>
                    {rows.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No secrets yet. Add a key to get started.
                      </div>
                    ) : (
                      rows.map((row) => {
                        const multiline = row.value.includes("\n") || row.value.length > 120;
                        return (
                          <div
                            key={row.id}
                            className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[minmax(8rem,14rem)_1fr_auto] sm:items-start sm:gap-3"
                          >
                            <Input
                              value={row.key}
                              disabled={busy}
                              spellCheck={false}
                              placeholder="KEY_NAME"
                              aria-label="Secret key"
                              className="font-mono text-xs"
                              onChange={(event) => updateRow(row.id, { key: event.target.value })}
                            />
                            {multiline ? (
                              <Textarea
                                value={row.value}
                                disabled={busy}
                                spellCheck={false}
                                placeholder="value"
                                aria-label={`Value for ${row.key || "secret"}`}
                                className="min-h-20 resize-y font-mono text-xs"
                                onChange={(event) =>
                                  updateRow(row.id, { value: event.target.value })
                                }
                              />
                            ) : (
                              <Input
                                value={row.value}
                                disabled={busy}
                                spellCheck={false}
                                placeholder="value"
                                aria-label={`Value for ${row.key || "secret"}`}
                                className="font-mono text-xs"
                                onChange={(event) =>
                                  updateRow(row.id, { value: event.target.value })
                                }
                              />
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={busy}
                              className="shrink-0 text-muted-foreground hover:text-destructive"
                              aria-label={`Remove ${row.key || "row"}`}
                              onClick={() => removeRow(row.id)}
                            >
                              <Trash2Icon className="size-4" />
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-6 py-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !projectId}
                  className="gap-1.5"
                  onClick={() => addRow()}
                >
                  <PlusIcon className="size-4" />
                  Add key
                </Button>
                {revealed ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    className="gap-1.5"
                    onClick={() => setRevealed(false)}
                  >
                    <EyeOffIcon className="size-4" />
                    Hide values
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !projectId}
                  className="gap-1.5"
                  onClick={() => {
                    setRevealed(false);
                    void refresh(projectId, fileName);
                  }}
                >
                  <RefreshCwIcon className="size-4" />
                  Reload
                </Button>
                <Button
                  type="button"
                  disabled={busy || !dirty || !revealed}
                  onClick={() => void save()}
                >
                  {busy ? "Saving…" : "Save locally"}
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

import { CopyIcon, GitBranchIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { cn } from "../../lib/utils";
import {
  BacksterosSearchablePropertyMenu,
  type BacksterosSearchablePropertyOption,
} from "../../backsteros/SearchablePropertyMenu";
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
import {
  fetchGithubRefs,
  fetchWordpressComponents,
  mutateWordpressComponents,
  type SiteComponent,
  type SiteComponentType,
} from "./hetznerApi";
import "../../backsteros/backsterosPropertyMenu.css";

const COMPONENT_TYPES: readonly { readonly value: SiteComponentType; readonly label: string }[] = [
  { value: "theme", label: "theme" },
  { value: "platform_plugin", label: "plugin" },
  { value: "client_plugin", label: "client plugin" },
  { value: "recipe_mu", label: "Required Plugin" },
];

function typeLabel(type: SiteComponentType): string {
  return COMPONENT_TYPES.find((entry) => entry.value === type)?.label ?? type;
}

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

type Draft = {
  readonly type: SiteComponentType;
  readonly repo: string;
  readonly path: string;
  readonly ref: string;
  readonly autoDeploy: boolean;
  readonly rolloutGroup: string;
};

const EMPTY_DRAFT: Draft = {
  type: "theme",
  repo: "",
  path: "",
  ref: "production",
  autoDeploy: true,
  rolloutGroup: "",
};

function ComponentRefPicker({
  repo,
  value,
  disabled,
  onChange,
}: {
  readonly repo: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly onChange: (ref: string) => void;
}) {
  const [refs, setRefs] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedRepo, setLoadedRepo] = useState<string | null>(null);

  const loadRefs = useCallback(async () => {
    const target = repo.trim();
    if (!target) return;
    if (loadedRepo === target && refs.length > 0) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGithubRefs(target);
      if (!data.ok) {
        setError(data.error ?? "Failed to load branches");
        setRefs(value ? [value] : []);
        return;
      }
      const merged = [
        ...new Set([...(value ? [value] : []), ...(data.branches ?? []), ...(data.tags ?? [])]),
      ];
      setRefs(merged);
      setLoadedRepo(target);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load branches");
      setRefs(value ? [value] : []);
    } finally {
      setLoading(false);
    }
  }, [loadedRepo, refs.length, repo, value]);

  const options = useMemo((): readonly BacksterosSearchablePropertyOption[] => {
    const list = refs.length > 0 ? refs : value ? [value] : [];
    return list.map((name) => ({
      value: name,
      label: name,
      searchText: name,
      icon: <GitBranchIcon className="size-3.5 opacity-70" aria-hidden />,
    }));
  }, [refs, value]);

  return (
    <div
      className="min-w-0"
      onPointerDown={() => {
        void loadRefs();
      }}
    >
      <BacksterosSearchablePropertyMenu
        label={loading ? "Loading…" : value || "Select ref"}
        icon={<GitBranchIcon className="size-3.5 opacity-70" aria-hidden />}
        value={value}
        options={options}
        searchPlaceholder="Search branches…"
        ariaLabel="Component branch or tag"
        disabled={disabled || !repo.trim()}
        muted={!value}
        onChange={onChange}
      />
      {error ? (
        <p className="mt-1 max-w-[12rem] truncate text-[11px] text-destructive" title={error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * WordPress multi-component deploy UI (deploy-contract.md).
 */
export function WordpressComponentsSettings({
  serverId,
  service,
}: {
  readonly serverId: string;
  readonly service: string;
}) {
  const [components, setComponents] = useState<readonly SiteComponent[]>([]);
  const [siteRoot, setSiteRoot] = useState("");
  const [siteRootDraft, setSiteRootDraft] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const applyPayload = useCallback(
    (data: {
      readonly components?: readonly SiteComponent[];
      readonly siteRoot?: string;
      readonly webhookUrl?: string;
    }) => {
      setComponents(data.components ?? []);
      if (typeof data.siteRoot === "string") {
        setSiteRoot(data.siteRoot);
        setSiteRootDraft(data.siteRoot);
      }
      if (typeof data.webhookUrl === "string") setWebhookUrl(data.webhookUrl);
    },
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWordpressComponents(serverId, service);
      if (!data.ok) {
        setError(data.error ?? "Failed to load WordPress components");
        setComponents([]);
        return;
      }
      applyPayload(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load WordPress components");
      setComponents([]);
    } finally {
      setLoading(false);
    }
  }, [applyPayload, serverId, service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function mutate(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const data = await mutateWordpressComponents({ serverId, service, ...body });
      if (!data.ok) throw new Error(data.error ?? "Request failed");
      applyPayload(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed");
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  function openCreate() {
    setDraft(EMPTY_DRAFT);
    setDialogOpen(true);
  }

  async function saveDraft() {
    await mutate({
      action: "upsert",
      type: draft.type,
      repo: draft.repo,
      path: draft.path,
      ref: draft.ref,
      autoDeploy: draft.autoDeploy,
      rolloutGroup: draft.rolloutGroup.trim() || null,
    });
    setDialogOpen(false);
  }

  async function updateComponentRef(component: SiteComponent, ref: string) {
    if (ref === component.ref) return;
    await mutate({
      action: "upsert",
      id: component.id,
      type: component.type,
      repo: component.repo,
      path: component.path,
      ref,
      autoDeploy: component.autoDeploy,
      rolloutGroup: component.rolloutGroup,
    });
  }

  async function deployComponent(componentId: string) {
    setDeployingId(componentId);
    try {
      await mutate({ action: "deploy", componentId });
    } finally {
      setDeployingId(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border/70 bg-card/40 px-6 py-10 text-sm text-muted-foreground">
        {error ?? "Loading WordPress components…"}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-8">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <SettingsCard
        title="Site components"
        description={
          <>
            A WordPress site is a bundle of git checkouts (theme, platform plugin, mu-plugins) — not
            one remote. Webhooks update{" "}
            <span className="text-foreground">only the matching component path</span>. Core, DB,
            uploads, and premium zips are never deploy components.
          </>
        }
      >
        <div className="divide-y divide-border/60">
          <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">Site root on host</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Absolute path to the compose / codebase root (contains wp-content/). Auto discover
                and Deploy fill this from the host when empty.
              </p>
              <Input
                value={siteRootDraft}
                disabled={busy}
                className="mt-3 font-mono text-xs"
                placeholder="/home/deploy/sites/ov"
                onChange={(event) => setSiteRootDraft(event.target.value)}
                onBlur={() => {
                  if (siteRootDraft !== siteRoot) {
                    void mutate({ action: "set_site_root", siteRoot: siteRootDraft });
                  }
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void mutate({ action: "seed_ov", replace: true })}
              >
                Auto discover
              </Button>
              <Button type="button" size="sm" disabled={busy} onClick={openCreate}>
                <PlusIcon className="size-4" />
                Add component
              </Button>
            </div>
          </div>

          {components.length === 0 ? (
            <div className="px-6 py-8 text-sm text-muted-foreground">
              No components yet. Add a theme / plugin, or use Auto discover for the OV reference
              bindings.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="border-b border-border/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-6 py-2.5 font-medium">Component</th>
                    <th className="px-3 py-2.5 font-medium">Last deploy</th>
                    <th className="px-3 py-2.5 font-medium">Deploy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {components.map((component) => {
                    const isDeploying = deployingId === component.id;
                    return (
                      <tr key={component.id} className="align-top">
                        <td className="px-6 py-3">
                          <ComponentRefPicker
                            repo={component.repo}
                            value={component.ref}
                            disabled={busy}
                            onChange={(ref) => void updateComponentRef(component, ref)}
                          />
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span
                              className="truncate font-medium text-foreground"
                              title={component.repo}
                            >
                              {component.repo}
                            </span>
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              {typeLabel(component.type)}
                            </span>
                          </div>
                          <div
                            className="mt-0.5 truncate font-mono text-xs text-muted-foreground"
                            title={component.path}
                          >
                            {component.path}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          <div className="font-medium text-foreground/80">
                            {component.lastDeployStatus ?? "—"}
                          </div>
                          {component.lastDeployAt ? (
                            <div className="mt-0.5">
                              {new Date(component.lastDeployAt).toLocaleString()}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy || isDeploying}
                            className="gap-1.5"
                            onClick={() => void deployComponent(component.id)}
                          >
                            <RefreshCwIcon
                              className={cn("size-3.5", isDeploying && "animate-spin")}
                            />
                            {isDeploying ? "Deploying…" : "Deploy"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        title="Component deploy webhook"
        description="Point GitHub push/tag webhooks here. Resolution matches repository + ref to subscribed components and enqueues one job per path (platform fan-out is concurrency-limited)."
      >
        <div className="flex flex-col gap-3 px-6 py-5">
          <div className="flex w-full items-center gap-2">
            <Input readOnly value={webhookUrl} className="min-w-0 flex-1 font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={busy}
              aria-label="Rotate webhook token"
              onClick={() => void mutate({ action: "rotate_webhook" })}
            >
              <RefreshCwIcon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Copy webhook URL"
              onClick={() => void writeTextToClipboard(webhookUrl, "WordPress webhook")}
            >
              <CopyIcon className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Optional global secret{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">
              BACKSTEROS_WORDPRESS_WEBHOOK_SECRET
            </code>{" "}
            fans out across all WordPress apps (platform rollouts).
          </p>
        </div>
      </SettingsCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogPopup className="max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle>Add component</DialogTitle>
            <DialogDescription>
              Paths are relative to the site root. Types follow the WordPress deploy contract.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 pb-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type</label>
              <Select
                value={draft.type}
                onValueChange={(value) => {
                  if (!value) return;
                  setDraft((prev) => ({ ...prev, type: value as SiteComponentType }));
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{typeLabel(draft.type)}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {COMPONENT_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Repo</label>
              <Input
                value={draft.repo}
                className="font-mono text-xs"
                placeholder="Lemo-Design/oosterlaarverhoeven"
                onChange={(event) => setDraft((prev) => ({ ...prev, repo: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Path</label>
              <Input
                value={draft.path}
                className="font-mono text-xs"
                placeholder="wp-content/themes/oosterlaarverhoeven/"
                onChange={(event) => setDraft((prev) => ({ ...prev, path: event.target.value }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Branch / tag</label>
                <ComponentRefPicker
                  repo={draft.repo}
                  value={draft.ref}
                  onChange={(ref) => setDraft((prev) => ({ ...prev, ref }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Rollout group</label>
                <Input
                  value={draft.rolloutGroup}
                  placeholder="platform (optional)"
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, rolloutGroup: event.target.value }))
                  }
                />
              </div>
            </div>
            <label className={cn("inline-flex items-center gap-2 text-sm")}>
              <Checkbox
                checked={draft.autoDeploy}
                onCheckedChange={(checked) =>
                  setDraft((prev) => ({ ...prev, autoDeploy: checked === true }))
                }
              />
              Auto-deploy on matching webhook
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || !draft.repo.trim() || !draft.path.trim()}
              onClick={() => void saveDraft()}
            >
              Save component
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}

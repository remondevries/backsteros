import { Link } from "@tanstack/react-router";
import { CheckIcon, CopyIcon, EllipsisIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import {
  fetchHetznerServerBackups,
  type DiscoveredDatabase,
  type HetznerServerBackup,
} from "./hetznerApi";
import type { StaticServerProfile } from "./staticServerProfiles";

export type StorageSectionId = "database" | "backups";

export function isStorageSectionId(value: unknown): value is StorageSectionId {
  return value === "database" || value === "backups";
}

const STORAGE_NAV = [
  { id: "database", label: "Database" },
  { id: "backups", label: "Backups" },
] as const;

function StorageCard({
  title,
  description,
  action,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly children?: ReactNode | undefined;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
        <div className="min-w-0">
          <h3 className="text-base font-medium text-foreground">{title}</h3>
          {description ? (
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function CopyConnectionButton({ value }: { readonly value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      className="shrink-0 text-muted-foreground"
      aria-label={copied ? "Copied" : "Copy connection URL"}
      onClick={() => {
        void writeTextToClipboard(value, "database connection URL").then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
    >
      {copied ? <CheckIcon className="size-4 text-[#3d9a6a]" /> : <CopyIcon className="size-4" />}
    </Button>
  );
}

function formatRelative(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return iso;
  const deltaSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(deltaSec);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return rtf.format(deltaSec, "second");
  const deltaMin = Math.round(deltaSec / 60);
  if (Math.abs(deltaMin) < 60) return rtf.format(deltaMin, "minute");
  const deltaHr = Math.round(deltaMin / 60);
  if (Math.abs(deltaHr) < 48) return rtf.format(deltaHr, "hour");
  const deltaDay = Math.round(deltaHr / 24);
  return rtf.format(deltaDay, "day");
}

function DatabasePanel({
  profile,
  databases,
  loading,
  error,
  onRefresh,
}: {
  readonly profile: StaticServerProfile;
  readonly databases: readonly DiscoveredDatabase[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly onRefresh: () => void;
}) {
  const engineDatabases = useMemo(
    () => databases.filter((database) => database.kind === "engine" || database.kind === "sqlite"),
    [databases],
  );

  const connectionTargets = useMemo(
    () => engineDatabases.filter((database) => database.connectionUrlMasked),
    [engineDatabases],
  );

  const databaseRows = useMemo(() => {
    const rows: {
      readonly id: string;
      readonly name: string;
      readonly meta: string;
      readonly sizeLabel: string | null;
    }[] = [];
    for (const database of engineDatabases) {
      if (database.logicalDatabases.length > 0) {
        for (const logical of database.logicalDatabases) {
          rows.push({
            id: logical.id,
            name: logical.name,
            meta: [database.engine, database.siteDomain ?? database.appName]
              .filter(Boolean)
              .join(" · "),
            sizeLabel: logical.sizeLabel ?? database.sizeLabel,
          });
        }
      } else {
        rows.push({
          id: database.id,
          name: database.name,
          meta: [database.engine, database.siteDomain ?? database.appName]
            .filter(Boolean)
            .join(" · "),
          sizeLabel: database.sizeLabel,
        });
      }
    }
    return rows;
  }, [engineDatabases]);

  const users = useMemo(() => {
    const rows: {
      readonly id: string;
      readonly username: string;
      readonly accessLabel: string;
    }[] = [];
    for (const database of engineDatabases) {
      for (const user of database.users) {
        rows.push({
          id: user.id,
          username: user.username,
          accessLabel:
            database.logicalDatabases.length > 1
              ? `${database.logicalDatabases.length} databases · ${database.engine}`
              : database.logicalDatabases[0]
                ? `${database.logicalDatabases[0].name} · ${database.engine}`
                : user.accessLabel,
        });
      }
    }
    return rows;
  }, [engineDatabases]);

  const detailsText = useMemo(() => {
    if (loading) return "Scanning containers and volumes for databases…";
    if (error) return error;
    if (engineDatabases.length === 0) {
      return `No database engines or SQLite files were discovered on ${profile.name} yet.`;
    }
    const summary = engineDatabases
      .map((database) =>
        database.engineVersion ? `${database.engine} ${database.engineVersion}` : database.engine,
      )
      .filter((value, index, all) => all.indexOf(value) === index)
      .join(", ");
    return `This server currently exposes ${summary}. External clients should connect over SSH to root@${profile.networking.publicIp}; database ports stay on the Docker network.`;
  }, [engineDatabases, error, loading, profile.name, profile.networking.publicIp]);

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <StorageCard title="Database details">
        <div className="px-6 py-5 text-sm leading-relaxed text-muted-foreground">{detailsText}</div>
      </StorageCard>

      <StorageCard
        title="Database connection URL"
        description="Copy a connection string for TablePlus or similar clients. SSH tunnels to the host, then reaches the container on the Docker network."
      >
        {loading ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">Loading connection details…</div>
        ) : connectionTargets.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">
            No copyable connection URLs yet. Engine containers need credentials and a container IP.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {connectionTargets.map((database) => (
              <div key={database.id} className="flex flex-col gap-2.5 px-6 py-5">
                <div className="text-xs font-medium text-muted-foreground">
                  {[database.engine, database.name, database.siteDomain ?? database.appName]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3.5 py-2.5">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                    {database.connectionUrlMasked}
                  </code>
                  {database.connectionUrl ? (
                    <CopyConnectionButton value={database.connectionUrl} />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </StorageCard>

      <StorageCard
        title="Databases"
        description="Databases discovered on this server."
        action={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground"
            aria-label="Refresh databases"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCwIcon className={cn("size-4", loading && "animate-spin")} />
          </Button>
        }
      >
        {loading ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">Discovering databases…</div>
        ) : databaseRows.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">No databases found.</div>
        ) : (
          <div className="divide-y divide-border/60">
            {databaseRows.map((row) => (
              <div key={row.id} className="flex items-center gap-3 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{row.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{row.meta}</div>
                </div>
                <div className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                  {row.sizeLabel ?? "—"}
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground"
                  disabled
                  aria-label={`Actions for ${row.name}`}
                >
                  <EllipsisIcon className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </StorageCard>

      <StorageCard title="Database users" description="Users discovered inside engine containers.">
        {loading ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">Loading users…</div>
        ) : users.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">
            No database users found. SQLite files do not have login users.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {users.map((user) => (
              <div key={user.id} className="flex items-center gap-3 px-6 py-4">
                <div className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {user.username}
                </div>
                <div className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                  {user.accessLabel}
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground"
                  disabled
                  aria-label={`Actions for ${user.username}`}
                >
                  <EllipsisIcon className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </StorageCard>
    </div>
  );
}

function BackupsPanel({ serverId }: { readonly serverId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backupWindow, setBackupWindow] = useState<string | null>(null);
  const [backups, setBackups] = useState<readonly HetznerServerBackup[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHetznerServerBackups(serverId);
      if (!data.ok && data.error) {
        setError(data.error);
        setBackups([]);
        setBackupWindow(null);
        return;
      }
      setBackups(data.backups ?? []);
      setBackupWindow(data.backupWindow ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load Hetzner backups");
      setBackups([]);
      setBackupWindow(null);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <StorageCard title="Backup status">
        <div className="px-6 py-5 text-sm leading-relaxed text-muted-foreground">
          {loading
            ? "Loading Hetzner backup status…"
            : error
              ? error
              : backupWindow
                ? `Hetzner automatic backups are enabled for this server (window ${backupWindow} UTC). Snapshots listed below come from the Hetzner Cloud API.`
                : "Hetzner automatic backups are not enabled for this server. Manual snapshots still appear below when present."}
        </div>
      </StorageCard>

      <StorageCard
        title="Backups & snapshots"
        description="Hetzner Cloud backups and snapshots for this server."
        action={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground"
            aria-label="Refresh backups"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCwIcon className={cn("size-4", loading && "animate-spin")} />
          </Button>
        }
      >
        {loading ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">Loading from Hetzner…</div>
        ) : backups.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">
            No Hetzner backups or snapshots found for this server yet.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {backups.map((backup) => (
              <div key={backup.id} className="flex items-center gap-3 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {backup.description || `${backup.type} ${backup.id}`}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[
                      backup.type === "backup" ? "Automatic backup" : "Snapshot",
                      formatRelative(backup.created),
                      backup.imageSizeGb != null
                        ? `${backup.imageSizeGb.toFixed(2)} GB stored`
                        : `${backup.diskSizeGb} GB disk`,
                    ].join(" · ")}
                  </div>
                </div>
                <div className="hidden shrink-0 text-xs capitalize text-muted-foreground sm:block">
                  {backup.status}
                </div>
              </div>
            ))}
          </div>
        )}
      </StorageCard>
    </div>
  );
}

export function ServerStorageTab({
  profile,
  section,
  databases,
  loadingDatabases,
  databasesError,
  onRefreshDatabases,
}: {
  readonly profile: StaticServerProfile;
  readonly section: StorageSectionId;
  readonly databases: readonly DiscoveredDatabase[];
  readonly loadingDatabases: boolean;
  readonly databasesError: string | null;
  readonly onRefreshDatabases: () => void;
}) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <WorkspacePageContainer width="expanded" className="gap-10 py-8">
        <div className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] xl:gap-14">
          <aside className="min-w-0">
            <h2 className="px-2 text-3xl font-semibold tracking-tight text-foreground">Storage</h2>
            <nav aria-label="Storage" className="mt-6 flex flex-col gap-1.5">
              {STORAGE_NAV.map((item) => {
                const active = item.id === section;
                return (
                  <Link
                    key={item.id}
                    to="/servers/$serverId"
                    params={{ serverId: profile.id }}
                    search={{ tab: "storage", section: item.id }}
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
            {section === "database" ? (
              <DatabasePanel
                profile={profile}
                databases={databases}
                loading={loadingDatabases}
                error={databasesError}
                onRefresh={onRefreshDatabases}
              />
            ) : (
              <BackupsPanel serverId={profile.id} />
            )}
          </div>
        </div>
      </WorkspacePageContainer>
    </ScrollArea>
  );
}

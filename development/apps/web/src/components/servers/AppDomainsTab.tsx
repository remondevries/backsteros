import {
  CheckCircle2Icon,
  CopyIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  EyeIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
import {
  addAppDomain,
  fetchAppDomains,
  removeAppDomain,
  setPrimaryAppDomain,
  type AppCertificateInfo,
  type AppDomainEntry,
} from "./hetznerApi";

function DomainsCard({
  title,
  description,
  action,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly action?: React.ReactNode;
  readonly children?: React.ReactNode;
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

function DnsCopyRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 px-4 py-3">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate font-mono text-sm text-foreground">{value}</span>
        <button
          type="button"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() => {
            void writeTextToClipboard(value, label.toLowerCase());
          }}
        >
          <CopyIcon className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function DnsConfigDialog({
  open,
  onOpenChange,
  host,
  serverIp,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly host: string;
  readonly serverIp: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Update DNS records</DialogTitle>
          <DialogDescription>
            Add the following records to your DNS provider to connect your domain with this site.
          </DialogDescription>
        </DialogHeader>
        <div className="mx-6 mb-2 overflow-hidden rounded-xl border border-border/70 bg-background/50">
          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 border-b border-border/60 px-4 py-3">
            <div className="text-sm text-muted-foreground">Type</div>
            <div className="font-mono text-sm text-foreground">A</div>
          </div>
          <div className="border-b border-border/60">
            <DnsCopyRow label="Name" value={host} />
          </div>
          <DnsCopyRow label="Value" value={serverIp || "—"} />
        </div>
        <DialogFooter variant="bare">
          <Button type="button" className="w-full" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export function AppDomainsTab({
  serverId,
  service,
}: {
  readonly serverId: string;
  readonly service: string;
}) {
  const [hosts, setHosts] = useState<readonly AppDomainEntry[]>([]);
  const [serverIp, setServerIp] = useState("");
  const [tls, setTls] = useState(false);
  const [certificate, setCertificate] = useState<AppCertificateInfo | null>(null);
  const [domainInput, setDomainInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dnsHost, setDnsHost] = useState<string | null>(null);

  const applyPayload = useCallback(
    (data: {
      readonly hosts?: readonly AppDomainEntry[];
      readonly serverIp?: string;
      readonly tls?: boolean;
      readonly certificate?: AppCertificateInfo;
    }) => {
      setHosts(data.hosts ?? []);
      if (data.serverIp) setServerIp(data.serverIp);
      if (typeof data.tls === "boolean") setTls(data.tls);
      setCertificate(data.certificate ?? null);
    },
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAppDomains(serverId, service);
      if (!data.ok && data.error) {
        setError(data.error);
        setHosts([]);
        setCertificate(null);
        return;
      }
      applyPayload(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load domains");
      setHosts([]);
    } finally {
      setLoading(false);
    }
  }, [applyPayload, serverId, service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onAddDomain() {
    const host = domainInput.trim();
    if (!host || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await addAppDomain({ serverId, service, host });
      if (!data.ok) {
        setError(data.error ?? "Failed to add domain");
        return;
      }
      applyPayload(data);
      setDomainInput("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to add domain");
    } finally {
      setBusy(false);
    }
  }

  async function onMakePrimary(host: string) {
    setBusy(true);
    setError(null);
    try {
      const data = await setPrimaryAppDomain({ serverId, service, host });
      if (!data.ok) {
        setError(data.error ?? "Failed to set primary domain");
        return;
      }
      applyPayload(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to set primary domain");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(host: string) {
    setBusy(true);
    setError(null);
    try {
      const data = await removeAppDomain({ serverId, service, host });
      if (!data.ok) {
        setError(data.error ?? "Failed to remove domain");
        return;
      }
      applyPayload(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to remove domain");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground">Domains</h2>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <DomainsCard
        title="Domains"
        description="Manage this app's domains on Kamal Proxy. Point DNS A/AAAA records at the server IP — Cloudflare is not required."
      >
        {loading ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">Loading domains…</div>
        ) : (
          <>
            <div className="border-b border-border/60 px-6 py-5">
              <p className="mb-2 text-sm font-medium text-foreground">Custom domains</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={domainInput}
                  onChange={(event) => setDomainInput(event.target.value)}
                  placeholder="your-domain.com"
                  disabled={busy}
                  className="sm:flex-1"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void onAddDomain();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !domainInput.trim()}
                  onClick={() => void onAddDomain()}
                  className="shrink-0"
                >
                  {busy ? "Saving…" : "Add domain"}
                </Button>
              </div>
              {serverIp ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  DNS tip: point the domain to{" "}
                  <span className="font-mono text-foreground/90">{serverIp}</span> before expecting
                  TLS to issue.
                </p>
              ) : null}
            </div>

            {hosts.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                No domains configured for this app.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {hosts.map((entry) => (
                  <div key={entry.host} className="flex items-center gap-3 px-6 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {entry.host}
                        </span>
                        {entry.primary ? (
                          <Badge variant="secondary" className="shrink-0">
                            Primary
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <Menu>
                      <MenuTrigger
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={`Actions for ${entry.host}`}
                        disabled={busy}
                      >
                        <EllipsisIcon className="size-4" />
                      </MenuTrigger>
                      <MenuPopup align="end">
                        <MenuItem
                          onClick={() => {
                            window.open(`https://${entry.host}`, "_blank", "noopener,noreferrer");
                          }}
                        >
                          <ExternalLinkIcon className="size-4" />
                          Visit
                        </MenuItem>
                        <MenuItem
                          onClick={() => {
                            void writeTextToClipboard(entry.host, "domain");
                          }}
                        >
                          <CopyIcon className="size-4" />
                          Copy
                        </MenuItem>
                        <MenuItem
                          onClick={() => {
                            void writeTextToClipboard(entry.host, "domain ID");
                          }}
                        >
                          <CopyIcon className="size-4" />
                          Copy ID
                        </MenuItem>
                        <MenuItem onClick={() => setDnsHost(entry.host)}>
                          <EyeIcon className="size-4" />
                          View configuration
                        </MenuItem>
                        {!entry.primary ? (
                          <MenuItem onClick={() => void onMakePrimary(entry.host)}>
                            <StarIcon className="size-4" />
                            Make primary
                          </MenuItem>
                        ) : null}
                        <MenuSeparator />
                        <MenuItem
                          variant="destructive"
                          disabled={hosts.length <= 1}
                          onClick={() => void onRemove(entry.host)}
                        >
                          <Trash2Icon className="size-4" />
                          Delete
                        </MenuItem>
                      </MenuPopup>
                    </Menu>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </DomainsCard>

      <DomainsCard
        title="Certificates"
        description="TLS is handled by Kamal Proxy (Let's Encrypt when enabled on the service)."
        action={
          <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled>
            <PlusIcon className="size-4" />
            Add certificate
          </Button>
        }
      >
        {loading ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">Loading certificates…</div>
        ) : !certificate || certificate.status === "disabled" ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            TLS is not enabled for this app in Kamal Proxy.
          </div>
        ) : (
          <div className="flex items-center gap-3 px-6 py-4">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">
                {certificate.label}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {certificate.hostsLabel}
                {tls ? " · Managed by kamal-proxy" : null}
              </div>
            </div>
            <Badge variant="secondary" className="shrink-0 gap-1 bg-[#3d9a6a]/15 text-[#3d9a6a]">
              <CheckCircle2Icon className="size-3.5" />
              Active
            </Badge>
          </div>
        )}
      </DomainsCard>

      <DnsConfigDialog
        open={dnsHost != null}
        onOpenChange={(open) => {
          if (!open) setDnsHost(null);
        }}
        host={dnsHost ?? ""}
        serverIp={serverIp}
      />
    </div>
  );
}

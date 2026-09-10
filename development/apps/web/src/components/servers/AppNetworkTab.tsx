import { Link } from "@tanstack/react-router";
import { EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "../../lib/utils";
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
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
import { Radio, RadioGroup } from "../ui/radio-group";
import {
  fetchAppNetwork,
  mutateAppNetwork,
  type AppRedirectRule,
  type AppSecurityRule,
  type RedirectType,
} from "./hetznerApi";

export type NetworkSectionId = "security" | "redirects";

export function isNetworkSectionId(value: unknown): value is NetworkSectionId {
  return value === "security" || value === "redirects";
}

const NETWORK_NAV = [
  { id: "security", label: "Security" },
  { id: "redirects", label: "Redirects" },
] as const;

type CredentialDraft = {
  readonly key: string;
  username: string;
  password: string;
  id?: string;
};

function NetworkCard({
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

function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  disabled,
}: {
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly onAction: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <div className="mx-6 my-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 px-6 py-14 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      <Button
        type="button"
        variant="outline"
        className="mt-5 gap-1.5"
        disabled={disabled}
        onClick={onAction}
      >
        <PlusIcon className="size-4" />
        {actionLabel}
      </Button>
    </div>
  );
}

function SecurityRuleDialog({
  open,
  onOpenChange,
  initial,
  busy,
  onSubmit,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly initial: AppSecurityRule | null;
  readonly busy: boolean;
  readonly onSubmit: (input: {
    readonly name: string;
    readonly path: string;
    readonly credentials: readonly {
      readonly id?: string;
      readonly username: string;
      readonly password: string;
    }[];
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [credentials, setCredentials] = useState<CredentialDraft[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    if (initial) {
      setName(initial.name);
      setPath(initial.path);
      setCredentials(
        initial.credentials.map((cred) => ({
          key: cred.id,
          id: cred.id,
          username: cred.username,
          password: cred.password,
        })),
      );
    } else {
      setName("");
      setPath("");
      setCredentials([]);
    }
  }, [initial, open]);

  async function handleSubmit() {
    setFormError(null);
    if (!name.trim()) {
      setFormError("Name is required");
      return;
    }
    if (credentials.length === 0) {
      setFormError("Add at least one credential");
      return;
    }
    for (const cred of credentials) {
      if (!cred.username.trim() || !cred.password) {
        setFormError("Each credential needs a username and password");
        return;
      }
    }
    try {
      await onSubmit({
        name: name.trim(),
        path: path.trim(),
        credentials: credentials.map((cred) => ({
          ...(cred.id ? { id: cred.id } : {}),
          username: cred.username.trim(),
          password: cred.password,
        })),
      });
      onOpenChange(false);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Failed to save security rule");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit security rule" : "New security rule"}</DialogTitle>
          <DialogDescription>
            Protect your site by adding a Basic Auth security rule.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-6 pb-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="security-rule-name">Name</Label>
            <Input
              id="security-rule-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Restricted Access"
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="security-rule-path">Path</Label>
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                Optional
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave blank to password protect all routes within your site.
            </p>
            <Input
              id="security-rule-path"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="/admin"
              disabled={busy}
              className="font-mono"
            />
          </div>
          <div className="overflow-hidden rounded-xl border border-border/70">
            <div className="border-b border-border/60 px-4 py-3 text-sm font-medium text-foreground">
              {credentials.length === 0
                ? "No credentials"
                : `${credentials.length} credential${credentials.length === 1 ? "" : "s"}`}
            </div>
            {credentials.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Get started and add a first credential for this rule.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={busy}
                  onClick={() =>
                    setCredentials([{ key: crypto.randomUUID(), username: "", password: "" }])
                  }
                >
                  <PlusIcon className="size-4" />
                  Add credential
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {credentials.map((cred, index) => (
                  <div key={cred.key} className="flex flex-col gap-3 px-4 py-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label>Username</Label>
                        <Input
                          value={cred.username}
                          onChange={(event) => {
                            const value = event.target.value;
                            setCredentials((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, username: value } : entry,
                              ),
                            );
                          }}
                          disabled={busy}
                          placeholder="admin"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Password</Label>
                        <Input
                          type="password"
                          value={cred.password}
                          onChange={(event) => {
                            const value = event.target.value;
                            setCredentials((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, password: value } : entry,
                              ),
                            );
                          }}
                          disabled={busy}
                          placeholder="••••••••"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={busy}
                        onClick={() =>
                          setCredentials((current) =>
                            current.filter((_, entryIndex) => entryIndex !== index),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="px-4 py-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={busy}
                    onClick={() =>
                      setCredentials((current) => [
                        ...current,
                        { key: crypto.randomUUID(), username: "", password: "" },
                      ])
                    }
                  >
                    <PlusIcon className="size-4" />
                    Add credential
                  </Button>
                </div>
              </div>
            )}
          </div>
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void handleSubmit()}>
            {busy ? "Saving…" : initial ? "Save" : "Add security rule"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function RedirectRuleDialog({
  open,
  onOpenChange,
  initial,
  busy,
  onSubmit,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly initial: AppRedirectRule | null;
  readonly busy: boolean;
  readonly onSubmit: (input: {
    readonly from: string;
    readonly to: string;
    readonly type: RedirectType;
  }) => Promise<void>;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState<RedirectType>("permanent");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    if (initial) {
      setFrom(initial.from);
      setTo(initial.to);
      setType(initial.type);
    } else {
      setFrom("");
      setTo("");
      setType("permanent");
    }
  }, [initial, open]);

  async function handleSubmit() {
    setFormError(null);
    if (!from.trim() || !to.trim()) {
      setFormError("From and To are required");
      return;
    }
    try {
      await onSubmit({ from: from.trim(), to: to.trim(), type });
      onOpenChange(false);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Failed to save redirect");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit redirect rule" : "New redirect rule"}</DialogTitle>
          <DialogDescription>
            Configure a redirect from one path or pattern to another destination.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-6 pb-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="redirect-from">From</Label>
            <Input
              id="redirect-from"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              placeholder="^/old-path/"
              disabled={busy}
              className="font-mono"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="redirect-to">To</Label>
            <Input
              id="redirect-to"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="https://example.com/new"
              disabled={busy}
              className="font-mono"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Type</Label>
            <RadioGroup
              value={type}
              onValueChange={(value) => {
                if (value === "temporary" || value === "permanent") setType(value);
              }}
              className="gap-2"
            >
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 px-3 py-3">
                <Radio value="temporary" className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium text-foreground">Temporary</span>
                  <span className="block text-xs text-muted-foreground">
                    Temporary redirect (302)
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 px-3 py-3">
                <Radio value="permanent" className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium text-foreground">Permanent</span>
                  <span className="block text-xs text-muted-foreground">
                    Permanent redirect (301)
                  </span>
                </span>
              </label>
            </RadioGroup>
          </div>
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void handleSubmit()}>
            {busy ? "Saving…" : initial ? "Save" : "Add redirect rule"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function SecurityPanel({
  serverId,
  service,
  rules,
  note,
  busy,
  onRefresh,
  setBusy,
  setError,
}: {
  readonly serverId: string;
  readonly service: string;
  readonly rules: readonly AppSecurityRule[];
  readonly note: string | null;
  readonly busy: boolean;
  readonly onRefresh: (payload: {
    readonly securityRules?: readonly AppSecurityRule[];
    readonly redirects?: readonly AppRedirectRule[];
    readonly proxyBasicAuthNote?: string | null;
  }) => void;
  readonly setBusy: (busy: boolean) => void;
  readonly setError: (error: string | null) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AppSecurityRule | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AppSecurityRule | null>(null);

  async function saveRule(input: {
    readonly name: string;
    readonly path: string;
    readonly credentials: readonly {
      readonly id?: string;
      readonly username: string;
      readonly password: string;
    }[];
  }) {
    setBusy(true);
    setError(null);
    try {
      const data = await mutateAppNetwork({
        serverId,
        service,
        action: editing ? "update_security" : "create_security",
        ...(editing ? { ruleId: editing.id } : {}),
        ...input,
      });
      if (!data.ok) throw new Error(data.error ?? "Failed to save security rule");
      onRefresh(data);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    setError(null);
    try {
      const data = await mutateAppNetwork({
        serverId,
        service,
        action: "delete_security",
        ruleId: pendingDelete.id,
      });
      if (!data.ok) throw new Error(data.error ?? "Failed to delete security rule");
      onRefresh(data);
      setPendingDelete(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete security rule");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <NetworkCard
        title="Security rules"
        description="Configure HTTP basic access authentication via security rules. Site-wide rules sync to kamal-proxy when supported."
        action={
          rules.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <PlusIcon className="size-4" />
              Add security rule
            </Button>
          ) : null
        }
      >
        {note ? (
          <p className="border-b border-border/60 px-6 py-3 text-xs text-muted-foreground">
            {note}
          </p>
        ) : null}
        {rules.length === 0 ? (
          <EmptyState
            title="No security rules yet"
            description="Get started and create your first security rule."
            actionLabel="Add security rule"
            disabled={busy}
            onAction={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          />
        ) : (
          <div className="divide-y divide-border/60">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-3 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{rule.name}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {rule.path || "Entire site"}
                    {" · "}
                    {rule.credentials.length} credential
                    {rule.credentials.length === 1 ? "" : "s"}
                  </div>
                </div>
                <Menu>
                  <MenuTrigger
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={`Actions for ${rule.name}`}
                    disabled={busy}
                  >
                    <EllipsisIcon className="size-4" />
                  </MenuTrigger>
                  <MenuPopup align="end">
                    <MenuItem
                      onClick={() => {
                        setEditing(rule);
                        setDialogOpen(true);
                      }}
                    >
                      <PencilIcon className="size-4" />
                      Edit
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem variant="destructive" onClick={() => setPendingDelete(rule)}>
                      <Trash2Icon className="size-4" />
                      Delete
                    </MenuItem>
                  </MenuPopup>
                </Menu>
              </div>
            ))}
          </div>
        )}
      </NetworkCard>

      <SecurityRuleDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        initial={editing}
        busy={busy}
        onSubmit={saveRule}
      />

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open && !busy) setPendingDelete(null);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete security rule?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this security rule? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" disabled={busy} />}>
              Cancel
            </AlertDialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}

function RedirectsPanel({
  serverId,
  service,
  rules,
  busy,
  onRefresh,
  setBusy,
  setError,
}: {
  readonly serverId: string;
  readonly service: string;
  readonly rules: readonly AppRedirectRule[];
  readonly busy: boolean;
  readonly onRefresh: (payload: {
    readonly securityRules?: readonly AppSecurityRule[];
    readonly redirects?: readonly AppRedirectRule[];
    readonly proxyBasicAuthNote?: string | null;
  }) => void;
  readonly setBusy: (busy: boolean) => void;
  readonly setError: (error: string | null) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AppRedirectRule | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AppRedirectRule | null>(null);

  async function saveRule(input: {
    readonly from: string;
    readonly to: string;
    readonly type: RedirectType;
  }) {
    setBusy(true);
    setError(null);
    try {
      const data = await mutateAppNetwork({
        serverId,
        service,
        action: editing ? "update_redirect" : "create_redirect",
        ...(editing ? { ruleId: editing.id } : {}),
        ...input,
      });
      if (!data.ok) throw new Error(data.error ?? "Failed to save redirect");
      onRefresh(data);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    setError(null);
    try {
      const data = await mutateAppNetwork({
        serverId,
        service,
        action: "delete_redirect",
        ruleId: pendingDelete.id,
      });
      if (!data.ok) throw new Error(data.error ?? "Failed to delete redirect");
      onRefresh(data);
      setPendingDelete(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete redirect");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <NetworkCard
        title="Redirect rules"
        description="Configure simple redirect rules for your site. Rules are stored in the control plane; kamal-proxy does not apply custom path redirects yet."
        action={
          rules.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <PlusIcon className="size-4" />
              Add redirect rule
            </Button>
          ) : null
        }
      >
        {rules.length === 0 ? (
          <EmptyState
            title="No redirect rules yet"
            description="Get started and create your first redirect rule."
            actionLabel="Add redirect rule"
            disabled={busy}
            onAction={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          />
        ) : (
          <div className="divide-y divide-border/60">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-3 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-sm text-foreground">
                    <span>{rule.from}</span>
                    <span className="mx-2 text-muted-foreground">→</span>
                    <span className="text-muted-foreground">{rule.to}</span>
                  </div>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {rule.type === "permanent" ? "Permanent" : "Temporary"}
                </Badge>
                <Menu>
                  <MenuTrigger
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={`Actions for ${rule.from}`}
                    disabled={busy}
                  >
                    <EllipsisIcon className="size-4" />
                  </MenuTrigger>
                  <MenuPopup align="end">
                    <MenuItem
                      onClick={() => {
                        setEditing(rule);
                        setDialogOpen(true);
                      }}
                    >
                      <PencilIcon className="size-4" />
                      Edit
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem variant="destructive" onClick={() => setPendingDelete(rule)}>
                      <Trash2Icon className="size-4" />
                      Delete
                    </MenuItem>
                  </MenuPopup>
                </Menu>
              </div>
            ))}
          </div>
        )}
      </NetworkCard>

      <RedirectRuleDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        initial={editing}
        busy={busy}
        onSubmit={saveRule}
      />

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open && !busy) setPendingDelete(null);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete redirect rule?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this redirect rule? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" disabled={busy} />}>
              Cancel
            </AlertDialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}

export function AppNetworkTab({
  serverId,
  service,
  section = "security",
}: {
  readonly serverId: string;
  readonly service: string;
  readonly section?: NetworkSectionId;
}) {
  const [securityRules, setSecurityRules] = useState<readonly AppSecurityRule[]>([]);
  const [redirects, setRedirects] = useState<readonly AppRedirectRule[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPayload = useCallback(
    (data: {
      readonly securityRules?: readonly AppSecurityRule[];
      readonly redirects?: readonly AppRedirectRule[];
      readonly proxyBasicAuthNote?: string | null;
    }) => {
      if (data.securityRules) setSecurityRules(data.securityRules);
      if (data.redirects) setRedirects(data.redirects);
      if ("proxyBasicAuthNote" in data) setNote(data.proxyBasicAuthNote ?? null);
    },
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAppNetwork(serverId, service);
      if (!data.ok && data.error) {
        setError(data.error);
        setSecurityRules([]);
        setRedirects([]);
        return;
      }
      applyPayload(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load network settings");
      setSecurityRules([]);
      setRedirects([]);
    } finally {
      setLoading(false);
    }
  }, [applyPayload, serverId, service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] xl:gap-14">
      <aside className="min-w-0">
        <h2 className="px-2 text-3xl font-semibold tracking-tight text-foreground">Network</h2>
        <nav aria-label="Network" className="mt-6 flex flex-col gap-1.5">
          {NETWORK_NAV.map((item) => {
            const active = item.id === section;
            return (
              <Link
                key={item.id}
                to="/servers/$serverId/apps/$service"
                params={{ serverId, service }}
                search={{ tab: "network", section: item.id }}
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
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {loading ? (
          <div className="rounded-xl border border-border/70 bg-card/40 px-6 py-10 text-sm text-muted-foreground">
            Loading network settings…
          </div>
        ) : section === "security" ? (
          <SecurityPanel
            serverId={serverId}
            service={service}
            rules={securityRules}
            note={note}
            busy={busy}
            onRefresh={applyPayload}
            setBusy={setBusy}
            setError={setError}
          />
        ) : (
          <RedirectsPanel
            serverId={serverId}
            service={service}
            rules={redirects}
            busy={busy}
            onRefresh={applyPayload}
            setBusy={setBusy}
            setError={setError}
          />
        )}
      </div>
    </div>
  );
}

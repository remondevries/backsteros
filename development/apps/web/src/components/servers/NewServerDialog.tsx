import { useEffect, useMemo, useState } from "react";

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
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import {
  createHetznerServer,
  fetchHetznerCatalog,
  monthlyPriceLabel,
  type HetznerCatalogResponse,
  type HetznerImage,
  type HetznerLocation,
  type HetznerServer,
  type HetznerServerType,
  type HetznerSshKey,
} from "./hetznerApi";

const DEFAULT_LOCATION = "fsn1";
const DEFAULT_TYPE = "cpx22";
const DEFAULT_IMAGE = "ubuntu-24.04";

type CatalogState = {
  readonly configured: boolean;
  readonly locations: readonly HetznerLocation[];
  readonly serverTypes: readonly HetznerServerType[];
  readonly images: readonly HetznerImage[];
  readonly sshKeys: readonly HetznerSshKey[];
};

function pickDefaultLocation(locations: readonly HetznerLocation[]): string {
  return (
    locations.find((entry) => entry.name === DEFAULT_LOCATION)?.name ?? locations[0]?.name ?? ""
  );
}

function pickDefaultType(types: readonly HetznerServerType[]): string {
  return types.find((entry) => entry.name === DEFAULT_TYPE)?.name ?? types[0]?.name ?? "";
}

function pickDefaultImage(images: readonly HetznerImage[]): string {
  return (
    images.find((entry) => entry.name === DEFAULT_IMAGE)?.name ??
    images.find((entry) => entry.name?.startsWith("ubuntu-"))?.name ??
    images[0]?.name ??
    ""
  );
}

function catalogFromResponse(data: HetznerCatalogResponse): CatalogState {
  return {
    configured: data.configured !== false,
    locations: data.locations ?? [],
    serverTypes: data.serverTypes ?? [],
    images: data.images ?? [],
    sshKeys: data.sshKeys ?? [],
  };
}

export function NewServerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: (server: HetznerServer, rootPassword: string | null) => void;
}) {
  const [catalog, setCatalog] = useState<CatalogState | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [serverType, setServerType] = useState("");
  const [image, setImage] = useState("");
  const [sshKeyIds, setSshKeyIds] = useState<readonly string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingCatalog(true);
    setCatalogError(null);
    setSubmitError(null);

    void fetchHetznerCatalog()
      .then((data) => {
        if (cancelled) return;
        if (!data.ok && data.error) {
          setCatalogError(data.error);
          setCatalog(null);
          return;
        }
        const next = catalogFromResponse(data);
        setCatalog(next);
        setLocation((current) => current || pickDefaultLocation(next.locations));
        setServerType((current) => current || pickDefaultType(next.serverTypes));
        setImage((current) => current || pickDefaultImage(next.images));
        if (next.sshKeys.length === 1) {
          setSshKeyIds([String(next.sshKeys[0]!.id)]);
        }
        if (!next.configured) {
          setCatalogError(
            "Hetzner Cloud is not configured. Set HCLOUD_TOKEN in ~/.config/secrets/hetzner.env",
          );
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setCatalogError(error instanceof Error ? error.message : "Failed to load Hetzner catalog");
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedType = useMemo(
    () => catalog?.serverTypes.find((entry) => entry.name === serverType) ?? null,
    [catalog, serverType],
  );

  const priceLabel = selectedType && location ? monthlyPriceLabel(selectedType, location) : null;

  const canSubmit =
    !loadingCatalog &&
    !submitting &&
    Boolean(catalog?.configured) &&
    name.trim().length > 0 &&
    location.length > 0 &&
    serverType.length > 0 &&
    image.length > 0;

  const reset = () => {
    setName("");
    setLocation("");
    setServerType("");
    setImage("");
    setSshKeyIds([]);
    setSubmitError(null);
    setCatalogError(null);
  };

  const toggleSshKey = (id: string) => {
    setSshKeyIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createHetznerServer({
        name: name.trim(),
        location,
        server_type: serverType,
        image,
        ...(sshKeyIds.length ? { ssh_keys: sshKeyIds } : {}),
      });
      if (!result.ok || !result.server) {
        setSubmitError(result.error ?? "Failed to create server");
        return;
      }
      onCreated(result.server, result.rootPassword ?? null);
      reset();
      onOpenChange(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to create server");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New server</DialogTitle>
          <DialogDescription>
            Provision a Hetzner Cloud VM. The API token stays on the local development server.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            id="new-hetzner-server-form"
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {catalogError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {catalogError}
              </p>
            ) : null}

            <div className="grid gap-1.5">
              <Label htmlFor="hetzner-server-name">Name</Label>
              <Input
                id="hetzner-server-name"
                placeholder="my-app-server"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
                disabled={loadingCatalog || submitting}
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Location</Label>
              <Select
                value={location}
                onValueChange={(value) => {
                  if (typeof value === "string") setLocation(value);
                }}
                disabled={loadingCatalog || submitting || !catalog?.locations.length}
              >
                <SelectTrigger aria-label="Location" className="w-full">
                  <SelectValue>
                    {catalog?.locations.find((entry) => entry.name === location)
                      ? `${catalog.locations.find((entry) => entry.name === location)!.city} (${location})`
                      : loadingCatalog
                        ? "Loading…"
                        : "Select location"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {(catalog?.locations ?? []).map((entry) => (
                    <SelectItem key={entry.id} value={entry.name}>
                      {entry.city} · {entry.name} · {entry.country}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Server type</Label>
              <Select
                value={serverType}
                onValueChange={(value) => {
                  if (typeof value === "string") setServerType(value);
                }}
                disabled={loadingCatalog || submitting || !catalog?.serverTypes.length}
              >
                <SelectTrigger aria-label="Server type" className="w-full">
                  <SelectValue>
                    {selectedType
                      ? `${selectedType.name} · ${selectedType.cores} vCPU · ${selectedType.memory} GB`
                      : loadingCatalog
                        ? "Loading…"
                        : "Select type"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {(catalog?.serverTypes ?? []).map((entry) => {
                    const price = location ? monthlyPriceLabel(entry, location) : null;
                    return (
                      <SelectItem key={entry.id} value={entry.name}>
                        {entry.name} · {entry.cores} vCPU · {entry.memory} GB
                        {price ? ` · ${price}/mo` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectPopup>
              </Select>
              {priceLabel ? (
                <p className="text-xs text-muted-foreground">
                  About {priceLabel} / month in {location}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label>Image</Label>
              <Select
                value={image}
                onValueChange={(value) => {
                  if (typeof value === "string") setImage(value);
                }}
                disabled={loadingCatalog || submitting || !catalog?.images.length}
              >
                <SelectTrigger aria-label="Image" className="w-full">
                  <SelectValue>
                    {catalog?.images.find((entry) => entry.name === image)?.description ??
                      (loadingCatalog ? "Loading…" : "Select image")}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {(catalog?.images ?? []).map((entry) => (
                    <SelectItem key={entry.id} value={entry.name ?? String(entry.id)}>
                      {entry.description}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>

            {catalog && catalog.sshKeys.length > 0 ? (
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium leading-none">SSH keys</legend>
                <div className="grid gap-1.5">
                  {catalog.sshKeys.map((key) => {
                    const id = String(key.id);
                    const checked = sshKeyIds.includes(id);
                    return (
                      <label
                        key={key.id}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm hover:bg-muted/40"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={checked}
                          onChange={() => toggleSshKey(id)}
                          disabled={submitting}
                        />
                        <span className="min-w-0">
                          <span className="block font-medium text-foreground">{key.name}</span>
                          <span className="block truncate font-mono text-xs text-muted-foreground">
                            {key.fingerprint}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            {submitError ? (
              <p className="text-sm text-destructive" role="alert">
                {submitError}
              </p>
            ) : null}
          </form>
        </DialogPanel>
        <DialogFooter variant="bare">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" form="new-hetzner-server-form" disabled={!canSubmit}>
            {submitting ? "Creating…" : "Create server"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

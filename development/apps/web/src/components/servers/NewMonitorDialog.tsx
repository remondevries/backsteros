import { useEffect, useMemo, useState } from "react";

import { fetchBacksterosContacts } from "../../backsteros/client";
import { BacksterosContactPersonIcon } from "../../backsteros/ContactPersonIcon";
import { BacksterosEntityAvatarIcon } from "../../backsteros/EntityAvatarIcon";
import {
  BacksterosSearchablePropertyMenu,
  type BacksterosSearchablePropertyOption,
} from "../../backsteros/SearchablePropertyMenu";
import type { BacksterosContact } from "../../backsteros/types";
import { useBacksterosContactAvatarSrcMap } from "../../backsteros/useBacksterosContactAvatars";
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
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "../ui/input-group";
import { Label } from "../ui/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import {
  createServerMonitor,
  type ServerMonitor,
  type ServerMonitorMetric,
  type ServerMonitorOperator,
} from "./hetznerApi";
import "../../backsteros/backsterosPropertyMenu.css";

const METRIC_OPTIONS: readonly { readonly value: ServerMonitorMetric; readonly label: string }[] = [
  { value: "cpu_load", label: "CPU Load Average" },
  { value: "used_memory", label: "Used Memory" },
  { value: "used_disk", label: "Used Disk Space" },
];

const OPERATOR_OPTIONS: readonly {
  readonly value: ServerMonitorOperator;
  readonly label: string;
}[] = [
  { value: "gte", label: "Greater than or equal to" },
  { value: "gt", label: "Greater than" },
  { value: "lte", label: "Less than or equal to" },
  { value: "lt", label: "Less than" },
];

export function NewMonitorDialog({
  open,
  onOpenChange,
  serverId,
  serverName,
  service = null,
  onCreated,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly serverId: string;
  readonly serverName: string;
  readonly service?: string | null;
  readonly onCreated: (monitor: ServerMonitor) => void;
}) {
  const [metric, setMetric] = useState<ServerMonitorMetric>("cpu_load");
  const [operator, setOperator] = useState<ServerMonitorOperator>("gte");
  const [threshold, setThreshold] = useState("80");
  const [durationMinutes, setDurationMinutes] = useState("15");
  const [contactId, setContactId] = useState<string>("");
  const [contacts, setContacts] = useState<readonly BacksterosContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const avatarSrcById = useBacksterosContactAvatarSrcMap(contacts);

  useEffect(() => {
    if (!open) return;
    setMetric("cpu_load");
    setOperator("gte");
    setThreshold("80");
    setDurationMinutes("15");
    setContactId("");
    setSubmitError(null);
    setSubmitting(false);
    setContactsError(null);
    setContactsLoading(true);
    let cancelled = false;
    void fetchBacksterosContacts()
      .then((rows) => {
        if (cancelled) return;
        setContacts(rows);
        if (rows[0]) setContactId(rows[0].id);
      })
      .catch((cause) => {
        if (cancelled) return;
        setContacts([]);
        setContactsError(
          cause instanceof Error ? cause.message : "Failed to load BacksterOS contacts",
        );
      })
      .finally(() => {
        if (!cancelled) setContactsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.id === contactId) ?? null,
    [contactId, contacts],
  );

  const contactOptions = useMemo((): readonly BacksterosSearchablePropertyOption[] => {
    return contacts.map((contact) => ({
      value: contact.id,
      label: contact.name,
      searchText: [contact.name, contact.firstName, contact.lastName, contact.email]
        .filter(Boolean)
        .join(" "),
      icon: <BacksterosEntityAvatarIcon src={avatarSrcById[contact.id] ?? null} size={14} />,
    }));
  }, [avatarSrcById, contacts]);

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    const thresholdValue = Number(threshold);
    const durationValue = Number(durationMinutes);
    if (!Number.isFinite(thresholdValue) || thresholdValue < 0) {
      setSubmitError("Enter a valid threshold");
      setSubmitting(false);
      return;
    }
    if (!Number.isFinite(durationValue) || durationValue < 1) {
      setSubmitError("Duration must be at least 1 minute");
      setSubmitting(false);
      return;
    }
    if (!contactId) {
      setSubmitError("Select a BacksterOS contact for the support ticket");
      setSubmitting(false);
      return;
    }

    try {
      const data = await createServerMonitor({
        serverId,
        service,
        metric,
        operator,
        threshold: thresholdValue,
        durationMinutes: Math.round(durationValue),
        notifyChannel: "support_ticket",
        notifyContactId: contactId,
        notifyContactName: selectedContact?.name ?? null,
      });
      if (!data.ok || !data.monitor) {
        setSubmitError(data.error ?? "Failed to create monitor");
        return;
      }
      onCreated(data.monitor);
      onOpenChange(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to create monitor");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>{service ? "New app monitor" : "New server monitor"}</DialogTitle>
          <DialogDescription>
            Create a new monitor for{" "}
            <span className="font-medium text-foreground">{serverName}</span>
            {service ? (
              <>
                {" "}
                / <span className="font-medium text-foreground">{service}</span>
              </>
            ) : null}
            . When it triggers, BacksterOS opens a support ticket for the selected contact.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            id="new-server-monitor-form"
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {submitError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {submitError}
              </p>
            ) : null}

            <div className="grid gap-1.5">
              <Label>Metric</Label>
              <Select
                value={metric}
                onValueChange={(value) => {
                  if (typeof value === "string") setMetric(value as ServerMonitorMetric);
                }}
                disabled={submitting}
              >
                <SelectTrigger aria-label="Metric" className="w-full">
                  <SelectValue>
                    {METRIC_OPTIONS.find((entry) => entry.value === metric)?.label ?? metric}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {METRIC_OPTIONS.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Condition</Label>
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)] gap-2">
                <Select
                  value={operator}
                  onValueChange={(value) => {
                    if (typeof value === "string") setOperator(value as ServerMonitorOperator);
                  }}
                  disabled={submitting}
                >
                  <SelectTrigger aria-label="Operator" className="w-full">
                    <SelectValue>
                      {OPERATOR_OPTIONS.find((entry) => entry.value === operator)?.label ??
                        operator}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {OPERATOR_OPTIONS.map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                <InputGroup>
                  <InputGroupInput
                    inputMode="decimal"
                    value={threshold}
                    onChange={(event) => setThreshold(event.target.value)}
                    disabled={submitting}
                    aria-label="Threshold"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>%</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>For at least</Label>
              <InputGroup>
                <InputGroupInput
                  inputMode="numeric"
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(event.target.value)}
                  disabled={submitting}
                  aria-label="Duration in minutes"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>Minutes</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </div>

            <div className="grid gap-1.5">
              <Label>Notify via support ticket</Label>
              <p className="text-sm text-muted-foreground">
                Search and pick a BacksterOS contact. When this monitor fires, we create a support
                ticket linked to that contact.
              </p>
              {contactsError ? <p className="text-sm text-destructive">{contactsError}</p> : null}
              <div className="flex min-w-0 items-center">
                <BacksterosSearchablePropertyMenu
                  label={
                    contactsLoading
                      ? "Loading contacts…"
                      : selectedContact
                        ? selectedContact.name
                        : contacts.length === 0
                          ? "No contacts found"
                          : "Select a contact"
                  }
                  icon={
                    selectedContact ? (
                      <BacksterosEntityAvatarIcon
                        src={avatarSrcById[selectedContact.id] ?? null}
                        size={14}
                      />
                    ) : (
                      <BacksterosContactPersonIcon size={14} className="opacity-70" />
                    )
                  }
                  value={contactId}
                  options={contactOptions}
                  searchPlaceholder="Search contacts…"
                  ariaLabel="Support ticket contact"
                  disabled={submitting || contactsLoading || contacts.length === 0}
                  muted={!selectedContact}
                  onChange={setContactId}
                />
              </div>
            </div>
          </form>
        </DialogPanel>
        <DialogFooter variant="bare">
          <Button
            type="submit"
            form="new-server-monitor-form"
            className="w-full"
            disabled={submitting || contactsLoading || !contactId}
          >
            {submitting ? "Creating…" : "Create server monitor"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

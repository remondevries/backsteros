/**
 * Placeholder conflicts for the Settings → Syncing resolution prototype.
 * Not connected to PowerSync, replication, or any live row state.
 */

export type SyncConflictFieldId =
  | "title"
  | "status"
  | "startAt"
  | "endAt"
  | "format"
  | "location"
  | "organization"
  | "attendees"
  | "summary"
  | "updatedAt"
  | "body"
  | "kind"
  | "subject"
  | "occurredAt";

export type SyncConflictField = {
  id: SyncConflictFieldId;
  label: string;
  localValue: string;
  cloudValue: string;
  /** When true, the two sides differ and should be visually highlighted. */
  differs: boolean;
};

export type SyncConflictEntityKind =
  | "Meeting"
  | "Contact"
  | "Document"
  | "CRM activity";

export type SyncConflictPrototype = {
  entityKind: SyncConflictEntityKind;
  displayId: string;
  entityId: string;
  detectedAtLabel: string;
  localUpdatedAtLabel: string;
  cloudUpdatedAtLabel: string;
  fields: SyncConflictField[];
};

function meetingFields(
  overrides: Partial<Record<SyncConflictFieldId, Partial<SyncConflictField>>>,
): SyncConflictField[] {
  const base: SyncConflictField[] = [
    {
      id: "title",
      label: "Title",
      localValue: "Kickoff with Acme",
      cloudValue: "Kickoff with ACME Corp",
      differs: true,
    },
    {
      id: "status",
      label: "Status",
      localValue: "Scheduled",
      cloudValue: "Scheduled",
      differs: false,
    },
    {
      id: "startAt",
      label: "Starts",
      localValue: "28 Oct 2026 · 10:00",
      cloudValue: "28 Oct 2026 · 10:30",
      differs: true,
    },
    {
      id: "endAt",
      label: "Ends",
      localValue: "28 Oct 2026 · 11:00",
      cloudValue: "28 Oct 2026 · 11:30",
      differs: true,
    },
    {
      id: "format",
      label: "Format",
      localValue: "In person",
      cloudValue: "Video call",
      differs: true,
    },
    {
      id: "location",
      label: "Location",
      localValue: "Office HQ · Room 3",
      cloudValue: "Zoom · Remon / Acme",
      differs: true,
    },
    {
      id: "organization",
      label: "Organization",
      localValue: "Acme BV",
      cloudValue: "Acme BV",
      differs: false,
    },
    {
      id: "attendees",
      label: "Attendees",
      localValue: "Remon · Sam · Jordan",
      cloudValue: "Remon · Sam · Jordan · Alex",
      differs: true,
    },
    {
      id: "summary",
      label: "Summary",
      localValue: "Align on Q4 rollout and vault sync ownership.",
      cloudValue:
        "Align on Q4 rollout; confirm who owns vault sync before Friday.",
      differs: true,
    },
    {
      id: "updatedAt",
      label: "Updated",
      localValue: "Today · 09:58",
      cloudValue: "Today · 10:11",
      differs: true,
    },
  ];

  return base.map((field) => {
    const patch = overrides[field.id];
    if (!patch) return field;
    const next = { ...field, ...patch };
    if (
      patch.localValue !== undefined ||
      patch.cloudValue !== undefined
    ) {
      next.differs =
        patch.differs ?? next.localValue !== next.cloudValue;
    }
    return next;
  });
}

/** Eight placeholder conflicts so the Syncing page can page through issues. */
export const SYNC_CONFLICT_PROTOTYPE_MOCKS: SyncConflictPrototype[] = [
  {
    entityKind: "Meeting",
    displayId: "MTG-184",
    entityId: "mtg_01JBPLACEHOLDER9XYZ",
    detectedAtLabel: "Today · 10:14",
    localUpdatedAtLabel: "Today · 09:58",
    cloudUpdatedAtLabel: "Today · 10:11",
    fields: meetingFields({}),
  },
  {
    entityKind: "Meeting",
    displayId: "MTG-191",
    entityId: "mtg_01JBPLACEHOLDERBOARD",
    detectedAtLabel: "Today · 09:40",
    localUpdatedAtLabel: "Today · 09:22",
    cloudUpdatedAtLabel: "Today · 09:37",
    fields: meetingFields({
      title: {
        localValue: "Board prep",
        cloudValue: "Board prep — draft agenda",
      },
      startAt: {
        localValue: "30 Oct 2026 · 14:00",
        cloudValue: "30 Oct 2026 · 15:00",
      },
      endAt: {
        localValue: "30 Oct 2026 · 15:00",
        cloudValue: "30 Oct 2026 · 16:00",
      },
      format: {
        localValue: "Video call",
        cloudValue: "Video call",
        differs: false,
      },
      location: {
        localValue: "Meet · Board room link",
        cloudValue: "Meet · Board room link",
        differs: false,
      },
      organization: {
        localValue: "BacksterOS",
        cloudValue: "BacksterOS",
        differs: false,
      },
      attendees: {
        localValue: "Remon · Mira",
        cloudValue: "Remon · Mira · Chris",
      },
      summary: {
        localValue: "Review runway and sync conflict UX.",
        cloudValue: "Review runway; decide conflict UX ownership.",
      },
      updatedAt: {
        localValue: "Today · 09:22",
        cloudValue: "Today · 09:37",
      },
    }),
  },
  {
    entityKind: "Meeting",
    displayId: "MTG-203",
    entityId: "mtg_01JBPLACEHOLDERCLIENT",
    detectedAtLabel: "Yesterday · 18:02",
    localUpdatedAtLabel: "Yesterday · 17:40",
    cloudUpdatedAtLabel: "Yesterday · 17:58",
    fields: meetingFields({
      title: {
        localValue: "Client check-in · Nova",
        cloudValue: "Nova weekly check-in",
      },
      status: {
        localValue: "Done",
        cloudValue: "Scheduled",
      },
      startAt: {
        localValue: "27 Oct 2026 · 16:00",
        cloudValue: "27 Oct 2026 · 16:00",
        differs: false,
      },
      endAt: {
        localValue: "27 Oct 2026 · 16:30",
        cloudValue: "27 Oct 2026 · 16:45",
      },
      format: {
        localValue: "Phone call",
        cloudValue: "Video call",
      },
      location: {
        localValue: "+31 6 …",
        cloudValue: "Zoom · Nova",
      },
      organization: {
        localValue: "Nova Labs",
        cloudValue: "Nova Labs",
        differs: false,
      },
      attendees: {
        localValue: "Remon · Lea",
        cloudValue: "Remon · Lea",
        differs: false,
      },
      summary: {
        localValue: "Follow up on invoice and portal access.",
        cloudValue: "Follow up on invoice; portal access still blocked.",
      },
      updatedAt: {
        localValue: "Yesterday · 17:40",
        cloudValue: "Yesterday · 17:58",
      },
    }),
  },
  {
    entityKind: "Contact",
    displayId: "CON-441",
    entityId: "ctc_01JBPLACEHOLDERSAM",
    detectedAtLabel: "Today · 08:55",
    localUpdatedAtLabel: "Today · 08:41",
    cloudUpdatedAtLabel: "Today · 08:52",
    fields: [
      {
        id: "title",
        label: "Name",
        localValue: "Sam Rivera",
        cloudValue: "Samantha Rivera",
        differs: true,
      },
      {
        id: "subject",
        label: "Company",
        localValue: "Acme BV",
        cloudValue: "Acme BV",
        differs: false,
      },
      {
        id: "body",
        label: "Email",
        localValue: "sam@acme.example",
        cloudValue: "s.rivera@acme.example",
        differs: true,
      },
      {
        id: "location",
        label: "Phone",
        localValue: "+31 6 1234 5678",
        cloudValue: "+31 6 1234 5678",
        differs: false,
      },
      {
        id: "updatedAt",
        label: "Updated",
        localValue: "Today · 08:41",
        cloudValue: "Today · 08:52",
        differs: true,
      },
    ],
  },
  {
    entityKind: "Meeting",
    displayId: "MTG-210",
    entityId: "mtg_01JBPLACEHOLDERDESIGN",
    detectedAtLabel: "Today · 11:05",
    localUpdatedAtLabel: "Today · 10:48",
    cloudUpdatedAtLabel: "Today · 11:01",
    fields: meetingFields({
      title: {
        localValue: "Design review · Syncing",
        cloudValue: "Design review — conflict UI",
      },
      startAt: {
        localValue: "29 Oct 2026 · 11:00",
        cloudValue: "29 Oct 2026 · 11:00",
        differs: false,
      },
      endAt: {
        localValue: "29 Oct 2026 · 12:00",
        cloudValue: "29 Oct 2026 · 12:00",
        differs: false,
      },
      format: {
        localValue: "In person",
        cloudValue: "In person",
        differs: false,
      },
      location: {
        localValue: "Studio",
        cloudValue: "Studio · Desk 2",
      },
      organization: {
        localValue: "BacksterOS",
        cloudValue: "BacksterOS",
        differs: false,
      },
      attendees: {
        localValue: "Remon · Design",
        cloudValue: "Remon · Design · Product",
      },
      summary: {
        localValue: "Walk through side-by-side conflict cells.",
        cloudValue: "Walk through conflict paging + apply fix.",
      },
      updatedAt: {
        localValue: "Today · 10:48",
        cloudValue: "Today · 11:01",
      },
    }),
  },
  {
    entityKind: "CRM activity",
    displayId: "ACT-92",
    entityId: "act_01JBPLACEHOLDERMEET1",
    detectedAtLabel: "Yesterday · 12:20",
    localUpdatedAtLabel: "Yesterday · 12:05",
    cloudUpdatedAtLabel: "Yesterday · 12:18",
    fields: [
      {
        id: "kind",
        label: "Kind",
        localValue: "Meeting",
        cloudValue: "Meeting",
        differs: false,
      },
      {
        id: "subject",
        label: "Subject",
        localValue: "Organization · Helix Co",
        cloudValue: "Organization · Helix Company",
        differs: true,
      },
      {
        id: "title",
        label: "Meeting",
        localValue: "Discovery call",
        cloudValue: "Discovery call (rescheduled)",
        differs: true,
      },
      {
        id: "occurredAt",
        label: "Occurred",
        localValue: "25 Oct 2026 · 11:00",
        cloudValue: "25 Oct 2026 · 13:00",
        differs: true,
      },
      {
        id: "updatedAt",
        label: "Updated",
        localValue: "Yesterday · 12:05",
        cloudValue: "Yesterday · 12:18",
        differs: true,
      },
    ],
  },
  {
    entityKind: "Meeting",
    displayId: "MTG-217",
    entityId: "mtg_01JBPLACEHOLDERSTANDUP",
    detectedAtLabel: "Today · 07:12",
    localUpdatedAtLabel: "Today · 07:01",
    cloudUpdatedAtLabel: "Today · 07:09",
    fields: meetingFields({
      title: {
        localValue: "Daily standup",
        cloudValue: "Daily standup",
        differs: false,
      },
      status: {
        localValue: "Done",
        cloudValue: "Done",
        differs: false,
      },
      startAt: {
        localValue: "26 Oct 2026 · 09:00",
        cloudValue: "26 Oct 2026 · 09:15",
      },
      endAt: {
        localValue: "26 Oct 2026 · 09:15",
        cloudValue: "26 Oct 2026 · 09:30",
      },
      format: {
        localValue: "Video call",
        cloudValue: "Video call",
        differs: false,
      },
      location: {
        localValue: "Meet · Standup",
        cloudValue: "Meet · Standup",
        differs: false,
      },
      organization: {
        localValue: "BacksterOS",
        cloudValue: "BacksterOS",
        differs: false,
      },
      attendees: {
        localValue: "Remon · Team",
        cloudValue: "Remon · Team",
        differs: false,
      },
      summary: {
        localValue: "Blocked on conflict paging.",
        cloudValue: "Unblocked — shipping 8-conflict prototype.",
      },
      updatedAt: {
        localValue: "Today · 07:01",
        cloudValue: "Today · 07:09",
      },
    }),
  },
  {
    entityKind: "Document",
    displayId: "DOC-55",
    entityId: "doc_01JBPLACEHOLDERVAULT",
    detectedAtLabel: "Today · 12:30",
    localUpdatedAtLabel: "Today · 12:18",
    cloudUpdatedAtLabel: "Today · 12:27",
    fields: [
      {
        id: "title",
        label: "Title",
        localValue: "Vault sync paths",
        cloudValue: "Vault sync paths (draft)",
        differs: true,
      },
      {
        id: "location",
        label: "Path",
        localValue: "Projects/OS/vault-sync.md",
        cloudValue: "Projects/OS/vault-sync.md",
        differs: false,
      },
      {
        id: "body",
        label: "Preview",
        localValue: "Local working copy prefers ~/Documents/BacksterOS.",
        cloudValue: "Cloud copy prefers private R2 + desktop working copy.",
        differs: true,
      },
      {
        id: "updatedAt",
        label: "Updated",
        localValue: "Today · 12:18",
        cloudValue: "Today · 12:27",
        differs: true,
      },
    ],
  },
];

/** @deprecated Prefer {@link SYNC_CONFLICT_PROTOTYPE_MOCKS}[0]. */
export const SYNC_CONFLICT_PROTOTYPE_MOCK = SYNC_CONFLICT_PROTOTYPE_MOCKS[0]!;

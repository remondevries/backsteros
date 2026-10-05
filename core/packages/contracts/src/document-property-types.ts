export const DOCUMENT_PROPERTY_TYPE_KINDS = [
  "select",
  "multi-select",
  "text",
  "date",
  "contact",
  "task",
  "number",
  "checkbox",
] as const;

export type DocumentPropertyTypeKind =
  (typeof DOCUMENT_PROPERTY_TYPE_KINDS)[number];

export const DOCUMENT_PROPERTY_TYPE_STATUSES = [
  "active",
  "proposed",
  "rejected",
] as const;

export type DocumentPropertyTypeStatus =
  (typeof DOCUMENT_PROPERTY_TYPE_STATUSES)[number];

export const DOCUMENT_PROPERTY_TYPE_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

export const RESERVED_DOCUMENT_PROPERTY_KEYS = ["docKey"] as const;

export type DocumentPropertyTypeOption = {
  value: string;
  label: string;
};

export type DocumentPropertyTypeSeed = {
  key: string;
  label: string;
  kind: DocumentPropertyTypeKind;
  options?: DocumentPropertyTypeOption[];
  multiple?: boolean;
};

export const CORE_DOCUMENT_PROPERTY_TYPE_SEEDS: readonly DocumentPropertyTypeSeed[] =
  [
    {
      key: "type",
      label: "Type",
      kind: "select",
      options: [
        { value: "reference", label: "Reference" },
        { value: "runbook", label: "Runbook" },
        { value: "house-rule", label: "House rule" },
        { value: "meeting-notes", label: "Meeting notes" },
        { value: "decision", label: "Decision" },
        { value: "letter", label: "Letter" },
        { value: "draft", label: "Draft" },
      ],
    },
    {
      key: "audience",
      label: "Audience",
      kind: "select",
      options: [
        { value: "agents", label: "Agents" },
        { value: "remon", label: "Remon" },
        { value: "client", label: "Client" },
        { value: "public", label: "Public" },
      ],
    },
    {
      key: "status",
      label: "Status",
      kind: "select",
      options: [
        { value: "draft", label: "Draft" },
        { value: "current", label: "Current" },
        { value: "superseded", label: "Superseded" },
        { value: "archived", label: "Archived" },
      ],
    },
    { key: "reviewDate", label: "Review date", kind: "date" },
    { key: "supersededBy", label: "Superseded by", kind: "text" },
    { key: "owner", label: "Owner", kind: "contact" },
    { key: "linkedTasks", label: "Linked tasks", kind: "task", multiple: true },
    {
      key: "linkedContacts",
      label: "Linked contacts",
      kind: "contact",
      multiple: true,
    },
    { key: "project", label: "Project", kind: "text" },
  ];

export function isDocumentPropertyTypeKey(value: string): boolean {
  return DOCUMENT_PROPERTY_TYPE_KEY_PATTERN.test(value);
}

export function isReservedDocumentPropertyKey(key: string): boolean {
  return (RESERVED_DOCUMENT_PROPERTY_KEYS as readonly string[]).includes(key);
}

export function agentMustProposeDocumentPropertyTypes(input: {
  kind: string;
  contactId?: string | null;
  isWorkspaceOwnerKey?: boolean;
}): boolean {
  if (input.kind !== "api_key") return false;
  if (input.isWorkspaceOwnerKey) return false;
  return true;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function asStringList(value: unknown): string[] | null {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(value)) return null;
  const list: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    const trimmed = entry.trim();
    if (trimmed) list.push(trimmed);
  }
  return list;
}

export function validateDocumentPropertyValue(input: {
  key: string;
  kind: DocumentPropertyTypeKind;
  value: unknown;
  options?: readonly DocumentPropertyTypeOption[];
  multiple?: boolean;
}): { ok: true; value: unknown } | { ok: false; error: string } {
  if (input.value === null || input.value === undefined) {
    return { ok: true, value: null };
  }
  const allowed = (input.options ?? []).map((option) => option.value);
  switch (input.kind) {
    case "select": {
      if (typeof input.value !== "string" || !input.value.trim()) {
        return { ok: false, error: `${input.key} must be a string` };
      }
      const next = input.value.trim();
      if (allowed.length && !allowed.includes(next)) {
        return { ok: false, error: `Invalid value for ${input.key}` };
      }
      return { ok: true, value: next };
    }
    case "multi-select": {
      const list = asStringList(input.value);
      if (!list) {
        return { ok: false, error: `${input.key} must be a list of strings` };
      }
      if (allowed.length && list.some((entry) => !allowed.includes(entry))) {
        return { ok: false, error: `Invalid value for ${input.key}` };
      }
      return { ok: true, value: list };
    }
    case "text": {
      if (typeof input.value !== "string") {
        return { ok: false, error: `${input.key} must be a string` };
      }
      const next = input.value.trim();
      return { ok: true, value: next.length ? next : null };
    }
    case "date": {
      if (typeof input.value !== "string" || !ISO_DATE.test(input.value.trim())) {
        return { ok: false, error: `${input.key} must be an ISO date string` };
      }
      return { ok: true, value: input.value.trim() };
    }
    case "contact":
    case "task": {
      const list = asStringList(input.value);
      if (!list) {
        return { ok: false, error: `${input.key} must be a string or list` };
      }
      if (!input.multiple) {
        return { ok: true, value: list[0] ?? null };
      }
      return { ok: true, value: list };
    }
    case "number": {
      if (typeof input.value === "number" && Number.isFinite(input.value)) {
        return { ok: true, value: input.value };
      }
      if (typeof input.value === "string" && input.value.trim()) {
        const parsed = Number(input.value);
        if (Number.isFinite(parsed)) return { ok: true, value: parsed };
      }
      return { ok: false, error: `${input.key} must be a number` };
    }
    case "checkbox": {
      if (typeof input.value !== "boolean") {
        return { ok: false, error: `${input.key} must be a boolean` };
      }
      return { ok: true, value: input.value };
    }
    default:
      return { ok: false, error: `Unknown kind for ${input.key}` };
  }
}

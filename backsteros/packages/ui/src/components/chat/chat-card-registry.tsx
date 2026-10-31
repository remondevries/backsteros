"use client";

import { createContext, useContext, type ReactNode } from "react";
import type {
  ChatUiCardPart,
  ChatUiContactCardData,
  ChatUiDocumentCardData,
  ChatUiEmailCardData,
  ChatUiLetterCardData,
  ChatUiOrganizationCardData,
  ChatUiProjectCardData,
  ChatUiTaskCardData,
} from "@backsteros/contracts";

import { isDefinedProjectArea, PROJECT_AREA_LABELS } from "../../projects/project-areas.js";
import { getProjectStatusLabel, isProjectStatus } from "../../projects/project-status.js";
import { isTaskStatus } from "../../tasks/task-status.js";
import type { TaskPriority } from "../../tasks/task-priority.js";
import { ContactPeekCard } from "../contacts/contact-peek-card.js";
import { OrganizationPeekCard } from "../organizations/organization-peek-card.js";
import { DocumentIcon } from "../documents/document-icon.js";
import { EmailMentionBlockChip } from "../email/email-mention-block-chip.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { LetterMentionHoverDetails } from "../documents/document-mention-hover-card.js";
import { LetterIcon } from "../letters/letter-icon.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import { ProjectStatusIcon } from "../projects/project-status-icon.js";
import {
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
} from "../../tasks/task-due-date.js";
import {
  TaskMentionBlockChip,
  type TaskMentionBlockChipTask,
} from "../tasks/task-mention-block-chip.js";
import { TaskDueDateIcon } from "../tasks/task-due-date-icon.js";
import { ChatLetterPdfPreview } from "./chat-attachments-card.js";
import { ChatEntityBlockChip } from "./chat-entity-block-chip.js";
import {
  ChatCardGoLink,
  ChatCardInvalid,
  ChatCardProp,
  ChatExpandableCard,
} from "./chat-expandable-card.js";
import {
  ChatEstimateCard,
  ChatHabitCard,
  ChatInvoiceCard,
  ChatJournalCard,
  ChatMeetingCard,
  ChatMessageCard,
  ChatPostCard,
  ChatTransactionCard,
} from "./chat-extra-entity-cards.js";

export type ChatCardRendererProps = {
  part: ChatUiCardPart;
};

export type ChatCardRenderer = (props: ChatCardRendererProps) => ReactNode;

export type ChatCardRegistry = Readonly<Record<string, ChatCardRenderer>>;

const ChatCardRegistryContext = createContext<ChatCardRegistry>({});

export function ChatCardRegistryProvider({
  registry,
  children,
}: {
  registry: ChatCardRegistry;
  children: ReactNode;
}) {
  return (
    <ChatCardRegistryContext.Provider value={registry}>
      {children}
    </ChatCardRegistryContext.Provider>
  );
}

export function useChatCardRegistry(): ChatCardRegistry {
  return useContext(ChatCardRegistryContext);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function asStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function asPriority(value: unknown): number | undefined {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 4
  ) {
    return value;
  }
  return undefined;
}

function asDueDate(
  value: unknown,
): number | string | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  return undefined;
}

function parseDueMs(dueRaw: number | string | null | undefined): number | null {
  if (typeof dueRaw === "number" && Number.isFinite(dueRaw)) return dueRaw;
  if (typeof dueRaw === "string") {
    const ms = Date.parse(dueRaw);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function formatList(values: readonly string[] | undefined, empty: string): string {
  const cleaned = (values ?? []).map((value) => value.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(", ") : empty;
}

function formatUpdatedAtLabel(updatedAt: number | string | undefined): string | null {
  if (updatedAt == null) return null;
  const date =
    typeof updatedAt === "number" ? new Date(updatedAt) : new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

/* ── parsers ───────────────────────────────────────────────────────── */

function asTaskCardData(data: ChatUiCardPart["data"]): ChatUiTaskCardData | null {
  if (!data || typeof data !== "object") return null;
  const taskId = data.taskId;
  if (typeof taskId !== "string" || !taskId) return null;
  return {
    taskId,
    displayId: asOptionalString(data.displayId),
    title: asOptionalString(data.title),
    href: asOptionalString(data.href),
    status: asOptionalString(data.status),
    description: asNullableString(data.description),
    priority: asPriority(data.priority),
    dueDate: asDueDate(data.dueDate),
    projectName: asNullableString(data.projectName),
    projectIcon: asNullableString(data.projectIcon),
    assigneeName: asNullableString(data.assigneeName),
    related: asStringList(data.related),
    labels: asStringList(data.labels),
  };
}

function asContactCardData(
  data: ChatUiCardPart["data"],
): ChatUiContactCardData | null {
  if (!data || typeof data !== "object") return null;
  const contactId = data.contactId;
  if (typeof contactId !== "string" || !contactId) return null;
  return {
    contactId,
    href: asOptionalString(data.href),
    name: asOptionalString(data.name),
    firstName: asNullableString(data.firstName),
    lastName: asNullableString(data.lastName),
    title: asNullableString(data.title),
    email: asNullableString(data.email),
    phone: asNullableString(data.phone),
    organizationName: asNullableString(data.organizationName),
    organizationAvatarSrc: asNullableString(data.organizationAvatarSrc),
    avatarSrc: asNullableString(data.avatarSrc),
    summary: asNullableString(data.summary),
    address: asNullableString(data.address),
    city: asNullableString(data.city),
    postalCode: asNullableString(data.postalCode),
    region: asNullableString(data.region),
    country: asNullableString(data.country),
    displayId: asNullableString(data.displayId),
  };
}

function asDocumentCardData(
  data: ChatUiCardPart["data"],
): ChatUiDocumentCardData | null {
  if (!data || typeof data !== "object") return null;
  const documentId = data.documentId;
  if (typeof documentId !== "string" || !documentId) return null;
  return {
    documentId,
    href: asOptionalString(data.href),
    title: asOptionalString(data.title),
    relativePath: asOptionalString(data.relativePath),
    projectKey: asOptionalString(data.projectKey),
    projectName: asNullableString(data.projectName),
    icon: asNullableString(data.icon),
    updatedAt:
      typeof data.updatedAt === "number" || typeof data.updatedAt === "string"
        ? data.updatedAt
        : undefined,
  };
}

function asProjectCardData(
  data: ChatUiCardPart["data"],
): ChatUiProjectCardData | null {
  if (!data || typeof data !== "object") return null;
  const projectId = data.projectId;
  if (typeof projectId !== "string" || !projectId) return null;
  return {
    projectId,
    href: asOptionalString(data.href),
    key: asOptionalString(data.key),
    name: asOptionalString(data.name),
    summary: asNullableString(data.summary),
    status: asOptionalString(data.status),
    area: asNullableString(data.area),
    icon: asNullableString(data.icon),
    type: asNullableString(data.type),
  };
}

function asOrganizationCardData(
  data: ChatUiCardPart["data"],
): ChatUiOrganizationCardData | null {
  if (!data || typeof data !== "object") return null;
  const organizationId = data.organizationId;
  if (typeof organizationId !== "string" || !organizationId) return null;
  return {
    organizationId,
    href: asOptionalString(data.href),
    key: asOptionalString(data.key),
    name: asOptionalString(data.name),
    email: asNullableString(data.email),
    summary: asNullableString(data.summary),
    avatarSrc: asNullableString(data.avatarSrc),
    displayId: asNullableString(data.displayId),
  };
}

function asEmailCardData(data: ChatUiCardPart["data"]): ChatUiEmailCardData | null {
  if (!data || typeof data !== "object") return null;
  const emailId = data.emailId;
  if (typeof emailId !== "string" || !emailId) return null;
  return {
    emailId,
    href: asOptionalString(data.href),
    displayId: asOptionalString(data.displayId),
    title: asOptionalString(data.title),
    status: asOptionalString(data.status),
    priority: asPriority(data.priority),
    dueDate: asDueDate(data.dueDate),
    receivedAt: asDueDate(data.receivedAt),
    from: asNullableString(data.from),
    projectName: asNullableString(data.projectName),
    contactName: asNullableString(data.contactName),
    snippet: asNullableString(data.snippet),
  };
}

function asLetterCardData(
  data: ChatUiCardPart["data"],
): ChatUiLetterCardData | null {
  if (!data || typeof data !== "object") return null;
  const letterId = data.letterId;
  if (typeof letterId !== "string" || !letterId) return null;
  return {
    letterId,
    href: asOptionalString(data.href),
    displayId: asOptionalString(data.displayId),
    title: asOptionalString(data.title),
    status: asOptionalString(data.status),
    dueDate: asDueDate(data.dueDate),
    projectName: asNullableString(data.projectName),
    description: asNullableString(data.description),
  };
}

function toMentionBlockTask(data: ChatUiTaskCardData): TaskMentionBlockChipTask {
  const priority = (data.priority ?? 0) as TaskPriority;
  const status = data.status && isTaskStatus(data.status) ? data.status : "triage";
  return {
    displayId: data.displayId?.trim() || data.taskId,
    title: data.title?.trim() || data.displayId?.trim() || data.taskId,
    status,
    priority,
    dueDate: parseDueMs(data.dueDate),
    projectName: data.projectName ?? null,
    projectIcon: data.projectIcon ?? null,
  };
}

/* ── cards ──────────────────────────────────────────────────────────── */

export function ChatTaskCard({ part }: ChatCardRendererProps) {
  const data = asTaskCardData(part.data);
  if (!data) return <ChatCardInvalid label="task" />;
  const href = data.href ?? `/tasks/${encodeURIComponent(data.taskId)}`;
  const description = data.description?.trim() || null;
  return (
    <ChatExpandableCard
      cardClassName="chat-ui-card--task"
      summary={
        <TaskMentionBlockChip
          task={toMentionBlockTask(data)}
          titleAttr={data.displayId ?? data.title ?? data.taskId}
        />
      }
    >
      <div className="chat-ui-card--entity__details">
        {description ? (
          <p className="chat-ui-card--entity__description">{description}</p>
        ) : (
          <p className="chat-ui-card--entity__description is-empty">
            No description
          </p>
        )}
        <div className="chat-ui-card--entity__footer">
          <dl className="chat-ui-card--entity__props">
            <ChatCardProp
              label="Assignee"
              value={data.assigneeName?.trim() || "Unassigned"}
              muted={!data.assigneeName?.trim()}
            />
            <ChatCardProp
              label="Related"
              value={formatList(data.related, "No related")}
              muted={(data.related?.length ?? 0) === 0}
            />
            <ChatCardProp
              label="Labels"
              value={formatList(data.labels, "No labels")}
              muted={(data.labels?.length ?? 0) === 0}
            />
          </dl>
          <ChatCardGoLink href={href}>Go to task</ChatCardGoLink>
        </div>
      </div>
    </ChatExpandableCard>
  );
}

function ChatContactCard({ part }: ChatCardRendererProps) {
  const data = asContactCardData(part.data);
  if (!data) return <ChatCardInvalid label="contact" />;
  const name =
    data.name?.trim() ||
    [data.firstName, data.lastName].filter(Boolean).join(" ").trim() ||
    data.displayId?.trim() ||
    data.contactId;
  const href = data.href ?? `/contacts/${encodeURIComponent(data.contactId)}`;
  const meta = [data.title?.trim(), data.organizationName?.trim()]
    .filter(Boolean)
    .join(" · ");
  return (
    <ChatExpandableCard
      cardClassName="chat-ui-card--contact"
      summary={
        <ChatEntityBlockChip
          kindClassName="mention-chip-lite--contact"
          icon={
            <EntityAvatarIcon
              src={data.avatarSrc}
              size={14}
              kind="contact"
            />
          }
          id={data.displayId}
          title={name}
          titleAttr={name}
          trailing={
            meta ? (
              <span className="mention-chip-lite__project">{meta}</span>
            ) : null
          }
        />
      }
    >
      <ContactPeekCard
        className="chat-ui-card--entity__contact-peek"
        contact={{
          id: data.contactId,
          name,
          firstName: data.firstName,
          lastName: data.lastName,
          title: data.title,
          organizationName: data.organizationName,
          organizationAvatarSrc: data.organizationAvatarSrc,
          avatarSrc: data.avatarSrc,
          email: data.email,
          phone: data.phone,
          address: data.address,
          city: data.city,
          postalCode: data.postalCode,
          region: data.region,
          country: data.country,
        }}
        viewProfile={{ href }}
      />
    </ChatExpandableCard>
  );
}

function ChatDocumentCard({ part }: ChatCardRendererProps) {
  const data = asDocumentCardData(part.data);
  if (!data) return <ChatCardInvalid label="document" />;
  const title = data.title?.trim() || data.relativePath?.trim() || data.documentId;
  const path =
    data.projectKey && data.relativePath
      ? `${data.projectKey}/${data.relativePath}`
      : data.relativePath?.trim() || null;
  const href =
    data.href ??
    (data.projectKey && data.relativePath
      ? `/documents/${encodeURIComponent(data.projectKey)}/${data.relativePath
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`
      : `/documents/${encodeURIComponent(data.documentId)}`);
  const updated = formatUpdatedAtLabel(data.updatedAt);
  return (
    <ChatExpandableCard
      cardClassName="chat-ui-card--document"
      summary={
        <ChatEntityBlockChip
          kindClassName="mention-chip-lite--document"
          icon={<DocumentIcon size={14} />}
          title={title}
          titleAttr={title}
          trailing={
            data.projectName ? (
              <span className="mention-chip-lite__project">
                {data.projectName}
              </span>
            ) : null
          }
        />
      }
    >
      <div className="chat-ui-card--entity__details">
        {path ? (
          <p className="chat-ui-card--entity__description chat-ui-card--entity__description--mono">
            {path}
          </p>
        ) : (
          <p className="chat-ui-card--entity__description is-empty">No path</p>
        )}
        <div className="chat-ui-card--entity__footer">
          <dl className="chat-ui-card--entity__props">
            <ChatCardProp
              label="Project"
              value={data.projectName?.trim() || data.projectKey || "—"}
              muted={!data.projectName?.trim() && !data.projectKey}
            />
            <ChatCardProp
              label="Updated"
              value={updated ?? "Unknown"}
              muted={!updated}
            />
          </dl>
          <ChatCardGoLink href={href}>Go to document</ChatCardGoLink>
        </div>
      </div>
    </ChatExpandableCard>
  );
}

function ChatProjectCard({ part }: ChatCardRendererProps) {
  const data = asProjectCardData(part.data);
  if (!data) return <ChatCardInvalid label="project" />;
  const key = data.key?.trim() || data.projectId;
  const name = data.name?.trim() || key;
  const href = data.href ?? `/projects/${encodeURIComponent(key)}`;
  const status = data.status && isProjectStatus(data.status) ? data.status : "backlog";
  const areaLabel =
    data.area && isDefinedProjectArea(data.area)
      ? PROJECT_AREA_LABELS[data.area]
      : null;
  const summary = data.summary?.trim() || null;
  return (
    <ChatExpandableCard
      cardClassName="chat-ui-card--project"
      summary={
        <ChatEntityBlockChip
          kindClassName="mention-chip-lite--project"
          icon={<ProjectOcticon icon={data.icon} size={14} />}
          id={key}
          title={name}
          titleAttr={name}
          trailing={
            <>
              <ProjectStatusIcon status={status} size={14} />
              {areaLabel ? (
                <span className="mention-chip-lite__area">{areaLabel}</span>
              ) : null}
            </>
          }
        />
      }
    >
      <div className="chat-ui-card--entity__details">
        {summary ? (
          <p className="chat-ui-card--entity__description">{summary}</p>
        ) : (
          <p className="chat-ui-card--entity__description is-empty">No summary</p>
        )}
        <div className="chat-ui-card--entity__footer">
          <dl className="chat-ui-card--entity__props">
            <ChatCardProp label="Status" value={getProjectStatusLabel(status)} />
            <ChatCardProp
              label="Area"
              value={areaLabel ?? "—"}
              muted={!areaLabel}
            />
          </dl>
          <ChatCardGoLink href={href}>Go to project</ChatCardGoLink>
        </div>
      </div>
    </ChatExpandableCard>
  );
}

function ChatOrganizationCard({ part }: ChatCardRendererProps) {
  const data = asOrganizationCardData(part.data);
  if (!data) return <ChatCardInvalid label="organization" />;
  const name = data.name?.trim() || data.key?.trim() || data.organizationId;
  const key = data.key?.trim() || data.displayId?.trim() || null;
  const href =
    data.href ?? `/organizations/${encodeURIComponent(data.organizationId)}`;
  return (
    <ChatExpandableCard
      cardClassName="chat-ui-card--organization"
      summary={
        <ChatEntityBlockChip
          kindClassName="mention-chip-lite--organization"
          icon={
            data.avatarSrc ? (
              <EntityAvatarIcon
                src={data.avatarSrc}
                size={14}
                kind="organization"
              />
            ) : (
              <OrganizationIcon size={14} />
            )
          }
          id={key}
          title={name}
          titleAttr={name}
        />
      }
    >
      <OrganizationPeekCard
        className="chat-ui-card--entity__contact-peek"
        organization={{
          id: data.organizationId,
          name,
          key,
          email: data.email,
          summary: data.summary,
          avatarSrc: data.avatarSrc,
        }}
        viewProfile={{ href }}
      />
    </ChatExpandableCard>
  );
}

function ChatEmailCard({ part }: ChatCardRendererProps) {
  const data = asEmailCardData(part.data);
  if (!data) return <ChatCardInvalid label="email" />;
  const displayId = data.displayId?.trim() || data.emailId;
  const title = data.title?.trim() || "Email";
  const href = data.href ?? `/email/${encodeURIComponent(data.emailId)}`;
  const status = data.status && isTaskStatus(data.status) ? data.status : "triage";
  const snippet = data.snippet?.trim() || null;
  return (
    <ChatExpandableCard
      cardClassName="chat-ui-card--email"
      summary={
        <EmailMentionBlockChip
          email={{
            displayId,
            title,
            status,
            priority: (data.priority ?? 0) as TaskPriority,
            dueDate: parseDueMs(data.dueDate),
            receivedAt: parseDueMs(data.receivedAt),
            from: data.from ?? null,
            projectName: data.projectName ?? null,
            contactName: data.contactName ?? null,
          }}
          titleAttr={title}
        />
      }
    >
      <div className="chat-ui-card--entity__details">
        {snippet ? (
          <p className="chat-ui-card--entity__description">{snippet}</p>
        ) : (
          <p className="chat-ui-card--entity__description is-empty">No snippet</p>
        )}
        <div className="chat-ui-card--entity__footer">
          <dl className="chat-ui-card--entity__props">
            <ChatCardProp
              label="Contact"
              value={data.contactName?.trim() || "—"}
              muted={!data.contactName?.trim()}
            />
            <ChatCardProp
              label="Project"
              value={data.projectName?.trim() || "—"}
              muted={!data.projectName?.trim()}
            />
          </dl>
          <ChatCardGoLink href={href}>Go to email</ChatCardGoLink>
        </div>
      </div>
    </ChatExpandableCard>
  );
}

function ChatLetterCard({ part }: ChatCardRendererProps) {
  const data = asLetterCardData(part.data);
  if (!data) return <ChatCardInvalid label="letter" />;
  const displayId = data.displayId?.trim() || data.letterId;
  const title = data.title?.trim() || displayId;
  const href = data.href ?? `/letters/${encodeURIComponent(data.letterId)}`;
  const status =
    data.status && isTaskStatus(data.status) ? data.status : "triage";
  const dueMs = parseDueMs(data.dueDate);
  const dueDateLabel =
    dueMs != null ? formatTaskDueMetaLabel(dueMs) : null;
  const pdfFilename = `${title.replace(/[\\/:*?"<>|]+/g, " ").trim() || displayId}.pdf`;
  return (
    <ChatExpandableCard
      cardClassName="chat-ui-card--letter"
      summary={
        <span
          className="mention-chip-lite mention-chip-lite--letter mention-chip-lite--block"
          title={displayId}
        >
          <span className="mention-chip-lite__icon" aria-hidden="true">
            <LetterIcon size={14} />
          </span>
          <span className="mention-chip-lite__id">{displayId}</span>
          <span className="mention-chip-lite__label mention-chip-lite__label--grow">
            {title}
          </span>
          {dueDateLabel ? (
            <span className="mention-chip-lite__due">
              <TaskDueDateIcon
                active
                urgency={getTaskDueDateUrgency(dueMs, new Date(), {
                  status,
                })}
                size={12}
              />
              <span>{dueDateLabel}</span>
            </span>
          ) : null}
          {data.projectName ? (
            <span className="mention-chip-lite__project">
              <span>{data.projectName}</span>
            </span>
          ) : null}
        </span>
      }
    >
      {({ open }) => (
        <div className="chat-ui-card--entity__details">
          <ChatLetterPdfPreview
            letterId={data.letterId}
            filename={pdfFilename}
            enabled={open}
          />
          <LetterMentionHoverDetails
            letter={{
              id: data.letterId,
              displayId,
              title,
              status,
              dueDate: dueMs,
              projectId: null,
              projectKey: null,
              projectName: data.projectName ?? null,
            }}
          />
          <div className="chat-ui-card--entity__footer">
            <ChatCardGoLink href={href}>Go to letter</ChatCardGoLink>
          </div>
        </div>
      )}
    </ChatExpandableCard>
  );
}

/** Fallback when a mention kind has no dedicated card renderer yet. */
function ChatGenericCard({ part }: ChatCardRendererProps) {
  const data = part.data;
  if (!data || typeof data !== "object") return <ChatCardInvalid label="generic" />;
  const record = data as Record<string, unknown>;
  const title =
    (typeof record.title === "string" && record.title.trim()) ||
    (typeof record.ref === "string" && record.ref.trim()) ||
    part.cardType;
  const kind =
    (typeof record.kind === "string" && record.kind.trim()) || "mention";
  const status =
    (typeof record.status === "string" && record.status.trim()) || null;
  const href = typeof record.href === "string" ? record.href : undefined;
  return (
    <ChatExpandableCard
      cardClassName="chat-ui-card--generic"
      summary={
        <ChatEntityBlockChip
          kindClassName="mention-chip-lite--generic"
          icon={<DocumentIcon size={14} />}
          id={kind}
          title={title}
          titleAttr={title}
          trailing={
            status ? (
              <span className="mention-chip-lite__status">{status}</span>
            ) : null
          }
        />
      }
    >
      <div className="chat-ui-card--entity__details">
        <div className="chat-ui-card--entity__footer">
          <dl className="chat-ui-card--entity__props">
            <ChatCardProp label="Kind" value={kind} />
            <ChatCardProp
              label="Status"
              value={status ?? "—"}
              muted={!status}
            />
          </dl>
          {href ? <ChatCardGoLink href={href}>Open</ChatCardGoLink> : null}
        </div>
      </div>
    </ChatExpandableCard>
  );
}

export const DEFAULT_CHAT_CARD_REGISTRY: ChatCardRegistry = {
  task: ChatTaskCard,
  contact: ChatContactCard,
  document: ChatDocumentCard,
  project: ChatProjectCard,
  organization: ChatOrganizationCard,
  email: ChatEmailCard,
  letter: ChatLetterCard,
  meeting: ChatMeetingCard,
  journal: ChatJournalCard,
  habit: ChatHabitCard,
  message: ChatMessageCard,
  post: ChatPostCard,
  transaction: ChatTransactionCard,
  invoice: ChatInvoiceCard,
  estimate: ChatEstimateCard,
  generic: ChatGenericCard,
};

export function mergeChatCardRegistry(
  overrides?: ChatCardRegistry | null,
): ChatCardRegistry {
  if (!overrides) return DEFAULT_CHAT_CARD_REGISTRY;
  return { ...DEFAULT_CHAT_CARD_REGISTRY, ...overrides };
}

export function ChatCardPartView({ part }: { part: ChatUiCardPart }) {
  const registry = useChatCardRegistry();
  const Renderer = registry[part.cardType];
  if (!Renderer) {
    return (
      <div className="chat-ui-card chat-ui-card--unknown">
        Unknown card: {part.cardType}
      </div>
    );
  }
  return <Renderer part={part} />;
}

"use client";

import { TrashIcon } from "@primer/octicons-react";

import { getDeletedMentionDisplay } from "../../mentions/deleted-mention-display.js";
import {
  resolveMentionCatalogContact,
  resolveMentionCatalogDocument,
  resolveMentionCatalogEmail,
  resolveMentionCatalogEstimate,
  resolveMentionCatalogHabit,
  resolveMentionCatalogInvoice,
  resolveMentionCatalogJournal,
  resolveMentionCatalogLetter,
  resolveMentionCatalogMeeting,
  resolveMentionCatalogMessage,
  resolveMentionCatalogOrganization,
  resolveMentionCatalogPost,
  resolveMentionCatalogProject,
  resolveMentionCatalogTask,
  resolveMentionCatalogTransaction,
} from "../../mentions/resolve-catalog-entry.js";
import type {
  MentionCatalog,
  MentionCatalogContact,
  MentionCatalogDocument,
  MentionCatalogEmail,
  MentionCatalogEstimate,
  MentionCatalogHabit,
  MentionCatalogInvoice,
  MentionCatalogJournal,
  MentionCatalogLetter,
  MentionCatalogMeeting,
  MentionCatalogMessage,
  MentionCatalogOrganization,
  MentionCatalogPost,
  MentionCatalogProject,
  MentionCatalogTask,
  MentionCatalogTransaction,
} from "../../mentions/mention-menu-types.js";
import {
  chatChannelKindLabel,
  resolveChatChannelKind,
} from "../../communication/chat-channel-kind.js";
import { MentionMessageChannelIcon } from "../communication/communication-kind-icons.js";
import { formatMeetingWhenBadge } from "../meetings/meeting-mention-block-chip.js";
import { ArrowSwitchIcon } from "@primer/octicons-react";
import { FlameIcon } from "../icons/flame-icon.js";
import { JournalIcon } from "../icons/journal-icon.js";
import { LemoDesignMarkIcon } from "../icons/lemo-design-mark-icon.js";
import { LinkedInIcon } from "../icons/linkedin-icon.js";
import { MoneybirdIcon } from "../icons/moneybird-icon.js";
import type { ParsedMentionToken } from "../../mentions/mention-tokens.js";
import { formatTaskDueMetaLabel } from "../../tasks/task-due-date.js";
import { getTaskPriorityLabel } from "../../tasks/task-priority.js";
import { getTaskStatusLabel } from "../../tasks/task-status.js";
import { getProjectStatusLabel } from "../../projects/project-status.js";
import { getContactsHref } from "../../navigation/entity-routes.js";
import { ContactPeekCard } from "../contacts/contact-peek-card.js";
import { DocumentIcon } from "./document-icon.js";
import { LetterIcon } from "../letters/letter-icon.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { useHoverCardClose } from "../shared/hover-card.js";
import { EmailNavIcon } from "../shell/sidebar-nav-icons.js";
import { TaskPriorityIcon } from "../tasks/task-priority-icon.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";
import {
  MentionHoverCardSeparator,
  MentionHoverDescription,
  MentionHoverFooterRow,
  MentionHoverHeader,
  MentionHoverInline,
  MentionHoverMetaRow,
  MentionHoverPanel,
  MentionHoverSection,
  MentionHoverStatusRow,
  MentionHoverTitle,
} from "../mentions/mention-hover-card-ui.js";

export type DocumentMentionHoverCardProps = {
  parsed: ParsedMentionToken;
  catalog: MentionCatalog;
};

function formatUpdatedAtLabel(updatedAt: number): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

const MENTION_KIND_LABELS: Record<ParsedMentionToken["kind"], string> = {
  task: "Task",
  letter: "Letter",
  email: "E-mail",
  project: "Project",
  contact: "Contact",
  organization: "Organization",
  document: "Document",
  meeting: "Meeting",
  journal: "Journal entry",
  habit: "Habit",
  message: "Message",
  post: "Post",
  transaction: "Transaction",
  invoice: "Invoice",
  estimate: "Estimate",
};

function MentionHoverDeletedPanel({ parsed }: { parsed: ParsedMentionToken }) {
  const display = getDeletedMentionDisplay(parsed);
  const kindLabel = MENTION_KIND_LABELS[parsed.kind];

  return (
    <MentionHoverPanel>
      <MentionHoverMetaRow>
        <TrashIcon
          size={14}
          className="mention-hover-card__icon mention-hover-card__icon--muted"
        />
        <span className="mention-hover-card__muted-strong">
          Deleted {kindLabel.toLowerCase()}
        </span>
      </MentionHoverMetaRow>
      <MentionHoverTitle>{display.title}</MentionHoverTitle>
      {display.subtitle ? (
        <MentionHoverDescription clamp={2} mono>
          {display.subtitle}
        </MentionHoverDescription>
      ) : display.identifier && display.identifier !== display.title ? (
        <MentionHoverDescription clamp={2} mono>
          {display.identifier}
        </MentionHoverDescription>
      ) : null}
      <MentionHoverFooterRow>
        <span>
          This {kindLabel.toLowerCase()} is no longer in your workspace.
        </span>
      </MentionHoverFooterRow>
    </MentionHoverPanel>
  );
}

export function TaskMentionHoverDetails({
  task,
}: {
  task: MentionCatalogTask;
}) {
  const dueLabel = formatTaskDueMetaLabel(task.dueDate);
  const priorityLabel = getTaskPriorityLabel(task.priority);
  const statusLabel = getTaskStatusLabel(task.status);

  return (
    <MentionHoverPanel>
      <MentionHoverMetaRow>
        <span className="mention-hover-card__id">{task.displayId}</span>
        {task.projectName ? (
          <>
            <span className="mention-hover-card__dot" aria-hidden="true">
              ·
            </span>
            <span className="mention-hover-card__truncate">
              {task.projectName}
            </span>
          </>
        ) : null}
      </MentionHoverMetaRow>
      <MentionHoverTitle>{task.title}</MentionHoverTitle>
      {task.description ? (
        <MentionHoverDescription>{task.description}</MentionHoverDescription>
      ) : null}
      <MentionHoverStatusRow>
        <TaskStatusIcon
          status={task.status}
          className="mention-hover-card__icon"
        />
        <span>{statusLabel}</span>
      </MentionHoverStatusRow>
      <MentionHoverFooterRow>
        <MentionHoverInline>
          <TaskPriorityIcon priority={task.priority} size={14} />
          <span>{priorityLabel}</span>
        </MentionHoverInline>
        <span>{dueLabel ? `Due ${dueLabel}` : "No due date"}</span>
      </MentionHoverFooterRow>
    </MentionHoverPanel>
  );
}

function LetterMentionHoverDetails({ letter }: { letter: MentionCatalogLetter }) {
  const dueLabel = formatTaskDueMetaLabel(letter.dueDate);
  const statusLabel = getTaskStatusLabel(letter.status);

  return (
    <MentionHoverPanel>
      <MentionHoverMetaRow>
        <LetterIcon
          size={14}
          className="mention-hover-card__icon mention-hover-card__icon--muted"
        />
        <span className="mention-hover-card__id">{letter.displayId}</span>
        {letter.projectName ? (
          <>
            <span className="mention-hover-card__dot" aria-hidden="true">
              ·
            </span>
            <span className="mention-hover-card__truncate">
              {letter.projectName}
            </span>
          </>
        ) : null}
      </MentionHoverMetaRow>
      <MentionHoverTitle>{letter.title}</MentionHoverTitle>
      <MentionHoverStatusRow>
        <TaskStatusIcon
          status={letter.status}
          className="mention-hover-card__icon"
        />
        <span>{statusLabel}</span>
      </MentionHoverStatusRow>
      <MentionHoverFooterRow>
        <span>{dueLabel ? `Due ${dueLabel}` : "No due date"}</span>
      </MentionHoverFooterRow>
    </MentionHoverPanel>
  );
}

function EmailMentionHoverDetails({ email }: { email: MentionCatalogEmail }) {
  const dueLabel = formatTaskDueMetaLabel(email.dueDate);
  const priorityLabel = getTaskPriorityLabel(email.priority);
  const statusLabel = getTaskStatusLabel(email.status);

  return (
    <MentionHoverPanel>
      <MentionHoverMetaRow>
        <EmailNavIcon
          size={14}
          className="mention-hover-card__icon mention-hover-card__icon--muted"
        />
        <span className="mention-hover-card__id">{email.displayId}</span>
        {email.projectName ? (
          <>
            <span className="mention-hover-card__dot" aria-hidden="true">
              ·
            </span>
            <span className="mention-hover-card__truncate">
              {email.projectName}
            </span>
          </>
        ) : email.contactName ? (
          <>
            <span className="mention-hover-card__dot" aria-hidden="true">
              ·
            </span>
            <span className="mention-hover-card__truncate">
              {email.contactName}
            </span>
          </>
        ) : null}
      </MentionHoverMetaRow>
      <MentionHoverTitle>{email.title}</MentionHoverTitle>
      <MentionHoverStatusRow>
        <TaskStatusIcon
          status={email.status}
          className="mention-hover-card__icon"
        />
        <span>{statusLabel}</span>
      </MentionHoverStatusRow>
      <MentionHoverFooterRow>
        <MentionHoverInline>
          <TaskPriorityIcon priority={email.priority} size={14} />
          <span>{priorityLabel}</span>
        </MentionHoverInline>
        <span>{dueLabel ? `Due ${dueLabel}` : "No due date"}</span>
      </MentionHoverFooterRow>
    </MentionHoverPanel>
  );
}

function ProjectMentionHoverDetails({
  project,
}: {
  project: MentionCatalogProject;
}) {
  return (
    <MentionHoverPanel variant="structured">
      <MentionHoverHeader
        icon={
          <ProjectOcticon
            icon={project.icon}
            className="mention-hover-card__icon mention-hover-card__icon--header"
          />
        }
        title={project.name}
      />
      <MentionHoverCardSeparator />
      {project.summary ? (
        <>
          <MentionHoverSection>
            <MentionHoverDescription>{project.summary}</MentionHoverDescription>
          </MentionHoverSection>
          <MentionHoverCardSeparator />
        </>
      ) : null}
      <MentionHoverSection>
        <MentionHoverFooterRow>
          <span>{getProjectStatusLabel(project.status)}</span>
          <span className="mention-hover-card__id">{project.key}</span>
        </MentionHoverFooterRow>
      </MentionHoverSection>
    </MentionHoverPanel>
  );
}

function DocumentMentionHoverDetails({
  document,
}: {
  document: MentionCatalogDocument;
}) {
  return (
    <MentionHoverPanel>
      <MentionHoverMetaRow>
        <DocumentIcon
          size={14}
          className="mention-hover-card__icon mention-hover-card__icon--muted"
        />
        <span className="mention-hover-card__truncate">
          {document.projectName}
        </span>
      </MentionHoverMetaRow>
      <MentionHoverTitle>{document.title}</MentionHoverTitle>
      <MentionHoverDescription clamp={2} mono>
        {document.projectKey}/{document.relativePath}
      </MentionHoverDescription>
      <MentionHoverFooterRow>
        <span>Updated {formatUpdatedAtLabel(document.updatedAt)}</span>
      </MentionHoverFooterRow>
    </MentionHoverPanel>
  );
}

function ContactMentionHoverDetails({
  contact,
}: {
  contact: MentionCatalogContact;
}) {
  const closeHoverCard = useHoverCardClose();
  // Prefer number, then id — never bare key (keys can collide across contacts).
  const profileHref = getContactsHref(
    contact.number != null ? String(contact.number) : contact.id,
  );

  return (
    <MentionHoverPanel variant="structured">
      <ContactPeekCard
        className="mention-hover-card__contact-peek"
        contact={{
          id: contact.id,
          name: contact.name,
          firstName: contact.firstName,
          lastName: contact.lastName,
          title: contact.title,
          organizationName: contact.organizationName,
          organizationAvatarSrc: contact.organizationAvatarSrc,
          avatarSrc: contact.avatarSrc,
          email: contact.email,
          emails: contact.emails,
          phone: contact.phone,
          phones: contact.phones,
          address: contact.address,
          city: contact.city,
          postalCode: contact.postalCode,
          region: contact.region,
          country: contact.country,
          socialAccounts: contact.socialAccounts,
        }}
        viewProfile={{
          href: profileHref,
          onClick: () => closeHoverCard?.(),
        }}
      />
    </MentionHoverPanel>
  );
}

function OrganizationMentionHoverDetails({
  organization,
}: {
  organization: MentionCatalogOrganization;
}) {
  return (
    <MentionHoverPanel variant="structured">
      <MentionHoverHeader
        icon={
          <OrganizationIcon
            size={16}
            className="mention-hover-card__icon mention-hover-card__icon--header"
          />
        }
        title={organization.name}
      />
      <MentionHoverCardSeparator />
      {organization.summary ? (
        <>
          <MentionHoverSection>
            <MentionHoverDescription>
              {organization.summary}
            </MentionHoverDescription>
          </MentionHoverSection>
          <MentionHoverCardSeparator />
        </>
      ) : null}
      <MentionHoverSection>
        <MentionHoverFooterRow>
          <span className="mention-hover-card__truncate">
            {organization.email ?? "Organization"}
          </span>
          <span className="mention-hover-card__id">{organization.key}</span>
        </MentionHoverFooterRow>
      </MentionHoverSection>
    </MentionHoverPanel>
  );
}

function MeetingMentionHoverDetails({
  meeting,
}: {
  meeting: MentionCatalogMeeting;
}) {
  const whenLabel = formatMeetingWhenBadge(meeting.startAt, meeting.endAt);
  return (
    <MentionHoverPanel>
      <MentionHoverMetaRow>
        <span className="mention-hover-card__id">
          {whenLabel ?? "Meeting"}
        </span>
        {meeting.projectName ? (
          <>
            <span className="mention-hover-card__dot" aria-hidden="true">
              ·
            </span>
            <span className="mention-hover-card__truncate">
              {meeting.projectName}
            </span>
          </>
        ) : null}
      </MentionHoverMetaRow>
      <MentionHoverTitle>{meeting.title}</MentionHoverTitle>
      {meeting.summary ? (
        <MentionHoverDescription>{meeting.summary}</MentionHoverDescription>
      ) : null}
      <MentionHoverFooterRow>
        <span>{meeting.status ?? "Meeting"}</span>
      </MentionHoverFooterRow>
    </MentionHoverPanel>
  );
}

function JournalMentionHoverDetails({
  journal,
}: {
  journal: MentionCatalogJournal;
}) {
  return (
    <MentionHoverPanel>
      <MentionHoverMetaRow>
        <JournalIcon
          size={14}
          className="mention-hover-card__icon mention-hover-card__icon--muted"
        />
        <span className="mention-hover-card__id">Journal</span>
      </MentionHoverMetaRow>
      <MentionHoverTitle>{journal.date}</MentionHoverTitle>
      {journal.snippet ? (
        <MentionHoverDescription>{journal.snippet}</MentionHoverDescription>
      ) : null}
      <MentionHoverFooterRow>
        <span>
          {journal.updatedAt != null
            ? `Updated ${formatUpdatedAtLabel(journal.updatedAt)}`
            : "Journal entry"}
        </span>
      </MentionHoverFooterRow>
    </MentionHoverPanel>
  );
}

function HabitMentionHoverDetails({ habit }: { habit: MentionCatalogHabit }) {
  return (
    <MentionHoverPanel>
      <MentionHoverMetaRow>
        <FlameIcon
          size={14}
          className="mention-hover-card__icon mention-hover-card__icon--muted"
        />
        <span className="mention-hover-card__truncate">Habit</span>
      </MentionHoverMetaRow>
      <MentionHoverTitle>{habit.title}</MentionHoverTitle>
      <MentionHoverFooterRow>
        <span>{habit.date ?? habit.cadence ?? "Definition"}</span>
        <span>
          {habit.completed == null
            ? "—"
            : habit.completed
              ? "Completed"
              : "Open"}
        </span>
      </MentionHoverFooterRow>
    </MentionHoverPanel>
  );
}

function MessageMentionHoverDetails({
  message,
}: {
  message: MentionCatalogMessage;
}) {
  return (
    <MentionHoverPanel>
      <MentionHoverMetaRow>
        <MentionMessageChannelIcon
          channelType={message.channelType}
          contactName={message.contactName}
          size={14}
        />
        <span className="mention-hover-card__truncate">
          {chatChannelKindLabel(
            resolveChatChannelKind(message.channelType, {
              contactName: message.contactName,
            }),
          )}
        </span>
      </MentionHoverMetaRow>
      <MentionHoverTitle>{message.title}</MentionHoverTitle>
      {message.preview ? (
        <MentionHoverDescription>{message.preview}</MentionHoverDescription>
      ) : null}
      <MentionHoverFooterRow>
        <span>{message.contactName ?? "Conversation"}</span>
        <span>{message.status ?? "—"}</span>
      </MentionHoverFooterRow>
    </MentionHoverPanel>
  );
}

function PostMentionHoverDetails({ post }: { post: MentionCatalogPost }) {
  return (
    <MentionHoverPanel>
      <MentionHoverMetaRow>
        <LinkedInIcon
          size={14}
          className="mention-hover-card__icon mention-hover-card__icon--muted"
        />
        <span className="mention-hover-card__truncate">
          {post.platform ?? "Post"}
        </span>
      </MentionHoverMetaRow>
      <MentionHoverTitle>{post.title}</MentionHoverTitle>
      {post.body ? (
        <MentionHoverDescription>{post.body}</MentionHoverDescription>
      ) : null}
      <MentionHoverFooterRow>
        <span>{post.authorHandle ?? "—"}</span>
        <span>{post.status ?? "—"}</span>
      </MentionHoverFooterRow>
    </MentionHoverPanel>
  );
}

function TransactionMentionHoverDetails({
  transaction,
}: {
  transaction: MentionCatalogTransaction;
}) {
  const amount =
    transaction.amountCents != null
      ? `${(transaction.amountCents / 100).toFixed(2)} ${transaction.currency ?? ""}`.trim()
      : null;
  return (
    <MentionHoverPanel>
      <MentionHoverMetaRow>
        <ArrowSwitchIcon
          size={14}
          className="mention-hover-card__icon mention-hover-card__icon--muted"
        />
        <span className="mention-hover-card__truncate">
          {transaction.bookedOn ?? "Transaction"}
        </span>
      </MentionHoverMetaRow>
      <MentionHoverTitle>{transaction.title}</MentionHoverTitle>
      {transaction.notes ? (
        <MentionHoverDescription>{transaction.notes}</MentionHoverDescription>
      ) : null}
      <MentionHoverFooterRow>
        <span>{amount ?? "—"}</span>
        <span>{transaction.categoryName ?? transaction.accountName ?? "—"}</span>
      </MentionHoverFooterRow>
    </MentionHoverPanel>
  );
}

function InvoiceMentionHoverDetails({
  invoice,
}: {
  invoice: MentionCatalogInvoice;
}) {
  return (
    <MentionHoverPanel>
      <MentionHoverMetaRow>
        <MoneybirdIcon
          size={14}
          withTile={false}
          className="mention-hover-card__icon mention-hover-card__icon--muted"
        />
        <span className="mention-hover-card__truncate">
          {invoice.invoiceNumber ?? "Invoice"}
        </span>
      </MentionHoverMetaRow>
      <MentionHoverTitle>{invoice.title}</MentionHoverTitle>
      <MentionHoverFooterRow>
        <span>{invoice.amountLabel ?? "—"}</span>
        <span>{invoice.contactName ?? invoice.state ?? "—"}</span>
      </MentionHoverFooterRow>
    </MentionHoverPanel>
  );
}

function EstimateMentionHoverDetails({
  estimate,
}: {
  estimate: MentionCatalogEstimate;
}) {
  const amount =
    estimate.totalAmountCents != null
      ? `${(estimate.totalAmountCents / 100).toFixed(2)} ${estimate.currency ?? "EUR"}`.trim()
      : null;
  return (
    <MentionHoverPanel>
      <MentionHoverMetaRow>
        <LemoDesignMarkIcon
          size={14}
          className="mention-hover-card__icon mention-hover-card__icon--muted"
        />
        <span className="mention-hover-card__truncate">
          {estimate.displayId ?? "Estimate"}
        </span>
      </MentionHoverMetaRow>
      <MentionHoverTitle>{estimate.title}</MentionHoverTitle>
      <MentionHoverFooterRow>
        <span>{amount ?? "—"}</span>
        <span>{estimate.clientLabel ?? estimate.status ?? "—"}</span>
      </MentionHoverFooterRow>
    </MentionHoverPanel>
  );
}

export function DocumentMentionHoverCard({
  parsed,
  catalog,
}: DocumentMentionHoverCardProps) {
  switch (parsed.kind) {
    case "task": {
      const task = resolveMentionCatalogTask(parsed, catalog);
      if (!task) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <TaskMentionHoverDetails task={task} />;
    }
    case "letter": {
      const letter = resolveMentionCatalogLetter(parsed, catalog);
      if (!letter) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <LetterMentionHoverDetails letter={letter} />;
    }
    case "email": {
      const email = resolveMentionCatalogEmail(parsed, catalog);
      if (!email) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <EmailMentionHoverDetails email={email} />;
    }
    case "meeting": {
      const meeting = resolveMentionCatalogMeeting(parsed, catalog);
      if (!meeting) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <MeetingMentionHoverDetails meeting={meeting} />;
    }
    case "journal": {
      const journal = resolveMentionCatalogJournal(parsed, catalog);
      if (!journal) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <JournalMentionHoverDetails journal={journal} />;
    }
    case "habit": {
      const habit = resolveMentionCatalogHabit(parsed, catalog);
      if (!habit) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <HabitMentionHoverDetails habit={habit} />;
    }
    case "message": {
      const message = resolveMentionCatalogMessage(parsed, catalog);
      if (!message) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <MessageMentionHoverDetails message={message} />;
    }
    case "post": {
      const post = resolveMentionCatalogPost(parsed, catalog);
      if (!post) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <PostMentionHoverDetails post={post} />;
    }
    case "transaction": {
      const transaction = resolveMentionCatalogTransaction(parsed, catalog);
      if (!transaction) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <TransactionMentionHoverDetails transaction={transaction} />;
    }
    case "invoice": {
      const invoice = resolveMentionCatalogInvoice(parsed, catalog);
      if (!invoice) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <InvoiceMentionHoverDetails invoice={invoice} />;
    }
    case "estimate": {
      const estimate = resolveMentionCatalogEstimate(parsed, catalog);
      if (!estimate) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <EstimateMentionHoverDetails estimate={estimate} />;
    }
    case "project": {
      const project = resolveMentionCatalogProject(parsed, catalog);
      if (!project) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <ProjectMentionHoverDetails project={project} />;
    }
    case "contact": {
      const contact = resolveMentionCatalogContact(parsed, catalog);
      if (!contact) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <ContactMentionHoverDetails contact={contact} />;
    }
    case "organization": {
      const organization = resolveMentionCatalogOrganization(parsed, catalog);
      if (!organization) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <OrganizationMentionHoverDetails organization={organization} />;
    }
    case "document": {
      const document = resolveMentionCatalogDocument(parsed, catalog);
      if (!document) {
        return <MentionHoverDeletedPanel parsed={parsed} />;
      }
      return <DocumentMentionHoverDetails document={document} />;
    }
  }
}

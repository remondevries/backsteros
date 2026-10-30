"use client";

import type {
  ChatUiCardPart,
  ChatUiEstimateCardData,
  ChatUiHabitCardData,
  ChatUiInvoiceCardData,
  ChatUiJournalCardData,
  ChatUiMeetingCardData,
  ChatUiMessageCardData,
  ChatUiPostCardData,
  ChatUiTransactionCardData,
} from "@backsteros/contracts";
import { ArrowSwitchIcon } from "@primer/octicons-react";

import { MentionMessageChannelIcon } from "../communication/communication-kind-icons.js";
import { CalendarIcon } from "../icons/calendar-icon.js";
import { FlameIcon } from "../icons/flame-icon.js";
import { JournalIcon } from "../icons/journal-icon.js";
import { LemoDesignMarkIcon } from "../icons/lemo-design-mark-icon.js";
import { LinkedInIcon } from "../icons/linkedin-icon.js";
import { MoneybirdIcon } from "../icons/moneybird-icon.js";
import { MeetingMentionBlockChip } from "../meetings/meeting-mention-block-chip.js";
import { ChatEntityBlockChip } from "./chat-entity-block-chip.js";
import {
  ChatCardGoLink,
  ChatCardInvalid,
  ChatCardProp,
  ChatExpandableCard,
} from "./chat-expandable-card.js";

type ChatCardRendererProps = {
  part: ChatUiCardPart;
};

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function asDue(
  value: unknown,
): number | string | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  return undefined;
}

function asMeetingCardData(
  data: ChatCardRendererProps["part"]["data"],
): ChatUiMeetingCardData | null {
  if (!data || typeof data !== "object") return null;
  const meetingId = data.meetingId;
  if (typeof meetingId !== "string" || !meetingId) return null;
  return {
    meetingId,
    href: asOptionalString(data.href),
    displayId: asOptionalString(data.displayId),
    title: asOptionalString(data.title),
    startAt: asDue(data.startAt),
    endAt: asDue(data.endAt),
    status: asNullableString(data.status),
    summary: asNullableString(data.summary),
    location: asNullableString(data.location),
    projectName: asNullableString(data.projectName),
    projectIcon: asNullableString(data.projectIcon),
    organizationName: asNullableString(data.organizationName),
  };
}

function asJournalCardData(
  data: ChatCardRendererProps["part"]["data"],
): ChatUiJournalCardData | null {
  if (!data || typeof data !== "object") return null;
  const date = data.date;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  return {
    journalId: asOptionalString(data.journalId),
    href: asOptionalString(data.href),
    date,
    title: asOptionalString(data.title),
    snippet: asNullableString(data.snippet),
    updatedAt: asDue(data.updatedAt),
  };
}

function asHabitCardData(
  data: ChatCardRendererProps["part"]["data"],
): ChatUiHabitCardData | null {
  if (!data || typeof data !== "object") return null;
  const habitId = data.habitId;
  if (typeof habitId !== "string" || !habitId) return null;
  const dateRaw = data.date;
  const date =
    dateRaw === null
      ? null
      : typeof dateRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
        ? dateRaw
        : undefined;
  return {
    habitId,
    href: asOptionalString(data.href),
    title: asOptionalString(data.title),
    icon: asNullableString(data.icon),
    cadence: asNullableString(data.cadence),
    date,
    completed:
      typeof data.completed === "boolean" || data.completed === null
        ? data.completed
        : undefined,
  };
}

function asMessageCardData(
  data: ChatCardRendererProps["part"]["data"],
): ChatUiMessageCardData | null {
  if (!data || typeof data !== "object") return null;
  const conversationId = data.conversationId;
  if (typeof conversationId !== "string" || !conversationId) return null;
  return {
    conversationId,
    href: asOptionalString(data.href),
    channelType: asOptionalString(data.channelType),
    title: asOptionalString(data.title),
    contactName: asNullableString(data.contactName),
    preview: asNullableString(data.preview),
    status: asNullableString(data.status),
    lastActivityAt: asDue(data.lastActivityAt),
  };
}

function asPostCardData(
  data: ChatCardRendererProps["part"]["data"],
): ChatUiPostCardData | null {
  if (!data || typeof data !== "object") return null;
  const postId = data.postId;
  if (typeof postId !== "string" || !postId) return null;
  return {
    postId,
    href: asOptionalString(data.href),
    platform: asNullableString(data.platform),
    title: asOptionalString(data.title),
    body: asNullableString(data.body),
    authorHandle: asNullableString(data.authorHandle),
    status: asNullableString(data.status),
    postedAt: asDue(data.postedAt),
    scheduledAt: asDue(data.scheduledAt),
  };
}

function asTransactionCardData(
  data: ChatCardRendererProps["part"]["data"],
): ChatUiTransactionCardData | null {
  if (!data || typeof data !== "object") return null;
  const transactionId = data.transactionId;
  if (typeof transactionId !== "string" || !transactionId) return null;
  return {
    transactionId,
    href: asOptionalString(data.href),
    title: asOptionalString(data.title),
    amountCents:
      typeof data.amountCents === "number" || data.amountCents === null
        ? data.amountCents
        : undefined,
    currency: asNullableString(data.currency),
    bookedOn: asNullableString(data.bookedOn),
    accountName: asNullableString(data.accountName),
    categoryName: asNullableString(data.categoryName),
    counterparty: asNullableString(data.counterparty),
    notes: asNullableString(data.notes),
  };
}

function asInvoiceCardData(
  data: ChatCardRendererProps["part"]["data"],
): ChatUiInvoiceCardData | null {
  if (!data || typeof data !== "object") return null;
  const invoiceId = data.invoiceId;
  if (typeof invoiceId !== "string" || !invoiceId) return null;
  return {
    invoiceId,
    href: asOptionalString(data.href),
    title: asOptionalString(data.title),
    invoiceNumber: asNullableString(data.invoiceNumber),
    state: asNullableString(data.state),
    invoiceDate: asNullableString(data.invoiceDate),
    dueDate: asNullableString(data.dueDate),
    amountLabel: asNullableString(data.amountLabel),
    contactName: asNullableString(data.contactName),
    currency: asNullableString(data.currency),
  };
}

function asEstimateCardData(
  data: ChatCardRendererProps["part"]["data"],
): ChatUiEstimateCardData | null {
  if (!data || typeof data !== "object") return null;
  const estimateId = data.estimateId;
  if (typeof estimateId !== "string" || !estimateId) return null;
  return {
    estimateId,
    href: asOptionalString(data.href),
    title: asOptionalString(data.title),
    displayId: asNullableString(data.displayId),
    status: asNullableString(data.status),
    documentDate: asNullableString(data.documentDate),
    clientLabel: asNullableString(data.clientLabel),
    totalAmountCents:
      typeof data.totalAmountCents === "number" || data.totalAmountCents === null
        ? data.totalAmountCents
        : undefined,
    currency: asNullableString(data.currency),
  };
}

export function ChatMeetingCard({ part }: ChatCardRendererProps) {
  const data = asMeetingCardData(part.data);
  if (!data) return <ChatCardInvalid label="meeting" />;
  const href =
    data.href ?? `/calendar/meetings/${encodeURIComponent(data.meetingId)}`;
  const summary = data.summary?.trim() || null;
  return (
    <ChatExpandableCard
      cardClassName="chat-ui-card--meeting"
      summary={
        <MeetingMentionBlockChip
          meeting={{
            title: data.title?.trim() || data.displayId || "Meeting",
            displayId: data.displayId,
            startAt: data.startAt,
            endAt: data.endAt,
            projectName: data.projectName,
            projectIcon: data.projectIcon,
            organizationName: data.organizationName,
          }}
          href={href}
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
            <ChatCardProp
              label="Location"
              value={data.location?.trim() || "—"}
              muted={!data.location?.trim()}
            />
            <ChatCardProp
              label="Status"
              value={data.status?.trim() || "—"}
              muted={!data.status?.trim()}
            />
          </dl>
          <ChatCardGoLink href={href}>Go to meeting</ChatCardGoLink>
        </div>
      </div>
    </ChatExpandableCard>
  );
}

export function ChatJournalCard({ part }: ChatCardRendererProps) {
  const data = asJournalCardData(part.data);
  if (!data) return <ChatCardInvalid label="journal" />;
  const href = data.href ?? `/journal/${encodeURIComponent(data.date)}`;
  const snippet = data.snippet?.trim() || null;
  return (
    <ChatExpandableCard
      cardClassName="chat-ui-card--journal"
      summary={
        <ChatEntityBlockChip
          kindClassName="mention-chip-lite--journal"
          href={href}
          icon={<JournalIcon size={14} />}
          id="Journal"
          title={data.date}
          titleAttr={data.title?.trim() || data.date}
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
          <ChatCardGoLink href={href}>Go to journal</ChatCardGoLink>
        </div>
      </div>
    </ChatExpandableCard>
  );
}

export function ChatHabitCard({ part }: ChatCardRendererProps) {
  const data = asHabitCardData(part.data);
  if (!data) return <ChatCardInvalid label="habit" />;
  const href =
    data.href ??
    (data.date
      ? `/journal/habits/${encodeURIComponent(data.habitId)}?date=${encodeURIComponent(data.date)}`
      : `/journal/habits/${encodeURIComponent(data.habitId)}`);
  const title = data.title?.trim() || "Habit";
  return (
    <ChatExpandableCard
      cardClassName="chat-ui-card--habit"
      summary={
        <ChatEntityBlockChip
          kindClassName="mention-chip-lite--habit"
          href={href}
          icon={<FlameIcon size={14} />}
          id="Habit"
          title={title}
          trailing={
            <>
              {data.date ? (
                <span className="mention-chip-lite__received">
                  <CalendarIcon size={12} />
                  <span>{data.date}</span>
                </span>
              ) : null}
              {data.cadence ? (
                <span className="mention-chip-lite__project">{data.cadence}</span>
              ) : null}
            </>
          }
        />
      }
    >
      <div className="chat-ui-card--entity__details">
        <div className="chat-ui-card--entity__footer">
          <dl className="chat-ui-card--entity__props">
            <ChatCardProp
              label="Cadence"
              value={data.cadence?.trim() || "—"}
              muted={!data.cadence?.trim()}
            />
            <ChatCardProp
              label="Status"
              value={
                data.completed == null
                  ? "—"
                  : data.completed
                    ? "Completed"
                    : "Open"
              }
              muted={data.completed == null}
            />
          </dl>
          <ChatCardGoLink href={href}>Go to habit</ChatCardGoLink>
        </div>
      </div>
    </ChatExpandableCard>
  );
}

export function ChatMessageCard({ part }: ChatCardRendererProps) {
  const data = asMessageCardData(part.data);
  if (!data) return <ChatCardInvalid label="message" />;
  const href =
    data.href ??
    `/communication/${encodeURIComponent(data.conversationId)}`;
  const title =
    data.title?.trim() ||
    data.contactName?.trim() ||
    data.channelType ||
    "Conversation";
  const preview = data.preview?.trim() || null;
  return (
    <ChatExpandableCard
      cardClassName="chat-ui-card--message"
      summary={
        <ChatEntityBlockChip
          kindClassName="mention-chip-lite--message"
          href={href}
          icon={
            <MentionMessageChannelIcon
              channelType={data.channelType}
              contactName={data.contactName}
              size={14}
            />
          }
          title={title}
          trailing={
            data.contactName ? (
              <span className="mention-chip-lite__project">
                {data.contactName}
              </span>
            ) : null
          }
        />
      }
    >
      <div className="chat-ui-card--entity__details">
        {preview ? (
          <p className="chat-ui-card--entity__description">{preview}</p>
        ) : (
          <p className="chat-ui-card--entity__description is-empty">
            No preview
          </p>
        )}
        <div className="chat-ui-card--entity__footer">
          <dl className="chat-ui-card--entity__props">
            <ChatCardProp
              label="Channel"
              value={data.channelType?.trim() || "—"}
              muted={!data.channelType?.trim()}
            />
            <ChatCardProp
              label="Status"
              value={data.status?.trim() || "—"}
              muted={!data.status?.trim()}
            />
          </dl>
          <ChatCardGoLink href={href}>Go to conversation</ChatCardGoLink>
        </div>
      </div>
    </ChatExpandableCard>
  );
}

export function ChatPostCard({ part }: ChatCardRendererProps) {
  const data = asPostCardData(part.data);
  if (!data) return <ChatCardInvalid label="post" />;
  const href = data.href ?? `/social/post/${encodeURIComponent(data.postId)}`;
  const title = data.title?.trim() || data.body?.trim()?.slice(0, 80) || "Post";
  const body = data.body?.trim() || null;
  return (
    <ChatExpandableCard
      cardClassName="chat-ui-card--post"
      summary={
        <ChatEntityBlockChip
          kindClassName="mention-chip-lite--post"
          href={href}
          icon={<LinkedInIcon size={14} />}
          id={data.platform}
          title={title}
          trailing={
            data.authorHandle ? (
              <span className="mention-chip-lite__project">
                {data.authorHandle}
              </span>
            ) : null
          }
        />
      }
    >
      <div className="chat-ui-card--entity__details">
        {body ? (
          <p className="chat-ui-card--entity__description">{body}</p>
        ) : (
          <p className="chat-ui-card--entity__description is-empty">No body</p>
        )}
        <div className="chat-ui-card--entity__footer">
          <dl className="chat-ui-card--entity__props">
            <ChatCardProp
              label="Platform"
              value={data.platform?.trim() || "—"}
              muted={!data.platform?.trim()}
            />
            <ChatCardProp
              label="Status"
              value={data.status?.trim() || "—"}
              muted={!data.status?.trim()}
            />
          </dl>
          <ChatCardGoLink href={href}>Go to post</ChatCardGoLink>
        </div>
      </div>
    </ChatExpandableCard>
  );
}

export function ChatTransactionCard({ part }: ChatCardRendererProps) {
  const data = asTransactionCardData(part.data);
  if (!data) return <ChatCardInvalid label="transaction" />;
  const href =
    data.href ??
    `/finance/transactions?tx=${encodeURIComponent(data.transactionId)}`;
  const title =
    data.title?.trim() || data.counterparty?.trim() || "Transaction";
  const amount =
    data.amountCents != null
      ? `${(data.amountCents / 100).toFixed(2)} ${data.currency ?? ""}`.trim()
      : null;
  const notes = data.notes?.trim() || null;
  return (
    <ChatExpandableCard
      cardClassName="chat-ui-card--transaction"
      summary={
        <ChatEntityBlockChip
          kindClassName="mention-chip-lite--transaction"
          href={href}
          icon={<ArrowSwitchIcon size={14} />}
          id={data.bookedOn}
          title={title}
          trailing={
            amount ? (
              <span className="mention-chip-lite__project">{amount}</span>
            ) : null
          }
        />
      }
    >
      <div className="chat-ui-card--entity__details">
        {notes ? (
          <p className="chat-ui-card--entity__description">{notes}</p>
        ) : (
          <p className="chat-ui-card--entity__description is-empty">No notes</p>
        )}
        <div className="chat-ui-card--entity__footer">
          <dl className="chat-ui-card--entity__props">
            <ChatCardProp
              label="Account"
              value={data.accountName?.trim() || "—"}
              muted={!data.accountName?.trim()}
            />
            <ChatCardProp
              label="Category"
              value={data.categoryName?.trim() || "—"}
              muted={!data.categoryName?.trim()}
            />
          </dl>
          <ChatCardGoLink href={href}>Go to transaction</ChatCardGoLink>
        </div>
      </div>
    </ChatExpandableCard>
  );
}

export function ChatInvoiceCard({ part }: ChatCardRendererProps) {
  const data = asInvoiceCardData(part.data);
  if (!data) return <ChatCardInvalid label="invoice" />;
  const href =
    data.href ??
    `/finance/invoices?invoice=${encodeURIComponent(data.invoiceId)}`;
  const title =
    data.title?.trim() || data.invoiceNumber?.trim() || "Invoice";
  return (
    <ChatExpandableCard
      cardClassName="chat-ui-card--invoice"
      summary={
        <ChatEntityBlockChip
          kindClassName="mention-chip-lite--invoice"
          href={href}
          icon={<MoneybirdIcon size={14} withTile={false} />}
          id={data.invoiceNumber}
          title={title}
          trailing={
            data.amountLabel ? (
              <span className="mention-chip-lite__project">
                {data.amountLabel}
              </span>
            ) : null
          }
        />
      }
    >
      <div className="chat-ui-card--entity__details">
        <div className="chat-ui-card--entity__footer">
          <dl className="chat-ui-card--entity__props">
            <ChatCardProp
              label="Contact"
              value={data.contactName?.trim() || "—"}
              muted={!data.contactName?.trim()}
            />
            <ChatCardProp
              label="Status"
              value={data.state?.trim() || "—"}
              muted={!data.state?.trim()}
            />
          </dl>
          <ChatCardGoLink href={href}>Go to invoice</ChatCardGoLink>
        </div>
      </div>
    </ChatExpandableCard>
  );
}

export function ChatEstimateCard({ part }: ChatCardRendererProps) {
  const data = asEstimateCardData(part.data);
  if (!data) return <ChatCardInvalid label="estimate" />;
  const href =
    data.href ?? `/finance/estimates/${encodeURIComponent(data.estimateId)}`;
  const title = data.title?.trim() || data.displayId?.trim() || "Estimate";
  const amount =
    data.totalAmountCents != null
      ? `${(data.totalAmountCents / 100).toFixed(2)} ${data.currency ?? "EUR"}`.trim()
      : null;
  return (
    <ChatExpandableCard
      cardClassName="chat-ui-card--estimate"
      summary={
        <ChatEntityBlockChip
          kindClassName="mention-chip-lite--estimate"
          href={href}
          icon={<LemoDesignMarkIcon size={14} />}
          id={data.displayId}
          title={title}
          trailing={
            amount ? (
              <span className="mention-chip-lite__project">{amount}</span>
            ) : null
          }
        />
      }
    >
      <div className="chat-ui-card--entity__details">
        <div className="chat-ui-card--entity__footer">
          <dl className="chat-ui-card--entity__props">
            <ChatCardProp
              label="Client"
              value={data.clientLabel?.trim() || "—"}
              muted={!data.clientLabel?.trim()}
            />
            <ChatCardProp
              label="Status"
              value={data.status?.trim() || "—"}
              muted={!data.status?.trim()}
            />
          </dl>
          <ChatCardGoLink href={href}>Go to estimate</ChatCardGoLink>
        </div>
      </div>
    </ChatExpandableCard>
  );
}

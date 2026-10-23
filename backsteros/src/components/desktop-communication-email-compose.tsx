import { useCallback, useEffect, useMemo, useState } from "react";
import {
  findContactByEmailAddress,
  type AgentMailDraftDetail,
  type AgentMailMessageDetail,
} from "@backsteros/contracts";
import {
  EmailComposeChrome,
  EmailDraftActions,
  EntityAvatarIcon,
  ContactPersonIcon,
  OrganizationIcon,
  buildEmailRecipientDropdownOptions,
  composeContactFirstName,
  normalizeEmailRecipients,
  pickComposeShellLanguage,
  renderComposePreviewShell,
  resolveComposeReplyTemplates,
} from "@backsteros/ui";

import { useAgentMail } from "../lib/agentmail-context";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import { writeEmailComposeSession } from "../lib/email-compose-session";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { useEmailDraftActions } from "../screens/email/use-email-draft-actions";

type DesktopCommunicationEmailComposeProps = {
  /** Called after send (or explicit discard) so Communication can leave create mode. */
  onFinished?: () => void;
  /** Keep the right-rail party card in sync with the To field. */
  onToChange?: (to: string) => void;
  /** Linked To contact from the right rail (preferred over email soft-match). */
  toContactId?: string | null;
  /** Linked org from the right rail — greeting uses org name when no contact. */
  toOrganizationId?: string | null;
  /** Re-open a saved draft from the Communication list. */
  openDraft?: { inboxId: string; draftId: string } | null;
};

/**
 * New-email compose embedded in Communication’s middle pane — keeps the left
 * list mounted (unlike navigating to `/email/compose`).
 */
export function DesktopCommunicationEmailCompose({
  onFinished,
  onToChange,
  toContactId = null,
  toOrganizationId = null,
  openDraft = null,
}: DesktopCommunicationEmailComposeProps) {
  const agentMail = useAgentMail();
  const workspace = useDesktopWorkspaceData();
  const [message, setMessage] = useState<AgentMailMessageDetail | null>(null);
  const [draft, setDraft] = useState<AgentMailDraftDetail | null>(null);

  const reloadMessageDetail = useCallback(
    async (_inboxId: string, _messageId: string) => {
      throw new Error("Compose has no parent message to reload.");
    },
    [],
  );
  const promoteEmailThreadStatus = useCallback(
    (_next: "in_progress" | "in_review" | "on_hold") => undefined,
    [],
  );
  const toEmailDetailHref = useCallback(
    (targetInboxId: string, targetMessageId: string) =>
      `/email/${encodeURIComponent(targetInboxId)}/${encodeURIComponent(targetMessageId)}?list=communication`,
    [],
  );

  const drafts = useEmailDraftActions({
    inboxId: undefined,
    messageId: undefined,
    draftId: undefined,
    isCompose: true,
    message,
    setMessage,
    draft,
    setDraft,
    reloadMessageDetail,
    promoteEmailThreadStatus,
    toEmailDetailHref,
    listReturnHref: "/communication",
    onComposeFinished: onFinished,
    composeDraftSeed: openDraft,
  });

  const {
    conceptError,
    sendError,
    sending,
    deleting,
    conceptSaving,
    conceptBodySaving,
    conceptBodyDraft,
    setConceptBodyDraft,
    conceptBodyMode,
    handleConceptBodyModeChange,
    composeSession,
    composeInboxId,
    setComposeInboxId,
    composeTo,
    setComposeTo,
    composeCc,
    setComposeCc,
    composeBcc,
    setComposeBcc,
    composeSubject,
    setComposeSubject,
    composeDraft,
    composeLoading,
    saveComposeDraft,
    sendDraft,
    deleteDraft,
  } = drafts;

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    workspace.contacts,
  );
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    workspace.organizations,
  );
  const recipientOptions = useMemo(
    () =>
      buildEmailRecipientDropdownOptions({
        contacts: workspace.contacts.map((contact) => ({
          ...contact,
          avatarSrc: contactAvatarSrc[contact.id] ?? contact.avatarSrc ?? null,
        })),
        organizations: workspace.organizations.map((organization) => ({
          ...organization,
          avatarSrc:
            organizationAvatarSrc[organization.id] ??
            organization.avatarSrc ??
            null,
        })),
        iconForContact: (contact) =>
          contact.avatarSrc ? (
            <EntityAvatarIcon src={contact.avatarSrc} size={14} kind="contact" />
          ) : (
            <ContactPersonIcon size={14} />
          ),
        iconForOrganization: (organization) =>
          organization.avatarSrc ? (
            <EntityAvatarIcon
              src={organization.avatarSrc}
              size={14}
              kind="organization"
            />
          ) : (
            <OrganizationIcon size={14} />
          ),
      }),
    [
      contactAvatarSrc,
      organizationAvatarSrc,
      workspace.contacts,
      workspace.organizations,
    ],
  );
  const composeMailboxes = useMemo(
    () =>
      agentMail.mailboxes.map((mailbox) => ({
        ...mailbox,
        avatarSrc: mailbox.contactId
          ? (contactAvatarSrc[mailbox.contactId] ?? null)
          : (mailbox.avatarSrc ?? null),
      })),
    [agentMail.mailboxes, contactAvatarSrc],
  );
  const mailboxSignOffAvatarSrc = useCallback(
    (mailboxInboxId: string | null | undefined) => {
      const id = mailboxInboxId?.trim();
      if (!id) return null;
      return (
        composeMailboxes.find((mailbox) => mailbox.inboxId === id)?.avatarSrc ??
        null
      );
    },
    [composeMailboxes],
  );

  const selectedMailbox = useMemo(
    () =>
      composeMailboxes.find((mailbox) => mailbox.inboxId === composeInboxId) ??
      composeMailboxes[0] ??
      null,
    [composeInboxId, composeMailboxes],
  );

  const fromContact = useMemo(() => {
    const id = selectedMailbox?.contactId?.trim();
    if (!id) return null;
    return workspace.contacts.find((contact) => contact.id === id) ?? null;
  }, [selectedMailbox?.contactId, workspace.contacts]);

  const toContact = useMemo(() => {
    const linkedId = toContactId?.trim();
    if (linkedId) {
      return (
        workspace.contacts.find((contact) => contact.id === linkedId) ?? null
      );
    }
    const address = normalizeEmailRecipients(composeTo)[0] ?? null;
    if (!address) return null;
    return findContactByEmailAddress(workspace.contacts, address) ?? null;
  }, [composeTo, toContactId, workspace.contacts]);

  const toOrganization = useMemo(() => {
    const linkedId =
      toOrganizationId?.trim() || toContact?.organizationId?.trim() || null;
    if (!linkedId) return null;
    return (
      workspace.organizations.find((organization) => organization.id === linkedId) ??
      null
    );
  }, [
    toContact?.organizationId,
    toOrganizationId,
    workspace.organizations,
  ]);

  const letterShell = useMemo(() => {
    const templates = resolveComposeReplyTemplates(agentMail.replyTemplates);
    // Default: From mailbox TLD (.nl → Dutch, .com → English).
    // Override: To-contact languages (first), else To-org languages when set.
    const language = pickComposeShellLanguage({
      contactLanguages: toContact?.languages,
      fromEmailAddress: selectedMailbox?.email,
    });
    // Contact first name wins; org-only links use the organization name.
    const firstName =
      composeContactFirstName(toContact?.firstName) ||
      composeContactFirstName(toContact?.name) ||
      toOrganization?.name?.trim() ||
      null;
    const signOffName =
      fromContact?.name?.trim() ||
      selectedMailbox?.contactName?.trim() ||
      selectedMailbox?.displayName?.trim() ||
      "Remon";
    return renderComposePreviewShell({
      templates,
      language,
      firstName,
      signOffName,
    });
  }, [
    agentMail.replyTemplates,
    fromContact?.name,
    selectedMailbox?.contactName,
    selectedMailbox?.displayName,
    selectedMailbox?.email,
    toContact?.firstName,
    toContact?.languages,
    toContact?.name,
    toOrganization?.name,
  ]);

  const conceptDraftActionsDisabled = conceptSaving || conceptBodySaving;

  useEffect(() => {
    onToChange?.(composeTo);
  }, [composeTo, onToChange]);

  // Prefer a default From inbox as soon as mailboxes load.
  useEffect(() => {
    if (composeInboxId.trim()) return;
    const first = composeMailboxes[0]?.inboxId?.trim();
    if (!first) return;
    setComposeInboxId(first);
    writeEmailComposeSession({
      sessionId: composeSession.sessionId,
      draftId: composeDraft?.draftId ?? null,
      inboxId: first,
    });
  }, [
    composeDraft?.draftId,
    composeInboxId,
    composeMailboxes,
    composeSession.sessionId,
    setComposeInboxId,
  ]);

  return (
    <div className="communication-chat__thread-body communication-chat__email-compose">
      <div className="communication-chat__thread-container">
        <div className="inbox-detail-body inbox-detail-body--email">
          {conceptError ? (
            <p className="email-concept-error" role="alert">
              {conceptError}
            </p>
          ) : null}
          {sendError ? (
            <p className="email-send-error" role="alert">
              {sendError}
            </p>
          ) : null}
          {composeLoading ? (
            <p className="email-concept-badge">Loading draft…</p>
          ) : null}
          <EmailComposeChrome
            mailboxes={composeMailboxes}
            inboxId={composeInboxId || selectedMailbox?.inboxId || ""}
            onInboxIdChange={(nextInboxId) => {
              setComposeInboxId(nextInboxId);
              writeEmailComposeSession({
                sessionId: composeSession.sessionId,
                draftId: composeDraft?.draftId ?? null,
                inboxId: nextInboxId,
              });
            }}
            to={composeTo}
            onToChange={setComposeTo}
            recipientOptions={recipientOptions}
            cc={composeCc}
            onCcChange={setComposeCc}
            bcc={composeBcc}
            onBccChange={setComposeBcc}
            subject={composeSubject}
            onSubjectChange={setComposeSubject}
            body={conceptBodyDraft}
            bodyMode={conceptBodyMode}
            onBodyChange={setConceptBodyDraft}
            replyGreeting={letterShell.greeting}
            replySignOff={letterShell.signOff}
            replySignOffAvatarSrc={mailboxSignOffAvatarSrc(
              composeInboxId || selectedMailbox?.inboxId,
            )}
            fieldsDisabled={conceptSaving || conceptBodySaving}
            autoFocusReady={!composeLoading}
            agentWorking={false}
            emptyBodyLabel="Write the message body…"
            composer={null}
            actions={
              <EmailDraftActions
                onSend={
                  composeDraft
                    ? () => {
                        void sendDraft(
                          composeDraft.inboxId,
                          composeDraft.draftId,
                        );
                      }
                    : undefined
                }
                onSaveDraft={() => {
                  void saveComposeDraft(conceptBodyDraft);
                }}
                onDelete={
                  composeDraft
                    ? () => {
                        void deleteDraft(
                          composeDraft.inboxId,
                          composeDraft.draftId,
                        );
                        onFinished?.();
                      }
                    : () => onFinished?.()
                }
                sending={sending}
                savingDraft={conceptSaving}
                deleting={deleting}
                disabled={conceptDraftActionsDisabled}
                bodyMode={conceptBodyMode}
                onBodyModeChange={(mode) => {
                  void handleConceptBodyModeChange(mode);
                }}
                savingBody={conceptBodySaving}
                deleteEntityLabel="this draft"
              />
            }
          />
        </div>
      </div>
    </div>
  );
}

import { useCallback, useMemo } from "react";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import {
  EmailDraftActions,
  RegisterPageTitle,
  RegisterEntityDeleteAction,
  RegisterEntityMenuItems,
  EmailThreadMessageCard,
  getEmailItemHref,
  getEmailListContext,
  getScopedProjectSectionHref,
  preserveEmailInboxListContext,
  isEmailComposePath,
  useEmailDraftBodyModeShortcuts,
} from "@backsteros/ui";
import { parseEmailDraftPath } from "@backsteros/ui";

import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { useAgentMail } from "../lib/agentmail-context";
import { EmailComposeView } from "./email/email-compose-view";
import { EmailThreadDetail } from "./email/email-thread-detail";
import { useEmailDraftActions } from "./email/use-email-draft-actions";
import { useEmailMessageActions } from "./email/use-email-message-actions";
import { useEmailMessageDetail } from "./email/use-email-message-detail";
import { useEmailThreadComments } from "./email/use-email-thread-comments";
import { useEmailThreadMetadata } from "./email/use-email-thread-metadata";
import { useEmailThreadView } from "./email/use-email-thread-view";

export function EmailPage() {
  const params = useParams({ strict: false }) as {
    inboxId?: string;
    messageId?: string;
    draftId?: string;
  };
  const location = useLocation();
  const locationPath = location.pathname;
  const isCompose = isEmailComposePath(locationPath);
  const draftPath = parseEmailDraftPath(locationPath);
  const inboxId = draftPath?.inboxId ?? params.inboxId;
  const messageId = draftPath ? undefined : params.messageId;
  const draftId = draftPath?.draftId ?? params.draftId;

  const toEmailDetailHref = useCallback(
    (targetInboxId: string, targetMessageId: string) =>
      preserveEmailInboxListContext(
        getEmailItemHref(targetInboxId, targetMessageId),
        location.searchStr,
      ),
    [location.searchStr],
  );
  // Shared Provider owns list fetch + SSE; detail only needs mailboxes.
  const agentMail = useAgentMail();
  const { contacts, projects } = useDesktopWorkspaceData();

  const {
    message,
    setMessage,
    draft,
    setDraft,
    loading,
    error,
    reloadMessageDetail,
  } = useEmailMessageDetail({ inboxId, messageId, draftId, isCompose });

  const metadataState = useEmailThreadMetadata({
    inboxId,
    message,
    setMessage,
  });
  const {
    organizationId,
    contactId,
    assigneeId,
    projectKey,
    promoteEmailThreadStatus,
  } = metadataState;

  const drafts = useEmailDraftActions({
    inboxId,
    messageId,
    draftId,
    isCompose,
    message,
    setMessage,
    draft,
    setDraft,
    reloadMessageDetail,
    promoteEmailThreadStatus,
    toEmailDetailHref,
  });
  const {
    setConceptError,
    conceptSaving,
    sendError,
    sending,
    deleting,
    conceptBodyDraft,
    setConceptBodyDraft,
    conceptBodyMode,
    conceptBodySaving,
    draftStageWorking,
    setDraftStageWorking,
    composeSubject,
    composeDraft,
    replyComposeOpen,
    setReplyComposeOpen,
    saveConceptDraftBody,
    handleConceptBodyModeChange,
    saveConceptReply,
    sendDraft,
    deleteDraft,
  } = drafts;

  const comments = useEmailThreadComments({
    inboxId,
    messageId,
    isCompose,
    message,
    conceptBodyDraft,
    conceptBodyMode,
    replyComposeOpen,
    setConceptError,
    setConceptBodyDraft,
    setReplyComposeOpen,
    setDraftStageWorking,
    saveConceptDraftBody,
    saveConceptReply,
    promoteEmailThreadStatus,
    organizationId,
    contactId,
    assigneeId,
    projectKey,
  });
  const {
    threadComments,
    setThreadComments,
    commentAgentWorking,
    draftAgentWorking,
  } = comments;

  const actions = useEmailMessageActions({
    inboxId,
    messageId,
    message,
    setMessage,
    setDraft,
    setThreadComments,
    setConceptError,
    reloadMessageDetail,
    toEmailDetailHref,
  });
  const { handleDeleteMessage, emailExtraMenuItems } = actions;

  const view = useEmailThreadView({
    message,
    messageId,
    loading,
    threadComments,
    replyComposeOpen,
    commentAgentWorking,
    draftAgentWorking,
    draftStageWorking,
  });

  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);

  const conceptDraftActionsDisabled =
    conceptSaving ||
    conceptBodySaving ||
    draftAgentWorking ||
    draftStageWorking;

  const showDraftWorking = draftAgentWorking || draftStageWorking;

  const emailDraftModeShortcutsEnabled =
    !showDraftWorking &&
    (isCompose ||
      Boolean(draft) ||
      Boolean(message && (replyComposeOpen || message.conceptDraft)));

  useEmailDraftBodyModeShortcuts({
    mode: conceptBodyMode,
    onModeChange: (mode) => {
      void handleConceptBodyModeChange(mode);
    },
    enabled: emailDraftModeShortcutsEnabled,
  });

  const title =
    isCompose
      ? composeSubject.trim() || composeDraft?.subject?.trim() || "New email"
      : draft?.subject?.trim() ||
        message?.subject?.trim() ||
        (draftId ? "Reply concept" : "Email");

  const breadcrumbItems = useMemo(() => {
    const listContext = getEmailListContext(location.searchStr);
    const currentLabel = isCompose
      ? composeSubject.trim() || "Compose"
      : title;

    if (listContext === "inbox") {
      return [
        { label: "Inbox", href: "/inbox" },
        { label: currentLabel },
      ];
    }

    if (listContext === "project") {
      const project =
        (projectKey
          ? projects.find((entry) => entry.key === projectKey)
          : null) ??
        (message?.threadMetadata?.projectId
          ? projects.find(
              (entry) => entry.id === message.threadMetadata?.projectId,
            )
          : null) ??
        null;
      const projectLabel =
        project?.name ??
        message?.threadMetadata?.projectName ??
        projectKey ??
        "Project";
      const projectHref = project
        ? getScopedProjectSectionHref(project.key, "tasks", {
            kind: "standalone",
          })
        : "/projects";
      return [
        { label: "Projects", href: "/projects" },
        { label: projectLabel, href: projectHref },
        { label: currentLabel },
      ];
    }

    // Tasks list (explicit or default when opened outside Inbox).
    return [
      { label: "Tasks", href: "/tasks" },
      { label: currentLabel },
    ];
  }, [
    composeSubject,
    isCompose,
    location.searchStr,
    message?.threadMetadata?.projectId,
    message?.threadMetadata?.projectName,
    projectKey,
    projects,
    title,
  ]);

  useDesktopSectionBreadcrumb(breadcrumbItems);

  const composeMailboxes = useMemo(
    () =>
      agentMail.mailboxes.map((mailbox) => ({
        ...mailbox,
        avatarSrc: mailbox.contactId
          ? contactAvatarSrc[mailbox.contactId] ?? null
          : null,
      })),
    [agentMail.mailboxes, contactAvatarSrc],
  );

  const mailboxSignOffAvatarSrc = (mailboxInboxId: string | null | undefined) => {
    const id = mailboxInboxId?.trim();
    if (!id) return null;
    return composeMailboxes.find((mailbox) => mailbox.inboxId === id)?.avatarSrc ?? null;
  };

  if (isCompose) {
    return (
      <EmailComposeView
        title={title}
        composeMailboxes={composeMailboxes}
        mailboxSignOffAvatarSrc={mailboxSignOffAvatarSrc}
        conceptDraftActionsDisabled={conceptDraftActionsDisabled}
        drafts={drafts}
      />
    );
  }

  let content;
  if (!inboxId || (!messageId && !draftId)) {
    content = (
      <div className="inbox-detail-empty">
        <div>
          <p>Select a message</p>
          <p className="inbox-detail-empty-hint">
            Incoming mail from the inboxes in{" "}
            <Link
              className="inbox-moved-banner__link"
              to="/settings/$tab"
              params={{ tab: "email" }}
            >
              Settings → E-mail
            </Link>{" "}
            appears in the left panel.
          </p>
        </div>
      </div>
    );
  } else if (loading) {
    content = (
      <div className="inbox-detail-empty">
        <p>Loading…</p>
      </div>
    );
  } else if (error) {
    content = (
      <div className="inbox-detail-empty">
        <p>{error}</p>
      </div>
    );
  } else if (draft) {
    content = (
      <div className="inbox-detail-body inbox-detail-body--email">
        {sendError ? (
          <p className="email-send-error" role="alert">
            {sendError}
          </p>
        ) : null}
        <EmailThreadMessageCard
          isConcept
          subject={draft.subject?.trim() || "Reply concept"}
          from={draft.from}
          to={draft.to ?? []}
          timestamp={draft.updatedAt}
          body={conceptBodyDraft}
          bodyMode={conceptBodyMode}
          onBodyChange={setConceptBodyDraft}
          replyGreeting={draft.greeting}
          replySignOff={draft.signOff}
          replySignOffAvatarSrc={mailboxSignOffAvatarSrc(draft.inboxId)}
          emptyBodyLabel="This draft has no text body."
          agentWorking={showDraftWorking}
          fieldsDisabled={conceptDraftActionsDisabled}
          actions={
            <EmailDraftActions
              onSend={() => {
                void sendDraft(draft.inboxId, draft.draftId, draft.inReplyTo);
              }}
              onDelete={() => {
                void deleteDraft(draft.inboxId, draft.draftId, draft.inReplyTo);
              }}
              sending={sending}
              deleting={deleting}
              disabled={conceptDraftActionsDisabled}
              bodyMode={conceptBodyMode}
              onBodyModeChange={(mode) => {
                void handleConceptBodyModeChange(mode);
              }}
              savingBody={conceptBodySaving}
            />
          }
        />
      </div>
    );
  } else if (message) {
    content = (
      <EmailThreadDetail
        inboxId={inboxId}
        messageId={messageId}
        message={message}
        composeMailboxes={composeMailboxes}
        contactAvatarSrc={contactAvatarSrc}
        mailboxSignOffAvatarSrc={mailboxSignOffAvatarSrc}
        conceptDraftActionsDisabled={conceptDraftActionsDisabled}
        showDraftWorking={showDraftWorking}
        metadataState={metadataState}
        drafts={drafts}
        comments={comments}
        actions={actions}
        view={view}
      />
    );
  } else {
    content = (
      <div className="inbox-detail-empty">
        <p>Not found.</p>
      </div>
    );
  }

  const detail = (
    <>
      <RegisterPageTitle title={title} />
      {message && inboxId && messageId ? (
        <>
          <RegisterEntityDeleteAction
            entityLabel={
              message.subject.trim()
                ? `${message.subject.trim()} (entire thread)`
                : "this conversation"
            }
            confirmLabel="Delete thread"
            actionVerb="Delete"
            onDelete={handleDeleteMessage}
          />
          <RegisterEntityMenuItems items={emailExtraMenuItems} />
        </>
      ) : null}
      <div className="inbox-detail-layout">{content}</div>
    </>
  );

  return detail;
}

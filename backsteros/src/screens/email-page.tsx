import { useCallback, useMemo } from "react";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import {
  EmailDraftActions,
  EntityAvatarIcon,
  ContactPersonIcon,
  OrganizationIcon,
  FinanceSyncIcon,
  RegisterPageTitle,
  RegisterEntityDeleteAction,
  RegisterEntityMenuItems,
  EmailThreadMessageCard,
  buildEmailRecipientDropdownOptions,
  getEmailItemHref,
  getEmailListContext,
  getPrimedTabTitle,
  getScopedProjectSectionHref,
  preserveEmailInboxListContext,
  isEmailComposePath,
} from "@backsteros/ui";
import { parseEmailDraftPath } from "@backsteros/ui";

import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import { emailDeleteEntityLabel } from "../lib/delete-email-message";
import {
  useDesktopWorkspacePeople,
  useDesktopWorkspaceProjects,
} from "../lib/workspace-data";
import { useAgentMail } from "../lib/agentmail-context";
import {
  projectListLabelForNavFrom,
  recalledProjectNavFrom,
  resolveProjectListHref,
  type ProjectNavFrom,
} from "../lib/project-type-cache";
import { resolveListReturnHref } from "../lib/list-return-href";
import { EmailComposeView } from "./email/email-compose-view";
import { EmailThreadDetail } from "./email/email-thread-detail";
import { useEmailDraftActions } from "./email/use-email-draft-actions";
import { useEmailMessageActions } from "./email/use-email-message-actions";
import { useEmailMessageDetail } from "./email/use-email-message-detail";
import { useEmailThreadComments } from "./email/use-email-thread-comments";
import { useEmailThreadMetadata } from "./email/use-email-thread-metadata";
import { useEmailThreadView } from "./email/use-email-thread-view";

export function EmailPage({
  embedInboxId,
  embedMessageId,
  embedDraftId,
  breadcrumbItems: breadcrumbItemsProp,
}: {
  embedInboxId?: string;
  embedMessageId?: string;
  embedDraftId?: string;
  breadcrumbItems?: { label: string; href?: string }[];
} = {}) {
  const params = useParams({ strict: false }) as {
    inboxId?: string;
    messageId?: string;
    draftId?: string;
  };
  const location = useLocation();
  const locationPath = location.pathname;
  const isCompose = isEmailComposePath(locationPath);
  const draftPath =
    embedDraftId && embedInboxId
      ? { inboxId: embedInboxId, draftId: embedDraftId }
      : parseEmailDraftPath(locationPath);
  const inboxId = embedInboxId ?? draftPath?.inboxId ?? params.inboxId;
  const messageId = embedDraftId
    ? undefined
    : (embedMessageId ?? (draftPath ? undefined : params.messageId));
  const draftId = embedDraftId ?? draftPath?.draftId ?? params.draftId;

  const toEmailDetailHref = useCallback(
    (targetInboxId: string, targetMessageId: string) =>
      preserveEmailInboxListContext(
        getEmailItemHref(targetInboxId, targetMessageId),
        location.searchStr,
      ),
    [location.searchStr],
  );
  const listReturnHref = useMemo(() => {
    const listContext = getEmailListContext(location.searchStr);
    if (listContext === "communication") {
      return "/communication";
    }
    if (listContext === "tasks") return "/tasks?due=today";
    if (listContext === "inbox") return "/inbox";
    // No list context (deep link) — still leave the removed thread.
    return "/inbox";
  }, [location.searchStr]);
  // Shared Provider owns list fetch + SSE; detail only needs mailboxes.
  const agentMail = useAgentMail();
  const { contacts, organizations } = useDesktopWorkspacePeople();
  const { projects } = useDesktopWorkspaceProjects();

  const {
    message,
    setMessage,
    draft,
    setDraft,
    loading,
    error,
    reloadMessageDetail,
    suppressAutoMarkRead,
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
    setMessage,
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
    reloadMessageDetail,
    listReturnHref,
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
    listReturnHref,
    suppressAutoMarkRead,
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
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    organizations,
  );
  const recipientOptions = useMemo(
    () =>
      buildEmailRecipientDropdownOptions({
        contacts: contacts.map((contact) => ({
          ...contact,
          avatarSrc: contactAvatarSrc[contact.id] ?? contact.avatarSrc ?? null,
        })),
        organizations: organizations.map((organization) => ({
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
    [contactAvatarSrc, contacts, organizationAvatarSrc, organizations],
  );

  const conceptDraftActionsDisabled =
    conceptSaving ||
    conceptBodySaving ||
    draftAgentWorking ||
    draftStageWorking;

  const showDraftWorking = draftAgentWorking || draftStageWorking;

  // Prefer detail only when it matches the open route — otherwise the previous
  // thread's subject sticks in the breadcrumb while the next message loads.
  const detailSubject = (() => {
    if (draftId) {
      if (draft?.draftId === draftId) {
        return draft.subject?.trim() || null;
      }
      return null;
    }
    if (messageId && message?.messageId === messageId) {
      return message.subject?.trim() || null;
    }
    return null;
  })();
  const listSubject = (() => {
    if (!inboxId) return null;
    if (draftId) {
      return (
        agentMail.messages.find(
          (entry) =>
            entry.kind === "draft" &&
            entry.inboxId === inboxId &&
            entry.id === draftId,
        )?.subject.trim() || null
      );
    }
    if (!messageId) return null;
    return (
      agentMail.messages.find(
        (entry) => entry.inboxId === inboxId && entry.id === messageId,
      )?.subject.trim() || null
    );
  })();
  const title = isCompose
    ? composeSubject.trim() || composeDraft?.subject?.trim() || "New email"
    : detailSubject ||
      listSubject ||
      getPrimedTabTitle(locationPath) ||
      (draftId ? "Reply concept" : "E-mail");

  const breadcrumbItems = useMemo(() => {
    if (breadcrumbItemsProp) {
      return [...breadcrumbItemsProp, { label: title }];
    }
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

    if (listContext === "communication") {
      return [
        { label: "Communication", href: "/communication" },
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
      const navFrom: ProjectNavFrom =
        recalledProjectNavFrom(project?.id) ??
        recalledProjectNavFrom(project?.key) ??
        recalledProjectNavFrom(projectKey) ??
        "projects";
      const projectsListHref = resolveProjectListHref({
        locationState: location.state,
        navFrom,
        projectId: project?.id,
        projectKey: project?.key,
        routeParam: projectKey,
      });
      return [
        {
          label: projectListLabelForNavFrom(navFrom),
          href: projectsListHref,
        },
        { label: projectLabel, href: projectHref },
        { label: currentLabel },
      ];
    }

    // Tasks list (explicit or default when opened outside Inbox).
    return [
      {
        label: "Tasks",
        href: resolveListReturnHref({
          kind: "task",
          locationState: location.state,
          fallback: "/tasks",
        }),
      },
      { label: currentLabel },
    ];
  }, [
    breadcrumbItemsProp,
    composeSubject,
    isCompose,
    location.searchStr,
    location.state,
    message?.threadMetadata?.projectId,
    message?.threadMetadata?.projectName,
    projectKey,
    projects,
    title,
  ]);

  const listContext = getEmailListContext(location.searchStr);
  // Communication-sourced email detail — refresh mailbox like the unified list.
  const showEmailBoxRefresh = listContext === "communication";

  const messagesBusy = agentMail.messagesLoading;
  const reloadMail = agentMail.reload;
  // Stable actions node — inline JSX recreated every render and infinite-looped
  // chrome header registration (Application Not Responding).
  const breadcrumbActions = useMemo(
    () =>
      showEmailBoxRefresh ? (
        <div className="catalog-chrome-actions">
          <button
            type="button"
            className="catalog-chrome-actions__icon-button"
            aria-label="Refresh mailbox"
            title="Refresh mailbox"
            disabled={messagesBusy}
            onClick={() => {
              void reloadMail();
              if (inboxId && messageId) {
                void reloadMessageDetail(inboxId, messageId);
              } else if (inboxId && draftId) {
                void reloadMessageDetail(inboxId, draftId);
              }
            }}
          >
            <FinanceSyncIcon
              size={14}
              className={
                messagesBusy
                  ? "catalog-chrome-actions__sync-icon is-spinning"
                  : "catalog-chrome-actions__sync-icon"
              }
            />
          </button>
        </div>
      ) : null,
    [
      draftId,
      inboxId,
      messageId,
      messagesBusy,
      reloadMail,
      reloadMessageDetail,
      showEmailBoxRefresh,
    ],
  );

  useDesktopSectionBreadcrumb(breadcrumbItems, {
    enabled: breadcrumbItemsProp == null || breadcrumbItemsProp.length > 0,
    actions: breadcrumbActions,
  });

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
        recipientOptions={recipientOptions}
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
              params={{ tab: "integrations" }}
              search={{ open: "email" } as never}
            >
              Settings → Integrations
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
              onSaveDraft={() => {
                void saveConceptDraftBody(
                  draft.inboxId,
                  draft.draftId,
                  conceptBodyDraft,
                );
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
            entityLabel={emailDeleteEntityLabel(message.subject)}
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

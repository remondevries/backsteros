import type { EmailMailbox } from "@backsteros/ui";
import {
  EmailComposeChrome,
  EmailDraftActions,
  RegisterPageTitle,
} from "@backsteros/ui";

import { DesktopEmailComposeLayout } from "../../components/desktop-email-compose-layout";
import { emailComposeAgentTaskId } from "../../lib/agent/email-agent-prompt";
import { useAgentMail } from "../../lib/agentmail-context";
import { writeEmailComposeSession } from "../../lib/email-compose-session";

import type { useEmailDraftActions } from "./use-email-draft-actions";

type EmailComposeViewProps = {
  title: string;
  composeMailboxes: (EmailMailbox & { avatarSrc: string | null })[];
  mailboxSignOffAvatarSrc: (
    mailboxInboxId: string | null | undefined,
  ) => string | null;
  conceptDraftActionsDisabled: boolean;
  drafts: ReturnType<typeof useEmailDraftActions>;
};

export function EmailComposeView({
  title,
  composeMailboxes,
  mailboxSignOffAvatarSrc,
  conceptDraftActionsDisabled,
  drafts,
}: EmailComposeViewProps) {
  const agentMail = useAgentMail();
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
    composeSubject,
    setComposeSubject,
    composeDraft,
    composeLoading,
    saveComposeDraft,
    sendDraft,
    deleteDraft,
  } = drafts;

  const selectedMailbox =
    agentMail.mailboxes.find((mailbox) => mailbox.inboxId === composeInboxId) ??
    null;
  const composeContext = {
    fromEmail: selectedMailbox?.email ?? "",
    to: composeTo,
    subject: composeSubject,
  };
  return (
    <>
      <RegisterPageTitle title={title} />
      <div className="inbox-detail-layout inbox-detail-layout--compose">
        <DesktopEmailComposeLayout
          taskId={emailComposeAgentTaskId()}
          composeContext={composeContext}
          promptDisabled={conceptSaving || conceptBodySaving}
          promptContextLabel={
            conceptBodyMode === "edit" && composeDraft ? "Concept draft" : null
          }
          promptPlaceholder={
            conceptBodyMode === "edit" && composeDraft
              ? "Ask AI to update this draft…"
              : undefined
          }
          onAssistantTurnComplete={(text) => saveComposeDraft(text)}
        >
          {(slot) => (
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
                inboxId={composeInboxId}
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
                subject={composeSubject}
                onSubjectChange={setComposeSubject}
                body={conceptBodyDraft}
                bodyMode={conceptBodyMode}
                onBodyChange={composeDraft ? setConceptBodyDraft : undefined}
                replyGreeting={composeDraft?.greeting}
                replySignOff={composeDraft?.signOff}
                replySignOffAvatarSrc={mailboxSignOffAvatarSrc(composeInboxId)}
                fieldsDisabled={
                  conceptSaving || conceptBodySaving || slot.agentWorking
                }
                agentWorking={slot.agentWorking}
                composer={slot.agentPrompt}
                actions={
                  <EmailDraftActions
                    modeOnly={!composeDraft}
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
                    onDelete={
                      composeDraft
                        ? () => {
                            void deleteDraft(
                              composeDraft.inboxId,
                              composeDraft.draftId,
                            );
                          }
                        : undefined
                    }
                    sending={sending}
                    deleting={deleting}
                    disabled={
                      conceptDraftActionsDisabled || slot.agentWorking
                    }
                    bodyMode={conceptBodyMode}
                    onBodyModeChange={(mode) => {
                      void handleConceptBodyModeChange(mode);
                    }}
                    savingBody={conceptBodySaving}
                  />
                }
              />
            </div>
          )}
        </DesktopEmailComposeLayout>
      </div>
    </>
  );
}

import type { EmailMailbox } from "@backsteros/ui";
import {
  EmailComposeChrome,
  EmailDraftActions,
  RegisterPageTitle,
} from "@backsteros/ui";

import { DesktopEmailComposeLayout } from "../../components/desktop-email-compose-layout";
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
    sendDraft,
    deleteDraft,
  } = drafts;

  return (
    <>
      <RegisterPageTitle title={title} />
      <div className="inbox-detail-layout inbox-detail-layout--compose">
        <DesktopEmailComposeLayout>
          {() => (
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
                fieldsDisabled={conceptSaving || conceptBodySaving}
                agentWorking={false}
                composer={null}
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
          )}
        </DesktopEmailComposeLayout>
      </div>
    </>
  );
}

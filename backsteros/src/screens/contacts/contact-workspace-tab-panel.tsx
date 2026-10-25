import { memo, type ComponentProps } from "react";
import {
  ContactMeetingsListView,
  EntityCommunicationListView,
} from "@backsteros/ui";

type CommunicationListProps = ComponentProps<typeof EntityCommunicationListView>;

export type ContactWorkspaceTabPanelHandlers = {
  onSelectMeeting: (meetingId: string) => void;
  onSelectChat: (conversationId: string) => void;
  onSelectEmail: (emailId: string) => void;
  onSelectSupport: (supportId: string) => void;
};

/**
 * Meetings / Communication tabs of the expanded contact workspace. Memoized
 * so overlay fades and card edits don't re-render the lists; pass stable
 * handlers.
 */
export const ContactWorkspaceTabPanel = memo(function ContactWorkspaceTabPanel({
  tab,
  contactId,
  meetings,
  communication,
  contactAvatarSrc,
  handlers,
}: {
  tab: "meetings" | "emails";
  contactId: string;
  meetings: ComponentProps<typeof ContactMeetingsListView>["meetings"];
  communication: Pick<
    CommunicationListProps,
    "conversations" | "emails" | "supportTasks"
  >;
  contactAvatarSrc: Readonly<Record<string, string | null | undefined>>;
  handlers: ContactWorkspaceTabPanelHandlers;
}) {
  if (tab === "meetings") {
    return (
      <ContactMeetingsListView
        contactId={contactId}
        meetings={meetings}
        onSelectMeeting={handlers.onSelectMeeting}
      />
    );
  }
  return (
    <EntityCommunicationListView
      conversations={communication.conversations}
      emails={communication.emails}
      supportTasks={communication.supportTasks}
      resolveAvatarSrc={() => contactAvatarSrc[contactId] ?? null}
      resolveEmailAvatarSrc={(item) => {
        const itemContactId = item.contactId?.trim();
        if (itemContactId) return contactAvatarSrc[itemContactId] ?? null;
        return contactAvatarSrc[contactId] ?? null;
      }}
      onSelectChat={handlers.onSelectChat}
      onSelectEmail={handlers.onSelectEmail}
      onSelectSupport={handlers.onSelectSupport}
    />
  );
});

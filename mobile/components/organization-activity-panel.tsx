import type { CrmActivity } from "@backsteros/contracts";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native";

import { meetingDetailHref } from "../lib/detail-href";
import { ui } from "../lib/ui";
import { useCrmActivityFeed } from "../lib/use-crm-data";
import {
  CrmActivityFeed,
  type CrmActivityFeedItem,
} from "./crm-activity-feed";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";

type Props = {
  organizationId: string;
};

function mapItem(item: CrmActivity): CrmActivityFeedItem {
  if (item.kind === "meeting") {
    return {
      id: item.id,
      kind: "meeting",
      occurredAt: item.occurredAt,
      body: item.body,
      bodyPreview: item.bodyPreview,
      meetingId: item.meetingId,
      meetingTitle: item.meetingTitle,
    };
  }
  return {
    id: item.id,
    kind: "note",
    occurredAt: item.occurredAt,
    body: item.body,
    bodyPreview: item.bodyPreview,
  };
}

/** Organization Activity tab — CRM notes + meetings (desktop chrome). */
export function OrganizationActivityPanel({ organizationId }: Props) {
  const router = useRouter();
  const { items, nextCursor, loading, error, loadMore, submitNote } =
    useCrmActivityFeed(
      "organization",
      organizationId,
      Boolean(organizationId),
    );

  return (
    <KeyboardAwareScrollView
      style={ui.screen}
      contentContainerStyle={styles.content}
      keepEndVisibleWhileTyping
    >
      <CrmActivityFeed
        items={items.map(mapItem)}
        loading={loading}
        error={error}
        nextCursor={nextCursor}
        onLoadMore={loadMore}
        onSubmitNote={submitNote}
        onCreateTask={() => {
          router.push("/create/task");
        }}
        onCreateMeeting={() => {
          router.push("/create/meeting");
        }}
        onCreateLetter={() => {
          router.push("/create/letter");
        }}
        onOpenMeeting={(meetingId) => {
          router.push(meetingDetailHref(meetingId));
        }}
      />
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 4,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
});

import type { AgentMailMessageAttachment } from "@backsteros/contracts";
import { useCallback } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";

import type { EmailMessageSourceDetail } from "../lib/email-message-source";
import type { EmailThreadBodyViewMode } from "../lib/email-thread-body-view-mode";
import type { EmailThreadPartyAvatar } from "../lib/email-thread-message-presentation";
import { formatRelativeTime } from "../lib/task-activity-format";
import { colors } from "../lib/theme";
import { ContactAvatarIcon } from "./contact-avatar-icon";
import {
  EmailMessageBodyView,
  type EmailBodySource,
} from "./email-message-body-view";
import { MoreHorizontalIcon } from "./more-horizontal-icon";

const DIRECTION_ARROW_PATHS = {
  received:
    "M11.78 4.22a.75.75 0 0 1 0 1.06l-5.26 5.26h4.2a.75.75 0 0 1 0 1.5H4.71a.75.75 0 0 1-.75-.75V5.28a.75.75 0 0 1 1.5 0v4.2l5.26-5.26a.75.75 0 0 1 1.06 0Z",
  sent: "M4.53 4.75A.75.75 0 0 1 5.28 4h6.01a.75.75 0 0 1 .75.75v6.01a.75.75 0 0 1-1.5 0v-4.2l-5.26 5.261a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L9.48 5.5h-4.2a.75.75 0 0 1-.75-.75Z",
} as const;

function DirectionArrowIcon({
  direction,
  size = 9,
  color = colors.foreground,
}: {
  direction: "sent" | "received";
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
      <Path d={DIRECTION_ARROW_PATHS[direction]} />
    </Svg>
  );
}

function ReplyIcon({ size = 16, color = colors.foreground }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M6.75 3.5 3 7.25l3.75 3.75M3 7.25h6.25A3.75 3.75 0 0 1 13 11v1.5"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

type MenuAction = {
  key: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export type EmailThreadMessageCardProps = {
  messageId: string;
  subject: string;
  from: string;
  to: string[];
  timestamp: string;
  message: EmailBodySource;
  viewMode: EmailThreadBodyViewMode;
  loadSource: () => Promise<EmailMessageSourceDetail>;
  isSent?: boolean;
  partyAvatar: EmailThreadPartyAvatar;
  fromLabel: string;
  fromEmail?: string | null;
  toLabel: string;
  attachments?: AgentMailMessageAttachment[];
  downloadingAttachmentId?: string | null;
  onOpenAttachment?: (attachment: AgentMailMessageAttachment) => void;
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  onCopyText?: () => void;
  onDelete?: () => void;
  onMarkUnreadFromHere?: () => void;
  onReportSpam?: () => void;
  onDownloadMessage?: () => void;
  onMessageInfo?: () => void;
  actionsDisabled?: boolean;
};

function PartyAvatar({ party }: { party: EmailThreadPartyAvatar }) {
  const dotColor =
    party.direction === "sent" ? "rgba(59, 130, 246, 0.95)" : "rgba(34, 197, 94, 0.95)";
  return (
    <View
      accessibilityLabel={
        party.direction === "sent"
          ? `Sent by ${party.label}`
          : `Received from ${party.label}`
      }
      style={styles.avatarWrap}
    >
      <View style={styles.avatarCircle}>
        <ContactAvatarIcon src={party.src} size={38} />
      </View>
      <View style={[styles.directionDot, { backgroundColor: dotColor }]}>
        <DirectionArrowIcon direction={party.direction} size={8} color="#fff" />
      </View>
    </View>
  );
}

function HeaderEndControls({
  timestamp,
  onReply,
  onOpenMenu,
  actionsDisabled,
}: {
  timestamp: string;
  onReply?: () => void;
  onOpenMenu: () => void;
  actionsDisabled?: boolean;
}) {
  return (
    <View style={styles.headerEnd}>
      <Text style={styles.headerDate}>{formatRelativeTime(timestamp)}</Text>
      {onReply ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reply"
          disabled={actionsDisabled}
          hitSlop={8}
          onPress={onReply}
          style={({ pressed }) => [
            styles.headerIconHit,
            pressed ? styles.headerIconPressed : null,
            actionsDisabled ? styles.headerIconDisabled : null,
          ]}
        >
          <ReplyIcon />
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Email message actions"
        disabled={actionsDisabled}
        hitSlop={8}
        onPress={onOpenMenu}
        style={({ pressed }) => [
          styles.headerIconHit,
          pressed ? styles.headerIconPressed : null,
          actionsDisabled ? styles.headerIconDisabled : null,
        ]}
      >
        <MoreHorizontalIcon size={16} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

/**
 * Single email message card — desktop `EmailThreadMessageCard` parity:
 * party avatar, direction dot, compact/route headers, reply + ⋯ actions.
 */
export function EmailThreadMessageCard({
  timestamp,
  message,
  viewMode,
  loadSource,
  isSent = false,
  partyAvatar,
  fromLabel,
  fromEmail = null,
  toLabel,
  attachments = [],
  downloadingAttachmentId = null,
  onOpenAttachment,
  onReply,
  onReplyAll,
  onForward,
  onCopyText,
  onDelete,
  onMarkUnreadFromHere,
  onReportSpam,
  onDownloadMessage,
  onMessageInfo,
  actionsDisabled = false,
}: EmailThreadMessageCardProps) {
  const showCompactHeader = viewMode === "rendered";

  const openMenu = useCallback(() => {
    const actions: MenuAction[] = [];
    if (onReply) {
      actions.push({ key: "reply", label: "Reply", onPress: onReply });
    }
    if (onReplyAll) {
      actions.push({ key: "reply-all", label: "Reply all", onPress: onReplyAll });
    }
    if (onForward) {
      actions.push({ key: "forward", label: "Forward", onPress: onForward });
    }
    if (onCopyText) {
      actions.push({
        key: "copy",
        label: "Copy message text",
        onPress: onCopyText,
      });
    }
    if (onDelete) {
      actions.push({
        key: "delete",
        label: "Move to Trash",
        destructive: true,
        onPress: onDelete,
      });
    }
    if (onMarkUnreadFromHere) {
      actions.push({
        key: "unread",
        label: "Mark unread from here",
        onPress: onMarkUnreadFromHere,
      });
    }
    if (onReportSpam) {
      actions.push({
        key: "spam",
        label: "Report spam",
        destructive: true,
        onPress: onReportSpam,
      });
    }
    if (onDownloadMessage) {
      actions.push({
        key: "download",
        label: "Download message",
        onPress: onDownloadMessage,
      });
    }
    if (onMessageInfo) {
      actions.push({
        key: "info",
        label: "Message info",
        onPress: onMessageInfo,
      });
    }
    if (actions.length === 0) return;

    const options = [...actions.map((action) => action.label), "Cancel"];
    const cancelButtonIndex = options.length - 1;
    const destructiveButtonIndex = actions.findIndex((action) => action.destructive);

    const onSelect = (index: number) => {
      if (index < 0 || index >= actions.length) return;
      actions[index]?.onPress();
    };

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
          destructiveButtonIndex:
            destructiveButtonIndex >= 0 ? destructiveButtonIndex : undefined,
          disabledButtonIndices: actionsDisabled
            ? actions.map((_, index) => index)
            : undefined,
        },
        onSelect,
      );
      return;
    }

    Alert.alert(
      "Message actions",
      undefined,
      [
        ...actions.map((action) => ({
          text: action.label,
          style: action.destructive ? ("destructive" as const) : ("default" as const),
          onPress: action.onPress,
        })),
        { text: "Cancel", style: "cancel" },
      ],
    );
  }, [
    actionsDisabled,
    onCopyText,
    onDelete,
    onDownloadMessage,
    onForward,
    onMarkUnreadFromHere,
    onMessageInfo,
    onReply,
    onReplyAll,
    onReportSpam,
  ]);

  const headerEnd = (
    <HeaderEndControls
      timestamp={timestamp}
      onReply={onReply}
      onOpenMenu={openMenu}
      actionsDisabled={actionsDisabled}
    />
  );

  return (
    <View
      style={[styles.card, isSent ? styles.cardSent : null]}
      accessibilityLabel={`Email from ${fromLabel}`}
    >
      {showCompactHeader ? (
        <View style={styles.compactHeader}>
          <PartyAvatar party={partyAvatar} />
          <View style={styles.compactIdentity}>
            <View style={styles.compactFromRow}>
              <Text style={styles.compactFromName} numberOfLines={1}>
                {fromLabel}
              </Text>
              {fromEmail && fromEmail !== fromLabel ? (
                <Text style={styles.compactFromEmail} numberOfLines={1}>
                  {`<${fromEmail}>`}
                </Text>
              ) : null}
            </View>
            <View style={styles.compactToRow}>
              <Text style={styles.compactToPrefix}>to</Text>
              <Text style={styles.compactToValue} numberOfLines={1}>
                {toLabel}
              </Text>
            </View>
          </View>
          {headerEnd}
        </View>
      ) : (
        <View style={styles.routeHeader}>
          <View style={styles.routeMain}>
            <View
              style={[
                styles.routeDirection,
                partyAvatar.direction === "sent"
                  ? styles.routeDirectionSent
                  : styles.routeDirectionReceived,
              ]}
            >
              <DirectionArrowIcon direction={partyAvatar.direction} size={12} />
            </View>
            <Text style={styles.routeText} numberOfLines={2}>
              <Text style={styles.routeFrom}>{fromLabel}</Text>
              <Text style={styles.routeArrow}> → </Text>
              <Text style={styles.routeTo}>{toLabel}</Text>
            </Text>
          </View>
          {headerEnd}
        </View>
      )}

      <View style={styles.body}>
        <EmailMessageBodyView
          message={message}
          viewMode={viewMode}
          loadSource={loadSource}
        />
      </View>

      {attachments.length > 0 ? (
        <View style={styles.attachmentRow}>
          {attachments.map((attachment) => (
            <Pressable
              key={attachment.attachmentId}
              accessibilityRole="button"
              accessibilityLabel={`Open attachment ${attachment.filename ?? attachment.attachmentId}`}
              onPress={() => onOpenAttachment?.(attachment)}
              style={({ pressed }) => [
                styles.attachmentChip,
                pressed ? { opacity: 0.7 } : null,
              ]}
            >
              {downloadingAttachmentId === attachment.attachmentId ? (
                <ActivityIndicator color={colors.muted} size="small" />
              ) : null}
              <Text style={styles.attachmentName} numberOfLines={1}>
                {attachment.filename?.trim() || attachment.attachmentId}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    gap: 10,
  },
  cardSent: {
    backgroundColor: "rgba(37, 99, 235, 0.08)",
    borderColor: "rgba(59, 130, 246, 0.22)",
  },
  compactHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  avatarWrap: {
    width: 42,
    height: 42,
    flexShrink: 0,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  directionDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  compactIdentity: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingTop: 2,
  },
  compactFromRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 4,
    minWidth: 0,
  },
  compactFromName: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
  },
  compactFromEmail: {
    color: colors.muted,
    fontSize: 12,
    flexShrink: 1,
  },
  compactToRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
  },
  compactToPrefix: {
    color: colors.muted,
    fontSize: 12,
  },
  compactToValue: {
    color: colors.muted,
    fontSize: 12,
    flexShrink: 1,
  },
  routeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  routeMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    minWidth: 0,
  },
  routeDirection: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  routeDirectionSent: {
    backgroundColor: "rgba(59, 130, 246, 0.18)",
  },
  routeDirectionReceived: {
    backgroundColor: "rgba(34, 197, 94, 0.18)",
  },
  routeText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
  },
  routeFrom: {
    color: colors.foreground,
    fontWeight: "600",
  },
  routeArrow: {
    color: colors.muted,
  },
  routeTo: {
    color: colors.muted,
  },
  headerEnd: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
    marginTop: 1,
  },
  headerDate: {
    color: colors.muted,
    fontSize: 12,
    marginRight: 2,
    maxWidth: 72,
  },
  headerIconHit: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  headerIconPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.07)",
  },
  headerIconDisabled: {
    opacity: 0.45,
  },
  body: {
    paddingTop: 2,
  },
  attachmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  attachmentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 240,
  },
  attachmentName: {
    color: colors.foreground,
    fontSize: 13,
  },
});

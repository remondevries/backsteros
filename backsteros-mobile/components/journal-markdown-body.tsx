import { Text, View } from "react-native";

import {
  projectDetailHref,
  taskDetailHref,
} from "../lib/detail-href";
import {
  resolveMentionChip,
  useMentionCatalogForBody,
  type MobileMentionCatalog,
} from "../lib/mention-catalog";
import {
  mentionTokenLabel,
  segmentMarkdownWithMentions,
  splitMarkdownParagraphs,
  type MentionSegment,
  type ParsedMentionToken,
} from "../lib/mention-tokens";
import { colors } from "../lib/theme";
import { MentionChip } from "./mention-chip";

type Props = {
  body: string;
};

function MentionSegmentView({
  token,
  catalog,
}: {
  token: ParsedMentionToken;
  catalog: MobileMentionCatalog;
}) {
  const resolved = resolveMentionChip(token, catalog);

  const href =
    resolved.taskId && !resolved.deleted
      ? taskDetailHref(resolved.taskId)
      : resolved.projectId && !resolved.deleted
        ? projectDetailHref(resolved.projectId)
        : undefined;

  return (
    <MentionChip
      token={token}
      label={resolved.label || mentionTokenLabel(token)}
      deleted={resolved.deleted}
      status={resolved.status}
      href={href}
    />
  );
}

const BODY_FONT_SIZE = 15;
const BODY_LINE_HEIGHT = 22;

function BlankParagraph() {
  return (
    <Text
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        color: colors.foreground,
        fontSize: BODY_FONT_SIZE,
        lineHeight: BODY_LINE_HEIGHT,
      }}
    >
      {" "}
    </Text>
  );
}

function ParagraphWithMentions({
  paragraph,
  catalog,
}: {
  paragraph: string;
  catalog: MobileMentionCatalog;
}) {
  const segments = segmentMarkdownWithMentions(paragraph);
  const hasMentions = segments.some((segment) => segment.type === "mention");

  if (!hasMentions) {
    return (
      <Text
        style={{
          color: colors.foreground,
          fontSize: BODY_FONT_SIZE,
          lineHeight: BODY_LINE_HEIGHT,
        }}
      >
        {paragraph}
      </Text>
    );
  }

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: 2,
        rowGap: 6,
      }}
    >
      {segments.map((segment, index) => (
        <SegmentView
          key={`${segment.type}-${index}`}
          segment={segment}
          catalog={catalog}
        />
      ))}
    </View>
  );
}

function SegmentView({
  segment,
  catalog,
}: {
  segment: MentionSegment;
  catalog: MobileMentionCatalog;
}) {
  if (segment.type === "mention") {
    return <MentionSegmentView token={segment.token} catalog={catalog} />;
  }

  if (!segment.content) return null;

  return (
    <Text
      style={{
        color: colors.foreground,
        fontSize: BODY_FONT_SIZE,
        lineHeight: BODY_LINE_HEIGHT,
      }}
    >
      {segment.content}
    </Text>
  );
}

/** Journal body with desktop-style `[@task:…]` / `[@project:…]` chips. */
export function JournalMarkdownBody({ body }: Props) {
  const catalog = useMentionCatalogForBody(body);
  const paragraphs = splitMarkdownParagraphs(body);

  return (
    <View>
      {paragraphs.map((paragraph, index) =>
        paragraph.trim() === "" ? (
          <BlankParagraph key={`blank-${index}`} />
        ) : (
          <ParagraphWithMentions
            key={`p-${index}`}
            paragraph={paragraph}
            catalog={catalog}
          />
        ),
      )}
    </View>
  );
}

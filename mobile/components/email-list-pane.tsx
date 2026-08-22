import { usePathname, useRouter } from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  Text,
  View,
  type SectionListData,
} from "react-native";

import { useAgentMail } from "../lib/agentmail-context";
import { isPadDevice } from "../lib/device";
import { formatEmailDisplayId } from "../lib/email-display-id";
import {
  emailPartyLabel,
  groupEmailItemsByStatus,
  resolveInboxEmailIconColor,
  type EmailListItem,
} from "../lib/email-list";
import { findSectionListLocation } from "../lib/list-keyboard-nav";
import { matchesListSearch } from "../lib/list-search";
import { getTaskStatusHeaderGradient } from "../lib/status-header-gradient";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { formatRelativeTime } from "../lib/task-activity-format";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { normalizePathname } from "../lib/use-escape-back-navigation";
import { useListJkNavigation } from "../lib/use-list-jk-navigation";
import { usePullToRevealSearch } from "../lib/use-pull-to-reveal-search";
import { ContentPageTitle } from "./content-page-title";
import { EmailNavIcon } from "./nav-icons";
import { ListSearchField } from "./list-search-field";
import {
  StatusGroupHeader,
  statusGroupEmptySectionFooter,
} from "./status-group-header";
import { TaskStatusIcon } from "./task-status-icon";

type Section = {
  title: string;
  status: string;
  data: EmailListItem[];
};

/** `/email/<inboxId>/<messageId>` → messageId / null. */
export function emailSelectedMessageIdFromPathname(
  pathname: string,
): string | null {
  const normalized = normalizePathname(pathname);
  const match = normalized.match(/^\/email\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  const segment = match[2];
  if (!segment || segment === "compose") return null;
  return decodeURIComponent(segment);
}

type Props = {
  /** Master-detail selection highlight (iPad). */
  selectedMessageId?: string | null;
  /** iPad split: open the first email if none is selected. */
  autoSelectFirst?: boolean;
  /** Phone: in-content scrolling title (not sticky stack header). */
  pageTitle?: string;
  pageTitleTrailing?: ReactNode;
  pageTitleSafeArea?: boolean;
};

/**
 * Email list — shared by phone full-screen and iPad left pane. Grouped by
 * task status like the desktop email side panel; one row per thread.
 */
export function EmailListPane({
  selectedMessageId = null,
  autoSelectFirst = false,
  pageTitle,
  pageTitleTrailing,
  pageTitleSafeArea = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const isPad = isPadDevice();
  const { messages, apiKeyConfigured, loading, reload } = useAgentMail();
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const search = usePullToRevealSearch({ suppress: pullRefreshing });

  const pathSelectedId =
    selectedMessageId ?? emailSelectedMessageIdFromPathname(pathname);

  const rows = useMemo(
    () =>
      messages.filter((item) =>
        matchesListSearch(
          search.query,
          item.subject,
          item.from,
          item.contactName ?? null,
          item.number != null ? formatEmailDisplayId(item.number) : null,
        ),
      ),
    [messages, search.query],
  );

  const sections = useMemo<Section[]>(
    () =>
      groupEmailItemsByStatus(rows).map((group) => ({
        title: group.label,
        status: group.status,
        data: group.items,
      })),
    [rows],
  );

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggleStatus = useCallback((status: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const visibleSections = useMemo(
    () =>
      sections.map((section) =>
        collapsed.has(section.status)
          ? { ...section, data: [] as EmailListItem[] }
          : section,
      ),
    [collapsed, sections],
  );

  const onPressRow = useCallback(
    (row: EmailListItem) => {
      const href =
        `/(app)/email/${encodeURIComponent(row.inboxId)}/${encodeURIComponent(row.id)}` as const;
      if (isPad) {
        router.replace(href);
        return;
      }
      router.push(href);
    },
    [isPad, router],
  );

  useEffect(() => {
    if (!autoSelectFirst || !isPad) return;
    if (loading) return;
    if (pathSelectedId) return;
    const normalized = normalizePathname(pathname);
    if (normalized !== "/email") return;
    const first = sections[0]?.data[0];
    if (!first) return;
    router.replace(
      `/(app)/email/${encodeURIComponent(first.inboxId)}/${encodeURIComponent(first.id)}`,
    );
  }, [
    autoSelectFirst,
    isPad,
    loading,
    pathSelectedId,
    pathname,
    router,
    sections,
  ]);

  const listRef = useRef<SectionList<EmailListItem, Section>>(null);
  const itemIds = useMemo(
    () =>
      visibleSections.flatMap((section) => section.data.map((row) => row.id)),
    [visibleSections],
  );
  const { highlightedId } = useListJkNavigation({
    itemIds,
    onActivate: (id) => {
      const row = rows.find((entry) => entry.id === id);
      if (row) onPressRow(row);
    },
    onHighlightChange: (id) => {
      if (!id || !listRef.current) return;
      const location = findSectionListLocation(visibleSections, id);
      if (!location) return;
      try {
        listRef.current.scrollToLocation({
          ...location,
          animated: true,
          viewPosition: 0.35,
        });
      } catch {
        // Ignore before layout.
      }
    },
  });

  if (loading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (!apiKeyConfigured) {
    return (
      <View style={ui.centered}>
        <Text style={ui.empty}>
          AgentMail is not configured. Add the API key in desktop Settings →
          Email.
        </Text>
      </View>
    );
  }

  return (
    <View style={ui.screen}>
      {search.visible ? (
        <ListSearchField
          ref={search.inputRef}
          value={search.query}
          onChangeText={search.setQuery}
          onBlur={search.closeIfEmpty}
          autoFocus
          placeholder="Search email"
        />
      ) : null}
      <SectionList
        ref={listRef}
        style={ui.screen}
        sections={visibleSections as SectionListData<EmailListItem, Section>[]}
        keyExtractor={(item) => `${item.inboxId}:${item.id}`}
        stickySectionHeadersEnabled={isPad}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        alwaysBounceVertical
        onScroll={search.onScroll}
        onScrollEndDrag={search.onScrollEndDrag}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={() => {
              setPullRefreshing(true);
              void reload().finally(() => setPullRefreshing(false));
            }}
            tintColor={colors.muted}
            colors={[colors.muted]}
          />
        }
        contentContainerStyle={{
          paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
        }}
        ListHeaderComponent={
          pageTitle ? (
            <ContentPageTitle
              title={pageTitle}
              trailing={pageTitleTrailing}
              includeTopSafeArea={pageTitleSafeArea}
            />
          ) : null
        }
        ListEmptyComponent={
          <Text style={ui.empty}>
            {search.query.trim() ? "No matching emails." : "No emails yet."}
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <StatusGroupHeader
            title={section.title}
            icon={<TaskStatusIcon status={section.status} size={14} />}
            gradient={getTaskStatusHeaderGradient(section.status)}
            collapsed={collapsed.has(section.status)}
            onToggle={() => toggleStatus(section.status)}
          />
        )}
        renderSectionFooter={({ section }) =>
          statusGroupEmptySectionFooter(visibleSections, section)
        }
        renderItem={({ item }) => {
          const title = item.subject?.trim() || "(no subject)";
          const displayId =
            item.displayId ??
            (item.number != null ? formatEmailDisplayId(item.number) : null);
          const party = item.contactName?.trim() || emailPartyLabel(item.from);
          const when = item.receivedAt
            ? formatRelativeTime(new Date(item.receivedAt).toISOString())
            : "";
          const highlighted = highlightedId === item.id;
          const selected = pathSelectedId === item.id;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={title}
              accessibilityState={{ selected }}
              onPress={() => onPressRow(item)}
              style={({ pressed }) => [
                ui.row,
                selected ? ui.listRowSelected : null,
                highlighted ? ui.keyboardNavHighlight : null,
                pressed ? { backgroundColor: colors.rowPressed } : null,
              ]}
            >
              <View style={ui.rowIcon}>
                <EmailNavIcon
                  size={15}
                  color={resolveInboxEmailIconColor(
                    typeof item.status === "string" ? item.status : null,
                  )}
                />
              </View>
              <View style={ui.rowBody}>
                <View style={ui.rowTitleLine}>
                  {displayId ? <Text style={ui.rowId}>{displayId}</Text> : null}
                  <Text style={ui.rowTitle} numberOfLines={1}>
                    {title}
                  </Text>
                </View>
                <View style={ui.rowTitleLine}>
                  <Text style={ui.rowMeta} numberOfLines={1}>
                    {party}
                    {when ? `  ·  ${when}` : ""}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

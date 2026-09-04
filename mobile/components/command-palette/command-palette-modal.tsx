import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  COMMAND_PALETTE_RESULT_SECTIONS,
  mapGlobalSearchResults,
  type CommandPaletteHit,
} from "../../lib/command-palette-search";
import { GO_NAVIGATION_ITEMS } from "../../lib/go-navigation";
import { useCommandPalette } from "../../lib/use-command-palette";
import { colors, spacing } from "../../lib/theme";
import { useMobileApiClient } from "../../lib/use-mobile-api-client";
import { TextInput } from "../app-text-input";

type Props = {
  visible: boolean;
  onClose: () => void;
};

type Destination = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

const EMPTY_DESTINATIONS: readonly Destination[] = [
  { id: "inbox", title: "Inbox", subtitle: "G I", href: "/inbox" },
  { id: "email", title: "Email", subtitle: "G E", href: "/email" },
  { id: "tasks", title: "Tasks", subtitle: "G T", href: "/tasks" },
  { id: "calendar", title: "Calendar", subtitle: "G M", href: "/calendar" },
  { id: "contacts", title: "Contacts", subtitle: "G C", href: "/contacts" },
  { id: "social", title: "Social", subtitle: "Social accounts", href: "/social" },
  {
    id: "organizations",
    title: "Organizations",
    subtitle: "G O",
    href: "/organizations",
  },
  { id: "projects", title: "Projects", subtitle: "G P", href: "/projects" },
  { id: "compose", title: "Compose", subtitle: "Create task or document", href: "/compose" },
  ...GO_NAVIGATION_ITEMS.filter(
    (item) =>
      !["inbox", "email", "tasks", "calendar", "contacts", "organizations", "projects"].includes(
        item.id,
      ),
  ).map((item) => ({
    id: item.id,
    title: item.label,
    subtitle: `G ${item.letter.toUpperCase()}`,
    href: item.href,
  })),
];

export function CommandPaletteModal({ visible, onClose }: Props) {
  const router = useRouter();
  const client = useMobileApiClient();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CommandPaletteHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setHits([]);
      setError(null);
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      void client
        .requestJson<{ results: Parameters<typeof mapGlobalSearchResults>[0] }>(
          `/api/v1/global-search?${new URLSearchParams({
            q: trimmed,
            limit: "20",
          }).toString()}`,
        )
        .then((body) => {
          if (cancelled) return;
          setHits(mapGlobalSearchResults(body.results ?? []));
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Search failed.");
          setHits([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, query, visible]);

  const sections = useMemo(() => {
    const grouped = new Map<string, CommandPaletteHit[]>();
    for (const section of COMMAND_PALETTE_RESULT_SECTIONS) {
      grouped.set(section, []);
    }
    for (const hit of hits) {
      grouped.get(hit.section)?.push(hit);
    }
    return COMMAND_PALETTE_RESULT_SECTIONS.map((title) => ({
      title,
      data: grouped.get(title) ?? [],
    })).filter((section) => section.data.length > 0);
  }, [hits]);

  const filteredDestinations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length >= 2) return [];
    if (!q) return EMPTY_DESTINATIONS;
    return EMPTY_DESTINATIONS.filter(
      (entry) =>
        entry.title.toLowerCase().includes(q) ||
        entry.subtitle.toLowerCase().includes(q),
    );
  }, [query]);

  const openHit = useCallback(
    (hit: CommandPaletteHit) => {
      onClose();
      router.push(hit.href as never);
    },
    [onClose, router],
  );

  const openDestination = useCallback(
    (href: string) => {
      onClose();
      router.push(href as never);
    },
    [onClose, router],
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { marginTop: insets.top + 24, marginBottom: insets.bottom + 24 },
          ]}
          onPress={(event) => event.stopPropagation()}
        >
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search or jump to…"
            autoFocus
            style={styles.input}
          />
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.muted} />
            </View>
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : query.trim().length < 2 ? (
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={styles.list}>
              <Text style={styles.sectionHeader}>Go</Text>
              {filteredDestinations.map((entry) => (
                <Pressable
                  key={entry.id}
                  accessibilityRole="button"
                  onPress={() => openDestination(entry.href)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed ? styles.rowPressed : null,
                  ]}
                >
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {entry.title}
                  </Text>
                  <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {entry.subtitle}
                  </Text>
                </Pressable>
              ))}
              <Text style={[styles.hint, { marginTop: 12 }]}>
                Type 2+ characters to search the workspace.
              </Text>
            </ScrollView>
          ) : sections.length === 0 ? (
            <Text style={styles.hint}>No results.</Text>
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item) => `${item.type}:${item.id}`}
              renderSectionHeader={({ section }) => (
                <Text style={styles.sectionHeader}>{section.title}</Text>
              )}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openHit(item)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed ? styles.rowPressed : null,
                  ]}
                >
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {item.subtitle ? (
                    <Text style={styles.rowSubtitle} numberOfLines={2}>
                      {item.subtitle}
                    </Text>
                  ) : null}
                </Pressable>
              )}
              contentContainerStyle={styles.list}
              style={{ maxHeight: 420 }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function CommandPaletteHost() {
  const { open, closePalette } = useCommandPalette();
  return <CommandPaletteModal visible={open} onClose={closePalette} />;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: spacing.screenX,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  input: {
    color: colors.foreground,
    fontSize: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  centered: {
    paddingVertical: 24,
    alignItems: "center",
  },
  hint: {
    color: colors.muted,
    fontSize: 14,
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  error: {
    color: "#da615d",
    fontSize: 14,
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  list: {
    paddingBottom: 8,
  },
  sectionHeader: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 4,
  },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 2,
  },
  rowPressed: {
    backgroundColor: colors.rowPressed,
  },
  rowTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
  rowSubtitle: {
    color: colors.muted,
    fontSize: 13,
  },
});

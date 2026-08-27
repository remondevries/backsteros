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
import { useCommandPalette } from "../../lib/use-command-palette";
import { colors, spacing } from "../../lib/theme";
import { useMobileApiClient } from "../../lib/use-mobile-api-client";
import { TextInput } from "../app-text-input";

type Props = {
  visible: boolean;
  onClose: () => void;
};

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

  const openHit = useCallback(
    (hit: CommandPaletteHit) => {
      onClose();
      router.push(hit.href as never);
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
            placeholder="Search projects, tasks, contacts…"
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
            <Text style={styles.hint}>Type at least 2 characters to search.</Text>
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

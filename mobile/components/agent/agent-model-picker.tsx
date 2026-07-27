import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";

import {
  formatAgentModelTriggerLabel,
  hydrateAgentChatModelId,
  readAgentChatModelIdCached,
  writeAgentChatModelId,
  type AgentChatModelOption,
} from "../../lib/agent/agent-chat-model";
import {
  fetchAgentPtyConnection,
  listCursorAgentModels,
} from "../../lib/agent/agent-pty";
import { colors } from "../../lib/theme";
import { useMobileApiClient } from "../../lib/use-mobile-api-client";

type Props = {
  disabled?: boolean;
  onModelChange?: (modelId: string) => void;
};

function ChevronIcon() {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
      <Path
        d="M3 4.5 6 7.5 9 4.5"
        stroke="#a3a3a3"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function AgentModelPicker({
  disabled = false,
  onModelChange,
}: Props) {
  const client = useMobileApiClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<AgentChatModelOption[]>([
    { id: "auto", displayName: "Auto" },
  ]);
  const [selectedId, setSelectedId] = useState(() =>
    readAgentChatModelIdCached(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void hydrateAgentChatModelId().then(setSelectedId);
  }, []);

  const selected = useMemo(
    () => models.find((m) => m.id === selectedId) ?? null,
    [models, selectedId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.displayName.toLowerCase().includes(q),
    );
  }, [models, query]);

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const discovered = await fetchAgentPtyConnection(client);
      if (!discovered.ok) {
        setError(discovered.error);
        return;
      }
      const result = await listCursorAgentModels(discovered.connection);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setModels(result.models);
      const current = readAgentChatModelIdCached();
      if (!result.models.some((m) => m.id === current)) {
        await writeAgentChatModelId("auto");
        setSelectedId("auto");
      }
    } finally {
      setLoading(false);
    }
  }, [client]);

  const openSheet = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    void loadModels();
  }, [disabled, loadModels]);

  const triggerLabel = formatAgentModelTriggerLabel(selected, selectedId);

  return (
    <View style={styles.root}>
      <Pressable
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Model: ${triggerLabel}`}
        onPress={openSheet}
        style={({ pressed }) => [
          styles.trigger,
          disabled ? styles.triggerDisabled : null,
          pressed && !disabled ? styles.triggerPressed : null,
        ]}
      >
        <Text style={styles.triggerLabel} numberOfLines={1}>
          {triggerLabel}
        </Text>
        <View style={styles.chevron}>
          <ChevronIcon />
        </View>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setOpen(false);
          setQuery("");
        }}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            setOpen(false);
            setQuery("");
          }}
        >
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Model</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search models…"
              placeholderTextColor="rgba(163,163,163,0.85)"
              style={styles.search}
              autoFocus
            />
            {loading && models.length <= 1 ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.muted} />
              </View>
            ) : null}
            {error && filtered.length === 0 ? (
              <Text style={styles.empty}>{error}</Text>
            ) : null}
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {!loading && !error && filtered.length === 0 ? (
                <Text style={styles.empty}>No models found</Text>
              ) : null}
              {filtered.map((model) => {
                const active = model.id === selectedId;
                return (
                  <Pressable
                    key={model.id}
                    onPress={() => {
                      void writeAgentChatModelId(model.id);
                      setSelectedId(model.id);
                      setOpen(false);
                      setQuery("");
                      onModelChange?.(model.id);
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      active ? styles.optionSelected : null,
                      pressed ? styles.optionPressed : null,
                    ]}
                  >
                    <Text style={styles.optionName}>
                      {formatAgentModelTriggerLabel(model)}
                    </Text>
                    <Text style={styles.optionId} numberOfLines={1}>
                      {model.id}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexShrink: 1,
    maxWidth: 180,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingLeft: 10,
    paddingRight: 8,
    borderRadius: 999,
  },
  triggerPressed: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  triggerDisabled: {
    opacity: 0.45,
  },
  triggerLabel: {
    flexShrink: 1,
    color: "rgba(163,163,163,0.95)",
    fontSize: 12,
    fontWeight: "500",
  },
  chevron: {
    opacity: 0.6,
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
    padding: 16,
  },
  sheet: {
    maxHeight: "70%",
    borderRadius: 16,
    backgroundColor: "#12141a",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    paddingTop: 14,
    paddingBottom: 10,
    overflow: "hidden",
  },
  sheetTitle: {
    paddingHorizontal: 14,
    marginBottom: 8,
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
  },
  search: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    color: "#f7f9ff",
    fontSize: 14,
  },
  list: {
    paddingHorizontal: 6,
  },
  loading: {
    paddingVertical: 16,
    alignItems: "center",
  },
  empty: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
  },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 8,
    gap: 2,
  },
  optionSelected: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  optionPressed: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  optionName: {
    color: "#f7f9ff",
    fontSize: 13,
    fontWeight: "600",
  },
  optionId: {
    color: "rgba(163,163,163,0.8)",
    fontSize: 11,
  },
});

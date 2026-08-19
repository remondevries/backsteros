import { useState, type ReactNode } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  AGENT_CHAT_MODE_OPTIONS,
  getAgentChatModeOption,
  type AgentChatMode,
  type AgentChatModeOption,
} from "../../lib/agent/agent-chat-mode";
import { colors } from "../../lib/theme";
import {
  AgentAskIcon,
  AgentBuildIcon,
  AgentPlanIcon,
} from "./agent-composer-icons";

/** Desktop `.desktop-agent-chat__mode-label.is-*` colors. */
export const AGENT_MODE_COLORS = {
  green: "rgba(74, 222, 128, 0.98)",
  yellow: "rgba(250, 204, 21, 0.98)",
  blue: "rgba(56, 189, 248, 0.98)",
} as const;

type Props = {
  mode: AgentChatMode;
  onChange: (mode: AgentChatMode) => void;
  disabled?: boolean;
};

function ModeIcon({
  option,
  color,
}: {
  option: AgentChatModeOption;
  color: string;
}): ReactNode {
  switch (option.id) {
    case "build":
      return <AgentBuildIcon color={color} />;
    case "plan":
      return <AgentPlanIcon color={color} />;
    case "ask":
      return <AgentAskIcon color={color} />;
  }
}

export function AgentModePicker({ mode, onChange, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const current = getAgentChatModeOption(mode);
  const accent = AGENT_MODE_COLORS[current.color];

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Mode: ${current.label}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.chip,
          pressed && !disabled ? styles.pressed : null,
          disabled ? styles.disabled : null,
        ]}
      >
        <ModeIcon option={current} color={accent} />
        <Text style={[styles.chipLabel, { color: accent }]}>
          {current.label}
        </Text>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Mode</Text>
            {AGENT_CHAT_MODE_OPTIONS.map((option) => {
              const active = option.id === mode;
              const optionColor = AGENT_MODE_COLORS[option.color];
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  onPress={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                  style={[styles.option, active ? styles.optionActive : null]}
                >
                  <View style={styles.optionHead}>
                    <ModeIcon option={option} color={optionColor} />
                    <Text style={[styles.optionLabel, { color: optionColor }]}>
                      {option.label}
                    </Text>
                  </View>
                  <Text style={styles.optionDesc}>{option.description}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 14,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.01,
  },
  pressed: {
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.45,
  },
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    gap: 8,
    paddingBottom: 28,
  },
  sheetTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  option: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 4,
  },
  optionActive: {
    backgroundColor: colors.rowPressed,
  },
  optionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  optionDesc: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    paddingLeft: 22,
  },
});

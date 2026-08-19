import { useState, type ReactNode } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  AGENT_CHAT_ACCESS_MODE_OPTIONS,
  getAgentChatAccessModeOption,
  type AgentChatAccessMode,
} from "../../lib/agent/agent-chat-access-mode";
import { colors } from "../../lib/theme";
import {
  AgentAccessAutoEditsIcon,
  AgentAccessFullIcon,
  AgentAccessSupervisedIcon,
} from "./agent-composer-icons";

/**
 * Desktop `.desktop-agent-chat__mode-label.is-access*` colors.
 * Supervised uses muted foreground; auto-edits blue; full access red.
 */
export const AGENT_ACCESS_COLORS = {
  supervised: "rgba(237, 237, 237, 0.72)",
  auto_accept_edits: "rgb(37, 99, 235)",
  full_access: "rgb(220, 38, 38)",
} as const;

type Props = {
  mode: AgentChatAccessMode;
  onChange: (mode: AgentChatAccessMode) => void;
  disabled?: boolean;
};

function AccessIcon({
  mode,
  color,
}: {
  mode: AgentChatAccessMode;
  color: string;
}): ReactNode {
  switch (mode) {
    case "full_access":
      return <AgentAccessFullIcon color={color} />;
    case "auto_accept_edits":
      return <AgentAccessAutoEditsIcon color={color} />;
    case "supervised":
    default:
      return <AgentAccessSupervisedIcon color={color} />;
  }
}

export function AgentAccessPicker({
  mode,
  onChange,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const current = getAgentChatAccessModeOption(mode);
  const accent = AGENT_ACCESS_COLORS[mode];

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Access: ${current.label}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.chip,
          pressed && !disabled ? styles.pressed : null,
          disabled ? styles.disabled : null,
        ]}
      >
        <AccessIcon mode={mode} color={accent} />
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
            <Text style={styles.sheetTitle}>Access</Text>
            {AGENT_CHAT_ACCESS_MODE_OPTIONS.map((option) => {
              const active = option.id === mode;
              const optionColor = AGENT_ACCESS_COLORS[option.id];
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
                    <AccessIcon mode={option.id} color={optionColor} />
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

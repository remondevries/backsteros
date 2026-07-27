import { useEffect, useRef } from "react";
import { Animated, ScrollView, StyleSheet, Text, View } from "react-native";

import type { AgentChatMessage } from "../../lib/agent/agent-chat-transcript";

type Props = {
  messages: readonly AgentChatMessage[];
  working?: boolean;
  emptyHint?: string;
};

function WorkingDots() {
  const a = useRef(new Animated.Value(0.35)).current;
  const b = useRef(new Animated.Value(0.35)).current;
  const c = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const make = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.35,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      );
    const anims = [make(a, 0), make(b, 200), make(c, 400)];
    for (const anim of anims) anim.start();
    return () => {
      for (const anim of anims) anim.stop();
    };
  }, [a, b, c]);

  return (
    <View style={styles.workingRow} accessibilityLabel="Working">
      <Animated.View style={[styles.workingDot, { opacity: a }]} />
      <Animated.View style={[styles.workingDot, { opacity: b }]} />
      <Animated.View style={[styles.workingDot, { opacity: c }]} />
    </View>
  );
}

export function AgentChatTranscript({
  messages,
  working = false,
  emptyHint = "Send a message to talk to the agent.",
}: Props) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 16);
    return () => clearTimeout(timer);
  }, [messages.length, working]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      accessibilityRole="summary"
    >
      {messages.length === 0 && !working ? (
        <Text style={styles.empty}>{emptyHint}</Text>
      ) : null}
      <View style={styles.inner}>
        {messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.turn,
              message.role === "user" ? styles.turnUser : styles.turnAssistant,
            ]}
          >
            <View
              style={[
                styles.bubble,
                message.role === "user"
                  ? styles.bubbleUser
                  : styles.bubbleAssistant,
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  message.role === "assistant" ? styles.bubbleTextAssistant : null,
                ]}
              >
                {message.text}
              </Text>
            </View>
          </View>
        ))}
        {working ? (
          <View style={[styles.turn, styles.turnAssistant]}>
            <WorkingDots />
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 12,
  },
  empty: {
    marginTop: "auto",
    marginBottom: "auto",
    padding: 16,
    color: "rgba(255,255,255,0.32)",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  inner: {
    gap: 18,
    marginTop: "auto",
    width: "100%",
    maxWidth: 672,
    alignSelf: "center",
  },
  turn: {
    width: "100%",
  },
  turnUser: {
    alignItems: "flex-end",
  },
  turnAssistant: {
    alignItems: "flex-start",
  },
  bubble: {
    maxWidth: "80%",
  },
  bubbleUser: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "#191a1d",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.05)",
  },
  bubbleAssistant: {
    maxWidth: "100%",
    paddingHorizontal: 4,
    paddingVertical: 2,
    backgroundColor: "transparent",
  },
  bubbleText: {
    color: "#f7f9ff",
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: 0.1,
  },
  bubbleTextAssistant: {
    color: "rgba(247,249,255,0.9)",
  },
  workingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  workingDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(163,163,163,0.55)",
  },
});

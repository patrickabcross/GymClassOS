// AgentSheet — chat UI mounted inside the bottom-sheet (D2-06 AGENT-01/02/03).
//
// Responsibilities:
//   - Render header ("Agent — GymClassOS Coach"), message list, text input, send button.
//   - On send: optimistic user bubble + empty assistant bubble that streams in.
//   - Call streamAgent() and accumulate onDelta into the streaming assistant bubble.
//   - On tool_use: surface inline as a small "· Using <tool>…" system line.
//   - On tool_result: invalidate the three TanStack caches the tools mutate
//     server-side (schedule / food-entries / profile) so when the user closes
//     the sheet and returns to a tab, the latest data shows.
//   - On unmount/close: cancel the in-flight stream (D-12).
//
// Per D2-05 SUMMARY: any food-logging surface MUST dual-invalidate
// ['food-entries'] + ['profile']. The agent's log_food_nl is one such surface,
// so we invalidate both on every tool_result (cheap; safe; agent doesn't know
// which tool ran from the mobile side without parsing).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { streamAgent } from "../lib/agent-stream";
import { useTheme } from "../lib/theme";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  streaming?: boolean;
};

type Props = { onClose: () => void };

export default function AgentSheet({ onClose }: Props) {
  const theme = useTheme();
  const qc = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "sys-welcome", role: "system", text: "Agent — GymClassOS Coach" },
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.cardElevated },
        header: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 14,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        headerTitle: {
          color: theme.colors.foreground,
          fontSize: 16,
          fontWeight: "600",
        },
        systemLine: {
          color: theme.colors.mutedFaint,
          fontSize: 11,
          textAlign: "center",
          marginVertical: 4,
        },
        bubbleRow: { flexDirection: "row" },
        bubbleRowUser: { justifyContent: "flex-end" },
        bubbleRowAgent: { justifyContent: "flex-start" },
        bubble: {
          maxWidth: "85%",
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 14,
        },
        bubbleUser: { backgroundColor: theme.colors.accent },
        bubbleAgent: { backgroundColor: theme.colors.cardElevated },
        bubbleText: { color: theme.colors.foreground, fontSize: 15, lineHeight: 20 },
        inputRow: {
          flexDirection: "row",
          alignItems: "flex-end",
          padding: 12,
          gap: 8,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
        },
        input: {
          flex: 1,
          color: theme.colors.foreground,
          backgroundColor: theme.colors.cardElevated,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 18,
          maxHeight: 100,
          fontSize: 15,
        },
        sendBtn: {
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: theme.colors.accent,
          alignItems: "center",
          justifyContent: "center",
        },
      }),
    [theme],
  );

  useEffect(() => {
    // Cancel any in-flight stream on unmount/close
    return () => cancelRef.current?.();
  }, []);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      text,
    };
    const assistantMsg: ChatMessage = {
      id: `a_${Date.now()}`,
      role: "assistant",
      text: "",
      streaming: true,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setSending(true);

    // Build wire-format messages from local state (skip system label, skip
    // empty assistant placeholder we just pushed for streaming).
    const wireMessages = [...messages, userMsg]
      .filter((m) => m.role !== "system" && m.text.trim().length > 0)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.text,
      }));

    try {
      cancelRef.current = await streamAgent(wireMessages, {
        onDelta: (t) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, text: m.text + t } : m,
            ),
          );
        },
        onToolUse: (e) => {
          // Surface tool calls inline as a small system note so the demo viewer
          // can see *which* tool fired.
          setMessages((prev) => [
            ...prev,
            {
              id: `sys_${Date.now()}_use`,
              role: "system",
              text: `· Using ${e.name}…`,
            },
          ]);
        },
        onToolResult: (_e) => {
          // Best-effort cache invalidation — the server-side tool already
          // wrote to the DB; the mobile cache needs to refresh so the relevant
          // tab shows the new booking / food entry on next focus.
          //
          // Dual-invalidation contract from D2-05 SUMMARY:
          //   food-entries  → Food tab list
          //   profile       → Home tab totals (kcal ring + macro line)
          //   schedule      → Schedule tab booking list
          qc.invalidateQueries({ queryKey: ["schedule"] });
          qc.invalidateQueries({ queryKey: ["food-entries"] });
          qc.invalidateQueries({ queryKey: ["profile"] });
        },
        onDone: () => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, streaming: false } : m,
            ),
          );
          setSending(false);
        },
        onError: (_err) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    text: m.text || "(error — try again)",
                    streaming: false,
                  }
                : m,
            ),
          );
          setSending(false);
        },
      });
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? {
                ...m,
                text: `Couldn't reach agent: ${err?.message ?? err}`,
                streaming: false,
              }
            : m,
        ),
      );
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Agent — GymClassOS Coach</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Feather name="x" size={22} color={theme.colors.muted} />
        </Pressable>
      </View>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: true })
        }
        renderItem={({ item }) => {
          if (item.role === "system") {
            return <Text style={styles.systemLine}>{item.text}</Text>;
          }
          const isUser = item.role === "user";
          return (
            <View
              style={[
                styles.bubbleRow,
                isUser ? styles.bubbleRowUser : styles.bubbleRowAgent,
              ]}
            >
              <View
                style={[
                  styles.bubble,
                  isUser ? styles.bubbleUser : styles.bubbleAgent,
                ]}
              >
                <Text style={styles.bubbleText}>{item.text}</Text>
                {item.streaming && (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.muted}
                    style={{ marginTop: 4 }}
                  />
                )}
              </View>
            </View>
          );
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask anything…"
            placeholderTextColor={theme.colors.mutedFaint}
            style={styles.input}
            multiline
            editable={!sending}
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim() || sending}
            style={[
              styles.sendBtn,
              (!draft.trim() || sending) && { opacity: 0.5 },
            ]}
          >
            <Feather name="send" size={18} color={theme.colors.accentForeground} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </KeyboardAvoidingView>
  );
}

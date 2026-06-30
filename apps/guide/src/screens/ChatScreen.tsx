/**
 * Yatra guide registration & operational chat screen.
 *
 * Layout (portrait):
 *   ┌─────────────────────────────────────┐
 *   │  Header: "Yatra" + progress bar     │
 *   ├──────────────────┬──────────────────┤
 *   │                  │ Profile sidebar  │
 *   │   Chat bubbles   │ (field statuses) │
 *   │                  │                  │
 *   ├──────────────────┴──────────────────┤
 *   │  Text input + send button           │
 *   └─────────────────────────────────────┘
 *
 * The sidebar shows every registration field with a checkmark (done) or a
 * clock (pending), matching the system-prompt spec: "done/pending field
 * states, progress bar, and visible agent action tags."
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { YatraChatResponse, YatraMessage, GuideRegistrationFields } from "@nepal-journey/types";
import { yatraGreet, yatraChat } from "@/api/client";

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_ID = "guide-session-" + Date.now(); // TODO: persist in SecureStore

/** Human-readable label for each registration field. */
const FIELD_LABELS: Record<keyof GuideRegistrationFields, string> = {
  name: "Full Name",
  location: "Location",
  experience_years: "Experience",
  specializations: "Specializations",
  ntb_license_number: "NTB License",
  has_ntb_license: "NTB Status",
  taan_member: "TAAN Member",
  first_aid_certified: "First Aid",
  languages: "Languages",
  daily_rate_usd: "Daily Rate",
  phone: "Phone",
  photo_url: "Profile Photo",
  availability_start: "Availability",
  availability_end: "Availability End",
};

/** Ordered list shown in the sidebar — mirrors REGISTRATION_NODES in yatra.py. */
const SIDEBAR_FIELDS: (keyof GuideRegistrationFields)[] = [
  "name",
  "location",
  "experience_years",
  "specializations",
  "ntb_license_number",
  "taan_member",
  "first_aid_certified",
  "languages",
  "daily_rate_usd",
  "phone",
  "photo_url",
  "availability_start",
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
      <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextBot]}>
        {message.content}
      </Text>
    </View>
  );
}

function ActionTag({ label }: { label: string }) {
  return (
    <View style={styles.actionTag}>
      <Text style={styles.actionTagText}>⚡ {label}</Text>
    </View>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? done / total : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { flex: pct }]} />
      <View style={{ flex: 1 - pct }} />
    </View>
  );
}

function Sidebar({
  fields,
  registrationComplete,
}: {
  fields: GuideRegistrationFields;
  registrationComplete: boolean;
}) {
  return (
    <ScrollView style={styles.sidebar} contentContainerStyle={styles.sidebarContent}>
      <Text style={styles.sidebarTitle}>
        {registrationComplete ? "Profile Complete ✓" : "Building Profile"}
      </Text>
      {SIDEBAR_FIELDS.map((key) => {
        const value = fields[key];
        const isDone =
          value !== null &&
          value !== undefined &&
          (!Array.isArray(value) || value.length > 0);
        return (
          <View key={key} style={styles.sidebarRow}>
            <Text style={styles.sidebarIcon}>{isDone ? "✓" : "○"}</Text>
            <Text
              style={[styles.sidebarLabel, isDone ? styles.sidebarDone : styles.sidebarPending]}
              numberOfLines={1}
            >
              {FIELD_LABELS[key]}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState<GuideRegistrationFields>({});
  const [progress, setProgress] = useState({ done: 0, total: 11 });
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [agentActions, setAgentActions] = useState<string[]>([]);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const appendMessage = useCallback((role: "user" | "assistant", content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-${role}`, role, content },
    ]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const applyResponse = useCallback((res: YatraChatResponse) => {
    appendMessage("assistant", res.message);
    setProgress(res.registration_progress);
    setRegistrationComplete(res.registration_complete);
    if (res.agent_actions.length > 0) {
      setAgentActions((prev) => [...prev, ...res.agent_actions]);
    }
  }, [appendMessage]);

  // Greet on mount
  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await yatraGreet(SESSION_ID);
        applyResponse(res);
      } catch (e) {
        appendMessage("assistant", "Namaste! I'm Yatra. (Could not connect to server — check your API URL.)");
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    appendMessage("user", text);
    setLoading(true);
    try {
      const res = await yatraChat(SESSION_ID, text);
      applyResponse(res);
    } catch (e) {
      appendMessage("assistant", "Sorry, something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [input, loading, appendMessage, applyResponse]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Yatra</Text>
        <Text style={styles.progressLabel}>
          {progress.done}/{progress.total} fields
        </Text>
        <ProgressBar done={progress.done} total={progress.total} />
      </View>

      <View style={styles.body}>
        {/* Chat area */}
        <View style={styles.chatArea}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <ChatBubble message={item} />}
            contentContainerStyle={styles.chatList}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          />
          {/* Agent action tags */}
          {agentActions.length > 0 && (
            <ScrollView
              horizontal
              style={styles.actionRow}
              contentContainerStyle={styles.actionRowContent}
              showsHorizontalScrollIndicator={false}
            >
              {agentActions.map((a, i) => (
                <ActionTag key={i} label={a} />
              ))}
            </ScrollView>
          )}
        </View>

        {/* Sidebar */}
        <Sidebar fields={fields} registrationComplete={registrationComplete} />
      </View>

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={registrationComplete ? "Ask Yatra anything..." : "Reply to Yatra..."}
          placeholderTextColor="#999"
          multiline
          returnKeyType="send"
          onSubmitEditing={() => void send()}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.sendBtn, loading && styles.sendBtnDisabled]}
          onPress={() => void send()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendBtnText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const NEPAL_BLUE = "#003893";
const NEPAL_RED = "#DC143C";
const SIDEBAR_W = 110;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0F4F8" },

  // Header
  header: {
    backgroundColor: NEPAL_BLUE,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 4,
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  progressLabel: { color: "#aac4f0", fontSize: 12 },
  progressTrack: {
    height: 4,
    flexDirection: "row",
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  progressFill: { backgroundColor: "#4A9FD5", borderRadius: 2 },

  // Body (chat + sidebar)
  body: { flex: 1, flexDirection: "row" },

  // Chat
  chatArea: { flex: 1, overflow: "hidden" },
  chatList: { padding: 12, gap: 8, paddingBottom: 4 },
  bubble: {
    maxWidth: "85%",
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: NEPAL_BLUE,
    borderBottomRightRadius: 4,
  },
  bubbleBot: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTextUser: { color: "#fff" },
  bubbleTextBot: { color: "#1a1a2e" },

  // Agent action tags
  actionRow: {
    maxHeight: 36,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  actionRowContent: { gap: 6, alignItems: "center" },
  actionTag: {
    backgroundColor: "#FFF3CD",
    borderWidth: 1,
    borderColor: "#FFD700",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  actionTagText: { fontSize: 11, color: "#856404" },

  // Sidebar
  sidebar: {
    width: SIDEBAR_W,
    backgroundColor: "#fff",
    borderLeftWidth: 1,
    borderLeftColor: "#e0e8f0",
  },
  sidebarContent: { padding: 8, gap: 6 },
  sidebarTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: NEPAL_BLUE,
    marginBottom: 4,
    textAlign: "center",
  },
  sidebarRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  sidebarIcon: { fontSize: 12, width: 14, textAlign: "center" },
  sidebarLabel: { fontSize: 10, flex: 1 },
  sidebarDone: { color: "#2D6A4F", fontWeight: "600" },
  sidebarPending: { color: "#999" },

  // Input bar
  inputBar: {
    flexDirection: "row",
    padding: 10,
    gap: 8,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e0e8f0",
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    backgroundColor: "#F0F4F8",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    maxHeight: 120,
    color: "#1a1a2e",
  },
  sendBtn: {
    backgroundColor: NEPAL_RED,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 60,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});

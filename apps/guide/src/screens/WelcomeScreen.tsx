import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { signUpWithEmail } from "@/lib/session";
import { useRouter } from "expo-router";

export default function WelcomeScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleContinue = async () => {
    const addr = email.trim().toLowerCase();
    if (!addr.includes("@")) {
      setError("Enter a valid email address");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signUpWithEmail(addr);
      router.push({ pathname: "/auth/otp", params: { email: addr } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.hero}>
        <Text style={styles.logo}>Nepal Journey</Text>
        <Text style={styles.tagline}>The smart guide platform</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>Sign in as a Guide</Text>
        <Text style={styles.sub}>We'll send a one-time code to your email.</Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="your@email.com"
          placeholderTextColor="#999"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          returnKeyType="done"
          onSubmitEditing={() => void handleContinue()}
          editable={!loading}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={() => void handleContinue()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Continue</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>
        By continuing you agree to our Terms of Service and Privacy Policy.
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#003893",
    justifyContent: "space-between",
    padding: 24,
    paddingBottom: 40,
  },
  hero: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  logo: { fontSize: 36, fontWeight: "900", color: "#fff", letterSpacing: -1 },
  tagline: { fontSize: 14, color: "rgba(255,255,255,0.7)" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  heading: { fontSize: 20, fontWeight: "800", color: "#1a1a2e" },
  sub: { fontSize: 13, color: "#888" },
  input: {
    borderWidth: 1.5,
    borderColor: "#e0e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1a1a2e",
  },
  btn: {
    backgroundColor: "#DC143C",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  error: { color: "#DC143C", fontSize: 13 },
  footer: { color: "rgba(255,255,255,0.4)", fontSize: 11, textAlign: "center" },
});

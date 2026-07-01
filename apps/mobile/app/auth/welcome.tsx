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
    if (!addr.includes("@")) { setError("Enter a valid email address"); return; }
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
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.hero}>
        <Text style={s.logo}>Nepal Journey</Text>
        <Text style={s.tagline}>Your AI trekking companion</Text>
      </View>
      <View style={s.card}>
        <Text style={s.heading}>Plan your trek</Text>
        <Text style={s.sub}>Sign in with your email to get started.</Text>
        <TextInput
          style={s.input}
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
        {error && <Text style={s.error}>{error}</Text>}
        <TouchableOpacity style={[s.btn, loading && s.btnOff]} onPress={() => void handleContinue()} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Continue</Text>}
        </TouchableOpacity>
      </View>
      <Text style={s.footer}>By continuing you agree to our Terms of Service.</Text>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#DC143C", justifyContent: "space-between", padding: 24, paddingBottom: 40 },
  hero: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  logo: { fontSize: 36, fontWeight: "900", color: "#fff", letterSpacing: -1 },
  tagline: { fontSize: 14, color: "rgba(255,255,255,0.7)" },
  card: { backgroundColor: "#fff", borderRadius: 24, padding: 24, gap: 12 },
  heading: { fontSize: 20, fontWeight: "800", color: "#1a1a2e" },
  sub: { fontSize: 13, color: "#888" },
  input: { borderWidth: 1.5, borderColor: "#e0e8f0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#1a1a2e" },
  btn: { backgroundColor: "#DC143C", borderRadius: 12, padding: 14, alignItems: "center" },
  btnOff: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  error: { color: "#DC143C", fontSize: 13 },
  footer: { color: "rgba(255,255,255,0.4)", fontSize: 11, textAlign: "center" },
});

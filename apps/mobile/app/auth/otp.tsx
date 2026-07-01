import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { verifyOtp, signUpWithEmail } from "@/lib/session";

export default function OtpScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleVerify = async () => {
    if (otp.length < 6) { setError("Enter the 6-digit code"); return; }
    setError(null);
    setLoading(true);
    try {
      await verifyOtp(email!, otp);
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.root}>
      <TouchableOpacity style={s.back} onPress={() => router.back()}>
        <Text style={s.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={s.heading}>Check your email</Text>
      <Text style={s.sub}>Code sent to {email}</Text>
      <TextInput
        style={s.input}
        value={otp}
        onChangeText={(v) => setOtp(v.replace(/\D/g, "").slice(0, 6))}
        placeholder="000000"
        placeholderTextColor="#ccc"
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
      />
      {error && <Text style={s.error}>{error}</Text>}
      <TouchableOpacity style={[s.btn, loading && s.btnOff]} onPress={() => void handleVerify()} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Verify</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => void signUpWithEmail(email!).catch(() => null)} style={s.resend}>
        <Text style={s.resendText}>Resend code</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#DC143C", padding: 24, gap: 16 },
  back: { paddingTop: 24 },
  backText: { color: "rgba(255,255,255,0.7)", fontSize: 15 },
  heading: { fontSize: 28, fontWeight: "800", color: "#fff" },
  sub: { fontSize: 14, color: "rgba(255,255,255,0.7)" },
  input: { backgroundColor: "#fff", borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16, fontSize: 32, fontWeight: "800", letterSpacing: 12, color: "#1a1a2e", textAlign: "center" },
  btn: { backgroundColor: "#003893", borderRadius: 14, padding: 16, alignItems: "center" },
  btnOff: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  resend: { alignItems: "center" },
  resendText: { color: "rgba(255,255,255,0.6)", fontSize: 13 },
  error: { color: "#FFAAAA", fontSize: 13 },
});

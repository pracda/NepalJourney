import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { verifyOtp, signUpWithEmail } from "@/lib/session";
import { saveToken } from "@/api/client";

export default function OtpScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);

  const handleVerify = async () => {
    if (otp.length < 6) {
      setError("Enter the 6-digit code from your email");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await verifyOtp(email!, otp);
      setSuccess(true);
      // Give the user a moment to see success, then navigate to the main app
      setTimeout(() => router.replace("/(tabs)"), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code — please try again");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError(null);
    try {
      await signUpWithEmail(email!);
    } catch (e) {
      setError("Couldn't resend — try again in a minute");
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.back}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.heading}>Check your email</Text>
        <Text style={styles.sub}>
          We sent a 6-digit code to{"\n"}
          <Text style={styles.email}>{email}</Text>
        </Text>

        <TextInput
          ref={inputRef}
          style={[styles.otpInput, success && styles.otpInputSuccess]}
          value={otp}
          onChangeText={(v) => setOtp(v.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          placeholderTextColor="#ccc"
          keyboardType="number-pad"
          returnKeyType="done"
          onSubmitEditing={() => void handleVerify()}
          editable={!loading && !success}
          maxLength={6}
          autoFocus
        />

        {error && <Text style={styles.error}>{error}</Text>}
        {success && <Text style={styles.successText}>Verified ✓</Text>}

        <TouchableOpacity
          style={[styles.btn, (loading || success) && styles.btnDisabled]}
          onPress={() => void handleVerify()}
          disabled={loading || success}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Verify</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resendBtn}
          onPress={() => void handleResend()}
          disabled={resending}
        >
          <Text style={styles.resendText}>
            {resending ? "Sending..." : "Resend code"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#003893", padding: 24 },
  back: { paddingTop: 16, marginBottom: 40 },
  backText: { color: "rgba(255,255,255,0.7)", fontSize: 15 },
  content: { gap: 16 },
  heading: { fontSize: 28, fontWeight: "800", color: "#fff" },
  sub: { fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 22 },
  email: { color: "#fff", fontWeight: "600" },
  otpInput: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 12,
    color: "#1a1a2e",
    textAlign: "center",
  },
  otpInputSuccess: { borderWidth: 2, borderColor: "#2D6A4F" },
  btn: {
    backgroundColor: "#DC143C",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  resendBtn: { alignItems: "center", padding: 8 },
  resendText: { color: "rgba(255,255,255,0.6)", fontSize: 13 },
  error: {
    color: "#FFAAAA",
    fontSize: 13,
    backgroundColor: "rgba(220,20,60,0.15)",
    borderRadius: 8,
    padding: 10,
  },
  successText: { color: "#90EE90", fontSize: 14, fontWeight: "600", textAlign: "center" },
});

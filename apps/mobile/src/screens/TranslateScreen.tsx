/**
 * BridgeVoice translation screen.
 * Tourist holds record button → Whisper transcribes → Claude translates →
 * OpenAI TTS plays back the translation in the target language.
 */

import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Audio } from "expo-av";
import type { SupportedLanguage, TranslateVoiceResponse } from "@nepal-journey/types";
import { translateVoice } from "@/api/client";

type LangPair = { source: SupportedLanguage; target: SupportedLanguage; label: string };

const LANG_PAIRS: LangPair[] = [
  { source: "en", target: "ne", label: "English → Nepali" },
  { source: "ne", target: "en", label: "Nepali → English" },
];

export default function TranslateScreen() {
  const [selectedPair, setSelectedPair] = useState<LangPair>(LANG_PAIRS[0]!);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TranslateVoiceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const startRecording = useCallback(async () => {
    setError(null);
    setResult(null);
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission denied", "Microphone access is required for voice translation.");
      return;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    recorderRef.current = recording;
    setRecording(true);
  }, []);

  const stopAndTranslate = useCallback(async () => {
    if (!recorderRef.current) return;
    setRecording(false);
    setLoading(true);
    try {
      await recorderRef.current.stopAndUnloadAsync();
      const uri = recorderRef.current.getURI();
      recorderRef.current = null;
      if (!uri) throw new Error("No audio recorded");

      const response = await fetch(uri);
      const blob = await response.blob();
      const translated = await translateVoice(blob, "recording.m4a", selectedPair.source, selectedPair.target);
      setResult(translated);

      // Auto-play the translated audio
      await soundRef.current?.unloadAsync();
      const audioUri = `data:audio/mp3;base64,${translated.audio_base64}`;
      const { sound } = await Audio.Sound.createAsync({ uri: audioUri }, { shouldPlay: true });
      soundRef.current = sound;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Translation failed");
    } finally {
      setLoading(false);
    }
  }, [selectedPair]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>BridgeVoice</Text>
      <Text style={styles.subtitle}>Real-time voice translation for trekkers</Text>

      {/* Language pair selector */}
      <View style={styles.pairRow}>
        {LANG_PAIRS.map((pair) => (
          <TouchableOpacity
            key={pair.label}
            style={[styles.pairBtn, selectedPair.label === pair.label && styles.pairBtnActive]}
            onPress={() => setSelectedPair(pair)}
          >
            <Text style={[styles.pairText, selectedPair.label === pair.label && styles.pairTextActive]}>
              {pair.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Record button */}
      <TouchableOpacity
        style={[styles.recordBtn, recording && styles.recordBtnActive]}
        onPress={recording ? () => void stopAndTranslate() : () => void startRecording()}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="large" color="#fff" />
        ) : (
          <>
            <Text style={styles.recordIcon}>{recording ? "⏹" : "🎙"}</Text>
            <Text style={styles.recordLabel}>{recording ? "Tap to translate" : "Hold to speak"}</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Error */}
      {error && <Text style={styles.error}>{error}</Text>}

      {/* Result */}
      {result && (
        <View style={styles.resultCard}>
          <View style={styles.resultSection}>
            <Text style={styles.resultSectionLabel}>You said ({selectedPair.source.toUpperCase()})</Text>
            <Text style={styles.resultText}>{result.transcript}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.resultSection}>
            <Text style={styles.resultSectionLabel}>Translation ({selectedPair.target.toUpperCase()})</Text>
            <Text style={[styles.resultText, styles.resultTranslation]}>{result.translation}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0F4F8" },
  content: { padding: 24, alignItems: "center", gap: 20, paddingBottom: 60 },
  title: { fontSize: 26, fontWeight: "800", color: "#003893" },
  subtitle: { fontSize: 14, color: "#888", textAlign: "center" },
  pairRow: { flexDirection: "row", gap: 10 },
  pairBtn: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#003893",
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pairBtnActive: { backgroundColor: "#003893" },
  pairText: { color: "#003893", fontWeight: "600", fontSize: 13 },
  pairTextActive: { color: "#fff" },
  recordBtn: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#DC143C",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    shadowColor: "#DC143C",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    marginVertical: 16,
  },
  recordBtnActive: { backgroundColor: "#8B0000", transform: [{ scale: 1.05 }] },
  recordIcon: { fontSize: 48 },
  recordLabel: { color: "#fff", fontWeight: "700", fontSize: 13 },
  error: { color: "#DC143C", fontSize: 14, textAlign: "center" },
  resultCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  resultSection: { gap: 4 },
  resultSectionLabel: { fontSize: 11, fontWeight: "700", color: "#888", textTransform: "uppercase" },
  resultText: { fontSize: 16, color: "#1a1a2e", lineHeight: 24 },
  resultTranslation: { color: "#003893", fontWeight: "600" },
  divider: { height: 1, backgroundColor: "#e0e8f0" },
});

/**
 * Trip planner — lets a tourist describe their ideal trek and see AI-matched guides.
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { GuideMatchResult } from "@nepal-journey/types";
import { matchGuides } from "@/api/client";

function GuideCard({ guide }: { guide: GuideMatchResult }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        {guide.photo_url ? (
          <Image source={{ uri: guide.photo_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>{guide.name[0]?.toUpperCase() ?? "G"}</Text>
          </View>
        )}
        <View style={styles.cardInfo}>
          <Text style={styles.guideName}>{guide.name}</Text>
          <Text style={styles.guideMeta}>{guide.location} · {guide.experience_years}y exp</Text>
          <Text style={styles.guideRating}>⭐ {guide.rating.toFixed(1)} ({guide.total_reviews})</Text>
        </View>
        <View style={styles.rateBox}>
          <Text style={styles.rateValue}>${guide.daily_rate_usd}</Text>
          <Text style={styles.rateLabel}>/day</Text>
        </View>
      </View>
      <View style={styles.chips}>
        {guide.specializations.slice(0, 3).map((s) => (
          <View key={s} style={styles.chip}>
            <Text style={styles.chipText}>{s}</Text>
          </View>
        ))}
        {guide.tier === "elite" && (
          <View style={[styles.chip, styles.eliteChip]}>
            <Text style={[styles.chipText, styles.eliteChipText]}>Elite</Text>
          </View>
        )}
      </View>
      <TouchableOpacity style={styles.bookBtn}>
        <Text style={styles.bookBtnText}>Book This Guide</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function PlannerScreen() {
  const [query, setQuery] = useState("");
  const [guides, setGuides] = useState<GuideMatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const results = await matchGuides(q);
      setGuides(results);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Describe your ideal trek (e.g. '10-day EBC, English-speaking guide')"
          placeholderTextColor="#999"
          returnKeyType="search"
          onSubmitEditing={() => void search()}
          multiline
        />
        <TouchableOpacity
          style={[styles.searchBtn, loading && styles.searchBtnDisabled]}
          onPress={() => void search()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.searchBtnText}>Find</Text>
          )}
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={guides}
        keyExtractor={(g) => g.id}
        renderItem={({ item }) => <GuideCard guide={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          searched ? (
            <Text style={styles.empty}>No guides found. Try a different description.</Text>
          ) : (
            <View style={styles.hero}>
              <Text style={styles.heroTitle}>Plan Your Trek</Text>
              <Text style={styles.heroSub}>
                Describe your dream trek above and we'll match you with the best local guides using AI.
              </Text>
            </View>
          )
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0F4F8" },
  searchBar: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e8f0",
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    backgroundColor: "#F0F4F8",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 80,
    color: "#1a1a2e",
  },
  searchBtn: {
    backgroundColor: "#003893",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 56,
  },
  searchBtnDisabled: { opacity: 0.5 },
  searchBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  list: { padding: 12, gap: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTop: { flexDirection: "row", gap: 12, alignItems: "center" },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarPlaceholder: { backgroundColor: "#003893", justifyContent: "center", alignItems: "center" },
  avatarInitial: { color: "#fff", fontSize: 22, fontWeight: "700" },
  cardInfo: { flex: 1, gap: 2 },
  guideName: { fontSize: 15, fontWeight: "700", color: "#1a1a2e" },
  guideMeta: { fontSize: 12, color: "#888" },
  guideRating: { fontSize: 12, color: "#555" },
  rateBox: { alignItems: "flex-end" },
  rateValue: { fontSize: 20, fontWeight: "800", color: "#003893" },
  rateLabel: { fontSize: 11, color: "#888" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { backgroundColor: "#F0F4F8", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, color: "#003893", fontWeight: "600" },
  eliteChip: { backgroundColor: "#FFF3CD", borderColor: "#FFD700", borderWidth: 1 },
  eliteChipText: { color: "#856404" },
  bookBtn: {
    backgroundColor: "#DC143C",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
  },
  bookBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  error: { color: "#DC143C", fontSize: 13, textAlign: "center", margin: 12 },
  empty: { textAlign: "center", color: "#888", marginTop: 40, fontSize: 15 },
  hero: { alignItems: "center", padding: 32, gap: 12 },
  heroTitle: { fontSize: 24, fontWeight: "800", color: "#003893" },
  heroSub: { fontSize: 14, color: "#888", textAlign: "center", lineHeight: 20 },
});

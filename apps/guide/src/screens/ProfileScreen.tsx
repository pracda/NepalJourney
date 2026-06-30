import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { Guide } from "@nepal-journey/types";
import { clearToken, getMyProfile } from "@/api/client";
import { useRouter } from "expo-router";

const TIER_COLOR: Record<string, string> = {
  standard: "#888",
  elite: "#B8860B",
};

export default function ProfileScreen() {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    void getMyProfile()
      .then(setGuide)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await clearToken();
    router.replace("/login" as never);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#003893" /></View>;
  }

  if (error || !guide) {
    return <View style={styles.center}><Text style={styles.error}>{error ?? "Profile unavailable"}</Text></View>;
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Avatar + name */}
      <View style={styles.hero}>
        {guide.photo_url ? (
          <Image source={{ uri: guide.photo_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>{guide.name[0]?.toUpperCase() ?? "G"}</Text>
          </View>
        )}
        <Text style={styles.name}>{guide.name}</Text>
        <View style={[styles.tierBadge, { borderColor: TIER_COLOR[guide.tier] ?? "#888" }]}>
          <Text style={[styles.tierText, { color: TIER_COLOR[guide.tier] ?? "#888" }]}>
            {guide.tier.toUpperCase()} GUIDE
          </Text>
        </View>
        <Text style={styles.rating}>⭐ {guide.rating.toFixed(1)} ({guide.total_reviews} reviews)</Text>
      </View>

      {/* Info rows */}
      <View style={styles.section}>
        <InfoRow label="Location" value={guide.location} />
        <InfoRow label="Experience" value={`${guide.experience_years} years`} />
        <InfoRow label="Languages" value={guide.languages.join(", ")} />
        <InfoRow label="Daily Rate" value={`$${guide.daily_rate_usd}`} />
        <InfoRow label="Total Trips" value={String(guide.total_trips)} />
        <InfoRow label="Verification" value={guide.verification_status} />
        <InfoRow
          label="Available"
          value={guide.is_available ? "Yes" : "No"}
          valueColor={guide.is_available ? "#2D6A4F" : "#DC143C"}
        />
      </View>

      {/* Specializations */}
      {guide.specializations.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Specializations</Text>
          <View style={styles.chips}>
            {guide.specializations.map((s) => (
              <View key={s} style={styles.chip}>
                <Text style={styles.chipText}>{s}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.logoutBtn} onPress={() => void handleLogout()}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0F4F8" },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  hero: { alignItems: "center", gap: 6, marginBottom: 8 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { backgroundColor: "#003893", justifyContent: "center", alignItems: "center" },
  avatarInitial: { color: "#fff", fontSize: 40, fontWeight: "700" },
  name: { fontSize: 22, fontWeight: "700", color: "#1a1a2e" },
  tierBadge: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 2 },
  tierText: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  rating: { fontSize: 14, color: "#555" },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#555", marginBottom: 4 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  infoLabel: { fontSize: 14, color: "#888" },
  infoValue: { fontSize: 14, fontWeight: "600", color: "#1a1a2e", textAlign: "right", flex: 1, marginLeft: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { backgroundColor: "#F0F4F8", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, color: "#003893", fontWeight: "600" },
  logoutBtn: {
    backgroundColor: "#DC143C",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  logoutText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  error: { color: "#DC143C", fontSize: 14 },
});

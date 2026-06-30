import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Booking } from "@nepal-journey/types";
import { getMyBookings } from "@/api/client";

interface EarningsSummary {
  totalEarned: number;
  pendingPayout: number;
  completedTrips: number;
  thisMonth: number;
}

function StatCard({ label, value, color = "#003893" }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function EarningsScreen() {
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getMyBookings()
      .then((bookings: Booking[]) => {
        const now = new Date();
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        setSummary({
          totalEarned: bookings
            .filter((b) => b.status === "completed")
            .reduce((s, b) => s + b.guide_payout_usd, 0),
          pendingPayout: bookings
            .filter((b) => b.status === "confirmed" || b.status === "in_progress")
            .reduce((s, b) => s + b.guide_payout_usd, 0),
          completedTrips: bookings.filter((b) => b.status === "completed").length,
          thisMonth: bookings
            .filter((b) => b.start_date.startsWith(monthStr) && b.status !== "cancelled")
            .reduce((s, b) => s + b.guide_payout_usd, 0),
        });
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#003893" /></View>;
  }

  if (error || !summary) {
    return <View style={styles.center}><Text style={styles.error}>{error ?? "No data"}</Text></View>;
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Earnings Overview</Text>
      <View style={styles.grid}>
        <StatCard label="Total Earned" value={`$${summary.totalEarned.toFixed(0)}`} color="#2D6A4F" />
        <StatCard label="Pending Payout" value={`$${summary.pendingPayout.toFixed(0)}`} color="#FFA500" />
        <StatCard label="Completed Trips" value={String(summary.completedTrips)} />
        <StatCard label="This Month" value={`$${summary.thisMonth.toFixed(0)}`} color="#DC143C" />
      </View>
      <Text style={styles.note}>
        Platform commission is 12%. Payouts are released 48h after trip completion.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0F4F8" },
  content: { padding: 20, gap: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  heading: { fontSize: 20, fontWeight: "700", color: "#1a1a2e" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    width: "47%",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  statValue: { fontSize: 28, fontWeight: "800" },
  statLabel: { fontSize: 12, color: "#888", marginTop: 4, textAlign: "center" },
  note: { fontSize: 12, color: "#999", lineHeight: 18, marginTop: 8 },
  error: { color: "#DC143C", fontSize: 14 },
});

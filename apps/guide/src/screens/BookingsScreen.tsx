import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Booking } from "@nepal-journey/types";
import { getMyBookings } from "@/api/client";

const STATUS_COLORS: Record<string, string> = {
  pending: "#FFA500",
  confirmed: "#2D6A4F",
  in_progress: "#003893",
  completed: "#888",
  cancelled: "#DC143C",
  disputed: "#8B0000",
};

function BookingCard({ booking }: { booking: Booking }) {
  const color = STATUS_COLORS[booking.status] ?? "#888";
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.dates}>
          {booking.start_date} → {booking.end_date}
        </Text>
        <View style={[styles.badge, { backgroundColor: color }]}>
          <Text style={styles.badgeText}>{booking.status.replace("_", " ")}</Text>
        </View>
      </View>
      <Text style={styles.amount}>${booking.guide_payout_usd.toFixed(2)} payout</Text>
      <Text style={styles.type}>{booking.booking_type.replace("_", " ")}</Text>
    </View>
  );
}

export default function BookingsScreen() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getMyBookings()
      .then(setBookings)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#003893" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={bookings}
      keyExtractor={(b) => b.id}
      renderItem={({ item }) => <BookingCard booking={item} />}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>No bookings yet.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  dates: { fontSize: 13, color: "#555" },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, color: "#fff", fontWeight: "600", textTransform: "capitalize" },
  amount: { fontSize: 18, fontWeight: "700", color: "#1a1a2e" },
  type: { fontSize: 12, color: "#888", marginTop: 2, textTransform: "capitalize" },
  errorText: { color: "#DC143C", fontSize: 14 },
  empty: { textAlign: "center", color: "#888", marginTop: 40, fontSize: 15 },
});

import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import type { Booking } from "@nepal-journey/types";
import { getMyBookings } from "@/api/client";

export default function BookingsScreen() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getMyBookings().then(setBookings).finally(() => setLoading(false));
  }, []);

  if (loading) return <View style={s.center}><ActivityIndicator color="#DC143C" /></View>;

  return (
    <FlatList
      data={bookings}
      keyExtractor={(b) => b.id}
      contentContainerStyle={s.list}
      ListEmptyComponent={<Text style={s.empty}>No bookings yet.</Text>}
      renderItem={({ item: b }) => (
        <View style={s.card}>
          <Text style={s.dates}>{b.start_date} → {b.end_date}</Text>
          <Text style={s.amount}>${b.total_amount_usd.toFixed(0)} total</Text>
          <Text style={s.status}>{b.status.replace("_", " ")}</Text>
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, gap: 4 },
  dates: { fontSize: 13, color: "#555" },
  amount: { fontSize: 18, fontWeight: "700", color: "#003893" },
  status: { fontSize: 12, color: "#888", textTransform: "capitalize" },
  empty: { textAlign: "center", color: "#888", marginTop: 40, fontSize: 15 },
});

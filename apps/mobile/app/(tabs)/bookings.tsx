/**
 * Tourist bookings tab — shows all bookings with live status via Supabase Realtime.
 *
 * Supabase Realtime subscribes to INSERT/UPDATE on the bookings table, scoped by
 * RLS to the authenticated tourist. When the guide confirms or cancels, the row
 * updates in real-time without the tourist needing to pull-to-refresh.
 *
 * UI ready to test:
 *   - After creating a booking on the guide detail screen, it appears here instantly
 *   - Status badge updates live when the guide accepts/declines in the Guide app
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import type { BookingWithGuide } from "@nepal-journey/types";
import { getMyBookings } from "@/api/client";
import { supabase } from "@/lib/supabase";

const STATUS_COLORS: Record<string, string> = {
  pending:     "#F59E0B",
  confirmed:   "#2D6A4F",
  in_progress: "#003893",
  completed:   "#6B7280",
  cancelled:   "#DC143C",
  disputed:    "#7C3AED",
};

const STATUS_LABELS: Record<string, string> = {
  pending:     "Awaiting Guide",
  confirmed:   "Confirmed",
  in_progress: "In Progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
  disputed:    "Disputed",
};

function BookingCard({
  booking,
  onPress,
}: {
  booking: BookingWithGuide;
  onPress: () => void;
}) {
  const color = STATUS_COLORS[booking.status] ?? "#6B7280";
  const label = STATUS_LABELS[booking.status] ?? booking.status;
  const guide = booking.guides;

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.92}>
      <View style={s.cardTop}>
        {guide?.photo_url ? (
          <Image source={{ uri: guide.photo_url }} style={s.avatar} />
        ) : (
          <View style={[s.avatar, s.avatarPlaceholder]}>
            <Text style={s.avatarInitial}>{guide?.name?.[0]?.toUpperCase() ?? "G"}</Text>
          </View>
        )}
        <View style={s.cardInfo}>
          <Text style={s.guideName}>{guide?.name ?? "Guide"}</Text>
          <Text style={s.guideLocation}>{guide?.location}</Text>
        </View>
        <View style={[s.badge, { backgroundColor: color }]}>
          <Text style={s.badgeText}>{label}</Text>
        </View>
      </View>
      <View style={s.cardDates}>
        <Text style={s.dates}>
          {booking.start_date} → {booking.end_date}
        </Text>
        <Text style={s.amount}>${booking.total_amount_usd.toFixed(0)}</Text>
      </View>
      {booking.status === "pending" && (
        <Text style={s.hint}>Waiting for guide confirmation…</Text>
      )}
    </TouchableOpacity>
  );
}

export default function BookingsScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingWithGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getMyBookings();
      setBookings(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bookings");
    }
  }, []);

  // Initial load
  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  // Supabase Realtime — update individual booking rows as they change
  useEffect(() => {
    const channel = supabase
      .channel("tourist-bookings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            // New booking — prepend
            setBookings((prev) => [payload.new as BookingWithGuide, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            // Status changed — update in place
            setBookings((prev) =>
              prev.map((b) =>
                b.id === (payload.new as BookingWithGuide).id
                  ? { ...b, ...(payload.new as Partial<BookingWithGuide>) }
                  : b,
              ),
            );
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#003893" />
      </View>
    );
  }

  return (
    <FlatList
      data={bookings}
      keyExtractor={(b) => b.id}
      contentContainerStyle={s.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#003893" />}
      ListHeaderComponent={
        error ? (
          <Text style={s.error}>{error}</Text>
        ) : null
      }
      ListEmptyComponent={
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No bookings yet</Text>
          <Text style={s.emptySub}>Find a guide on the Planner tab and book your trek.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <BookingCard
          booking={item}
          onPress={() => router.push({ pathname: "/guide/[id]", params: { id: item.guide_id } })}
        />
      )}
    />
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F0F4F8" },
  list: { padding: 16, gap: 12, backgroundColor: "#F0F4F8", flexGrow: 1 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { backgroundColor: "#003893", justifyContent: "center", alignItems: "center" },
  avatarInitial: { color: "#fff", fontSize: 18, fontWeight: "700" },
  cardInfo: { flex: 1 },
  guideName: { fontSize: 14, fontWeight: "700", color: "#1a1a2e" },
  guideLocation: { fontSize: 12, color: "#888" },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, color: "#fff", fontWeight: "600" },
  cardDates: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dates: { fontSize: 13, color: "#555" },
  amount: { fontSize: 16, fontWeight: "700", color: "#003893" },
  hint: { fontSize: 12, color: "#F59E0B", fontStyle: "italic" },
  error: { color: "#DC143C", fontSize: 13, textAlign: "center", marginBottom: 8 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#333" },
  emptySub: { fontSize: 13, color: "#888", textAlign: "center", paddingHorizontal: 32 },
});

/**
 * Guide bookings screen — shows incoming requests and active bookings.
 *
 * Pending bookings show Accept / Decline buttons.
 * Confirmed bookings show a "Start Trip" button (→ in_progress).
 * In-progress bookings show a "Mark Complete" button.
 *
 * Status updates call PATCH /bookings/{id}/status. The state machine on the server
 * validates the transition — invalid transitions return 422 with an explanation.
 *
 * Supabase Realtime keeps the list live: when a tourist creates a new booking,
 * it appears on the guide's screen without a manual refresh.
 *
 * UI ready to test:
 *   - Tourist creates a booking → guide sees "Pending" card with Accept/Decline
 *   - Guide accepts → tourist's app updates live via Realtime
 *   - Guide declines → tourist sees "Cancelled", receives push notification
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { BookingWithGuide } from "@nepal-journey/types";
import { getMyBookings, updateBookingStatus } from "@/api/client";
import { supabase } from "@/lib/supabase";

const STATUS_COLORS: Record<string, string> = {
  pending:     "#F59E0B",
  confirmed:   "#2D6A4F",
  in_progress: "#003893",
  completed:   "#6B7280",
  cancelled:   "#DC143C",
  disputed:    "#7C3AED",
};

// ─── Action helpers ───────────────────────────────────────────────────────────

function ActionButtons({
  booking,
  onUpdate,
}: {
  booking: BookingWithGuide;
  onUpdate: (id: string, status: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const act = (newStatus: string, confirmMsg?: string) => {
    const doIt = async () => {
      setLoading(true);
      try {
        await updateBookingStatus(booking.id, newStatus);
        onUpdate(booking.id, newStatus);
      } catch (e) {
        Alert.alert("Error", e instanceof Error ? e.message : "Please try again.");
      } finally {
        setLoading(false);
      }
    };

    if (confirmMsg) {
      Alert.alert("Confirm", confirmMsg, [
        { text: "Cancel", style: "cancel" },
        { text: "Yes", onPress: () => void doIt() },
      ]);
    } else {
      void doIt();
    }
  };

  if (loading) {
    return <ActivityIndicator size="small" color="#003893" style={{ marginTop: 8 }} />;
  }

  if (booking.status === "pending") {
    return (
      <View style={s.actionRow}>
        <TouchableOpacity style={[s.actionBtn, s.acceptBtn]} onPress={() => act("confirmed")}>
          <Text style={s.actionBtnText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.actionBtn, s.declineBtn]}
          onPress={() => act("cancelled", "Decline this booking request?")}
        >
          <Text style={[s.actionBtnText, s.declineBtnText]}>Decline</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (booking.status === "confirmed") {
    return (
      <View style={s.actionRow}>
        <TouchableOpacity
          style={[s.actionBtn, s.startBtn]}
          onPress={() => act("in_progress", "Start this trip now?")}
        >
          <Text style={s.actionBtnText}>Start Trip</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (booking.status === "in_progress") {
    return (
      <View style={s.actionRow}>
        <TouchableOpacity
          style={[s.actionBtn, s.completeBtn]}
          onPress={() => act("completed", "Mark this trip as complete?")}
        >
          <Text style={s.actionBtnText}>Mark Complete</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function BookingCard({
  booking,
  onUpdate,
}: {
  booking: BookingWithGuide;
  onUpdate: (id: string, status: string) => void;
}) {
  const color = STATUS_COLORS[booking.status] ?? "#6B7280";
  const days = Math.max(
    1,
    Math.ceil(
      (new Date(booking.end_date).getTime() - new Date(booking.start_date).getTime()) / 86_400_000,
    ),
  );

  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={s.cardInfo}>
          <Text style={s.dates}>{booking.start_date} → {booking.end_date}</Text>
          <Text style={s.meta}>{days} day{days !== 1 ? "s" : ""} · {booking.booking_type.replace("_", " ")}</Text>
        </View>
        <View style={[s.badge, { backgroundColor: color }]}>
          <Text style={s.badgeText}>{booking.status.replace("_", " ")}</Text>
        </View>
      </View>

      <View style={s.earningsRow}>
        <Text style={s.earningsLabel}>Your earnings</Text>
        <Text style={s.earningsValue}>${booking.guide_payout_usd.toFixed(2)}</Text>
      </View>

      {booking.notes ? (
        <Text style={s.notes}>{booking.notes}</Text>
      ) : null}

      <ActionButtons booking={booking} onUpdate={onUpdate} />
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BookingsScreen() {
  const [bookings, setBookings] = useState<BookingWithGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingCount = bookings.filter((b) => b.status === "pending").length;

  const load = useCallback(async () => {
    try {
      const data = await getMyBookings();
      setBookings(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bookings");
    }
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  // Realtime: tourist creates a new booking → it pops up on guide's screen
  useEffect(() => {
    const channel = supabase
      .channel("guide-bookings")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings" },
        (payload) => {
          setBookings((prev) => [payload.new as BookingWithGuide, ...prev]);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const onUpdate = useCallback((id: string, status: string) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: status as BookingWithGuide["status"] } : b)),
    );
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
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          tintColor="#003893"
        />
      }
      ListHeaderComponent={
        <>
          {pendingCount > 0 && (
            <View style={s.pendingBanner}>
              <Text style={s.pendingBannerText}>
                🔔 {pendingCount} booking request{pendingCount !== 1 ? "s" : ""} awaiting your response
              </Text>
            </View>
          )}
          {error ? <Text style={s.error}>{error}</Text> : null}
        </>
      }
      ListEmptyComponent={
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No bookings yet</Text>
          <Text style={s.emptySub}>
            Complete your registration so NTB can verify your profile and tourists can find you.
          </Text>
        </View>
      }
      renderItem={({ item }) => <BookingCard booking={item} onUpdate={onUpdate} />}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F0F4F8" },
  list: { padding: 16, gap: 12, backgroundColor: "#F0F4F8", flexGrow: 1 },

  pendingBanner: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 4,
  },
  pendingBannerText: { fontSize: 13, fontWeight: "600", color: "#92400E" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardInfo: { flex: 1 },
  dates: { fontSize: 14, fontWeight: "700", color: "#1a1a2e" },
  meta: { fontSize: 12, color: "#888", marginTop: 2 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, color: "#fff", fontWeight: "600", textTransform: "capitalize" },

  earningsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  earningsLabel: { fontSize: 12, color: "#888" },
  earningsValue: { fontSize: 18, fontWeight: "800", color: "#2D6A4F" },

  notes: { fontSize: 12, color: "#666", fontStyle: "italic", borderTopWidth: 1, borderTopColor: "#f0f0f0", paddingTop: 6 },

  actionRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  actionBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  acceptBtn: { backgroundColor: "#2D6A4F" },
  declineBtn: { backgroundColor: "#FEE2E2", borderWidth: 1, borderColor: "#FECACA" },
  declineBtnText: { color: "#DC143C" },
  startBtn: { backgroundColor: "#003893" },
  completeBtn: { backgroundColor: "#6B7280" },

  error: { color: "#DC143C", fontSize: 13, textAlign: "center", marginBottom: 8 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#333" },
  emptySub: { fontSize: 13, color: "#888", textAlign: "center", paddingHorizontal: 32, lineHeight: 18 },
});

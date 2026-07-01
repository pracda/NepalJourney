/**
 * Booking creation screen.
 *
 * Flow:
 *   1. Tourist picks start date, end date, booking type
 *   2. Price preview is calculated client-side (days × daily_rate_usd)
 *   3. Commission (12%) and guide payout are shown for transparency
 *   4. Confirm → POST /bookings → navigate to bookings tab on success
 *
 * Date picker: uses a simple text input (ISO date) for cross-platform simplicity.
 * A proper date picker (expo-datetime-picker) can replace this in Stage 7.
 *
 * Route params: id (guide_id), rate (daily_rate_usd), name (guide name)
 */

import React, { useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { BookingType } from "@nepal-journey/types";
import { createBooking } from "@/api/client";

const NEPAL_BLUE = "#003893";
const NEPAL_RED = "#DC143C";
const COMMISSION_RATE = 0.12;

const BOOKING_TYPES: { value: BookingType; label: string; desc: string }[] = [
  { value: "day_trip", label: "Day Trip", desc: "Single day adventure" },
  { value: "multi_day", label: "Multi-Day Trek", desc: "Overnight trek with the guide" },
  { value: "custom", label: "Custom", desc: "Discuss your specific needs" },
];

function daysBetween(start: string, end: string): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  return Math.max(1, Math.ceil((e - s) / 86_400_000));
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());
}

export default function BookingScreen() {
  const { id: guideId, rate, name: guideName } = useLocalSearchParams<{
    id: string;
    rate: string;
    name: string;
  }>();
  const router = useRouter();

  const dailyRate = parseFloat(rate ?? "0");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [bookingType, setBookingType] = useState<BookingType>("day_trip");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const days = useMemo(
    () => (isValidDate(startDate) && isValidDate(endDate) ? daysBetween(startDate, endDate) : 0),
    [startDate, endDate],
  );
  const totalAmount = useMemo(() => days * dailyRate, [days, dailyRate]);
  const commission = useMemo(() => parseFloat((totalAmount * COMMISSION_RATE).toFixed(2)), [totalAmount]);
  const guidePayout = useMemo(() => parseFloat((totalAmount - commission).toFixed(2)), [totalAmount, commission]);

  const canSubmit =
    isValidDate(startDate) &&
    isValidDate(endDate) &&
    days > 0 &&
    totalAmount > 0;

  async function submit() {
    if (!canSubmit || !guideId) return;
    setLoading(true);
    try {
      const booking = await createBooking({
        guide_id: guideId,
        booking_type: bookingType,
        start_date: startDate,
        end_date: endDate,
        total_amount_usd: totalAmount,
        notes: notes.trim() || undefined,
      });

      Alert.alert(
        "Booking Sent!",
        `Your request has been sent to ${guideName ?? "your guide"}. You'll be notified once they confirm.`,
        [
          {
            text: "View Bookings",
            onPress: () => router.replace("/(tabs)/bookings"),
          },
        ],
      );
      void booking; // suppress unused var lint
    } catch (e) {
      Alert.alert("Booking Failed", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Guide summary */}
          <View style={styles.guideBar}>
            <Text style={styles.guideBarLabel}>Booking with</Text>
            <Text style={styles.guideBarName}>{guideName ?? "Guide"}</Text>
            <Text style={styles.guideBarRate}>${dailyRate}/day</Text>
          </View>

          {/* Booking type */}
          <View style={styles.section}>
            <Text style={styles.label}>Trip Type</Text>
            <View style={styles.typeGrid}>
              {BOOKING_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.typeCard, bookingType === t.value && styles.typeCardActive]}
                  onPress={() => setBookingType(t.value)}
                >
                  <Text style={[styles.typeLabel, bookingType === t.value && styles.typeLabelActive]}>
                    {t.label}
                  </Text>
                  <Text style={styles.typeDesc}>{t.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Dates */}
          <View style={styles.section}>
            <Text style={styles.label}>Dates (YYYY-MM-DD)</Text>
            <View style={styles.dateRow}>
              <View style={styles.dateField}>
                <Text style={styles.dateFieldLabel}>Start</Text>
                <TextInput
                  style={[styles.dateInput, !isValidDate(startDate) && startDate ? styles.dateInputError : null]}
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="2026-09-01"
                  placeholderTextColor="#bbb"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              </View>
              <Text style={styles.dateSep}>→</Text>
              <View style={styles.dateField}>
                <Text style={styles.dateFieldLabel}>End</Text>
                <TextInput
                  style={[styles.dateInput, !isValidDate(endDate) && endDate ? styles.dateInputError : null]}
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="2026-09-08"
                  placeholderTextColor="#bbb"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              </View>
            </View>
            {days > 0 && (
              <Text style={styles.dayCount}>{days} day{days !== 1 ? "s" : ""}</Text>
            )}
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any special requirements, route preferences, group size..."
              placeholderTextColor="#bbb"
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Price breakdown */}
          {totalAmount > 0 && (
            <View style={styles.priceBox}>
              <Text style={styles.priceTitle}>Price Breakdown</Text>
              <View style={styles.priceLine}>
                <Text style={styles.priceLineLabel}>{days} day{days !== 1 ? "s" : ""} × ${dailyRate}/day</Text>
                <Text style={styles.priceLineValue}>${totalAmount.toFixed(2)}</Text>
              </View>
              <View style={styles.priceLine}>
                <Text style={styles.priceLineLabel}>Platform fee (12%)</Text>
                <Text style={styles.priceLineValue}>−${commission.toFixed(2)}</Text>
              </View>
              <View style={[styles.priceLine, styles.priceLineFinal]}>
                <Text style={styles.priceLineLabelBold}>Guide receives</Text>
                <Text style={styles.priceLineValueBold}>${guidePayout.toFixed(2)}</Text>
              </View>
              <View style={[styles.priceLine, styles.priceLineTotal]}>
                <Text style={styles.priceTotalLabel}>You pay</Text>
                <Text style={styles.priceTotalValue}>${totalAmount.toFixed(2)}</Text>
              </View>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Confirm button */}
        <View style={styles.ctaBar}>
          <TouchableOpacity
            style={[styles.ctaBtn, (!canSubmit || loading) && styles.ctaBtnDisabled]}
            disabled={!canSubmit || loading}
            onPress={() => void submit()}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.ctaBtnText}>
                {canSubmit ? `Confirm Booking — $${totalAmount.toFixed(0)}` : "Fill in dates to continue"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0F4F8" },
  scroll: { padding: 16, gap: 12 },

  guideBar: {
    backgroundColor: NEPAL_BLUE,
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  guideBarLabel: { fontSize: 12, color: "#aac4f0" },
  guideBarName: { flex: 1, fontSize: 16, fontWeight: "700", color: "#fff" },
  guideBarRate: { fontSize: 15, fontWeight: "700", color: "#fff" },

  section: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  label: { fontSize: 12, fontWeight: "700", color: "#888", textTransform: "uppercase", letterSpacing: 0.5 },

  typeGrid: { gap: 8 },
  typeCard: {
    borderWidth: 1.5,
    borderColor: "#e0e8f0",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#F8FAFC",
  },
  typeCardActive: { borderColor: NEPAL_BLUE, backgroundColor: "#EBF1FB" },
  typeLabel: { fontSize: 14, fontWeight: "700", color: "#555" },
  typeLabelActive: { color: NEPAL_BLUE },
  typeDesc: { fontSize: 12, color: "#888", marginTop: 2 },

  dateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dateField: { flex: 1, gap: 4 },
  dateFieldLabel: { fontSize: 11, color: "#888" },
  dateInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: "#1a1a2e",
    backgroundColor: "#F8FAFC",
  },
  dateInputError: { borderColor: NEPAL_RED },
  dateSep: { fontSize: 18, color: "#aaa", marginTop: 16 },
  dayCount: { fontSize: 13, color: NEPAL_BLUE, fontWeight: "600" },

  notesInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: "#1a1a2e",
    minHeight: 72,
    textAlignVertical: "top",
    backgroundColor: "#F8FAFC",
  },

  priceBox: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "#e0e8f0",
  },
  priceTitle: { fontSize: 13, fontWeight: "700", color: "#888", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  priceLine: { flexDirection: "row", justifyContent: "space-between" },
  priceLineLabel: { fontSize: 13, color: "#555" },
  priceLineValue: { fontSize: 13, color: "#555" },
  priceLineFinal: { paddingTop: 4, borderTopWidth: 1, borderTopColor: "#e0e8f0" },
  priceLineLabelBold: { fontSize: 13, fontWeight: "600", color: "#2D6A4F" },
  priceLineValueBold: { fontSize: 13, fontWeight: "700", color: "#2D6A4F" },
  priceLineTotal: { paddingTop: 4 },
  priceTotalLabel: { fontSize: 16, fontWeight: "800", color: "#1a1a2e" },
  priceTotalValue: { fontSize: 16, fontWeight: "800", color: NEPAL_BLUE },

  ctaBar: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e0e8f0",
    padding: 16,
  },
  ctaBtn: {
    backgroundColor: NEPAL_RED,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  ctaBtnDisabled: { backgroundColor: "#ccc" },
  ctaBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});

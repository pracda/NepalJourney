/**
 * Guide profile screen — shown when a tourist taps a guide card in the Planner.
 *
 * Sections:
 *   1. Hero: photo, name, location, tier badge, rating
 *   2. Quick stats: experience, daily rate, availability window
 *   3. Specializations + languages chips
 *   4. Verifications: NTB license, TAAN member, first aid
 *   5. Recent reviews (up to 10)
 *   6. Sticky "Book This Guide" CTA at the bottom
 *
 * Navigation: receives guide_id as a route param from Expo Router.
 * The CTA navigates to BookingScreen passing guide_id + daily_rate_usd.
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { GuideDetail, GuideReview } from "@nepal-journey/types";
import { getGuide, getGuideReviews } from "@/api/client";

const NEPAL_BLUE = "#003893";
const NEPAL_RED = "#DC143C";

// ─── Sub-components ───────────────────────────────────────────────────────────

function VerificationBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={[styles.verBadge, ok ? styles.verBadgeOk : styles.verBadgeNo]}>
      <Text style={styles.verBadgeText}>{ok ? "✓" : "✗"} {label}</Text>
    </View>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

function StarRow({ rating }: { rating: number }) {
  return (
    <Text style={styles.starRow}>
      {"★".repeat(Math.round(rating))}{"☆".repeat(5 - Math.round(rating))}
    </Text>
  );
}

function ReviewCard({ review }: { review: GuideReview }) {
  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <StarRow rating={review.overall_rating} />
        <Text style={styles.reviewDate}>
          {new Date(review.created_at).toLocaleDateString("en-NP", { dateStyle: "medium" })}
        </Text>
      </View>
      {review.comment ? (
        <Text style={styles.reviewComment}>{review.comment}</Text>
      ) : null}
      <View style={styles.reviewSubRatings}>
        {review.safety_rating != null && (
          <Text style={styles.subRating}>Safety {review.safety_rating}/5</Text>
        )}
        {review.knowledge_rating != null && (
          <Text style={styles.subRating}>Knowledge {review.knowledge_rating}/5</Text>
        )}
        {review.communication_rating != null && (
          <Text style={styles.subRating}>Communication {review.communication_rating}/5</Text>
        )}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function GuideDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [guide, setGuide] = useState<GuideDetail | null>(null);
  const [reviews, setReviews] = useState<GuideReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const [g, r] = await Promise.all([getGuide(id), getGuideReviews(id)]);
        setGuide(g);
        setReviews(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load guide");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={NEPAL_BLUE} />
      </View>
    );
  }

  if (error || !guide) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? "Guide not found"}</Text>
      </View>
    );
  }

  const isAvailable = guide.is_available && guide.verification_status === "verified";

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={styles.hero}>
          {guide.photo_url ? (
            <Image source={{ uri: guide.photo_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>{guide.name[0]?.toUpperCase() ?? "G"}</Text>
            </View>
          )}
          <Text style={styles.guideName}>{guide.name}</Text>
          <Text style={styles.guideLocation}>{guide.location}</Text>

          <View style={styles.heroStats}>
            <View style={styles.statBlock}>
              <Text style={styles.statValue}>⭐ {guide.rating.toFixed(1)}</Text>
              <Text style={styles.statLabel}>{guide.total_reviews} reviews</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBlock}>
              <Text style={styles.statValue}>{guide.experience_years}y</Text>
              <Text style={styles.statLabel}>experience</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBlock}>
              <Text style={styles.statValue}>${guide.daily_rate_usd}</Text>
              <Text style={styles.statLabel}>per day</Text>
            </View>
          </View>

          {guide.tier === "elite" && (
            <View style={styles.eliteBadge}>
              <Text style={styles.eliteBadgeText}>★ Elite Guide</Text>
            </View>
          )}
        </View>

        {/* Availability */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Availability</Text>
          <View style={styles.availRow}>
            <View style={[styles.availDot, { backgroundColor: isAvailable ? "#2D6A4F" : "#DC143C" }]} />
            <Text style={styles.availText}>
              {isAvailable ? "Available for bookings" : "Not currently available"}
            </Text>
          </View>
          {guide.availability_start && (
            <Text style={styles.availDates}>
              {guide.availability_start}{guide.availability_end ? ` → ${guide.availability_end}` : ""}
            </Text>
          )}
        </View>

        {/* Specializations */}
        {guide.specializations?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Specializations</Text>
            <View style={styles.chips}>
              {guide.specializations.map((s) => <Chip key={s} label={s} />)}
            </View>
          </View>
        )}

        {/* Languages */}
        {guide.languages?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Languages</Text>
            <View style={styles.chips}>
              {guide.languages.map((l) => <Chip key={l} label={l} />)}
            </View>
          </View>
        )}

        {/* Verifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Certifications</Text>
          <View style={styles.chips}>
            <VerificationBadge label="NTB Licensed" ok={!!guide.ntb_license_number} />
            <VerificationBadge label="TAAN Member" ok={guide.taan_member} />
            <VerificationBadge label="First Aid" ok={guide.first_aid_certified} />
          </View>
        </View>

        {/* Reviews */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Reviews ({guide.total_reviews})
          </Text>
          {reviews.length > 0 ? (
            reviews.map((r) => <ReviewCard key={r.id} review={r} />)
          ) : (
            <Text style={styles.noReviews}>No reviews yet — be the first!</Text>
          )}
        </View>

        {/* Bottom padding so content clears the sticky button */}
        <View style={{ height: 90 }} />
      </ScrollView>

      {/* Sticky CTA */}
      <View style={styles.ctaBar}>
        <View style={styles.ctaRate}>
          <Text style={styles.ctaRateValue}>${guide.daily_rate_usd}</Text>
          <Text style={styles.ctaRateLabel}>/day</Text>
        </View>
        <TouchableOpacity
          style={[styles.ctaBtn, !isAvailable && styles.ctaBtnDisabled]}
          disabled={!isAvailable}
          onPress={() =>
            router.push({
              pathname: "/book/[id]",
              params: { id: guide.id, rate: String(guide.daily_rate_usd), name: guide.name },
            })
          }
        >
          <Text style={styles.ctaBtnText}>
            {isAvailable ? "Book This Guide" : "Not Available"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0F4F8" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { paddingBottom: 16 },
  errorText: { color: NEPAL_RED, fontSize: 14 },

  // Hero
  hero: {
    backgroundColor: "#fff",
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e8f0",
  },
  avatar: { width: 96, height: 96, borderRadius: 48, marginBottom: 12 },
  avatarPlaceholder: { backgroundColor: NEPAL_BLUE, justifyContent: "center", alignItems: "center" },
  avatarInitial: { color: "#fff", fontSize: 38, fontWeight: "700" },
  guideName: { fontSize: 22, fontWeight: "800", color: "#1a1a2e" },
  guideLocation: { fontSize: 14, color: "#888", marginTop: 2, marginBottom: 16 },
  heroStats: { flexDirection: "row", gap: 0, alignItems: "center" },
  statBlock: { alignItems: "center", paddingHorizontal: 20 },
  statValue: { fontSize: 17, fontWeight: "700", color: NEPAL_BLUE },
  statLabel: { fontSize: 11, color: "#888", marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: "#e0e8f0" },
  eliteBadge: {
    marginTop: 12,
    backgroundColor: "#FFF3CD",
    borderWidth: 1,
    borderColor: "#FFD700",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  eliteBadgeText: { color: "#856404", fontSize: 12, fontWeight: "700" },

  // Sections
  section: {
    backgroundColor: "#fff",
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },

  // Availability
  availRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  availDot: { width: 8, height: 8, borderRadius: 4 },
  availText: { fontSize: 14, color: "#333" },
  availDates: { fontSize: 12, color: "#888", marginTop: 4 },

  // Chips
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { backgroundColor: "#F0F4F8", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, color: NEPAL_BLUE, fontWeight: "600" },

  // Verification badges
  verBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  verBadgeOk: { backgroundColor: "#D1FAE5" },
  verBadgeNo: { backgroundColor: "#FEE2E2" },
  verBadgeText: { fontSize: 12, fontWeight: "600", color: "#1a1a2e" },

  // Reviews
  reviewCard: {
    borderWidth: 1,
    borderColor: "#e0e8f0",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    gap: 6,
  },
  reviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  starRow: { fontSize: 14, color: "#F59E0B", letterSpacing: 2 },
  reviewDate: { fontSize: 11, color: "#aaa" },
  reviewComment: { fontSize: 13, color: "#333", lineHeight: 18 },
  reviewSubRatings: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  subRating: { fontSize: 11, color: "#888" },
  noReviews: { fontSize: 13, color: "#aaa", textAlign: "center", paddingVertical: 12 },

  // Sticky CTA
  ctaBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e0e8f0",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
  },
  ctaRate: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  ctaRateValue: { fontSize: 22, fontWeight: "800", color: NEPAL_BLUE },
  ctaRateLabel: { fontSize: 13, color: "#888" },
  ctaBtn: {
    flex: 1,
    backgroundColor: NEPAL_RED,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaBtnDisabled: { backgroundColor: "#ccc" },
  ctaBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});

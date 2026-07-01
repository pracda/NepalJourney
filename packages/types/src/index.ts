// ─── Enums (mirror the Postgres enums in 001_initial_schema.sql) ─────────────

export type UserRole = "tourist" | "guide" | "ntb_admin" | "government";

export type GuideTier = "standard" | "elite";

export type VerificationStatus = "pending" | "verified" | "rejected" | "suspended";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "disputed";

export type BookingType = "day_trip" | "multi_day" | "custom";

export type ComplaintStatus = "open" | "investigating" | "resolved" | "escalated";

export type ComplaintSeverity = "low" | "medium" | "high" | "critical";

export type SosStatus = "active" | "acknowledged" | "resolved";

export type VerificationJobStatus = "queued" | "processing" | "completed" | "failed";

// ─── Shared primitives ────────────────────────────────────────────────────────

/** ISO-8601 date-time string (UTC). */
export type ISODateString = string;

/** UUID v4 string. */
export type UUID = string;

/** WKT POINT string, e.g. "POINT(85.3240 27.7172)". */
export type WKTPoint = string;

// ─── Users ────────────────────────────────────────────────────────────────────

export interface User {
  id: UUID;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  preferred_language: string;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// ─── Guides ───────────────────────────────────────────────────────────────────

export interface Guide {
  id: UUID;
  user_id: UUID;
  name: string;
  photo_url: string | null;
  location: string;
  experience_years: number;
  specializations: string[];
  ntb_license_number: string | null;
  taan_member: boolean;
  first_aid_certified: boolean;
  languages: string[];
  daily_rate_usd: number;
  phone: string;
  is_available: boolean;
  availability_start: string | null;
  availability_end: string | null;
  verification_status: VerificationStatus;
  tier: GuideTier;
  rating: number;
  total_reviews: number;
  total_trips: number;
  last_known_location: WKTPoint | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

/** Fields collected during Yatra guide registration. */
export interface GuideRegistrationFields {
  name?: string | null;
  location?: string | null;
  experience_years?: number | null;
  specializations?: string[] | null;
  ntb_license_number?: string | null;
  /** False when a guide explicitly states they don't have a license. */
  has_ntb_license?: boolean | null;
  taan_member?: boolean | null;
  first_aid_certified?: boolean | null;
  languages?: string[] | null;
  daily_rate_usd?: number | null;
  phone?: string | null;
  photo_url?: string | null;
  availability_start?: string | null;
  availability_end?: string | null;
}

// ─── Tourists ─────────────────────────────────────────────────────────────────

export interface Tourist {
  id: UUID;
  user_id: UUID;
  nationality: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  tracking_consent: boolean;
  last_known_location: WKTPoint | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export interface Route {
  id: UUID;
  slug: string;
  name: string;
  description: string | null;
  difficulty: string | null;
  duration_days: number | null;
  max_altitude_m: number | null;
  start_point: WKTPoint | null;
  end_point: WKTPoint | null;
  requires_permit: boolean;
  permit_name: string | null;
  best_months: string[] | null;
  estimated_cost_usd_low: number | null;
  estimated_cost_usd_high: number | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// ─── Trips ────────────────────────────────────────────────────────────────────

export interface Trip {
  id: UUID;
  tourist_id: UUID;
  guide_id: UUID | null;
  route_id: UUID | null;
  title: string;
  start_date: string | null;
  end_date: string | null;
  status: "planning" | "active" | "completed" | "cancelled";
  notes: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export interface Booking {
  id: UUID;
  tourist_id: UUID;
  guide_id: UUID;
  trip_id: UUID | null;
  booking_type: BookingType;
  status: BookingStatus;
  start_date: string;
  end_date: string;
  total_amount_usd: number;
  platform_commission_usd: number;
  guide_payout_usd: number;
  notes: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

/** Booking row joined with the guide's display fields. Returned by GET /bookings. */
export interface BookingWithGuide extends Booking {
  guides: {
    name: string;
    photo_url: string | null;
    location: string;
    phone?: string;
  } | null;
}

export interface CreateBookingRequest {
  guide_id: UUID;
  trip_id?: UUID;
  booking_type: BookingType;
  start_date: string;
  end_date: string;
  total_amount_usd: number;
  notes?: string;
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

export interface Review {
  id: UUID;
  booking_id: UUID;
  tourist_id: UUID;
  guide_id: UUID;
  overall_rating: number;
  safety_rating: number | null;
  knowledge_rating: number | null;
  communication_rating: number | null;
  punctuality_rating: number | null;
  comment: string | null;
  created_at: ISODateString;
}

// ─── GPS / Tracking ───────────────────────────────────────────────────────────

export interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude_meters?: number | null;
  accuracy_meters?: number | null;
  recorded_at?: ISODateString;
}

export interface GpsTrackEntry extends GpsPoint {
  id: UUID;
  tourist_id: UUID;
  trip_id: UUID | null;
  recorded_at: ISODateString;
}

// ─── SOS Alerts ───────────────────────────────────────────────────────────────

export interface SosAlert {
  id: UUID;
  tourist_id: UUID | null;
  guide_id: UUID | null;
  location: WKTPoint | null;
  altitude_meters: number | null;
  message: string | null;
  status: SosStatus;
  acknowledged_by: UUID | null;
  acknowledged_at: ISODateString | null;
  resolved_at: ISODateString | null;
  created_at: ISODateString;
}

// ─── Complaints ───────────────────────────────────────────────────────────────

export interface Complaint {
  id: UUID;
  reporter_id: UUID;
  reported_guide_id: UUID;
  booking_id: UUID | null;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  description: string;
  resolution_notes: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// ─── Yatra Agent (Guide Onboarding Chat) ──────────────────────────────────────

/** Registration nodes in order — must stay in sync with agents/yatra.py YatraNode enum. */
export type YatraNode =
  | "name"
  | "location"
  | "experience"
  | "specializations"
  | "ntb_license"
  | "certifications"
  | "languages"
  | "rate"
  | "phone"
  | "photo"
  | "availability"
  | "confirm"
  | "complete"
  | "operational";

export interface YatraMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: ISODateString;
}

export interface YatraSession {
  session_id: string;
  guide_id: UUID;
  current_node: YatraNode;
  registration_fields: GuideRegistrationFields;
  registration_complete: boolean;
  pending_verification: boolean;
  message_history: YatraMessage[];
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface YatraChatResponse {
  session_id: string;
  message: string;
  current_node: YatraNode;
  registration_complete: boolean;
  registration_progress: { done: number; total: number };
  /** Visible agent action tags shown in the sidebar, e.g. "NTB license sent to verification queue". */
  agent_actions: string[];
}

// ─── BridgeVoice Translation ──────────────────────────────────────────────────

export type SupportedLanguage = "en" | "ne";

export interface TranslateTextRequest {
  text: string;
  source_lang: SupportedLanguage;
  target_lang: SupportedLanguage;
}

export interface TranslateTextResponse {
  translation: string;
}

export interface TranslateVoiceResponse {
  transcript: string;
  translation: string;
  /** Base64-encoded MP3 audio of the translated speech. */
  audio_base64: string;
}

// ─── Guide Matching ───────────────────────────────────────────────────────────

export interface GuideMatchResult extends Pick<Guide,
  | "id"
  | "name"
  | "photo_url"
  | "location"
  | "experience_years"
  | "specializations"
  | "languages"
  | "daily_rate_usd"
  | "rating"
  | "total_reviews"
  | "tier"
  | "is_available"
  | "verification_status"
> {
  /** Cosine similarity score (0–1) from pgvector. Present in match results only. */
  similarity?: number;
}

// ─── Push tokens ─────────────────────────────────────────────────────────────

export interface PushToken {
  id: UUID;
  user_id: UUID;
  token: string;
  platform: "ios" | "android" | "web";
  created_at: ISODateString;
}

export interface RegisterPushTokenRequest {
  token: string;
  platform: "ios" | "android" | "web";
}

// ─── Guide detail (public, for tourist view) ──────────────────────────────────

export interface GuideDetail extends Guide {
  /** Only present when fetched via /guides/{id} — excluded from match results. */
  phone: string | null;
  availability_start: string | null;
  availability_end: string | null;
}

export interface GuideReview {
  id: UUID;
  booking_id: UUID;
  tourist_id: UUID;
  overall_rating: number;
  safety_rating: number | null;
  knowledge_rating: number | null;
  communication_rating: number | null;
  punctuality_rating: number | null;
  comment: string | null;
  created_at: ISODateString;
}

// ─── API error shape ──────────────────────────────────────────────────────────

export interface ApiError {
  detail: string;
  status?: number;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface CurrentUser {
  id: UUID;
  email: string | null;
  role: UserRole;
}

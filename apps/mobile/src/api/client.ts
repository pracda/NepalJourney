import * as SecureStore from "expo-secure-store";
import type {
  ApiError,
  BookingWithGuide,
  CreateBookingRequest,
  GuideDetail,
  GuideMatchResult,
  GuideReview,
  GpsPoint,
  RegisterPushTokenRequest,
  SosAlert,
  TranslateVoiceResponse,
  TranslateTextRequest,
  TranslateTextResponse,
} from "@nepal-journey/types";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "access_token";

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ detail: res.statusText }))) as ApiError;
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Guide matching & discovery ───────────────────────────────────────────────

export async function matchGuides(preferences: string): Promise<GuideMatchResult[]> {
  const data = await request<{ guides: GuideMatchResult[] }>(
    `/guides/match?preferences=${encodeURIComponent(preferences)}`
  );
  return data.guides ?? data as unknown as GuideMatchResult[];
}

export async function listGuides(params?: {
  location?: string;
  specialization?: string;
}): Promise<GuideMatchResult[]> {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  const data = await request<{ guides: GuideMatchResult[] }>(`/guides${qs ? `?${qs}` : ""}`);
  return data.guides ?? [];
}

export async function getGuide(guideId: string): Promise<GuideDetail> {
  return request<GuideDetail>(`/guides/${guideId}`);
}

export async function getGuideReviews(guideId: string, limit = 10): Promise<GuideReview[]> {
  const data = await request<{ reviews: GuideReview[] }>(
    `/guides/${guideId}/reviews?limit=${limit}`
  );
  return data.reviews ?? [];
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export async function createBooking(payload: CreateBookingRequest): Promise<BookingWithGuide> {
  return request("/bookings", { method: "POST", body: JSON.stringify(payload) });
}

export async function getMyBookings(): Promise<BookingWithGuide[]> {
  const data = await request<{ bookings: BookingWithGuide[] }>("/bookings");
  return data.bookings ?? [];
}

export async function getBooking(bookingId: string): Promise<BookingWithGuide> {
  return request(`/bookings/${bookingId}`);
}

export async function updateBookingStatus(
  bookingId: string,
  newStatus: string,
): Promise<BookingWithGuide> {
  return request(`/bookings/${bookingId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: newStatus }),
  });
}

// ─── Push tokens ──────────────────────────────────────────────────────────────

export async function registerPushToken(payload: RegisterPushTokenRequest): Promise<void> {
  await request("/bookings/push-token", { method: "POST", body: JSON.stringify(payload) });
}

// ─── GPS tracking ─────────────────────────────────────────────────────────────

export async function sendGpsPoint(point: GpsPoint): Promise<void> {
  await request("/tracking/gps", { method: "POST", body: JSON.stringify(point) });
}

export async function flushGpsQueue(points: GpsPoint[]): Promise<void> {
  await request("/tracking/gps/batch", { method: "POST", body: JSON.stringify({ points }) });
}

export async function triggerSos(
  point: Pick<GpsPoint, "latitude" | "longitude" | "altitude_meters">,
  message?: string
): Promise<SosAlert> {
  return request("/tracking/sos", {
    method: "POST",
    body: JSON.stringify({ ...point, message }),
  });
}

// ─── Translation ──────────────────────────────────────────────────────────────

export async function translateVoice(
  audioBlob: Blob,
  filename: string,
  sourceLang: string,
  targetLang: string
): Promise<TranslateVoiceResponse> {
  const token = await getToken();
  const form = new FormData();
  form.append("audio", audioBlob, filename);
  form.append("source_lang", sourceLang);
  form.append("target_lang", targetLang);

  const res = await fetch(`${BASE_URL}/translate/voice`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ detail: res.statusText }))) as ApiError;
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<TranslateVoiceResponse>;
}

export async function translateText(payload: TranslateTextRequest): Promise<TranslateTextResponse> {
  return request("/translate/text", { method: "POST", body: JSON.stringify(payload) });
}

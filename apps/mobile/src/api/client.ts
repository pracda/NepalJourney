import * as SecureStore from "expo-secure-store";
import type {
  ApiError,
  Booking,
  CreateBookingRequest,
  GuideMatchResult,
  GpsPoint,
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

// ─── Guide matching ───────────────────────────────────────────────────────────

export async function matchGuides(preferences: string): Promise<GuideMatchResult[]> {
  return request(`/guides/match?preferences=${encodeURIComponent(preferences)}`);
}

export async function listGuides(params?: {
  location?: string;
  specialization?: string;
}): Promise<GuideMatchResult[]> {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return request(`/guides${qs ? `?${qs}` : ""}`);
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export async function createBooking(payload: CreateBookingRequest): Promise<Booking> {
  return request("/bookings", { method: "POST", body: JSON.stringify(payload) });
}

export async function getMyBookings(): Promise<Booking[]> {
  return request("/bookings");
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

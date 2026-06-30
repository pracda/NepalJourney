import * as SecureStore from "expo-secure-store";
import type {
  ApiError,
  YatraChatResponse,
  YatraMessage,
  Booking,
  Guide,
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

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
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

// ─── Yatra ────────────────────────────────────────────────────────────────────

export async function yatraGreet(sessionId: string): Promise<YatraChatResponse> {
  return request("/chat/yatra/greet", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export async function yatraChat(
  sessionId: string,
  message: string
): Promise<YatraChatResponse> {
  return request("/chat/yatra", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, message }),
  });
}

export async function yatraHistory(sessionId: string): Promise<YatraMessage[]> {
  return request(`/chat/yatra/${sessionId}/history`);
}

// ─── Guide profile ────────────────────────────────────────────────────────────

export async function getMyProfile(): Promise<Guide> {
  return request("/guides/me");
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export async function getMyBookings(): Promise<Booking[]> {
  return request("/bookings");
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

export async function translateText(
  payload: TranslateTextRequest
): Promise<TranslateTextResponse> {
  return request("/translate/text", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

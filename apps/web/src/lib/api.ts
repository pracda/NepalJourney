/**
 * Server-side API helpers for the NTB dashboard.
 * These run only in Next.js Server Components / Route Handlers — never in the browser.
 *
 * All functions take an access_token which must be an NTB admin JWT.
 * The FastAPI /admin/* endpoints enforce the role check server-side.
 */

import type { Guide, SosAlert, Booking } from "@nepal-journey/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── Admin guide types (richer than the public Guide type) ───────────────────

export interface AdminGuide extends Guide {
  ntb_license_number: string | null;
  taan_member: boolean;
  first_aid_certified: boolean;
  total_trips: number;
  created_at: string;
  version: number;
}

export interface AuditEntry {
  action: string;
  notes: string | null;
  previous_value: Record<string, unknown>;
  new_value: Record<string, unknown>;
  created_at: string;
  admin_user_id: string;
}

export interface AdminGuideDetail {
  guide: AdminGuide;
  audit_history: AuditEntry[];
}

export interface GuideListResponse {
  guides: AdminGuide[];
  total: number;
  offset: number;
  limit: number;
}

// ─── Core fetch helper ────────────────────────────────────────────────────────

async function serverRequest<T>(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ─── Public guide endpoints (tourist-facing, RLS-gated) ──────────────────────

export async function getActiveSosAlerts(token: string): Promise<SosAlert[]> {
  return serverRequest("/tracking/sos/active", token);
}

export async function getGuides(token: string): Promise<Guide[]> {
  return serverRequest("/guides", token);
}

export async function getBookings(token: string): Promise<Booking[]> {
  return serverRequest("/bookings", token);
}

// ─── Admin guide endpoints ────────────────────────────────────────────────────

export async function adminListGuides(
  token: string,
  params?: { verification_status?: string; limit?: number; offset?: number },
): Promise<GuideListResponse> {
  const qs = new URLSearchParams();
  if (params?.verification_status) qs.set("verification_status", params.verification_status);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const query = qs.toString() ? `?${qs}` : "";
  return serverRequest(`/admin/guides${query}`, token);
}

export async function adminGetGuide(token: string, guideId: string): Promise<AdminGuideDetail> {
  return serverRequest(`/admin/guides/${guideId}`, token);
}

export interface VerifyGuidePayload {
  action: "approve" | "reject";
  notes?: string;
  version: number;
}

export async function adminVerifyGuide(
  token: string,
  guideId: string,
  payload: VerifyGuidePayload,
): Promise<{ guide_id: string; verification_status: string; version: number }> {
  return serverRequest(`/admin/guides/${guideId}/verify`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function adminGetAuditLog(
  token: string,
  params?: { target_type?: string; limit?: number; offset?: number },
): Promise<{ entries: AuditEntry[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.target_type) qs.set("target_type", params.target_type);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const query = qs.toString() ? `?${qs}` : "";
  return serverRequest(`/admin/audit-log${query}`, token);
}

/**
 * Server-side API helpers for the NTB dashboard.
 * These run only in Next.js Server Components / Route Handlers — never in the browser.
 */

import type {
  Guide,
  SosAlert,
  Booking,
  Complaint,
} from "@nepal-journey/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function serverRequest<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export async function getActiveSosAlerts(token: string): Promise<SosAlert[]> {
  return serverRequest("/tracking/sos/active", token);
}

export async function getGuides(token: string): Promise<Guide[]> {
  return serverRequest("/guides", token);
}

export async function getBookings(token: string): Promise<Booking[]> {
  return serverRequest("/bookings", token);
}

"use client";

/**
 * GuideVerificationPanel — approve or reject a guide from the NTB dashboard.
 *
 * This is a client component because it manages local dialog state and submits
 * the PATCH request interactively. The parent Server Component passes in the
 * guide's current status and version (optimistic lock).
 *
 * Optimistic lock:
 *   We pass `version` from the server to the API. If another admin acted
 *   concurrently, the server returns 409 with the current state. We surface
 *   that as a user-readable error message and prompt the admin to refresh.
 *
 * Security:
 *   The request goes to the FastAPI /admin/* endpoint, not directly to Supabase.
 *   The admin JWT is read from the Supabase session client-side via useSession()
 *   so the service-role key never touches the browser.
 */

import { useState } from "react";
import { supabase } from "@/lib/supabase";

interface Props {
  guideId: string;
  guideName: string;
  currentStatus: string;
  version: number;
  onVerified?: (newStatus: string, newVersion: number) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function GuideVerificationPanel({
  guideId,
  guideName,
  currentStatus,
  version: initialVersion,
  onVerified,
}: Props) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(initialVersion);
  const [status, setStatus] = useState(currentStatus);

  const alreadyDecided = status === "verified" || status === "rejected";

  async function submit() {
    if (!action) return;
    if (action === "reject" && !notes.trim()) {
      setError("Please provide a reason for rejection.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("Session expired — please log in again.");
        return;
      }

      const res = await fetch(`${API_BASE}/admin/guides/${guideId}/verify`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action,
          notes: notes.trim() || undefined,
          version,
        }),
      });

      if (res.status === 409) {
        // Optimistic lock conflict — another admin acted first
        const body = await res.json();
        setError(
          `Another admin already ${body.detail?.current_status ?? "updated"} this guide. ` +
            "Refresh the page to see the current state.",
        );
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail ?? `Request failed (${res.status})`);
        return;
      }

      const data = await res.json();
      setStatus(data.verification_status);
      setVersion(data.version);
      setOpen(false);
      setNotes("");
      onVerified?.(data.verification_status, data.version);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error — please retry.");
    } finally {
      setLoading(false);
    }
  }

  const statusColor: Record<string, string> = {
    pending: "text-yellow-700 bg-yellow-50 border-yellow-200",
    verified: "text-green-700 bg-green-50 border-green-200",
    rejected: "text-red-700 bg-red-50 border-red-200",
    suspended: "text-gray-500 bg-gray-50 border-gray-200",
  };

  return (
    <div className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Verification</h2>

      {/* Current status */}
      <div className={`inline-flex items-center px-3 py-1 rounded-full border text-sm font-medium mb-6 ${statusColor[status] ?? "text-gray-500 bg-gray-50 border-gray-200"}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </div>

      {alreadyDecided ? (
        <p className="text-sm text-gray-400">
          This guide has already been {status}. No further action needed.
        </p>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={() => { setAction("approve"); setOpen(true); setError(null); }}
            className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={() => { setAction("reject"); setOpen(true); setError(null); }}
            className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors"
          >
            Reject
          </button>
        </div>
      )}

      {/* Confirmation dialog */}
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {action === "approve" ? "Approve" : "Reject"} — {guideName}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {action === "approve"
                ? "This guide will be marked as verified and their profile will become visible to tourists."
                : "This guide will be marked as rejected. An email notification will be sent with your reason."}
            </p>

            {/* Notes field */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {action === "reject" ? "Reason (required)" : "Notes (optional)"}
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  action === "reject"
                    ? "e.g. NTB license number could not be verified."
                    : "Any additional notes for the record..."
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 mb-4 bg-red-50 px-3 py-2 rounded-lg border border-red-200">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setOpen(false); setNotes(""); setError(null); }}
                disabled={loading}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={loading}
                className={`flex-1 px-4 py-2 text-white text-sm font-semibold rounded-lg transition-colors ${
                  action === "approve"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                } disabled:opacity-50`}
              >
                {loading ? "Saving…" : `Confirm ${action === "approve" ? "Approval" : "Rejection"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

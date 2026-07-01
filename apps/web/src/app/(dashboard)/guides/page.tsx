import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminToken } from "@/lib/supabase-server";
import { adminListGuides, type AdminGuide } from "@/lib/api";

export const metadata: Metadata = { title: "Guides — NTB Dashboard" };

// Revalidate every 60 s — guide list changes slowly; this avoids a full
// re-render on every page load while keeping data reasonably fresh.
export const revalidate = 60;

const VERIFICATION_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  verified: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  suspended: "bg-gray-100 text-gray-500",
};

function StatusBadge({ status }: { status: string }) {
  const color = VERIFICATION_COLOR[status] ?? "bg-gray-100 text-gray-500";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {status}
    </span>
  );
}

function GuideRow({ guide }: { guide: AdminGuide }) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{guide.name}</div>
        <div className="text-xs text-gray-400">{guide.location}</div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{guide.experience_years}y</td>
      <td className="px-4 py-3">
        <StatusBadge status={guide.verification_status} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {guide.tier === "elite" ? (
          <span className="text-amber-600 font-bold">★ Elite</span>
        ) : (
          "Standard"
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">⭐ {(guide.rating ?? 0).toFixed(1)}</td>
      <td className="px-4 py-3 text-sm text-gray-600">${guide.daily_rate_usd}/day</td>
      <td className="px-4 py-3">
        <Link
          href={`/guides/${guide.id}`}
          className="text-xs text-blue-700 hover:underline font-medium"
        >
          Review →
        </Link>
      </td>
    </tr>
  );
}

interface PageProps {
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function GuidesPage({ searchParams }: PageProps) {
  const token = await requireAdminToken();
  const { status, page } = await searchParams;

  const limit = 50;
  const offset = ((Number(page) || 1) - 1) * limit;

  let guides: AdminGuide[] = [];
  let total = 0;
  let fetchError: string | null = null;

  try {
    const result = await adminListGuides(token, {
      verification_status: status,
      limit,
      offset,
    });
    guides = result.guides;
    total = result.total;
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Failed to load guides";
  }

  const pendingCount = guides.filter((g) => g.verification_status === "pending").length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Guides</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total} total
            {pendingCount > 0 && (
              <span className="ml-2 text-yellow-700 font-semibold">
                · {pendingCount} pending review
              </span>
            )}
          </p>
        </div>

        {/* Status filter */}
        <form method="get">
          <select
            name="status"
            defaultValue={status ?? ""}
            onChange={(e) => {
              // Progressive enhancement — works without JS via form submit
              (e.target.closest("form") as HTMLFormElement).submit();
            }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </form>
      </div>

      {fetchError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {fetchError}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Guide</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Exp</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Tier</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Rating</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Rate</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {guides.length > 0 ? (
                guides.map((g) => <GuideRow key={g.id} guide={g} />)
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">
                    {status ? `No guides with status "${status}".` : "No guides found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Pagination footer */}
          {total > limit && (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
              <span>Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
              <div className="flex gap-2">
                {offset > 0 && (
                  <Link
                    href={`?${new URLSearchParams({ ...(status ? { status } : {}), page: String(Math.max(1, (Number(page) || 1) - 1)) })}`}
                    className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50"
                  >
                    Previous
                  </Link>
                )}
                {offset + limit < total && (
                  <Link
                    href={`?${new URLSearchParams({ ...(status ? { status } : {}), page: String((Number(page) || 1) + 1) })}`}
                    className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

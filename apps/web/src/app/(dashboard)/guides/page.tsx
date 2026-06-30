import type { Metadata } from "next";
import type { Guide } from "@nepal-journey/types";

export const metadata: Metadata = { title: "Guides — NTB Dashboard" };

const VERIFICATION_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  verified: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  suspended: "bg-gray-100 text-gray-500",
};

function GuideRow({ guide }: { guide: Guide }) {
  const color = VERIFICATION_COLOR[guide.verification_status] ?? "bg-gray-100 text-gray-500";
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{guide.name}</div>
        <div className="text-xs text-gray-400">{guide.location}</div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{guide.experience_years}y</td>
      <td className="px-4 py-3">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
          {guide.verification_status}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {guide.tier === "elite" && <span className="text-amber-600 font-bold">★ Elite</span>}
        {guide.tier === "standard" && "Standard"}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">⭐ {guide.rating.toFixed(1)}</td>
      <td className="px-4 py-3 text-sm text-gray-600">${guide.daily_rate_usd}/day</td>
      <td className="px-4 py-3">
        <button className="text-xs text-nepal-blue hover:underline font-medium">Review</button>
      </td>
    </tr>
  );
}

export default function GuidesPage() {
  // Data would be fetched server-side with a Supabase admin client.
  // Placeholder render until auth + Supabase client are wired up in a follow-on PR.
  const guides: Guide[] = [];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Guides</h1>
          <p className="text-sm text-gray-500 mt-1">Manage verification and tier status</p>
        </div>
        <div className="flex gap-3">
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

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
                  Connect Supabase to see guide data. See the dashboard Overview for setup steps.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

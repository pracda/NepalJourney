import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminToken } from "@/lib/supabase-server";
import { adminGetGuide, type AuditEntry } from "@/lib/api";
import GuideVerificationPanel from "@/components/GuideVerificationPanel";

export const metadata: Metadata = { title: "Guide Review — NTB Dashboard" };

// Always fresh — an admin reviewing a guide needs real-time data
export const revalidate = 0;

function AuditRow({ entry }: { entry: AuditEntry }) {
  const dt = new Date(entry.created_at).toLocaleString("en-NP", {
    timeZone: "Asia/Kathmandu",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <tr className="border-b border-gray-100 text-sm">
      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{dt}</td>
      <td className="px-4 py-3 font-medium text-gray-800">{entry.action.replace(/_/g, " ")}</td>
      <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{entry.notes ?? "—"}</td>
      <td className="px-4 py-3 text-gray-400 text-xs font-mono truncate max-w-[120px]">
        {entry.admin_user_id.slice(0, 8)}…
      </td>
    </tr>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-sm text-gray-800">{value ?? "—"}</dd>
    </div>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function GuideDetailPage({ params }: PageProps) {
  const { id } = await params;
  const token = await requireAdminToken();

  let data: Awaited<ReturnType<typeof adminGetGuide>> | null = null;
  let fetchError: string | null = null;

  try {
    data = await adminGetGuide(token, id);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Failed to load guide";
  }

  if (fetchError || !data) {
    return (
      <div className="p-8">
        <Link href="/guides" className="text-sm text-blue-700 hover:underline mb-4 inline-block">
          ← Back to Guides
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mt-4">
          {fetchError ?? "Guide not found"}
        </div>
      </div>
    );
  }

  const { guide, audit_history } = data;

  return (
    <div className="p-8 max-w-5xl">
      <Link href="/guides" className="text-sm text-blue-700 hover:underline mb-6 inline-block">
        ← Back to Guides
      </Link>

      <div className="flex items-start gap-4 mb-8">
        {guide.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={guide.photo_url}
            alt={guide.name}
            className="w-16 h-16 rounded-full object-cover border border-gray-200"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{guide.name}</h1>
          <p className="text-sm text-gray-500">{guide.location} · {guide.experience_years} years experience</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Profile details */}
        <div className="md:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Profile Details</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="NTB License" value={guide.ntb_license_number} />
            <Field label="TAAN Member" value={guide.taan_member ? "Yes" : "No"} />
            <Field label="First Aid Certified" value={guide.first_aid_certified ? "Yes" : "No"} />
            <Field
              label="Languages"
              value={
                Array.isArray(guide.languages) && guide.languages.length > 0
                  ? guide.languages.join(", ")
                  : "—"
              }
            />
            <Field
              label="Specializations"
              value={
                Array.isArray(guide.specializations) && guide.specializations.length > 0
                  ? guide.specializations.join(", ")
                  : "—"
              }
            />
            <Field label="Daily Rate" value={`$${guide.daily_rate_usd}/day`} />
            <Field label="Rating" value={`⭐ ${(guide.rating ?? 0).toFixed(1)} (${guide.total_reviews ?? 0} reviews)`} />
            <Field label="Total Trips" value={guide.total_trips ?? 0} />
            <Field label="Tier" value={guide.tier} />
            <Field
              label="Member Since"
              value={new Date(guide.created_at).toLocaleDateString("en-NP", {
                timeZone: "Asia/Kathmandu",
                dateStyle: "medium",
              })}
            />
          </dl>
        </div>

        {/* Verification panel (client component) */}
        <GuideVerificationPanel
          guideId={guide.id}
          guideName={guide.name}
          currentStatus={guide.verification_status}
          version={guide.version}
        />
      </div>

      {/* Audit history */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Audit History</h2>
          <p className="text-xs text-gray-400 mt-0.5">All admin actions on this guide, most recent first</p>
        </div>
        {audit_history.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Time (NPT)</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Action</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Notes</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Admin</th>
              </tr>
            </thead>
            <tbody>
              {audit_history.map((entry, i) => (
                <AuditRow key={i} entry={entry} />
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-6 py-8 text-center text-gray-400 text-sm">
            No admin actions recorded for this guide yet.
          </p>
        )}
      </div>
    </div>
  );
}

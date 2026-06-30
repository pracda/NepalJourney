/**
 * Dashboard overview — shows headline stats in stat cards.
 * Data fetched server-side so it's always fresh on load.
 *
 * Placeholder note: In production these numbers would be fetched from
 * Supabase admin queries. For now the page renders with a placeholder
 * "Connect Supabase" CTA when no token is available.
 */

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Overview — NTB Dashboard" };

interface StatCardProps {
  label: string;
  value: string | number;
  color?: string;
  note?: string;
}

function StatCard({ label, value, color = "text-nepal-blue", note }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
      <p className={`text-4xl font-extrabold ${color}`}>{value}</p>
      {note && <p className="text-xs text-gray-400 mt-2">{note}</p>}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Operations Overview</h1>
      <p className="text-gray-500 text-sm mb-8">Nepal Tourism Board · Real-time platform data</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        <StatCard label="Active Guides" value="—" note="Connect Supabase to see live data" />
        <StatCard label="Bookings This Month" value="—" />
        <StatCard label="Active SOS Alerts" value="—" color="text-nepal-red" />
        <StatCard label="Open Complaints" value="—" color="text-amber-600" />
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-base font-semibold text-gray-700 mb-4">Getting Started</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
          <li>Copy <code className="bg-gray-100 px-1 rounded">.env.example</code> to <code className="bg-gray-100 px-1 rounded">.env.local</code> and fill in your Supabase credentials.</li>
          <li>Run <code className="bg-gray-100 px-1 rounded">pnpm install</code> at the repo root, then <code className="bg-gray-100 px-1 rounded">pnpm dev:web</code>.</li>
          <li>Apply the DB migration: <code className="bg-gray-100 px-1 rounded">supabase db push</code> or run the SQL in <code className="bg-gray-100 px-1 rounded">api/db/migrations/</code> directly.</li>
          <li>Start the API: <code className="bg-gray-100 px-1 rounded">docker compose up</code> from the repo root (or <code className="bg-gray-100 px-1 rounded">supabase start</code> for full Supabase local dev).</li>
        </ol>
      </div>
    </div>
  );
}

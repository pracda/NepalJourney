import type { Metadata } from "next";

export const metadata: Metadata = { title: "Analytics — NTB Dashboard" };

export default function AnalyticsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Analytics</h1>
      <p className="text-sm text-gray-500 mb-8">Platform-wide booking, revenue, and trekker activity data</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Bookings Over Time</h2>
          <div className="h-40 flex items-center justify-center text-gray-300 text-sm">
            Chart — connect Supabase
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Revenue by Route</h2>
          <div className="h-40 flex items-center justify-center text-gray-300 text-sm">
            Chart — connect Supabase
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Active Trekkers (Live)</h2>
          <div className="h-40 flex items-center justify-center text-gray-300 text-sm">
            Map — connect Supabase Realtime + PostGIS
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Guide Tier Distribution</h2>
          <div className="h-40 flex items-center justify-center text-gray-300 text-sm">
            Chart — connect Supabase
          </div>
        </div>
      </div>
    </div>
  );
}

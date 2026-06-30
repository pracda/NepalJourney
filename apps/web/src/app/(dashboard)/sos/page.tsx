import type { Metadata } from "next";
import type { SosAlert } from "@nepal-journey/types";

export const metadata: Metadata = { title: "SOS Feed — NTB Dashboard" };

function AlertCard({ alert }: { alert: SosAlert }) {
  const age = Math.floor((Date.now() - new Date(alert.created_at).getTime()) / 60000);
  return (
    <div className="bg-white border border-red-100 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-widest text-nepal-red">
          {alert.status === "active" ? "🔴 ACTIVE" : alert.status === "acknowledged" ? "🟡 ACKNOWLEDGED" : "✅ RESOLVED"}
        </span>
        <span className="text-xs text-gray-400">{age}min ago</span>
      </div>
      {alert.message && <p className="text-sm text-gray-700 mb-3">{alert.message}</p>}
      <div className="flex gap-2 text-xs text-gray-400 mb-4">
        {alert.tourist_id && <span>Tourist: {alert.tourist_id.slice(0, 8)}…</span>}
        {alert.guide_id && <span>Guide: {alert.guide_id.slice(0, 8)}…</span>}
        {alert.altitude_meters && <span>{alert.altitude_meters}m</span>}
      </div>
      {alert.status === "active" && (
        <div className="flex gap-2">
          <button className="flex-1 text-xs bg-nepal-blue text-white rounded-lg py-2 font-semibold hover:bg-blue-900 transition-colors">
            Acknowledge
          </button>
          <button className="flex-1 text-xs border border-gray-200 rounded-lg py-2 font-semibold hover:bg-gray-50 transition-colors">
            Dispatch Rescue
          </button>
        </div>
      )}
    </div>
  );
}

export default function SosPage() {
  const alerts: SosAlert[] = [];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SOS Feed</h1>
          <p className="text-sm text-gray-500 mt-1">Active emergency alerts from the field</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-gray-500">Live</span>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-16 text-center">
          <p className="text-gray-400 text-sm">No active SOS alerts.</p>
          <p className="text-gray-300 text-xs mt-1">Connect Supabase Realtime for live updates.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {alerts.map((a) => <AlertCard key={a.id} alert={a} />)}
        </div>
      )}
    </div>
  );
}

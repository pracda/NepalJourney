import type { Metadata } from "next";

export const metadata: Metadata = { title: "Disputes — NTB Dashboard" };

export default function DisputesPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Disputes & Complaints</h1>
      <p className="text-sm text-gray-500 mb-8">Review escalated complaints and resolve booking disputes</p>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-16 text-center">
        <p className="text-gray-400 text-sm">No open disputes.</p>
        <p className="text-gray-300 text-xs mt-1">
          Disputes are auto-escalated from the complaints system after 3 complaints in 90 days.
        </p>
      </div>
    </div>
  );
}

import Link from "next/link";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/guides", label: "Guides" },
  { href: "/dashboard/sos", label: "SOS Feed" },
  { href: "/dashboard/disputes", label: "Disputes" },
  { href: "/dashboard/analytics", label: "Analytics" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 bg-nepal-blue text-white flex flex-col flex-shrink-0">
        <div className="px-6 py-5 border-b border-white/10">
          <p className="text-xs font-bold tracking-widest text-white/60 uppercase mb-1">Nepal Journey</p>
          <p className="text-lg font-bold">NTB Dashboard</p>
        </div>
        <nav className="flex-1 py-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center px-6 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-6 py-4 border-t border-white/10 text-xs text-white/40">
          Nepal Tourism Board
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-nepal-snow">
        {children}
      </main>
    </div>
  );
}

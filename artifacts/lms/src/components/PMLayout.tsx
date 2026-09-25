import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  Users,
  School,
  Menu,
  X,
  LogOut,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cohorts", label: "Cohorts", icon: Users },
  { href: "/schools", label: "Schools", icon: School },
];

export function PMLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const { user } = useAuth();

  function logout() {
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).finally(() => {
      window.location.href = "/login";
    });
  }

  const nav = (
    <nav className="flex flex-col gap-1 p-4">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = location === href || location.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              active
                ? "bg-[var(--color-warm-gold)]/15 text-[var(--color-warm-gold)]"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Icon size={18} />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[var(--color-cream)] flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-gray-200 shrink-0">
        <div className="px-4 py-5 border-b border-gray-100">
          <p className="font-bold text-[var(--color-deep-navy)] text-sm">Yes Futures LMS</p>
          <p className="text-xs text-gray-400 mt-0.5">Programme Manager</p>
        </div>
        {nav}
        <div className="mt-auto p-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 truncate mb-2">{user?.email}</p>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 w-56 bg-white z-30 flex flex-col transition-transform md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <p className="font-bold text-[var(--color-deep-navy)] text-sm">Yes Futures LMS</p>
          <button onClick={() => setMobileOpen(false)}>
            <X size={20} className="text-gray-500" />
          </button>
        </div>
        {nav}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button onClick={() => setMobileOpen(true)}>
            <Menu size={22} className="text-gray-600" />
          </button>
          <p className="font-semibold text-sm text-[var(--color-deep-navy)]">Yes Futures LMS</p>
        </header>

        <main className="flex-1 p-4 md:p-6 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

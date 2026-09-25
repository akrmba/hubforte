import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Users, Menu, X, LogOut } from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/my-students", label: "My Students", icon: Users },
];

export function CoachLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--color-cream)]">
      {/* Top bar */}
      <header className="sticky top-0 z-50 flex items-center justify-between h-14 px-4 bg-[var(--color-deep-navy)] text-white shadow-md">
        <button
          className="md:hidden p-1.5 rounded hover:bg-white/10"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        <span className="font-semibold text-sm tracking-wide">Yes Futures LMS</span>

        <div className="flex items-center gap-3 text-sm">
          <span className="hidden sm:inline text-white/70">{user?.name}</span>
          <a
            href="/api/auth/logout"
            className="p-1.5 rounded hover:bg-white/10"
            title="Log out"
          >
            <LogOut size={18} />
          </a>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar — desktop */}
        <nav className="hidden md:flex flex-col w-56 min-h-[calc(100vh-3.5rem)] bg-white border-r border-gray-200 p-3 gap-1">
          {NAV_ITEMS.map((item) => {
            const active = location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-[var(--color-warm-gold)]/10 text-[var(--color-warm-gold)]"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Mobile menu overlay */}
        {menuOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setMenuOpen(false)}>
            <nav
              className="absolute left-0 top-14 w-64 bg-white shadow-lg p-3 flex flex-col gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {NAV_ITEMS.map((item) => {
                const active = location.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      active
                        ? "bg-[var(--color-warm-gold)]/10 text-[var(--color-warm-gold)]"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 p-4 md:p-6 max-w-5xl">
          {children}
        </main>
      </div>
    </div>
  );
}

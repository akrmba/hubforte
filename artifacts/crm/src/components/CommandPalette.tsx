import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Search, ArrowRight, LayoutDashboard, Users, Building2, CheckSquare, Activity, Megaphone, Handshake, UserCheck, GraduationCap, TrendingUp, LifeBuoy, FileDown, FileUp, Settings, Shield } from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  keywords?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: "Contacts", href: "/contacts", icon: <Users className="w-4 h-4" /> },
  { label: "Organisations", href: "/organizations", icon: <Building2 className="w-4 h-4" /> },
  { label: "Tasks", href: "/tasks", icon: <CheckSquare className="w-4 h-4" /> },
  { label: "Activities", href: "/activities", icon: <Activity className="w-4 h-4" /> },
  { label: "Outreach", href: "/outreach", icon: <Megaphone className="w-4 h-4" /> },
  { label: "Funders", href: "/funders", icon: <Handshake className="w-4 h-4" /> },
  { label: "Volunteers", href: "/volunteers", icon: <UserCheck className="w-4 h-4" /> },
  { label: "Students", href: "/ext/students", icon: <GraduationCap className="w-4 h-4" /> },
  { label: "Pipeline", href: "/pipeline", icon: <TrendingUp className="w-4 h-4" /> },
  { label: "Support", href: "/support", icon: <LifeBuoy className="w-4 h-4" /> },
  { label: "Import", href: "/import", icon: <FileUp className="w-4 h-4" /> },
  { label: "Export", href: "/export", icon: <FileDown className="w-4 h-4" /> },
  { label: "Settings", href: "/settings", icon: <Settings className="w-4 h-4" /> },
  { label: "Admin", href: "/admin", icon: <Shield className="w-4 h-4" /> },
];

const RECENT_KEY = "hubforte-recent-pages";

function getRecent(): NavItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const hrefs: string[] = JSON.parse(raw);
    return hrefs.map(h => NAV_ITEMS.find(n => n.href === h)).filter(Boolean) as NavItem[];
  } catch { return []; }
}

function addRecent(href: string) {
  try {
    const existing = getRecent().map(n => n.href).filter(h => h !== href);
    localStorage.setItem(RECENT_KEY, JSON.stringify([href, ...existing].slice(0, 5)));
  } catch {}
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? NAV_ITEMS.filter(n =>
        n.label.toLowerCase().includes(query.toLowerCase()) ||
        n.href.toLowerCase().includes(query.toLowerCase()) ||
        (n.keywords || "").toLowerCase().includes(query.toLowerCase())
      )
    : getRecent().length > 0
      ? getRecent()
      : NAV_ITEMS.slice(0, 6);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => { setSelected(0); }, [query]);

  const navigate = (item: NavItem) => {
    addRecent(item.href);
    setLocation(item.href);
    onClose();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    else if (e.key === "Enter" && filtered[selected]) { navigate(filtered[selected]); }
    else if (e.key === "Escape") { onClose(); }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-lg mx-4 rounded-xl shadow-2xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKey}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search pages and actions..."
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none"
          />
          <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-slate-200 dark:border-slate-700 px-1.5 text-[10px] text-slate-400">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">No results for "{query}"</p>
          ) : (
            <>
              {!query && getRecent().length > 0 && (
                <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Recent</p>
              )}
              {filtered.map((item, i) => (
                <button
                  key={item.href}
                  onClick={() => navigate(item)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === selected
                      ? "bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className="text-slate-400">{item.icon}</span>
                  <span className="text-sm font-medium">{item.label}</span>
                  <ArrowRight className="w-3 h-3 ml-auto text-slate-300" />
                </button>
              ))}
            </>
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 flex gap-4 text-[10px] text-slate-400">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

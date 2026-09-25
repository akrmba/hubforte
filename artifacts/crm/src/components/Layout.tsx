import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useLogout } from "@workspace/api-client-react";
import { AiNavHelper } from "./AiNavHelper";
import { ThemeToggle } from "@/components/ThemeProvider";
import { CommandPalette } from "@/components/CommandPalette";
import { getRoleLabel } from "@/lib/roles";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Building2,
  Users,
  TrendingUp,
  BookOpen,
  BarChart3,
  Settings,
  Shield,
  Crown,
  Menu,
  Bell,
  Search,
  LogOut,
  User,
  Check,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Mail,
  CheckSquare,
  Megaphone,
  HeadphonesIcon,
  Heart,
  HandCoins,
  GraduationCap,
  UsersRound,
  Target,
  ShieldCheck,
  Zap,
  Paperclip,
  ExternalLink,
  Plus,
  Activity,
  Plug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, getNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// Palette — reads from CSS variables so dark mode works automatically.
// Values defined in index.css under :root and .dark
const C = {
  bg:           "var(--yf-bg)",
  sidebar:      "var(--yf-sidebar)",
  sidebarBorder:"var(--yf-sidebar-border)",
  topbar:       "var(--yf-topbar)",
  topbarBorder: "var(--yf-topbar-border)",
  textPrimary:  "var(--yf-text-primary)",
  textSecond:   "var(--yf-text-second)",
  textMuted:    "var(--yf-text-muted)",
  accent:       "var(--yf-accent)",
  accentLight:  "var(--yf-accent-light)",
  accentMid:    "var(--yf-accent-mid)",
  hover:        "var(--yf-hover)",
};

const COLLAPSE_KEY = "yf_sidebar_collapsed";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function YFLogo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}>
      <div
        className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
        style={{ background: C.accent }}
      >
        <span className="font-black text-[11px] tracking-tighter" style={{ color: "#fff8f0" }}>YF</span>
      </div>
      {!collapsed && (
        <div className="flex flex-col leading-none">
          <span className="font-semibold text-[13px]" style={{ color: C.textPrimary, letterSpacing: "0.01em" }}>Yes Futures</span>
          <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: C.textMuted }}>CRM</span>
        </div>
      )}
    </div>
  );
}

const NAV_SECTIONS = [
  {
    label: "Core",
    items: [
      { href: "/ext/dashboard",  icon: LayoutDashboard, label: "Home",           always: true },
      { href: "/ext/schools",    icon: Building2,       label: "Organisations",  module: "organisations" },
      { href: "/ext/contacts",   icon: Users,           label: "Contacts",       module: "contacts" },
      { href: "/pipeline",       icon: TrendingUp,      label: "Pipeline",       module: "pipeline" },
    ],
  },
  {
    label: "Engagement",
    items: [
      { href: "/outreach",       icon: Megaphone,       label: "Outreach & Campaigns", module: "outreach" },
      { href: "/support",        icon: HeadphonesIcon,  label: "Support Tickets",      module: "support" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/ext/volunteers", icon: Heart,           label: "Volunteers",     module: "volunteers" },
      { href: "/funders",        icon: HandCoins,       label: "Funders",        module: "funders" },
    ],
  },
  {
    label: "Delivery",
    items: [
      { href: "/ext/programmes", icon: BookOpen,        label: "Programmes",     module: "programmes" },
      { href: "/ext/cohorts",    icon: UsersRound,      label: "Cohorts",        module: "cohorts" },
    ],
  },
  {
    label: "Compliance",
    items: [
      { href: "/ext/outcomes",      icon: Target,       label: "Outcomes",       module: "outcomes" },
      { href: "/ext/safeguarding",  icon: ShieldCheck,  label: "Safeguarding",   module: "safeguarding" },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/ext/automation",   icon: Zap,           label: "Automation",     module: "automation" },
      { href: "/ext/attachments",  icon: Paperclip,     label: "Attachments",    module: "attachments" },
      { href: "/ext/reports",      icon: BarChart3,     label: "Reports",        module: "reports" },
      { href: "/integrations",     icon: Activity,      label: "Integrations",   always: true },
    ],
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isSuperAdmin, isLoading } = useAuth();
  const { isModuleEnabled } = useFeatureFlags();
  const [location, setLocation] = useLocation();
  const logout = useLogout();
  const { toast } = useToast();

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
  });
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); setCmdOpen(o => !o); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const toggleCollapse = () => setCollapsed(c => {
    const next = !c;
    try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch {}
    return next;
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebounce(searchQuery, 300);

  useEffect(() => {
    if (!debouncedSearch || debouncedSearch.length < 2) {
      setSearchResults(null); setSearchOpen(false); return;
    }
    setSearchLoading(true);
    api.get(`/search?q=${encodeURIComponent(debouncedSearch)}`)
      .then((data: any) => { setSearchResults(data); setSearchOpen(true); })
      .catch(() => setSearchResults(null))
      .finally(() => setSearchLoading(false));
  }, [debouncedSearch]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const handleSearchNavigate = (path: string) => {
    setSearchOpen(false); setSearchQuery(""); setSearchResults(null); setLocation(path);
  };

  const hasResults = searchResults && (
    searchResults.contacts?.length > 0 || searchResults.organizations?.length > 0 ||
    searchResults.funders?.length > 0 || searchResults.opportunities?.length > 0 ||
    searchResults.tasks?.length > 0 || searchResults.campaigns?.length > 0
  );

  const handleLogout = () => logout.mutate(undefined, { onSuccess: () => setLocation("/login") });

  const queryClient = useQueryClient();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const { data: notifications = [] } = useQuery<AppNotification[]>({
    queryKey: ["notifications"],
    queryFn: getNotifications,
    refetchInterval: 60000,
  });
  const markAllRead = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  if (isLoading || !user) return null;

  const visibleSections = NAV_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(l => l.always || (l.module ? isModuleEnabled(l.module) : true)),
  })).filter(section => section.items.length > 0);
  const lmsUrl = import.meta.env.VITE_LMS_URL;
  const settingsLinks = [
    ...(isModuleEnabled("lms") ? [{ href: lmsUrl || "#", icon: GraduationCap, label: "LMS", external: true, lmsUnconfigured: !lmsUrl }] : []),
    { href: "/settings",     icon: Settings, label: "Settings" },
    ...(isAdmin      ? [{ href: "/admin",       icon: Shield, label: "Admin" }, { href: "/admin/apps", icon: Plug, label: "Connected Apps" }, { href: "/admin/team", icon: Users, label: "Team" }]       : []),
    ...(isSuperAdmin ? [{ href: "/super-admin", icon: Crown,  label: "Super Admin" }, { href: "/super-admin/health", icon: Activity, label: "System Health" }, { href: "/super-admin/knowledge-base", icon: BookOpen, label: "Knowledge Base" }] : []),
  ];

  const sidebarW = collapsed ? "w-[58px]" : "w-52";

  const NavContent = ({ mobile = false }: { mobile?: boolean }) => {
    const isC = collapsed && !mobile;
    return (
      <div className="flex flex-col h-full" style={{ background: C.sidebar, borderRight: `1px solid ${C.sidebarBorder}` }}>
        {/* Logo */}
        <div
          className={`flex items-center h-14 px-3.5 ${isC ? "justify-center" : "justify-between"}`}
          style={{ borderBottom: `1px solid ${C.sidebarBorder}` }}
        >
          <YFLogo collapsed={isC} />
          {!mobile && (
            <button
              onClick={toggleCollapse}
              className="p-1 rounded-md transition-colors"
              style={{ color: C.textMuted }}
              onMouseEnter={e => (e.currentTarget.style.background = C.hover)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              {isC ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        {/* Primary nav */}
        <nav className="flex-1 py-3 px-2 space-y-3 overflow-y-auto">
          {visibleSections.map((section, si) => (
            <div key={section.label}>
              {si > 0 && <div className="mx-2 mb-1.5" style={{ borderTop: `1px solid ${C.sidebarBorder}` }} />}
              {!isC && (
                <div className="px-3 pb-1 text-[10px] uppercase tracking-widest font-semibold" style={{ color: C.textMuted }}>
                  {section.label}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map(link => {
                  const isActive = location === link.href || location.startsWith(link.href + "/");
                  return (
                    <Link key={link.href} href={link.href} className="block">
                      <div
                        title={isC ? link.label : undefined}
                        className={`flex items-center gap-2.5 rounded-lg text-sm font-medium transition-all duration-100 select-none ${isC ? "justify-center px-0 py-2.5 mx-1" : "px-3 py-2"}`}
                        style={{
                          color: isActive ? C.accent : C.textSecond,
                          background: isActive ? C.accentLight : "transparent",
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.hover; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                      >
                        <link.icon
                          className={`flex-shrink-0 ${isC ? "h-5 w-5" : "h-4 w-4"}`}
                          style={{ color: isActive ? C.accent : C.textMuted }}
                        />
                        {!isC && <span className="truncate">{link.label}</span>}
                        {isActive && !isC && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: C.accent }} />
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Settings */}
        <div className="px-2 pb-2 pt-2 space-y-0.5" style={{ borderTop: `1px solid ${C.sidebarBorder}` }}>
          {settingsLinks.map(link => {
            const isExt = 'external' in link && link.external;
            const isLmsUnconfigured = 'lmsUnconfigured' in link && link.lmsUnconfigured;
            const isActive = !isExt && (location === link.href || location.startsWith(link.href + "/"));
            const isC2 = collapsed && !mobile;
            const inner = (
              <div
                title={isC2 ? link.label : undefined}
                className={`flex items-center gap-2.5 rounded-lg text-sm font-medium transition-all duration-100 select-none ${isC2 ? "justify-center px-0 py-2 mx-1" : "px-3 py-1.5"}`}
                style={{ color: isActive ? C.accent : C.textMuted, background: isActive ? C.accentLight : "transparent" }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.hover; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <link.icon className="flex-shrink-0 h-4 w-4" style={{ color: isActive ? C.accent : C.textMuted }} />
                {!isC2 && <span className="truncate">{link.label}</span>}
                {!isC2 && isExt && <ExternalLink className="ml-auto h-3 w-3 flex-shrink-0" style={{ color: C.textMuted }} />}
              </div>
            );
            if (isExt && isLmsUnconfigured) {
              return (
                <button key={link.href} className="block w-full text-left" onClick={() => toast({ title: "LMS not configured", description: "Contact your administrator.", variant: "destructive" })}>
                  {inner}
                </button>
              );
            }
            return isExt ? (
              <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="block">{inner}</a>
            ) : (
              <Link key={link.href} href={link.href} className="block">{inner}</Link>
            );
          })}
        </div>

        {/* User footer */}
        <div className="p-3" style={{ borderTop: `1px solid ${C.sidebarBorder}` }}>
          {collapsed && !mobile ? (
            <button
              onClick={handleLogout}
              title="Sign out"
              className="w-full flex justify-center p-1.5 rounded-lg transition-colors"
              style={{ color: C.textMuted }}
              onMouseEnter={e => (e.currentTarget.style.background = C.hover)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <Avatar className="h-7 w-7 flex-shrink-0">
                <AvatarImage src={(user as any).image || ""} />
                <AvatarFallback className="text-xs font-semibold" style={{ background: C.accentLight, color: C.accent }}>
                  {user.name?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate" style={{ color: C.textPrimary }}>{user.name}</p>
                <p className="text-[11px] truncate" style={{ color: C.textMuted }}>{getRoleLabel(user.role ?? "")}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-1 rounded-md transition-colors flex-shrink-0"
                style={{ color: C.textMuted }}
                onMouseEnter={e => (e.currentTarget.style.background = C.hover)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-[100dvh] flex w-full" style={{ background: C.bg }}>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      {/* Desktop sidebar */}
      <div className={`hidden md:flex flex-col fixed inset-y-0 z-50 transition-all duration-200 ${sidebarW}`}>
        <NavContent />
      </div>

      {/* Content */}
      <div className={`flex-1 flex flex-col min-h-[100dvh] transition-all duration-200 ${collapsed ? "md:pl-[58px]" : "md:pl-52"}`}>
        {/* Topbar */}
        <header
          className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 px-4 sm:px-5"
          style={{ background: C.topbar, borderBottom: `1px solid ${C.topbarBorder}` }}
        >
          {/* Mobile */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 rounded-lg" style={{ color: C.textSecond }}>
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-52 p-0 border-0">
              <NavContent mobile />
            </SheetContent>
          </Sheet>

          {/* Search */}
          <div ref={searchRef} className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: C.textMuted }} />
            <input
              className="h-8 w-full pl-8 pr-3 text-sm rounded-lg outline-none transition-all"
              style={{
                background: C.bg,
                border: `1px solid ${C.sidebarBorder}`,
                color: C.textPrimary,
              }}
              placeholder="Search..."
              type="search"
              autoComplete="off"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={e => {
                e.currentTarget.style.borderColor = C.accent;
                e.currentTarget.style.background = "#fff8f0";
                if (hasResults) setSearchOpen(true);
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = C.sidebarBorder;
                e.currentTarget.style.background = C.bg;
              }}
            />
            {searchOpen && (
              <div
                className="absolute top-full left-0 right-0 mt-1.5 rounded-xl z-50 max-h-96 overflow-y-auto"
                style={{ background: C.sidebar, border: `1px solid ${C.sidebarBorder}`, boxShadow: "0 8px 32px rgba(28,20,16,0.12)" }}
              >
                {searchLoading && <div className="p-4 text-sm text-center" style={{ color: C.textMuted }}>Searching...</div>}
                {!searchLoading && !hasResults && <div className="p-4 text-sm text-center" style={{ color: C.textMuted }}>No results for "{debouncedSearch}"</div>}
                {[
                  { key: "contacts",      label: "Contacts",      icon: User,        path: (c: any) => `/contacts/${c.id}`,           name: (c: any) => `${c.firstName} ${c.lastName}`, sub: (c: any) => c.email },
                  { key: "organizations", label: "Organisations",  icon: Building2,   path: (o: any) => `/organizations/${o.id}`,      name: (o: any) => o.name,                         sub: (o: any) => o.type },
                  { key: "funders",       label: "Funders",        icon: Landmark,    path: (f: any) => `/funders/${f.id}`,            name: (f: any) => f.name,                         sub: () => "" },
                  { key: "opportunities", label: "Pipeline",       icon: TrendingUp,  path: (o: any) => `/pipeline/${o.id}`,           name: (o: any) => o.name,                         sub: (o: any) => o.stage },
                  { key: "tasks",         label: "Tasks",          icon: CheckSquare, path: () => `/tasks`,                            name: (t: any) => t.title,                        sub: (t: any) => t.status },
                  { key: "campaigns",     label: "Campaigns",      icon: Mail,        path: (c: any) => `/outreach/campaigns/${c.id}`, name: (c: any) => c.name,                         sub: (c: any) => c.status },
                ].map(({ key, label, icon: Icon, path, name, sub }) =>
                  !searchLoading && searchResults?.[key]?.length > 0 ? (
                    <div key={key}>
                      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.textMuted, background: C.bg, borderBottom: `1px solid ${C.sidebarBorder}` }}>{label}</div>
                      {searchResults[key].map((item: any) => (
                        <button key={item.id} onClick={() => handleSearchNavigate(path(item))}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
                          style={{ color: C.textPrimary }}
                          onMouseEnter={e => (e.currentTarget.style.background = C.hover)}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                        >
                          <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: C.textMuted }} />
                          <span className="text-sm truncate">{name(item)}</span>
                          {sub(item) && <span className="text-xs ml-auto truncate" style={{ color: C.textMuted }}>{sub(item)}</span>}
                        </button>
                      ))}
                    </div>
                  ) : null
                )}
                {!searchLoading && hasResults && (
                  <div style={{ borderTop: `1px solid ${C.sidebarBorder}` }}>
                    <button onClick={() => handleSearchNavigate(`/search?q=${encodeURIComponent(debouncedSearch)}`)}
                      className="w-full px-3 py-2.5 text-xs font-medium text-center transition-colors"
                      style={{ color: C.accent }}
                      onMouseEnter={e => (e.currentTarget.style.background = C.hover)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      View all results for "{debouncedSearch}"
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right */}
          <div className="flex items-center gap-1 ml-auto">
            {/* Quick-create */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors"
                  style={{ color: C.textSecond }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.hover)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  title="Quick create"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44" style={{ background: C.sidebar, border: `1px solid ${C.sidebarBorder}` }}>
                <DropdownMenuItem onClick={() => setLocation("/ext/contacts?new=1")} style={{ color: C.textSecond }}>
                  <User className="mr-2 h-3.5 w-3.5" /> New Contact
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation("/ext/schools?new=1")} style={{ color: C.textSecond }}>
                  <Building2 className="mr-2 h-3.5 w-3.5" /> New Organisation
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation("/pipeline?new=1")} style={{ color: C.textSecond }}>
                  <TrendingUp className="mr-2 h-3.5 w-3.5" /> New Deal
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation("/tasks?new=1")} style={{ color: C.textSecond }}>
                  <CheckSquare className="mr-2 h-3.5 w-3.5" /> New Task
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation("/outreach?new=1")} style={{ color: C.textSecond }}>
                  <Megaphone className="mr-2 h-3.5 w-3.5" /> New Campaign
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ThemeToggle />
            {/* Notifications */}
            <div ref={notifRef} className="relative">
              <button
                className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors relative"
                style={{ color: C.textSecond }}
                onClick={() => setNotifOpen(!notifOpen)}
                onMouseEnter={e => (e.currentTarget.style.background = C.hover)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: C.accent }}>
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-80 rounded-xl z-50"
                  style={{ background: C.sidebar, border: `1px solid ${C.sidebarBorder}`, boxShadow: "0 8px 32px rgba(28,20,16,0.12)" }}
                >
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.sidebarBorder}` }}>
                    <span className="text-sm font-semibold" style={{ color: C.textPrimary }}>Notifications</span>
                    {unreadCount > 0 && (
                      <button className="text-xs font-medium flex items-center gap-1 transition-colors" style={{ color: C.accent }} onClick={() => markAllRead.mutate()}>
                        <Check className="h-3 w-3" /> Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-sm" style={{ color: C.textMuted }}>All caught up</div>
                    ) : notifications.map(n => (
                      <div key={n.id}
                        className={`px-4 py-3 cursor-pointer transition-colors ${n.read ? "opacity-60" : ""}`}
                        style={{ borderBottom: `1px solid ${C.sidebarBorder}` }}
                        onClick={() => {
                          if (!n.read) markRead.mutate(n.id);
                          if (n.link) { setNotifOpen(false); setLocation(n.link); }
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = C.hover)}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <div className="flex items-start gap-2.5">
                          {!n.read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: C.accent }} />}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: C.textPrimary }}>{n.title}</p>
                            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: C.textSecond }}>{n.message}</p>
                          </div>
                          <span className="text-[10px] whitespace-nowrap flex-shrink-0" style={{ color: C.textMuted }}>{timeAgo(n.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* User */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-8 px-2 flex items-center gap-2 rounded-lg transition-colors"
                  onMouseEnter={e => (e.currentTarget.style.background = C.hover)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={(user as any).image || ""} />
                    <AvatarFallback className="text-[11px] font-semibold" style={{ background: C.accentLight, color: C.accent }}>
                      {user.name?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm font-medium" style={{ color: C.textPrimary }}>{user.name?.split(" ")[0]}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40" style={{ background: C.sidebar, border: `1px solid ${C.sidebarBorder}` }}>
                <DropdownMenuItem onClick={handleLogout} style={{ color: C.textSecond }}>
                  <LogOut className="mr-2 h-3.5 w-3.5" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
      <AiNavHelper />
    </div>
  );
}

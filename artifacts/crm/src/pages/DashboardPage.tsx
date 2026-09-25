import { useEffect } from 'react';
import { useGetDashboardStats, getGetDashboardStatsQueryKey, useGetDashboardActivity, getGetDashboardActivityQueryKey, useGetDashboardTasksDue, getGetDashboardTasksDueQueryKey } from "@workspace/api-client-react";
import { logUserAction } from "../lib/analytics";
import { Building2, Users, CheckSquare, Mail, ArrowRight, Activity as ActivityIcon, LifeBuoy, TrendingUp, Plus, Phone, Calendar, FileText, AlertCircle, GraduationCap } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow, isPast, isToday } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function DashboardPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'DashboardPage' });
  }, []);

  const [, setLocation] = useLocation();
  const { isAdmin, isManager, isSuperAdmin } = useAuth();
  const { isModuleEnabled } = useFeatureFlags();

  // DO NOT rename or remove these hook calls
  const { data: stats, isLoading: isLoadingStats } = useGetDashboardStats({
    query: { queryKey: getGetDashboardStatsQueryKey() }
  });

  const { data: activities, isLoading: isLoadingActivities } = useGetDashboardActivity({
    query: { queryKey: getGetDashboardActivityQueryKey() }
  });

  const { data: tasks, isLoading: isLoadingTasks } = useGetDashboardTasksDue({
    query: { queryKey: getGetDashboardTasksDueQueryKey() }
  });

  const { data: pendingRuns } = useQuery({
    queryKey: ["remediation-runs-pending"],
    queryFn: () => api.get("/remediation/runs?status=PENDING_APPROVAL"),
    enabled: isAdmin,
    retry: false,
  });

  const { data: pipelineStages, isLoading: isLoadingPipeline } = useQuery<{ stage: string; dealCount: number; totalValue: number }[]>({
    queryKey: ["dashboard-pipeline-stages"],
    queryFn: () => api.get("/dashboard/pipeline-stages"),
    enabled: isModuleEnabled("pipeline"),
  });

  const statsAny = stats as any;
  const activitiesAny = (activities as any) || [];
  const tasksAny = (tasks as any) || [];

  // Activity type icons
  const activityIcon = (type: string) => {
    switch (type?.toUpperCase()) {
      case "CALL": return <Phone className="w-3.5 h-3.5" />;
      case "EMAIL": return <Mail className="w-3.5 h-3.5" />;
      case "MEETING": return <Calendar className="w-3.5 h-3.5" />;
      case "NOTE": return <FileText className="w-3.5 h-3.5" />;
      default: return <ActivityIcon className="w-3.5 h-3.5" />;
    }
  };

  // Build last-7-days activity chart data
  const activityChartData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString("en-GB", { weekday: "short" });
    const count = activitiesAny.filter((a: any) => {
      const ad = new Date(a.date || a.createdAt);
      return ad.toDateString() === d.toDateString();
    }).length;
    return { label, count };
  });

  // KPI cards — module-gated, with delta placeholder
  const card4 = isModuleEnabled("support")
    ? { label: "Open Tickets", value: statsAny?.openTickets, icon: <LifeBuoy className="w-5 h-5" />, href: "/support", color: "text-rose-600", bg: "bg-rose-50", delta: "—" }
    : isModuleEnabled("outreach")
    ? { label: "Active Campaigns", value: statsAny?.activeCampaigns, icon: <Mail className="w-5 h-5" />, href: "/outreach", color: "text-emerald-600", bg: "bg-emerald-50", delta: "—" }
    : null;

  const kpiCards = [
    { label: "Total Contacts", value: statsAny?.totalContacts, icon: <Users className="w-5 h-5" />, href: "/contacts", color: "text-indigo-600", bg: "bg-indigo-50", module: "contacts", delta: "—" },
    { label: "Pipeline Value", value: statsAny?.pipelineValue != null ? `£${Number(statsAny.pipelineValue).toLocaleString()}` : "—", icon: <TrendingUp className="w-5 h-5" />, href: "/pipeline", color: "text-violet-600", bg: "bg-violet-50", isString: true, module: "pipeline", delta: "—" },
    { label: "Tasks Due Today", value: statsAny?.tasksDueToday, icon: <CheckSquare className="w-5 h-5" />, href: "/tasks", color: "text-amber-600", bg: "bg-amber-50", alert: (statsAny?.tasksDueToday ?? 0) > 0, module: null, delta: "—" },
    ...(card4 ? [{ ...card4, module: null, alert: false, isString: false }] : []),
  ].filter(c => !c.module || isModuleEnabled(c.module));

  const quickActions = [
    { label: "New Contact", href: "/contacts", icon: <Users className="w-4 h-4" />, module: "contacts" },
    { label: "New Organisation", href: "/organizations", icon: <Building2 className="w-4 h-4" />, module: "organisations" },
    { label: "New Deal", href: "/pipeline", icon: <TrendingUp className="w-4 h-4" />, module: "pipeline" },
    { label: "New Task", href: "/tasks", icon: <CheckSquare className="w-4 h-4" />, module: null },
    { label: "Send Campaign", href: "/outreach", icon: <Mail className="w-4 h-4" />, module: "outreach" },
  ].filter(a => !a.module || isModuleEnabled(a.module));

  return (
    <div className="p-5 md:p-7 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Here's what's happening today.</p>
        </div>
        {(isAdmin || isManager) && (
          <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white gap-1.5" onClick={() => setLocation("/contacts")}>
            <Plus className="w-4 h-4" /> New Contact
          </Button>
        )}
      </div>

      {/* Pending remediation alert */}
      {isAdmin && (pendingRuns as any)?.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800">{(pendingRuns as any).length} remediation run(s) pending approval.</span>
          <Link href="/admin" className="ml-auto text-sm font-medium text-amber-700 underline">Review</Link>
        </div>
      )}

      {/* Row 1: KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <Link key={card.label} href={card.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-5">
                {isLoadingStats ? (
                  <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-16" /></div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{card.label}</span>
                      <div className={`p-1.5 rounded-lg ${card.bg}`}>
                        <span className={card.color}>{card.icon}</span>
                      </div>
                    </div>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        {card.isString ? card.value : (card.value ?? 0)}
                      </span>
                      {(card as any).alert && ((card.value ?? 0) as number) > 0 && (
                        <Badge variant="destructive" className="mb-0.5 text-xs">Overdue</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">vs last month: {(card as any).delta ?? "—"}</p>
                  </>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Row 2: Activity feed + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Activity feed (65%) */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingActivities ? (
              <div className="px-5 pb-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : activitiesAny.length === 0 ? (
              <div className="px-5 pb-5 text-sm text-slate-400 text-center py-8">No recent activity yet.</div>
            ) : (
              <>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activitiesAny.slice(0, 10).map((a: any) => (
                    <div key={a.id} className="flex items-start gap-3 px-5 py-3">
                      <div className="mt-0.5 h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                        {activityIcon(a.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{a.summary || a.type}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {a.contactName && <span className="font-medium">{a.contactName}</span>}
                          {a.organizationName && <span> · {a.organizationName}</span>}
                          {a.date && <span> · {formatDistanceToNow(new Date(a.date), { addSuffix: true })}</span>}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800">
                  <Link href="/activities" className="text-sm text-cyan-600 hover:text-cyan-700 flex items-center gap-1">
                    View all activities <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Quick actions (35%) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quickActions.map((action) => (
              <Button
                key={action.label}
                variant="outline"
                className="w-full justify-start gap-2 text-sm"
                onClick={() => setLocation(action.href)}
              >
                {action.icon}
                {action.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Pipeline by Stage (module-gated, real data) */}
        {isModuleEnabled("pipeline") && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Pipeline by Stage</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingPipeline ? (
                <Skeleton className="h-32 w-full" />
              ) : !pipelineStages || pipelineStages.every(s => s.dealCount === 0) ? (
                <p className="text-sm text-slate-400 text-center py-6">No active pipeline deals.</p>
              ) : (
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart
                    layout="vertical"
                    data={pipelineStages.map(({ stage, dealCount, totalValue }) => ({
                      name: stage.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
                      value: totalValue,
                      count: dealCount,
                    }))}
                    barSize={14}
                    margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={90} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      cursor={{ fill: "#f1f5f9" }}
                      formatter={(val: number, _name: string, props: any) =>
                        [`£${val.toLocaleString()} (${props.payload.count} deal${props.payload.count !== 1 ? "s" : ""})`, "Value"]
                      }
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="#0891b2" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}

        {/* Activity this week chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Activity This Week</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingActivities ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={activityChartData} barSize={20}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis hide allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {activityChartData.map((_, i) => (
                      <Cell key={i} fill={i === activityChartData.length - 1 ? "#0891b2" : "#bae6fd"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: LMS card (module-gated) */}
      {isModuleEnabled("lms") && (
        <Card className="bg-cyan-600 border-cyan-600 text-white">
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <GraduationCap className="w-8 h-8 text-cyan-100 shrink-0" />
              <div>
                <p className="font-semibold text-lg">Learning Management System</p>
                {isLoadingStats ? (
                  <div className="flex gap-2 mt-1"><Skeleton className="h-3 w-32 bg-cyan-400" /><Skeleton className="h-3 w-40 bg-cyan-400" /></div>
                ) : (
                  <p className="text-cyan-100 text-sm">
                    {statsAny?.activeCohorts ?? 0} active cohort{(statsAny?.activeCohorts ?? 0) !== 1 ? "s" : ""} · {statsAny?.studentsEnrolledThisWeek ?? 0} students enrolled this week
                  </p>
                )}
              </div>
            </div>
            <a
              href={import.meta.env.VITE_LMS_URL || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={!import.meta.env.VITE_LMS_URL ? "pointer-events-none opacity-50" : ""}
            >
              <Button variant="secondary" size="sm" className="shrink-0 bg-white text-cyan-700 hover:bg-cyan-50">
                Open LMS <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </a>
          </CardContent>
        </Card>
      )}

      {/* Row 5: System status small cards (super admin only) */}
      {isSuperAdmin && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-dashed">
            <CardContent className="p-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide">API Status</p>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Operational</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardContent className="p-3">
              <p className="text-xs text-slate-400 uppercase tracking-wide">Error Rate</p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{statsAny?.errorRate ?? "0.0"}%</p>
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardContent className="p-3">
              <p className="text-xs text-slate-400 uppercase tracking-wide">Last Deployment</p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">—</p>
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardContent className="p-3 flex items-center">
              <Link href="/super-admin" className="text-sm text-cyan-600 hover:text-cyan-700 flex items-center gap-1">
                Health dashboard <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

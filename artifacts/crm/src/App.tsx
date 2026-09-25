import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import NotFound from "@/pages/not-found";
import { MaintenancePage } from "@/components/MaintenancePage";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

import LoginPage from "@/pages/LoginPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import AcceptInvitePage from "@/pages/AcceptInvitePage";
import RegisterPage from "@/pages/RegisterPage";
import TwoFactorPage from "@/pages/TwoFactorPage";
import DashboardPage from "@/pages/DashboardPage";
import OrganizationsPage from "@/pages/OrganizationsPage";
import OrganizationDetailPage from "@/pages/OrganizationDetailPage";
import ContactsPage from "@/pages/ContactsPage";
import ContactDetailPage from "@/pages/ContactDetailPage";
import TasksPage from "@/pages/TasksPage";
import ActivitiesPage from "@/pages/ActivitiesPage";
import OutreachPage from "@/pages/OutreachPage";
import NewCampaignPage from "@/pages/NewCampaignPage";
import CampaignDetailPage from "@/pages/CampaignDetailPage";
import TemplatesPage from "@/pages/TemplatesPage";
import TemplateEditorPage from "@/pages/TemplateEditorPage";
import ImportPage from "@/pages/ImportPage";
import ExportPage from "@/pages/ExportPage";
import SettingsPage from "@/pages/SettingsPage";
import AdminPage from "@/pages/AdminPage";
import VolunteersPage from "@/pages/VolunteersPage";
import VolunteerDetailPage from "@/pages/VolunteerDetailPage";
import FundersPage from "@/pages/FundersPage";
import FunderDetailPage from "@/pages/FunderDetailPage";
import PipelinePage from "@/pages/PipelinePage";
import OpportunityDetailPage from "@/pages/OpportunityDetailPage";
import ReportsPage from "@/pages/ReportsPage";
import SupportPage from "@/pages/SupportPage";
import TicketDetailPage from "@/pages/TicketDetailPage";
import SearchPage from "@/pages/SearchPage";
import SuperAdminPage from "./pages/SuperAdminPage";
import ModuleControlCentrePage from "./pages/ModuleControlCentrePage";
import HealthDashboardPage from "./pages/HealthDashboardPage";
import IntegrationsPage from "./pages/IntegrationsPage";
import AppsPage from "./pages/AppsPage";
import TeamPage from "./pages/TeamPage";
import KnowledgeBasePage from "./pages/KnowledgeBasePage";
import DeveloperSharePage from "./pages/DeveloperSharePage";
import ExtendedDashboardPage from "./pages/extended/DashboardPage";
import ExtendedSchoolsPage from "./pages/extended/SchoolsPage";
import ExtendedSchoolsPipelinePage from "./pages/extended/SchoolsPipelinePage";
import ExtendedSchoolDetailPage from "./pages/extended/SchoolDetailPage";
import ExtendedTrustsPage from "./pages/extended/TrustsPage";
import ExtendedTrustDetailPage from "./pages/extended/TrustDetailPage";
import ExtendedContactsPage from "./pages/extended/ContactsPage";
import ExtendedContactDetailPage from "./pages/extended/ContactDetailPage";
import ExtendedSponsorsPage from "./pages/extended/SponsorsPage";
import ExtendedSponsorDetailPage from "./pages/extended/SponsorDetailPage";
import ExtendedFundingPage from "./pages/extended/FundingPage";
import ExtendedFundingDetailPage from "./pages/extended/FundingDetailPage";
import ExtendedProgrammesPage from "./pages/extended/ProgrammesPage";
import ExtendedProgrammeDetailPage from "./pages/extended/ProgrammeDetailPage";
import ExtendedStudentsPage from "./pages/extended/StudentsPage";
import ExtendedStudentDetailPage from "./pages/extended/StudentDetailPage";
import ExtendedVolunteersPage from "./pages/extended/VolunteersPage";
import ExtendedVolunteerDetailPage from "./pages/extended/VolunteerDetailPage";
import ExtendedActivitiesPage from "./pages/extended/ActivitiesPage";
import ExtendedCohortsPage from "./pages/extended/CohortsPage";
import ExtendedSessionsPage from "./pages/extended/SessionsPage";
import ExtendedOutcomesPage from "./pages/extended/OutcomesPage";
import ExtendedSafeguardingPage from "./pages/extended/SafeguardingPage";
import ExtendedConsentManagementPage from "./pages/extended/ConsentManagementPage";
import ExtendedAttachmentsPage from "./pages/extended/AttachmentsPage";
import ExtendedReportingPage from "./pages/extended/ReportingPage";
import ExtendedAutomationPage from "./pages/extended/AutomationPage";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getMaintenanceStatus, onMaintenanceChange, api, registerApiErrorHandler } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    }
  }
});

function ProtectedRoute({ component: Component, ...rest }: any) {
  return (
    <Route {...rest}>
      {(params) => (
        <Layout>
          <Component params={params} />
        </Layout>
      )}
    </Route>
  );
}

function RootRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/ext/dashboard", { replace: true });
  }, [setLocation]);
  return null;
}

function AuthLoginRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/login", { replace: true });
  }, [setLocation]);
  return null;
}

function AuthForgotPasswordRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/forgot-password", { replace: true });
  }, [setLocation]);
  return null;
}

function Router() {
  const { toast } = useToast();
  const [maintenance, setMaintenance] = useState(() => getMaintenanceStatus());
  const [checked, setChecked] = useState(false);

  // Phase 7C: Register global API error handler for status-specific toasts
  useEffect(() => {
    registerApiErrorHandler((status, message, errorRefId) => {
      if (status === 401) return; // 401 redirects to login — no toast needed
      toast({
        title: status >= 500 ? "Something went wrong" : status === 403 ? "Access denied" : status === 429 ? "Too many requests" : "Error",
        description: errorRefId && status >= 500
          ? `${message} (Ref: ${errorRefId})`
          : message,
        variant: "destructive",
      });
    });
  }, [toast]);

  // Check maintenance status on mount and periodically
  useEffect(() => {
    const checkMaintenance = async () => {
      try {
        const res = await api.getRaw("/super-admin/maintenance");
        if (res.ok) {
          const data = await res.json();
          if (data.enabled) {
            setMaintenance({ isMaintenanceMode: true, maintenanceInfo: { message: data.message, estimatedResolution: data.estimatedResolution, enabledAt: data.enabledAt } });
          }
        }
      } catch {
        // If maintenance endpoint is unreachable, try to detect via 503
      }
      setChecked(true);
    };
    checkMaintenance();

    const unsub = onMaintenanceChange(() => {
      setMaintenance(getMaintenanceStatus());
    });

    // Poll every 30 seconds for maintenance status changes
    const interval = setInterval(checkMaintenance, 30000);
    return () => { unsub(); clearInterval(interval); };
  }, []);

  // Show maintenance page if detected — SUPER_ADMIN and PLATFORM_OWNER can still access the app
  const { data: currentUser } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "PLATFORM_OWNER";
  if (maintenance.isMaintenanceMode && !isSuperAdmin) {
    return <MaintenancePage info={maintenance.maintenanceInfo ?? undefined} />;
  }

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/auth/login" component={AuthLoginRedirect} />
      <Route path="/auth/forgot-password" component={AuthForgotPasswordRedirect} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/accept-invite" component={AcceptInvitePage} />
      <Route path="/auth/register" component={RegisterPage} />
      <Route path="/auth/2fa" component={TwoFactorPage} />
      <Route path="/" component={RootRedirect} />
      <ProtectedRoute path="/dashboard" component={DashboardPage} />
      <ProtectedRoute path="/organizations" component={OrganizationsPage} />
      <ProtectedRoute path="/organizations/:id" component={OrganizationDetailPage} />
      <ProtectedRoute path="/contacts" component={ContactsPage} />
      <ProtectedRoute path="/contacts/:id" component={ContactDetailPage} />
      <ProtectedRoute path="/tasks" component={TasksPage} />
      <ProtectedRoute path="/activities" component={ActivitiesPage} />
      <ProtectedRoute path="/volunteers" component={VolunteersPage} />
      <ProtectedRoute path="/volunteers/:id" component={VolunteerDetailPage} />
      <ProtectedRoute path="/funders" component={FundersPage} />
      <ProtectedRoute path="/funders/:id" component={FunderDetailPage} />
      <ProtectedRoute path="/pipeline" component={PipelinePage} />
      <ProtectedRoute path="/pipeline/:id" component={OpportunityDetailPage} />
      <ProtectedRoute path="/outreach" component={OutreachPage} />
      <ProtectedRoute path="/outreach/campaigns/new" component={NewCampaignPage} />
      <ProtectedRoute path="/outreach/campaigns/:id" component={CampaignDetailPage} />
      <ProtectedRoute path="/outreach/templates" component={TemplatesPage} />
      <ProtectedRoute path="/outreach/templates/new" component={TemplateEditorPage} />
      <ProtectedRoute path="/outreach/templates/:id/edit" component={TemplateEditorPage} />
      <ProtectedRoute path="/reports" component={ReportsPage} />
      <ProtectedRoute path="/support" component={SupportPage} />
      <ProtectedRoute path="/support/tickets/:id" component={TicketDetailPage} />
      <ProtectedRoute path="/import" component={ImportPage} />
      <ProtectedRoute path="/export" component={ExportPage} />
      <ProtectedRoute path="/settings" component={SettingsPage} />
      <ProtectedRoute path="/admin" component={AdminPage} />
      <ProtectedRoute path="/super-admin" component={SuperAdminPage} />
      <ProtectedRoute path="/super-admin/modules" component={ModuleControlCentrePage} />
      <ProtectedRoute path="/super-admin/health" component={HealthDashboardPage} />
      <ProtectedRoute path="/search" component={SearchPage} />
      <ProtectedRoute path="/ext/dashboard" component={ExtendedDashboardPage} />
      <ProtectedRoute path="/ext/schools" component={ExtendedSchoolsPage} />
      <ProtectedRoute path="/ext/schools/pipeline" component={ExtendedSchoolsPipelinePage} />
      <ProtectedRoute path="/ext/schools/:id" component={ExtendedSchoolDetailPage} />
      <ProtectedRoute path="/ext/trusts" component={ExtendedTrustsPage} />
      <ProtectedRoute path="/ext/trusts/:id" component={ExtendedTrustDetailPage} />
      <ProtectedRoute path="/ext/contacts" component={ExtendedContactsPage} />
      <ProtectedRoute path="/ext/contacts/:id" component={ExtendedContactDetailPage} />
      <ProtectedRoute path="/ext/sponsors" component={ExtendedSponsorsPage} />
      <ProtectedRoute path="/ext/sponsors/:id" component={ExtendedSponsorDetailPage} />
      <ProtectedRoute path="/ext/funding" component={ExtendedFundingPage} />
      <ProtectedRoute path="/ext/funding/:id" component={ExtendedFundingDetailPage} />
      <ProtectedRoute path="/ext/programmes" component={ExtendedProgrammesPage} />
      <ProtectedRoute path="/ext/programmes/:id" component={ExtendedProgrammeDetailPage} />
      <ProtectedRoute path="/ext/students" component={ExtendedStudentsPage} />
      <ProtectedRoute path="/ext/students/:id" component={ExtendedStudentDetailPage} />
      <ProtectedRoute path="/ext/volunteers" component={ExtendedVolunteersPage} />
      <ProtectedRoute path="/ext/volunteers/:id" component={ExtendedVolunteerDetailPage} />
      <ProtectedRoute path="/ext/activities" component={ExtendedActivitiesPage} />
      <ProtectedRoute path="/ext/cohorts" component={ExtendedCohortsPage} />
       <ProtectedRoute path="/ext/sessions" component={ExtendedSessionsPage} />
       <ProtectedRoute path="/ext/outcomes" component={ExtendedOutcomesPage} />
       <ProtectedRoute path="/ext/consent" component={ExtendedConsentManagementPage} />
       <ProtectedRoute path="/ext/attachments" component={ExtendedAttachmentsPage} />
       <ProtectedRoute path="/ext/safeguarding" component={ExtendedSafeguardingPage} />
       <ProtectedRoute path="/ext/reports" component={ExtendedReportingPage} />
       <ProtectedRoute path="/ext/automation" component={ExtendedAutomationPage} />
       <ProtectedRoute path="/integrations" component={IntegrationsPage} />
       <ProtectedRoute path="/admin/apps" component={AppsPage} />
       <ProtectedRoute path="/admin/team" component={TeamPage} />
       <ProtectedRoute path="/super-admin/knowledge-base" component={KnowledgeBasePage} />
       <Route path="/developer/share/:token" component={DeveloperSharePage} />
       <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;

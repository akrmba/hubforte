import { Switch, Route, Redirect } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { CoachLayout } from "@/components/CoachLayout";
import { PMLayout } from "@/components/PMLayout";
import { MyStudentsPage } from "@/pages/MyStudentsPage";
import { StudentHubPage } from "@/pages/StudentHubPage";
import { AttendancePage } from "@/pages/AttendancePage";
import { ScoresPage } from "@/pages/ScoresPage";
import { NarrativesPage } from "@/pages/NarrativesPage";
import { SurveyHandoverPage } from "@/pages/SurveyHandoverPage";
import { EnterPage } from "@/pages/EnterPage";
import { SurveyPage } from "@/pages/SurveyPage";
import { SurveyCodePage } from "@/pages/SurveyCodePage";
import { PMDashboardPage } from "@/pages/PMDashboardPage";
import { CohortsPage } from "@/pages/CohortsPage";
import { CreateCohortPage } from "@/pages/CreateCohortPage";
import { CohortOverviewPage } from "@/pages/CohortOverviewPage";
import { CohortStudentsPage } from "@/pages/CohortStudentsPage";
import { StudentImportPage } from "@/pages/StudentImportPage";
import { CompletenessDashboardPage } from "@/pages/CompletenessDashboardPage";
import { SurveyLinksPage } from "@/pages/SurveyLinksPage";
import { ReportContentPage } from "@/pages/ReportContentPage";
import { ImpactPreviewPage } from "@/pages/ImpactPreviewPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { AddStudentPage } from "@/pages/AddStudentPage";
import { StudentDetailPage } from "@/pages/StudentDetailPage";
import { SchoolsPage } from "@/pages/SchoolsPage";
import { TeacherLandingPage } from "@/pages/TeacherLandingPage";
import { TeacherStudentsPage } from "@/pages/TeacherStudentsPage";
import { TeacherFeedbackPage } from "@/pages/TeacherFeedbackPage";
import { StudentReportPortalPage } from "@/pages/StudentReportPortalPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = "http://localhost:5173/login";
    return null;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Switch>
      {/* ── Public token-exchange routes (no JWT) ── */}
      <Route path="/enter">
        <EnterPage />
      </Route>
      <Route path="/survey/code">
        <SurveyCodePage />
      </Route>
      <Route path="/survey">
        <SurveyPage />
      </Route>

      {/* ── Teacher portal (session-cookie, no JWT) ── */}
      <Route path="/report">
        <StudentReportPortalPage />
      </Route>

      {/* ── Teacher portal (session-cookie, no JWT) ── */}
      <Route path="/teacher/students/:studentId">
        {(params) => <TeacherFeedbackPage key={params.studentId} />}
      </Route>
      <Route path="/teacher/students">
        <TeacherStudentsPage />
      </Route>
      <Route path="/teacher">
        <TeacherLandingPage />
      </Route>

      {/* ── Coach portal (JWT required) ── */}
      <Route path="/my-students/:studentId/attendance">
        <ProtectedRoute>
          <CoachLayout><AttendancePage /></CoachLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/my-students/:studentId/scores">
        <ProtectedRoute>
          <CoachLayout><ScoresPage /></CoachLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/my-students/:studentId/narratives">
        <ProtectedRoute>
          <CoachLayout><NarrativesPage /></CoachLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/my-students/:studentId/survey">
        <ProtectedRoute>
          <CoachLayout><SurveyHandoverPage /></CoachLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/my-students/:studentId">
        <ProtectedRoute>
          <CoachLayout><StudentHubPage /></CoachLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/my-students">
        <ProtectedRoute>
          <CoachLayout><MyStudentsPage /></CoachLayout>
        </ProtectedRoute>
      </Route>

      {/* ── PM portal (JWT required) ── */}
      <Route path="/cohorts/new">
        <ProtectedRoute>
          <PMLayout><CreateCohortPage /></PMLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/cohorts/:cohortId/students/import">
        <ProtectedRoute>
          <PMLayout><StudentImportPage /></PMLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/cohorts/:cohortId/students/new">
        <ProtectedRoute>
          <PMLayout><AddStudentPage /></PMLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/cohorts/:cohortId/students/:studentId">
        <ProtectedRoute>
          <PMLayout><StudentDetailPage /></PMLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/cohorts/:cohortId/students">
        <ProtectedRoute>
          <PMLayout><CohortStudentsPage /></PMLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/cohorts/:cohortId/completeness">
        <ProtectedRoute>
          <PMLayout><CompletenessDashboardPage /></PMLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/cohorts/:cohortId/survey-links">
        <ProtectedRoute>
          <PMLayout><SurveyLinksPage /></PMLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/cohorts/:cohortId/report-content">
        <ProtectedRoute>
          <PMLayout><ReportContentPage /></PMLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/cohorts/:cohortId/impact">
        <ProtectedRoute>
          <PMLayout><ImpactPreviewPage /></PMLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/cohorts/:cohortId/reports">
        <ProtectedRoute>
          <PMLayout><ReportsPage /></PMLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/cohorts/:cohortId">
        <ProtectedRoute>
          <PMLayout><CohortOverviewPage /></PMLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/cohorts">
        <ProtectedRoute>
          <PMLayout><CohortsPage /></PMLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute>
          <PMLayout><PMDashboardPage /></PMLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/schools">
        <ProtectedRoute>
          <PMLayout><SchoolsPage /></PMLayout>
        </ProtectedRoute>
      </Route>

      {/* ── Root redirect ── */}
      <Route path="/">
        <Redirect to="/my-students" />
      </Route>
    </Switch>
  );
}

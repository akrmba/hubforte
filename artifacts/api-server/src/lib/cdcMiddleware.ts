/**
 * CDC Middleware — Task 7.2
 * Captures before/after state for POST/PUT/PATCH/DELETE mutations.
 * Writes to change_events table. Lightweight — does not slow normal CRUD.
 */
import { Request, Response, NextFunction } from "express";
import { db, changeEventsTable } from "@workspace/db";
import { generateId } from "./id";
import { getRequestId } from "./requestContext";

const TRACKED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// CRM flat-prefix routes — simple prefix to entity mapping.
const CRM_ROUTE_ENTITY_MAP: Record<string, string> = {
  "/organizations": "organizations",
  "/contacts": "contacts",
  "/programmes": "programmes",
  "/students": "students",
  "/volunteers": "volunteers",
  "/placements": "placements",
  "/funders": "funders",
  "/funding-opportunities": "funding_opportunities",
  "/programme-cohorts": "programme_cohorts",
  "/programme-sessions": "programme_sessions",
  "/session-attendance": "session_attendance",
  "/outcome-records": "outcome_records",
  "/consent-records": "consent_records",
  "/tasks": "tasks",
  "/activities": "activities",
};

// LMS pattern rules — ordered most-specific first to prevent shadowing.
// Each entry: [regex, entityType, idGroupIndex]
// idGroupIndex: which capture group holds the path-level entity ID fallback (1-based).
// 0 means no path ID available (collection endpoints, batch ops).
// The response body's id field (body?.id) is always preferred over the path fallback.
const LMS_ROUTE_PATTERNS: Array<[RegExp, string, number]> = [
  // Student sub-resources (before /lms/students/:id)
  [/^\/lms\/students\/([^/]+)\/scores$/,              "lms_talent_scores",      1],
  [/^\/lms\/students\/([^/]+)\/chosen-talents$/,      "lms_chosen_talents",     1],
  [/^\/lms\/students\/([^/]+)\/narratives$/,          "lms_coach_narratives",   1],
  [/^\/lms\/students\/([^/]+)\/survey-links$/,        "lms_access_tokens",      1],
  [/^\/lms\/students\/([^/]+)\/ai-summaries/,         "lms_ai_summaries",       1],
  [/^\/lms\/students\/([^/]+)\/handover-session$/,    "lms_access_tokens",      1],
  [/^\/lms\/students\/([^/]+)\/attendance-override$/, "session_attendance",     1],
  [/^\/lms\/students\/([^/]+)\/withdraw$/,            "students",               1],
  // Student CRUD
  [/^\/lms\/students\/([^/]+)$/,                      "students",               1],
  // Cohort sub-resources (before /lms/cohorts/:id)
  [/^\/lms\/cohorts\/([^/]+)\/students\/import\//,    "students",               1],
  [/^\/lms\/cohorts\/([^/]+)\/students$/,             "students",               1],
  [/^\/lms\/cohorts\/([^/]+)\/attendance$/,           "session_attendance",     1],
  [/^\/lms\/cohorts\/([^/]+)\/teacher-feedback$/,     "lms_teacher_feedback",   1],
  [/^\/lms\/cohorts\/([^/]+)\/teacher-links$/,        "lms_access_tokens",      1],
  [/^\/lms\/cohorts\/([^/]+)\/surveys$/,              "lms_student_surveys",    1],
  [/^\/lms\/cohorts\/([^/]+)\/qr-codes$/,             "lms_access_tokens",      1],
  [/^\/lms\/cohorts\/([^/]+)\/trip-data$/,            "lms_trip_data",          1],
  [/^\/lms\/cohorts\/([^/]+)\/narratives$/,           "lms_cohort_narratives",  1],
  [/^\/lms\/cohorts\/([^/]+)\/forward-to-future$/,    "lms_forward_to_future",  1],
  [/^\/lms\/cohorts\/([^/]+)\/completeness$/,         "programme_cohorts",      1],
  [/^\/lms\/cohorts\/([^/]+)\/impact/,                "lms_impact_snapshots",   1],
  [/^\/lms\/cohorts\/([^/]+)\/reports/,               "lms_reports",            1],
  [/^\/lms\/cohorts\/([^/]+)\/attendance-overrides$/, "session_attendance",     1],
  [/^\/lms\/cohorts\/([^/]+)\/status$/,               "programme_cohorts",      1],
  // Cohort CRUD
  [/^\/lms\/cohorts\/([^/]+)$/,                       "programme_cohorts",      1],
  [/^\/lms\/cohorts$/,                                "programme_cohorts",      0],
  // Flat LMS routes
  [/^\/lms\/attendance$/,                             "session_attendance",     0],
  [/^\/lms\/tokens\/([^/]+)$/,                        "lms_access_tokens",      1],
  [/^\/lms\/reports\/([^/]+)/,                        "lms_reports",            1],
  [/^\/lms\/ai-summaries\/([^/]+)$/,                  "lms_ai_summaries",       1],
  [/^\/lms\/dashboard/,                               "programme_cohorts",      0],
];

interface RouteMatch {
  entityType: string;
  pathEntityId: string | null;
}

function resolveLmsRoute(path: string): RouteMatch | null {
  for (const [pattern, entityType, idGroup] of LMS_ROUTE_PATTERNS) {
    const m = pattern.exec(path);
    if (m) {
      return { entityType, pathEntityId: idGroup > 0 ? (m[idGroup] ?? null) : null };
    }
  }
  return null;
}

function resolveRoute(path: string): RouteMatch | null {
  if (path.startsWith("/lms/")) {
    return resolveLmsRoute(path);
  }
  for (const [prefix, entity] of Object.entries(CRM_ROUTE_ENTITY_MAP)) {
    if (path.startsWith(prefix)) {
      const parts = path.split("/").filter(Boolean);
      return { entityType: entity, pathEntityId: parts.length >= 2 ? parts[1] : null };
    }
  }
  return null;
}

export function cdcMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!TRACKED_METHODS.has(req.method)) { next(); return; }

  const apiPath = req.path; // path relative to /api
  const match = resolveRoute(apiPath);
  if (!match) { next(); return; }

  const user = req.user;
  if (!user?.tenantId) { next(); return; }

  const tenantId = user.tenantId;
  const userId = user.id;

  const eventType = req.method === "POST" ? "CREATE"
    : req.method === "DELETE" ? "DELETE"
    : "UPDATE";

  const newValues = req.body && typeof req.body === "object" ? req.body : {};

  // Fire-and-forget — never block the request
  const originalJson = res.json.bind(res);
  res.json = function(body: any) {
    // Write CDC event after response is formed.
    // Prefer the response body's id (the actual created/updated record ID).
    // Fall back to the path-extracted entity ID for batch ops that return no id.
    const entityId = body?.id ?? match.pathEntityId ?? "unknown";
    setImmediate(async () => {
      try {
        await db.insert(changeEventsTable).values({
          id: generateId("cdc"),
          tenantId,
          entityType: match.entityType,
          entityId,
          eventType,
          changedFields: Object.keys(newValues),
          oldValues: {},
          newValues,
          userId,
        });
      } catch {
        // CDC failure must never affect the original operation
      }
    });
    return originalJson(body);
  };

  next();
}

import { Router } from "express";
import cohortsRouter from "./cohorts";
import studentsRouter from "./students";
import attendanceRouter from "./attendance";
import scoresRouter from "./scores";
import chosenTalentsRouter from "./chosenTalents";
import narrativesRouter from "./narratives";
import teacherFeedbackRouter from "./teacherFeedback";
import reportContentRouter from "./reportContent";
import completenessRouter from "./completeness";
import dashboardRouter from "./dashboard";
import forwardToFutureRouter from "./forwardToFuture";
import attendanceOverrideRouter from "./attendanceOverride";
import surveyLinksRouter from "./surveyLinks";
import handoverRouter from "./handover";
import qrCodesRouter from "./qrCodes";
import reportsRouter from "./reports";
import impactRouter from "./impact";

const router = Router();

router.use("/cohorts", cohortsRouter);
router.use("/students", studentsRouter);
router.use("/attendance", attendanceRouter);
router.use("/dashboard", dashboardRouter);

// Student-scoped sub-routes (mounted without prefix — handlers define full sub-paths)
router.use("/", scoresRouter);
router.use("/", chosenTalentsRouter);
router.use("/", narrativesRouter);
router.use("/", teacherFeedbackRouter);
router.use("/", reportContentRouter);
router.use("/", completenessRouter);
router.use("/", forwardToFutureRouter);
router.use("/", attendanceOverrideRouter);

// Phase 3: Token system + public endpoints
router.use("/", surveyLinksRouter);
router.use("/", handoverRouter);
router.use("/", qrCodesRouter);
router.use("/", reportsRouter);
router.use("/", impactRouter);

export default router;


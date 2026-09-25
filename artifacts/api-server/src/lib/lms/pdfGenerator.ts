/**
 * LMS PDF Generator (Task 6.5)
 *
 * Renders HTML templates with data and produces PDF files.
 * Uses puppeteer when available; falls back to saving HTML for manual conversion.
 */

import fs from "fs";
import path from "path";
import type { CohortImpact, StudentImpact } from "./impactEngine";

const TEMPLATES_DIR = path.join(__dirname, "../../templates/lms");
const OUTPUT_DIR = process.env.LMS_PDF_OUTPUT_DIR ?? path.join(process.cwd(), "tmp/lms-reports");

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function loadTemplate(name: string): string {
  const p = path.join(TEMPLATES_DIR, name);
  if (!fs.existsSync(p)) throw new Error(`Template not found: ${name}`);
  return fs.readFileSync(p, "utf-8");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// RAW_* keys are pre-rendered HTML (e.g. bar charts) and must NOT be escaped.
const RAW_KEYS = new Set(["CONFIDENCE_BAR", "RESILIENCE_BAR", "COMMUNICATION_BAR", "SELF_AWARENESS_BAR", "STUDENT_ROWS"]);

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key] ?? "";
    return RAW_KEYS.has(key) ? val : escapeHtml(val);
  });
}

function talentBar(value: number | null, max = 10): string {
  if (value === null) return "<span class='na'>n/a</span>";
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const cls = value >= 0 ? "positive" : "negative";
  return `<div class='bar-wrap'><div class='bar ${cls}' style='width:${Math.abs(pct)}%'></div><span class='bar-val'>${value > 0 ? "+" : ""}${value.toFixed(1)}</span></div>`;
}

function impStr(v: number | null): string {
  if (v === null) return "n/a";
  return (v > 0 ? "+" : "") + v.toFixed(1);
}

export interface PdfResult {
  fileReference: string; // relative path stored in DB
  absolutePath: string;
}

async function renderToPdf(html: string, outputPath: string): Promise<void> {
  try {
    // Try puppeteer if available
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    // Block external network requests — all content must be inline in the template
    await page.setRequestInterception(true);
    page.on("request", (req: any) => {
      if (req.resourceType() === "document") { req.continue(); } else { req.abort(); }
    });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.pdf({ path: outputPath, format: "A4", printBackground: true });
    await browser.close();
  } catch {
    // Puppeteer not available — save HTML for manual conversion
    const htmlPath = outputPath.replace(/\.pdf$/, ".html");
    fs.writeFileSync(htmlPath, html, "utf-8");
    // Write a placeholder PDF marker
    fs.writeFileSync(outputPath, `PDF_PENDING:${htmlPath}`, "utf-8");
  }
}

export async function generateStudentReport(
  cohortId: string,
  student: StudentImpact,
  cohortName: string,
  leadTeacherName: string | null,
): Promise<PdfResult> {
  ensureOutputDir();
  const template = loadTemplate("student-personal-report.html");

  const html = renderTemplate(template, {
    STUDENT_NAME: student.name,
    COHORT_NAME: cohortName,
    LEAD_TEACHER: leadTeacherName ?? "",
    YEAR_GROUP: student.yearGroup ?? "",
    ATTENDANCE_ATTENDED: String(student.attendance.attended),
    ATTENDANCE_TOTAL: String(student.attendance.total),
    ATTENDANCE_PCT: Math.round(student.attendance.pct).toString(),
    CHOSEN_TALENTS: student.chosenTalents.join(", ") || "Not recorded",
    CONFIDENCE_IMP: impStr(student.triangulated.improvement.confidence),
    RESILIENCE_IMP: impStr(student.triangulated.improvement.resilience),
    COMMUNICATION_IMP: impStr(student.triangulated.improvement.communication),
    SELF_AWARENESS_IMP: impStr(student.triangulated.improvement.selfAwareness),
    STUDENT_VOICE_SUMMARY: student.aiSummaries.studentVoice ?? "",
    TEACHER_REFLECTION: student.aiSummaries.teacherReflection ?? "",
    CONFIDENCE_BAR: talentBar(student.triangulated.improvement.confidence),
    RESILIENCE_BAR: talentBar(student.triangulated.improvement.resilience),
    COMMUNICATION_BAR: talentBar(student.triangulated.improvement.communication),
    SELF_AWARENESS_BAR: talentBar(student.triangulated.improvement.selfAwareness),
  });

  const filename = `student-${student.studentId}-${Date.now()}.pdf`;
  const absolutePath = path.join(OUTPUT_DIR, filename);
  await renderToPdf(html, absolutePath);

  return { fileReference: `lms-reports/${filename}`, absolutePath };
}

export async function generateSchoolReport(
  impact: CohortImpact,
): Promise<PdfResult> {
  ensureOutputDir();
  const template = loadTemplate("school-ofsted-report.html");

  const studentRows = impact.students
    .filter((s) => s.eligible)
    .map((s) => `<tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.yearGroup ?? "")}</td>
      <td>${s.attendance.attended}/${s.attendance.total}</td>
      <td>${impStr(s.triangulated.improvement.confidence)}</td>
      <td>${impStr(s.triangulated.improvement.resilience)}</td>
      <td>${impStr(s.triangulated.improvement.communication)}</td>
      <td>${impStr(s.triangulated.improvement.selfAwareness)}</td>
    </tr>`).join("\n");

  const html = renderTemplate(template, {
    COHORT_NAME: impact.cohortName,
    PROGRAMME_TYPE: impact.programmeType ?? "",
    LEAD_TEACHER: impact.leadTeacherName ?? "",
    TOTAL_STUDENTS: String(impact.totalStudents),
    ELIGIBLE_STUDENTS: String(impact.eligibleStudents),
    EXCLUDED_STUDENTS: String(impact.excludedStudents),
    AVG_ATTENDANCE_PCT: Math.round(impact.averageAttendancePct).toString(),
    CONFIDENCE_IMP: impStr(impact.cohortAverageScores.improvement.confidence),
    RESILIENCE_IMP: impStr(impact.cohortAverageScores.improvement.resilience),
    COMMUNICATION_IMP: impStr(impact.cohortAverageScores.improvement.communication),
    SELF_AWARENESS_IMP: impStr(impact.cohortAverageScores.improvement.selfAwareness),
    COHORT_STUDENT_VOICE: impact.aiSummaries.cohortStudentVoice ?? "",
    COHORT_COACH_SUMMARY: impact.aiSummaries.cohortCoachSummary ?? "",
    COHORT_TEACHER_SUMMARY: impact.aiSummaries.cohortTeacherSummary ?? "",
    STUDENT_ROWS: studentRows,
  });

  const filename = `school-${impact.cohortId}-${Date.now()}.pdf`;
  const absolutePath = path.join(OUTPUT_DIR, filename);
  await renderToPdf(html, absolutePath);

  return { fileReference: `lms-reports/${filename}`, absolutePath };
}

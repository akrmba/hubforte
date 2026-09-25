/**
 * LMS QR Code Generation — Phase 3 Task 3.6 (Round 03b)
 *
 * Generates a printable A4 PDF with one QR code per student.
 * Layout: 6 per page (2 columns × 3 rows) with cut lines.
 * Each entry shows: student first name, QR code (fragment-based invite URL),
 * and personal access code as fallback text.
 *
 * GET /api/lms/cohorts/:cohortId/qr-codes → application/pdf
 */

import { Router } from "express";
import { db, studentsTable, programmeCohortsTable, lmsAccessTokensTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { authMiddleware, requireRole } from "../../lib/auth";
import { generateId } from "../../lib/id";
import QRCode from "qrcode";
import PDFDocument from "pdfkit";

const router = Router();

const LMS_BASE_URL = process.env.LMS_BASE_URL ?? "https://lms.hubforte.com";

// A4 dimensions in points (72 points per inch)
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 36; // 0.5 inch
const COLS = 2;
const ROWS = 3;
const CARDS_PER_PAGE = COLS * ROWS;

const CARD_WIDTH = (PAGE_WIDTH - MARGIN * 2) / COLS;
const CARD_HEIGHT = (PAGE_HEIGHT - MARGIN * 2) / ROWS;
const QR_SIZE = 130;

router.get(
  "/cohorts/:cohortId/qr-codes",
  authMiddleware,
  requireRole("MANAGER", "ADMIN", "SUPER_ADMIN"),
  async (req, res): Promise<void> => {
    try {
      const user = req.user!;
      const tenantId = user.tenantId!;
      const cohortId = req.params.cohortId as string;

      // Verify cohort exists and PM scoping
      const [cohort] = await db
        .select({
          id: programmeCohortsTable.id,
          programmeManagerId: programmeCohortsTable.programmeManagerId,
        })
        .from(programmeCohortsTable)
        // @ts-ignore -- Drizzle and() overload
        .where(and(eq(programmeCohortsTable.id, cohortId), eq(programmeCohortsTable.tenantId, tenantId)));

      if (!cohort) {
        res.status(404).json({ error: "Cohort not found" });
        return;
      }
      if (user.role === "MANAGER" && cohort.programmeManagerId !== user.id) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      // Load students (non-withdrawn)
      const students = await db
        .select({
          id: studentsTable.id,
          firstName: studentsTable.firstName,
          personalAccessCode: studentsTable.personalAccessCode,
        })
        .from(studentsTable)
        // @ts-ignore
        .where(and(eq(studentsTable.cohortId, cohortId), eq(studentsTable.tenantId, tenantId)));

      if (students.length === 0) {
        res.status(400).json({ error: "No students in this cohort" });
        return;
      }

      // Generate a fresh invite token per student and render QR PNG buffers
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

      const studentCards: Array<{
        firstName: string;
        personalAccessCode: string | null;
        qrPng: Buffer;
      }> = [];

      for (const student of students) {
        // Revoke any existing active student_survey tokens for this student
        // per Part 2: "PM can regenerate a token at any time — old token is revoked immediately"
        await db
          .update(lmsAccessTokensTable)
          .set({ revokedAt: now } as any)
          .where(and(
            // @ts-ignore
            eq(lmsAccessTokensTable.tenantId, tenantId),
            // @ts-ignore
            eq(lmsAccessTokensTable.tokenType, "student_survey"),
            // @ts-ignore
            eq(lmsAccessTokensTable.scopeId, student.id),
            // @ts-ignore
            isNull(lmsAccessTokensTable.revokedAt),
          ) as any);

        const inviteToken = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(inviteToken).digest("hex");
        const tokenId = generateId("ltk");

        await db.insert(lmsAccessTokensTable).values({
          id: tokenId,
          tenantId,
          tokenHash,
          tokenType: "student_survey",
          scopeType: "student",
          scopeId: student.id,
          expiresAt,
          createdBy: user.id,
          maxUses: 5,
          useCount: 0,
          createdAt: now,
        } as any);

        const qrUrl = `${LMS_BASE_URL}/enter#token=${inviteToken}`;
        const qrPng = await QRCode.toBuffer(qrUrl, {
          type: "png",
          margin: 1,
          width: QR_SIZE * 2, // 2x for crisp print
          errorCorrectionLevel: "M",
        });

        studentCards.push({
          firstName: student.firstName,
          personalAccessCode: (student as any).personalAccessCode ?? null,
          qrPng,
        });
      }

      // Build PDF
      const doc = new PDFDocument({ size: "A4", margin: 0 });

      // Stream PDF to response
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="qr-codes-${cohortId}.pdf"`,
      );
      doc.pipe(res);

      for (let i = 0; i < studentCards.length; i++) {
        const pageIndex = i % CARDS_PER_PAGE;
        if (i > 0 && pageIndex === 0) {
          doc.addPage();
        }

        const col = pageIndex % COLS;
        const row = Math.floor(pageIndex / COLS);
        const x = MARGIN + col * CARD_WIDTH;
        const y = MARGIN + row * CARD_HEIGHT;

        const card = studentCards[i];

        // Draw cut lines (dashed rectangle)
        doc
          .save()
          .dash(3, { space: 3 })
          .rect(x, y, CARD_WIDTH, CARD_HEIGHT)
          .stroke("#cccccc")
          .restore();

        // Center content within card
        const centerX = x + CARD_WIDTH / 2;
        const contentTop = y + 20;

        // Student first name (privacy: first name only)
        doc
          .font("Helvetica-Bold")
          .fontSize(14)
          .fillColor("#333333")
          .text(card.firstName, x + 10, contentTop, {
            width: CARD_WIDTH - 20,
            align: "center",
          });

        // QR code (PNG embedded)
        const qrX = centerX - QR_SIZE / 2;
        const qrY = contentTop + 25;
        doc.image(card.qrPng, qrX, qrY, { width: QR_SIZE, height: QR_SIZE });

        // "Scan to complete survey" label
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#666666")
          .text("Scan to complete survey", x + 10, qrY + QR_SIZE + 8, {
            width: CARD_WIDTH - 20,
            align: "center",
          });

        // Personal access code as fallback
        if (card.personalAccessCode) {
          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor("#999999")
            .text(`Code: ${card.personalAccessCode}`, x + 10, qrY + QR_SIZE + 24, {
              width: CARD_WIDTH - 20,
              align: "center",
            });
        }
      }

      doc.end();
    } catch (err) {
      console.error("[lms/cohorts/:cohortId/qr-codes GET]", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

export default router;

import { Router, type IRouter } from "express";
import { db, contactsTable, organizationsTable, activitiesTable, usersTable } from "@workspace/db";
import { eq, ilike, and, sql } from "drizzle-orm";
import { authMiddleware, requireRole, denyDevRoles } from "../lib/auth";
import { generateId } from "../lib/id";

const router: IRouter = Router();

router.post("/import/validate", authMiddleware, denyDevRoles, requireRole("ADMIN","MANAGER","OPERATOR"), async (req, res): Promise<void> => {
  const { type, rows, mappings } = req.body;

  if (!type || !rows || !mappings) {
    res.status(400).json({ error: "type, rows, and mappings are required" });
    return;
  }

  const errors: { row: number; field: string; message: string }[] = [];
  let valid = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const mappedRow: Record<string, any> = {};
    for (const [csvCol, crmField] of Object.entries(mappings)) {
      mappedRow[crmField as string] = row[csvCol];
    }

    let rowValid = true;
    if (type === "contacts") {
      if (!mappedRow.firstName) {
        errors.push({ row: i + 1, field: "firstName", message: "First name is required" });
        rowValid = false;
      }
      if (!mappedRow.lastName) {
        errors.push({ row: i + 1, field: "lastName", message: "Last name is required" });
        rowValid = false;
      }
      if (!mappedRow.email) {
        errors.push({ row: i + 1, field: "email", message: "Email is required" });
        rowValid = false;
      } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(mappedRow.email)) {
          errors.push({ row: i + 1, field: "email", message: "Invalid email format" });
          rowValid = false;
        }
      }
      if (!mappedRow.organizationId && !mappedRow.organizationName) {
        errors.push({ row: i + 1, field: "organizationId", message: "Organization is required" });
        rowValid = false;
      }
    } else if (type === "organizations") {
      if (!mappedRow.name) {
        errors.push({ row: i + 1, field: "name", message: "Name is required" });
        rowValid = false;
      }
    }

    if (rowValid) valid++;
  }

  res.json({ valid, errors });
});

router.post("/import/contacts", authMiddleware, denyDevRoles, requireRole("ADMIN","MANAGER","OPERATOR"), async (req, res): Promise<void> => {
  const user = req.user!;
  const tenantId = user.tenantId;
  const { rows, mappings } = req.body;

  if (!rows || !mappings) {
    res.status(400).json({ error: "rows and mappings are required" });
    return;
  }

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const mappedRow: Record<string, any> = {};
    for (const [csvCol, crmField] of Object.entries(mappings)) {
      mappedRow[crmField as string] = row[csvCol];
    }

    if (!mappedRow.email || !mappedRow.firstName || !mappedRow.lastName) {
      errors++;
      continue;
    }

    try {
      const [existing] = await db
        .select()
        .from(contactsTable)
        .where(and(eq(contactsTable.email, mappedRow.email), tenantId ? eq(contactsTable.tenantId, tenantId) : undefined));
      if (existing) {
        skipped++;
        continue;
      }

      let orgId = mappedRow.organizationId;
      if (!orgId && mappedRow.organizationName) {
        const [org] = await db
          .select()
          .from(organizationsTable)
          .where(and(ilike(organizationsTable.name, mappedRow.organizationName), tenantId ? eq(organizationsTable.tenantId, tenantId) : undefined));
        if (org) {
          orgId = org.id;
        } else {
          const newOrg = generateId("org");
          await db.insert(organizationsTable).values({
            id: newOrg,
            tenantId,
            name: mappedRow.organizationName,
            type: "OTHER",
            status: "PROSPECT",
            ownerId: user.id,
          });
          orgId = newOrg;
        }
      }

      if (!orgId) {
        errors++;
        continue;
      }

      await db.insert(contactsTable).values({
        id: generateId("con"),
        tenantId,
        firstName: mappedRow.firstName,
        lastName: mappedRow.lastName,
        email: mappedRow.email,
        phone: mappedRow.phone || null,
        role: mappedRow.role || null,
        status: (mappedRow.status as any) || "PROSPECT",
        organizationId: orgId,
        ownerId: user.id,
      });

      created++;
    } catch {
      errors++;
    }
  }

  const actId = generateId("act");
  await db.insert(activitiesTable).values({
    id: actId,
    tenantId,
    type: "NOTE",
    summary: `Imported ${created} contacts via CSV`,
    date: new Date(),
    contactId: null,
    organizationId: null,
    userId: user.id,
  });

  res.json({ created, skipped, errors });
});

router.post("/import/organizations", authMiddleware, denyDevRoles, requireRole("ADMIN","MANAGER","OPERATOR"), async (req, res): Promise<void> => {
  const user = req.user!;
  const tenantId = user.tenantId;
  const { rows, mappings } = req.body;

  if (!rows || !mappings) {
    res.status(400).json({ error: "rows and mappings are required" });
    return;
  }

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const mappedRow: Record<string, any> = {};
    for (const [csvCol, crmField] of Object.entries(mappings)) {
      mappedRow[crmField as string] = row[csvCol];
    }

    if (!mappedRow.name) {
      errors++;
      continue;
    }

    try {
      const [existing] = await db
        .select()
        .from(organizationsTable)
        .where(and(ilike(organizationsTable.name, mappedRow.name), tenantId ? eq(organizationsTable.tenantId, tenantId) : undefined));
      if (existing) {
        skipped++;
        continue;
      }

      await db.insert(organizationsTable).values({
        id: generateId("org"),
        tenantId,
        name: mappedRow.name,
        type: (mappedRow.type as any) || "OTHER",
        status: (mappedRow.status as any) || "PROSPECT",
        location: mappedRow.location || null,
        notes: mappedRow.notes || null,
        ownerId: user.id,
      });

      created++;
    } catch {
      errors++;
    }
  }

  const actId = generateId("act");
  await db.insert(activitiesTable).values({
    id: actId,
    tenantId,
    type: "NOTE",
    summary: `Imported ${created} organisations via CSV`,
    date: new Date(),
    contactId: null,
    organizationId: null,
    userId: user.id,
  });

  res.json({ created, skipped, errors });
});

router.get("/export/contacts", authMiddleware, denyDevRoles, requireRole("ADMIN","MANAGER"), async (req, res): Promise<void> => {
  const { search, status, organizationId } = req.query as Record<string, string>;
  const tenantId = req.user!.tenantId;

  const conditions = [];
  if (tenantId) conditions.push(eq(contactsTable.tenantId, tenantId));
  if (search) conditions.push(ilike(contactsTable.firstName, `%${search}%`));
  if (status) conditions.push(eq(contactsTable.status, status as any));
  if (organizationId) conditions.push(eq(contactsTable.organizationId, organizationId));

  const contacts = await db
    .select({
      id: contactsTable.id,
      firstName: contactsTable.firstName,
      lastName: contactsTable.lastName,
      email: contactsTable.email,
      phone: contactsTable.phone,
      role: contactsTable.role,
      status: contactsTable.status,
      organizationName: organizationsTable.name,
      lastContactedAt: contactsTable.lastContactedAt,
      createdAt: contactsTable.createdAt,
    })
    .from(contactsTable)
    .leftJoin(organizationsTable, and(eq(contactsTable.organizationId, organizationsTable.id), tenantId ? eq(organizationsTable.tenantId, tenantId) : undefined))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const headers = ["id", "firstName", "lastName", "email", "phone", "role", "status", "organizationName", "lastContactedAt", "createdAt"];
  const rows = contacts.map((c) =>
    headers.map((h) => {
      const val = (c as any)[h];
      if (val === null || val === undefined) return "";
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="contacts.csv"`);
  res.send(csv);
});

router.get("/export/organizations", authMiddleware, denyDevRoles, requireRole("ADMIN","MANAGER"), async (req, res): Promise<void> => {
  const { search, status } = req.query as Record<string, string>;
  const tenantId = req.user!.tenantId;

  const conditions = [];
  if (tenantId) conditions.push(eq(organizationsTable.tenantId, tenantId));
  if (search) conditions.push(ilike(organizationsTable.name, `%${search}%`));
  if (status) conditions.push(eq(organizationsTable.status, status as any));

  const orgs = await db
    .select()
    .from(organizationsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const headers = ["id", "name", "type", "status", "location", "notes", "createdAt"];
  const rows = orgs.map((o) =>
    headers.map((h) => {
      const val = (o as any)[h];
      if (val === null || val === undefined) return "";
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="organizations.csv"`);
  res.send(csv);
});

export default router;

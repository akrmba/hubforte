import { db, notificationsTable, usersTable } from "@workspace/db";
import { and, eq, or } from "drizzle-orm";
import { generateId } from "./id";

interface NotificationPayload {
  title: string;
  message: string;
  type?: "INFO" | "WARNING" | "SUCCESS" | "ERROR";
  link?: string;
}

async function notifyRecipients(
  recipients: Array<{ id: string; tenantId: string | null }>,
  opts: NotificationPayload
) {
  for (const recipient of recipients) {
    await createNotification({
      ...opts,
      userId: recipient.id,
      tenantId: recipient.tenantId ?? null,
    });
  }
}

export async function createNotification(opts: {
  userId: string;
  tenantId?: string | null;
  title: string;
  message: string;
  type?: "INFO" | "WARNING" | "SUCCESS" | "ERROR";
  link?: string;
}) {
  const [user] = opts.tenantId === undefined
    ? await db
        .select({ tenantId: usersTable.tenantId })
        .from(usersTable)
        .where(eq(usersTable.id, opts.userId))
        .limit(1)
    : [null];
  await db.insert(notificationsTable).values({
    id: generateId("ntf"),
    tenantId: opts.tenantId === undefined ? user?.tenantId ?? null : opts.tenantId,
    userId: opts.userId,
    title: opts.title,
    message: opts.message,
    type: opts.type || "INFO",
    link: opts.link || null,
  });
}

export async function notifyAdminUsers(opts: NotificationPayload) {
  const admins = await db
    .select({ id: usersTable.id, tenantId: usersTable.tenantId })
    .from(usersTable)
    .where(or(eq(usersTable.role, "ADMIN"), eq(usersTable.role, "SUPER_ADMIN")));

  await notifyRecipients(admins, opts);
}

export async function notifyTenantAdminUsers(tenantId: string, opts: NotificationPayload) {
  const admins = await db
    .select({ id: usersTable.id, tenantId: usersTable.tenantId })
    .from(usersTable)
    .where(and(eq(usersTable.role, "ADMIN"), eq(usersTable.tenantId, tenantId)));

  await notifyRecipients(admins, opts);
}

export async function notifySuperAdminUsers(opts: NotificationPayload) {
  const superAdmins = await db
    .select({ id: usersTable.id, tenantId: usersTable.tenantId })
    .from(usersTable)
    .where(eq(usersTable.role, "SUPER_ADMIN"));

  await notifyRecipients(superAdmins, opts);
}

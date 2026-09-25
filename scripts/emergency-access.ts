/**
 * Emergency break-glass account management script.
 *
 * Usage:
 *   pnpm tsx scripts/emergency-access.ts create   — create the emergency account (run once)
 *   pnpm tsx scripts/emergency-access.ts status   — show current state
 *   pnpm tsx scripts/emergency-access.ts reset-password <newPassword>  — change the password
 *
 * The account is created with active=false (suspended). To unlock it in a lockout:
 *   POST /api/super-admin/emergency-access/activate  { "token": "<EMERGENCY_ACTIVATION_TOKEN>" }
 * After recovery, deactivate it again:
 *   POST /api/super-admin/emergency-access/deactivate  (requires SUPER_ADMIN session)
 */

import "dotenv/config";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const EMERGENCY_EMAIL = "emergency@hubforte.internal";

async function create() {
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.isEmergencyAccount, true))
    .limit(1);

  if (existing.length > 0) {
    console.log("Emergency account already exists:");
    console.log(`  ID:     ${existing[0].id}`);
    console.log(`  Email:  ${existing[0].email}`);
    console.log(`  Active: ${existing[0].active}`);
    return;
  }

  const password = process.env.EMERGENCY_PASSWORD ?? randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);

  await db.insert(usersTable).values({
    id: randomUUID(),
    name: "Emergency Access",
    email: EMERGENCY_EMAIL,
    passwordHash,
    role: "SUPER_ADMIN",
    active: false, // suspended by default — activated only via token
    isEmergencyAccount: true,
    tenantId: null,
  });

  console.log("Emergency account created (suspended).");
  console.log(`  Email:    ${EMERGENCY_EMAIL}`);
  console.log(`  Password: ${password}`);
  console.log("");
  console.log("Store these credentials in your password manager NOW.");
  console.log("The password is not recoverable after this point.");
  console.log("");
  console.log("To activate in a lockout:");
  console.log("  POST /api/super-admin/emergency-access/activate");
  console.log('  Body: { "token": "<EMERGENCY_ACTIVATION_TOKEN>" }');
}

async function status() {
  const account = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.isEmergencyAccount, true))
    .limit(1);

  if (account.length === 0) {
    console.log("No emergency account found. Run: pnpm tsx scripts/emergency-access.ts create");
    return;
  }

  console.log("Emergency account status:");
  console.log(`  ID:     ${account[0].id}`);
  console.log(`  Email:  ${account[0].email}`);
  console.log(`  Active: ${account[0].active}`);
  console.log(`  Role:   ${account[0].role}`);
}

async function resetPassword(newPassword: string) {
  if (!newPassword || newPassword.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const result = await db
    .update(usersTable)
    .set({ passwordHash })
    .where(eq(usersTable.isEmergencyAccount, true));

  console.log("Emergency account password updated.");
}

const [, , command, arg] = process.argv;

switch (command) {
  case "create":
    await create();
    break;
  case "status":
    await status();
    break;
  case "reset-password":
    await resetPassword(arg);
    break;
  default:
    console.log("Usage:");
    console.log("  pnpm tsx scripts/emergency-access.ts create");
    console.log("  pnpm tsx scripts/emergency-access.ts status");
    console.log("  pnpm tsx scripts/emergency-access.ts reset-password <newPassword>");
    process.exit(1);
}

process.exit(0);

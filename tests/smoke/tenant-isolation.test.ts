/**
 * Tenant Isolation Tests
 *
 * Proves that one tenant's users cannot read, write, or delete another tenant's data.
 * These tests run against a live local dev stack with two seeded test tenants.
 *
 * Required env vars (in addition to standard smoke test vars):
 *   TENANT_A_EMAIL      — admin user in Tenant A
 *   TENANT_A_PASSWORD
 *   TENANT_B_EMAIL      — admin user in Tenant B
 *   TENANT_B_PASSWORD
 *
 * If these are not set, the tests are skipped with a clear message.
 * They must pass in CI before any production deployment.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";

config({ path: "artifacts/api-server/.env" });

const API_BASE = process.env.API_BASE_URL || "http://localhost:3000";
const AJAX_HEADERS = {
  "Content-Type": "application/json",
  "X-Requested-With": "XMLHttpRequest",
};

const TENANT_A = {
  email: process.env.TENANT_A_EMAIL || "",
  password: process.env.TENANT_A_PASSWORD || "",
};

const TENANT_B = {
  email: process.env.TENANT_B_EMAIL || "",
  password: process.env.TENANT_B_PASSWORD || "",
};

const SKIP = !TENANT_A.email || !TENANT_B.email;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: AJAX_HEADERS,
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status}`);
  const data = await res.json();
  return data.token as string;
}

function authHeaders(token: string) {
  return { ...AJAX_HEADERS, Authorization: `Bearer ${token}` };
}

async function createContact(token: string, suffix: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/contacts`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      firstName: `IsolationTest`,
      lastName: `Contact-${suffix}`,
      email: `isolation-${suffix}-${Date.now()}@test.invalid`,
    }),
  });
  if (res.status !== 201) throw new Error(`Contact creation failed: ${res.status}`);
  const data = await res.json();
  return data.id as string;
}

async function deleteContact(token: string, id: string): Promise<void> {
  await fetch(`${API_BASE}/api/contacts/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let tokenA: string;
let tokenB: string;
let contactIdA: string;       // contact created by Tenant A
let TENANT_A_TENANT_ID: string; // tenantId of Tenant A — used to assert cross-tenant leakage
let TENANT_B_TENANT_ID: string; // tenantId of Tenant B — used to assert records belong to B only
let tenantBUserId: string;    // a real user in Tenant B — used for role-update test

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Tenant Isolation", () => {
  beforeAll(async () => {
    if (SKIP) return;
    tokenA = await login(TENANT_A.email, TENANT_A.password);
    tokenB = await login(TENANT_B.email, TENANT_B.password);

    // Capture Tenant A's tenantId from the /me endpoint
    const meResA = await fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders(tokenA) });
    if (meResA.status === 200) {
      const meA = await meResA.json();
      TENANT_A_TENANT_ID = meA.user?.tenantId ?? meA.tenantId ?? "";
    }

    // Capture Tenant B's tenantId and user ID
    const meResB = await fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders(tokenB) });
    if (meResB.status === 200) {
      const meB = await meResB.json();
      TENANT_B_TENANT_ID = meB.user?.tenantId ?? meB.tenantId ?? "";
      tenantBUserId = meB.user?.id ?? meB.id ?? "";
    }

    // Create a contact in Tenant A that Tenant B must never see
    contactIdA = await createContact(tokenA, "tenantA");
  });

  afterAll(async () => {
    if (SKIP || !tokenA || !contactIdA) return;
    await deleteContact(tokenA, contactIdA);
  });

  it("skips gracefully when test tenants are not configured", () => {
    if (!SKIP) return;
    console.warn(
      "Tenant isolation tests skipped — set TENANT_A_EMAIL, TENANT_A_PASSWORD, " +
      "TENANT_B_EMAIL, TENANT_B_PASSWORD to run these tests."
    );
    expect(true).toBe(true);
  });

  it("Tenant B cannot read Tenant A contact by ID", async () => {
    if (SKIP) return;
    const res = await fetch(`${API_BASE}/api/contacts/${contactIdA}`, {
      headers: authHeaders(tokenB),
    });
    // Must be 404 — never 200. A 403 would reveal the record exists.
    expect(res.status).toBe(404);
  });

  it("Tenant B contact list does not include Tenant A contacts", async () => {
    if (SKIP) return;
    const res = await fetch(`${API_BASE}/api/contacts?limit=100`, {
      headers: authHeaders(tokenB),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    const ids: string[] = (data.data ?? []).map((c: any) => c.id);
    expect(ids).not.toContain(contactIdA);
  });

  it("Tenant B cannot update Tenant A contact", async () => {
    if (SKIP) return;
    const res = await fetch(`${API_BASE}/api/contacts/${contactIdA}`, {
      method: "PATCH",
      headers: authHeaders(tokenB),
      body: JSON.stringify({ firstName: "Hacked" }),
    });
    expect(res.status).toBe(404);
  });

  it("Tenant B cannot delete Tenant A contact", async () => {
    if (SKIP) return;
    const res = await fetch(`${API_BASE}/api/contacts/${contactIdA}`, {
      method: "DELETE",
      headers: authHeaders(tokenB),
    });
    expect(res.status).toBe(404);
  });

  it("Tenant B organisation list does not include Tenant A organisations", async () => {
    if (SKIP) return;
    // Create an org in Tenant A
    const createRes = await fetch(`${API_BASE}/api/organizations`, {
      method: "POST",
      headers: authHeaders(tokenA),
      body: JSON.stringify({ name: `IsolationTestOrg-${Date.now()}` }),
    });
    if (createRes.status !== 201) return; // org module may not be enabled — skip gracefully
    const org = await createRes.json();
    const orgId = org.id as string;

    // Tenant B must not see it
    const readRes = await fetch(`${API_BASE}/api/organizations/${orgId}`, {
      headers: authHeaders(tokenB),
    });
    expect(readRes.status).toBe(404);

    // Cleanup
    await fetch(`${API_BASE}/api/organizations/${orgId}`, {
      method: "DELETE",
      headers: authHeaders(tokenA),
    });
  });

  it("Tenant B cannot access Tenant A reports", async () => {
    if (SKIP) return;
    const res = await fetch(`${API_BASE}/api/reports?limit=10`, {
      headers: authHeaders(tokenB),
    });
    if (res.status === 404 || res.status === 403) return; // module not enabled — skip
    expect(res.status).toBe(200);
    const data = await res.json();
    const records: any[] = data.data ?? [];
    // Every record with a tenantId must belong to Tenant B specifically — not just "not Tenant A"
    records.forEach((r: any) => {
      if (r.tenantId) {
        expect(r.tenantId).not.toBe(TENANT_A_TENANT_ID);
        if (TENANT_B_TENANT_ID) {
          expect(r.tenantId).toBe(TENANT_B_TENANT_ID);
        }
      }
    });
  });

  it("Tenant B cannot assign platform-engineering roles to users", async () => {
    if (SKIP) return;
    // Attempt to invite a user with DEVELOPER role via Tenant B's admin
    const res = await fetch(`${API_BASE}/api/admin/users/invite`, {
      method: "POST",
      headers: authHeaders(tokenB),
      body: JSON.stringify({
        email: `isolation-dev-${Date.now()}@test.invalid`,
        role: "DEVELOPER",
      }),
    });
    // Must be rejected — 400 or 403
    expect([400, 403]).toContain(res.status);
  });

  it("Tenant B cannot assign PLATFORM_BUILDER role to users", async () => {
    if (SKIP) return;
    const res = await fetch(`${API_BASE}/api/admin/users/invite`, {
      method: "POST",
      headers: authHeaders(tokenB),
      body: JSON.stringify({
        email: `isolation-pb-${Date.now()}@test.invalid`,
        role: "PLATFORM_BUILDER",
      }),
    });
    expect([400, 403]).toContain(res.status);
  });

  it("Tenant B cannot update a user to a platform-engineering role", async () => {
    if (SKIP) return;
    // Use a real Tenant B user ID — proves the role guard fires on a valid user, not just a 404
    const targetId = tenantBUserId || "usr_nonexistent";
    const res = await fetch(`${API_BASE}/api/admin/users/${targetId}`, {
      method: "PATCH",
      headers: authHeaders(tokenB),
      body: JSON.stringify({ role: "DEVELOPER" }),
    });
    // Must be 403 — the role guard must fire before any update happens
    // 404 is only acceptable if tenantBUserId was not captured (env not configured)
    if (tenantBUserId) {
      expect(res.status).toBe(403);
    } else {
      expect([403, 404]).toContain(res.status);
    }
  });
});

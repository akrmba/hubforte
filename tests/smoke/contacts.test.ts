import { describe, it, expect, beforeAll } from "vitest";
import { config } from "dotenv";

config({ path: "artifacts/api-server/.env" });

const API_BASE = process.env.API_BASE_URL || "http://localhost:3000";
const AJAX_HEADERS = {
  "Content-Type": "application/json",
  "X-Requested-With": "XMLHttpRequest",
};

const TEST_USER = {
  email: process.env.TEST_USER_EMAIL || process.env.ADMIN_EMAIL || "admin@test.local",
  password: process.env.TEST_USER_PASSWORD || process.env.SEED_PASSWORD || "testpassword123",
};

let authToken: string | null = null;

describe("Contacts Smoke Tests", () => {
  beforeAll(async () => {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: AJAX_HEADERS,
      body: JSON.stringify(TEST_USER),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    authToken = data.token;
  });

  it("lists contacts with authentication", async () => {
    expect(authToken).toBeTruthy();

    const response = await fetch(`${API_BASE}/api/contacts?limit=10`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("data");
    expect(data).toHaveProperty("total");
    expect(data).toHaveProperty("page");
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("rejects unauthenticated contact access", async () => {
    const response = await fetch(`${API_BASE}/api/contacts`);
    expect(response.status).toBe(401);
  });
});

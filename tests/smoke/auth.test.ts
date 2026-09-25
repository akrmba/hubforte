import { describe, it, expect } from "vitest";
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

describe("Auth Smoke Tests", () => {
  it("logs in with valid credentials", async () => {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: AJAX_HEADERS,
      body: JSON.stringify(TEST_USER),
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("user");
    expect(data).toHaveProperty("token");
    expect(data.user).toHaveProperty("email", TEST_USER.email);
    expect(data.user).toHaveProperty("role");
    expect(data.user).toHaveProperty("id");
  });

  it("rejects invalid credentials", async () => {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: AJAX_HEADERS,
      body: JSON.stringify({
        email: "nonexistent@test.local",
        password: "wrongpassword",
      }),
    });

    expect(response.status).toBe(401);
  });

  it("logs out without error", async () => {
    const response = await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      headers: AJAX_HEADERS,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });
});

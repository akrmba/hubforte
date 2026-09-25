import { describe, it, expect } from "vitest";

const API_BASE = process.env.API_BASE_URL || "http://localhost:3000";

describe("Health Smoke Tests", () => {
  it("should return ok from basic health check", async () => {
    const response = await fetch(`${API_BASE}/api/healthz`);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("status", "ok");
    expect(data).toHaveProperty("db");
    expect(data).toHaveProperty("timestamp");
    expect(["connected", "error", "disconnected"]).toContain(data.db);
  });

  it("should fail when health endpoint is broken", async () => {
    // This test validates that the test suite can detect failures
    // If the API is down or unreachable, this should fail
    const response = await fetch(`${API_BASE}/api/healthz`);
    expect(response.ok).toBe(true);
  });
});

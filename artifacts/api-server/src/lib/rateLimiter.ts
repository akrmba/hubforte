import { RateLimiterMemory } from "rate-limiter-flexible";

const isDev = process.env.NODE_ENV !== "production";

const authLimiterStore = new RateLimiterMemory({
  points: isDev ? 200 : 10,
  duration: 15 * 60,
  blockDuration: isDev ? 1 : 15 * 60,
});

const apiLimiterStore = new RateLimiterMemory({
  points: 200,
  duration: 60,
  blockDuration: 60,
});

export async function checkRateLimit(limiter: "auth" | "api", ip: string): Promise<void> {
  const store = limiter === "auth" ? authLimiterStore : apiLimiterStore;
  try {
    await store.consume(ip);
  } catch {
    throw { status: 429, body: { error: "Too many requests. Please try again later." } };
  }
}

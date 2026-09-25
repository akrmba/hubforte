import { logger } from "./logger";

const BASE_URL = "https://api.instatus.com/v1";

function getConfig(): { apiKey: string; pageId: string } | null {
  const apiKey = process.env.INSTATUS_API_KEY || process.env.STATUS_PAGE_API_KEY;
  const pageId = process.env.INSTATUS_PAGE_ID || process.env.STATUS_PAGE_ID;
  if (!apiKey || !pageId) return null;
  return { apiKey, pageId };
}

export async function updateComponentStatus(
  componentName: string,
  status: "operational" | "degraded" | "outage"
): Promise<void> {
  const cfg = getConfig();
  if (!cfg) return;

  const instatusStatus = status === "operational" ? "OPERATIONAL" : status === "degraded" ? "UNDERMAINTENANCE" : "MAJOROUTAGE";

  try {
    const res = await fetch(`${BASE_URL}/${cfg.pageId}/components`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    if (!res.ok) return;
    const data = await res.json() as { id: string; name: string }[];
    const component = data.find((c) => c.name.toLowerCase() === componentName.toLowerCase());
    if (!component) {
      logger.warn({ componentName }, "statusPage: component not found");
      return;
    }

    await fetch(`${BASE_URL}/${cfg.pageId}/components/${component.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: instatusStatus }),
    });
    logger.info({ componentName, status }, "statusPage: component status updated");
  } catch (err) {
    logger.error({ err, componentName }, "statusPage: updateComponentStatus failed");
  }
}

export async function createIncident(
  title: string,
  body: string,
  affectedComponents: string[]
): Promise<string | null> {
  const cfg = getConfig();
  if (!cfg) return null;

  try {
    const res = await fetch(`${BASE_URL}/${cfg.pageId}/incidents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: title,
        message: body,
        status: "INVESTIGATING",
        notify: true,
        components: affectedComponents.map((name) => ({ name, status: "MAJOROUTAGE" })),
      }),
    });
    if (!res.ok) {
      logger.error({ status: res.status }, "statusPage: createIncident API error");
      return null;
    }
    const data = await res.json() as { id: string };
    logger.info({ incidentId: data.id, title }, "statusPage: incident created");
    return data.id;
  } catch (err) {
    logger.error({ err, title }, "statusPage: createIncident failed");
    return null;
  }
}

export async function resolveIncident(incidentId: string, resolutionNote: string): Promise<void> {
  const cfg = getConfig();
  if (!cfg) return;

  try {
    await fetch(`${BASE_URL}/${cfg.pageId}/incidents/${incidentId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "RESOLVED",
        message: resolutionNote,
        notify: true,
      }),
    });
    logger.info({ incidentId }, "statusPage: incident resolved");
  } catch (err) {
    logger.error({ err, incidentId }, "statusPage: resolveIncident failed");
  }
}

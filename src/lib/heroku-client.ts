import { logger } from "./logger";
import type { ProcessType } from "./process-type";

const HEROKU_API_BASE = "https://api.heroku.com";

interface HerokuFormation {
  quantity: number;
  type: string;
}

async function herokuFetch(apiKey: string, path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${HEROKU_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.heroku+json; version=3",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error("Heroku API error", {
      path,
      status: response.status,
      body: body.slice(0, 500),
    });
    throw new Error(`Heroku API ${response.status}: ${body.slice(0, 200)}`);
  }

  return response;
}

export async function getFormationCount(
  appName: string,
  apiKey: string,
  processType: ProcessType
): Promise<number> {
  const response = await herokuFetch(apiKey, `/apps/${appName}/formation/${processType}`);
  const formation = (await response.json()) as HerokuFormation;
  return formation.quantity;
}

export async function scaleFormation(
  appName: string,
  apiKey: string,
  processType: ProcessType,
  quantity: number
): Promise<number> {
  const response = await herokuFetch(apiKey, `/apps/${appName}/formation/${processType}`, {
    method: "PATCH",
    body: JSON.stringify({ quantity }),
  });
  const formation = (await response.json()) as HerokuFormation;
  logger.info("Scaled Heroku formation", {
    app: appName,
    processType,
    quantity: formation.quantity,
  });
  return formation.quantity;
}

export async function getWebDynoCount(appName: string, apiKey: string): Promise<number> {
  return getFormationCount(appName, apiKey, "web");
}

export async function scaleWebDynos(
  appName: string,
  apiKey: string,
  quantity: number
): Promise<number> {
  return scaleFormation(appName, apiKey, "web", quantity);
}

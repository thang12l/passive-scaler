import { getConfig, isHerokuConfigured } from "./config";
import { logger } from "./logger";

const HEROKU_API_BASE = "https://api.heroku.com";

interface HerokuFormation {
  quantity: number;
  type: string;
}

async function herokuFetch(path: string, init?: RequestInit): Promise<Response> {
  const config = getConfig();
  const response = await fetch(`${HEROKU_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.heroku+json; version=3",
      Authorization: `Bearer ${config.HEROKU_API_KEY}`,
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

export async function getWebDynoCount(appName?: string): Promise<number | null> {
  if (!isHerokuConfigured()) {
    return null;
  }

  const app = appName ?? getConfig().TARGET_HEROKU_APP;
  const response = await herokuFetch(`/apps/${app}/formation/web`);
  const formation = (await response.json()) as HerokuFormation;
  return formation.quantity;
}

export async function scaleWebDynos(quantity: number, appName?: string): Promise<number | null> {
  if (!isHerokuConfigured()) {
    return null;
  }

  const app = appName ?? getConfig().TARGET_HEROKU_APP;
  const response = await herokuFetch(`/apps/${app}/formation/web`, {
    method: "PATCH",
    body: JSON.stringify({ quantity }),
  });
  const formation = (await response.json()) as HerokuFormation;
  logger.info("Scaled Heroku formation", { app, quantity: formation.quantity });
  return formation.quantity;
}

"use client";

const ADMIN_TOKEN_KEY = "passive-scaler-admin-token";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

export async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getAdminToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(path, { ...init, headers });
}

export async function watchAppLive(
  slug: string,
  onMetrics: () => void,
  signal: AbortSignal
): Promise<"unauthorized" | "closed"> {
  let response: Response;
  try {
    response = await adminFetch(`/api/apps/${slug}/live`, { signal });
  } catch (error) {
    if (signal.aborted) return "closed";
    throw error;
  }
  if (response.status === 401) return "unauthorized";
  if (!response.ok || !response.body) {
    throw new Error(`Live stream failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:") && eventName === "metrics") {
          onMetrics();
          eventName = "message";
        } else if (line === "") {
          eventName = "message";
        }
      }
    }
  } catch (error) {
    if (signal.aborted) return "closed";
    throw error;
  }

  return "closed";
}

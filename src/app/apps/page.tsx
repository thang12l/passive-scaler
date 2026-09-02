"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminLogin } from "@/components/admin-login";
import { StatusBadge } from "@/components/status-badge";
import { adminFetch, getAdminToken } from "@/lib/admin-client";

interface AppListItem {
  slug: string;
  app_name: string;
  display_name: string;
  scaling_enabled: boolean;
  worker_scaling_enabled: boolean;
  live_scaling: boolean;
  last_reported_at: string | null;
  formations: Array<{
    process_type: string;
    current_dynos: number | null;
    last_metrics: {
      response_time: number | null;
      memory_percent: number | null;
      queue_size: number | null;
    };
  }>;
}

function formatFormationSummary(formations: AppListItem["formations"]): string {
  const web = formations.find((f) => f.process_type === "web");
  const worker = formations.find((f) => f.process_type === "worker");
  const parts: string[] = [];
  if (web) parts.push(`web ${web.current_dynos ?? "—"}`);
  if (worker) parts.push(`worker ${worker.current_dynos ?? "—"}`);
  return parts.join(" · ") || "—";
}

export default function AppsPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [apps, setApps] = useState<AppListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadApps = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await adminFetch("/api/apps");
    if (response.status === 401) {
      setAuthenticated(false);
      setLoading(false);
      return;
    }
    if (!response.ok) {
      setError("Failed to load apps");
      setLoading(false);
      return;
    }
    const data = await response.json();
    setApps(data.apps);
    setAuthenticated(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (getAdminToken()) {
      loadApps();
    } else {
      setLoading(false);
    }
  }, [loadApps]);

  if (!authenticated) {
    return (
      <AdminLogin
        onAuthenticated={() => {
          setAuthenticated(true);
          loadApps();
        }}
      />
    );
  }

  return (
    <>
      <div className="actions" style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, flex: 1 }}>Apps</h1>
        <Link href="/apps/new" className="btn primary">
          Add app
        </Link>
      </div>

      {error && <div className="alert error">{error}</div>}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : apps.length === 0 ? (
        <div className="card">
          <p>No apps yet.</p>
          <Link href="/apps/new" className="btn primary">
            Add your first app
          </Link>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>App</th>
                <th>Dynos</th>
                <th>Last report</th>
                <th>Mode</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.slug}>
                  <td>
                    <strong>{app.display_name}</strong>
                    <div className="muted">{app.app_name}</div>
                  </td>
                  <td>{formatFormationSummary(app.formations)}</td>
                  <td>
                    {app.last_reported_at
                      ? new Date(app.last_reported_at).toLocaleString()
                      : "—"}
                  </td>
                  <td>
                    <StatusBadge
                      scalingEnabled={app.scaling_enabled}
                      workerScalingEnabled={app.worker_scaling_enabled}
                      liveScaling={app.live_scaling}
                    />
                  </td>
                  <td>
                    <Link href={`/apps/${app.slug}`}>Manage</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

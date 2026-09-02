"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminLogin } from "@/components/admin-login";
import { StatusBadge } from "@/components/status-badge";
import { adminFetch, getAdminToken } from "@/lib/admin-client";

interface AppListItem {
  slug: string;
  display_name: string;
  heroku_app_name: string;
  scaling_enabled: boolean;
  dry_run: boolean;
  live_scaling: boolean;
  webhook_url: string;
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
      <>
        <AdminLogin
          onAuthenticated={() => {
            setAuthenticated(true);
            loadApps();
          }}
        />
      </>
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
                <th>Heroku</th>
                <th>Mode</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.slug}>
                  <td>
                    <strong>{app.display_name}</strong>
                    <div className="muted">{app.slug}</div>
                  </td>
                  <td>{app.heroku_app_name}</td>
                  <td>
                    <StatusBadge
                      scalingEnabled={app.scaling_enabled}
                      dryRun={app.dry_run}
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

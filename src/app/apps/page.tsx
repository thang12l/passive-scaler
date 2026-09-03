"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminLogin } from "@/components/admin-login";
import { StatusBadge } from "@/components/status-badge";
import { adminFetch, getAdminToken } from "@/lib/admin-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 text-2xl font-semibold tracking-tight">Apps</h1>
        <Button asChild>
          <Link href="/apps/new">Add app</Link>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : apps.length === 0 ? (
        <Card>
          <CardContent className="space-y-4">
            <p>No apps yet.</p>
            <Button asChild>
              <Link href="/apps/new">Add your first app</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>App</TableHead>
                  <TableHead>Dynos</TableHead>
                  <TableHead>Last report</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.map((app) => (
                  <TableRow key={app.slug}>
                    <TableCell>
                      <strong>{app.display_name}</strong>
                      <div className="text-sm text-muted-foreground">{app.app_name}</div>
                    </TableCell>
                    <TableCell>{formatFormationSummary(app.formations)}</TableCell>
                    <TableCell>
                      {app.last_reported_at
                        ? new Date(app.last_reported_at).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        scalingEnabled={app.scaling_enabled}
                        workerScalingEnabled={app.worker_scaling_enabled}
                        liveScaling={app.live_scaling}
                      />
                    </TableCell>
                    <TableCell>
                      <Link href={`/apps/${app.slug}`} className="text-sm underline-offset-4 hover:underline">
                        Manage
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

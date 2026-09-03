"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppForm, type AppFormValues } from "@/components/app-form";
import { AdminLogin } from "@/components/admin-login";
import { EventsTable } from "@/components/events-table";
import { FormationPanel } from "@/components/formation-panel";
import { StatusBadge } from "@/components/status-badge";
import { adminFetch, getAdminToken, watchAppLive } from "@/lib/admin-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AppDetail {
  slug: string;
  app_name: string;
  display_name: string;
  scaling_enabled: boolean;
  worker_scaling_enabled: boolean;
  live_scaling: boolean;
  min_dynos: number;
  max_dynos: number;
  response_time_threshold_ms: number;
  memory_threshold_percent: number;
  scale_up_cooldown_seconds: number;
  scale_down_cooldown_seconds: number;
  worker_min_dynos: number;
  worker_max_dynos: number;
  worker_queue_size_threshold: number;
  worker_queue_latency_threshold_ms: number;
  worker_memory_threshold_percent: number;
  worker_scale_up_cooldown_seconds: number;
  worker_scale_down_cooldown_seconds: number;
  has_app_heroku_api_key: boolean;
  has_platform_heroku_api_key: boolean;
  heroku_api_key?: string;
}

interface FormationState {
  process_type: string;
  current_dynos: number | null;
  last_scale_time: string | null;
  last_action: string | null;
  last_metrics: {
    response_time: number | null;
    memory_percent: number | null;
    queue_size: number | null;
    queue_latency: number | null;
  };
  last_reported_at: string;
}

export default function EditAppPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;

  const [authenticated, setAuthenticated] = useState(Boolean(getAdminToken()));
  const [app, setApp] = useState<AppDetail | null>(null);
  const [formations, setFormations] = useState<FormationState[]>([]);
  const [lastReportedAt, setLastReportedAt] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [eventsReloadToken, setEventsReloadToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadApp = useCallback(async (opts?: { silent?: boolean }) => {
    if (opts?.silent) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await adminFetch(`/api/apps/${slug}`);
      if (response.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (!response.ok) return;
      const data = await response.json();
      setApp(data.app);
      setFormations(data.formations ?? []);
      setLastReportedAt(data.last_reported_at ?? null);
      setWebhookUrl(data.webhook_url);
      setAuthenticated(true);
    } finally {
      if (opts?.silent) setRefreshing(false);
      else setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (getAdminToken()) loadApp();
    else setLoading(false);
  }, [loadApp]);

  const refreshFromMetrics = useCallback(() => {
    setRefreshing(true);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      void loadApp({ silent: true });
      setEventsReloadToken((token) => token + 1);
    }, 300);
  }, [loadApp]);

  const hasApp = Boolean(app);

  useEffect(() => {
    if (!authenticated || !slug || !hasApp) return;

    const controller = new AbortController();
    let stopped = false;
    let delay = 1000;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        controller.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve();
        });
      });

    const connect = async () => {
      while (!stopped && !controller.signal.aborted) {
        try {
          const result = await watchAppLive(slug, refreshFromMetrics, controller.signal);
          if (result === "unauthorized" || stopped || controller.signal.aborted) return;
          delay = 1000;
        } catch {
          if (stopped || controller.signal.aborted) return;
        }
        await wait(delay);
        delay = Math.min(delay * 2, 15_000);
      }
    };

    void connect();
    return () => {
      stopped = true;
      controller.abort();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [authenticated, slug, hasApp, refreshFromMetrics]);

  async function handleSubmit(values: AppFormValues) {
    const response = await adminFetch(`/api/apps/${slug}`, {
      method: "PATCH",
      body: JSON.stringify({
        display_name: values.display_name,
        scaling_enabled: values.scaling_enabled,
        min_dynos: values.min_dynos,
        max_dynos: values.max_dynos,
        response_time_threshold_ms: values.response_time_threshold_ms,
        memory_threshold_percent: values.memory_threshold_percent,
        scale_up_cooldown_seconds: values.scale_up_cooldown_seconds,
        scale_down_cooldown_seconds: values.scale_down_cooldown_seconds,
        worker_scaling_enabled: values.worker_scaling_enabled,
        worker_min_dynos: values.worker_min_dynos,
        worker_max_dynos: values.worker_max_dynos,
        worker_queue_size_threshold: values.worker_queue_size_threshold,
        worker_queue_latency_threshold_ms: values.worker_queue_latency_threshold_ms,
        worker_memory_threshold_percent: values.worker_memory_threshold_percent,
        worker_scale_up_cooldown_seconds: values.worker_scale_up_cooldown_seconds,
        worker_scale_down_cooldown_seconds: values.worker_scale_down_cooldown_seconds,
        ...(values.heroku_api_key !== (app?.heroku_api_key ?? "")
          ? { heroku_api_key: values.heroku_api_key }
          : {}),
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error ?? "Failed to update app");
    }

    setMessage("Settings saved.");
    await loadApp();
  }

  async function regenerateSecret() {
    if (!confirm("Regenerate webhook secret? The old secret will stop working immediately.")) {
      return;
    }
    const response = await adminFetch(`/api/apps/${slug}/regenerate-secret`, {
      method: "POST",
    });
    if (!response.ok) {
      setMessage("Failed to regenerate secret.");
      return;
    }
    const data = await response.json();
    setNewSecret(data.webhook_secret);
  }

  async function deleteApp() {
    if (!confirm(`Delete app "${slug}"? This cannot be undone.`)) return;
    const response = await adminFetch(`/api/apps/${slug}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("Failed to delete app.");
      return;
    }
    router.push("/apps");
  }

  if (!authenticated) {
    return <AdminLogin onAuthenticated={() => { setAuthenticated(true); loadApp(); }} />;
  }

  if (loading || !app) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const formValues: AppFormValues = {
    app_name: app.app_name,
    display_name: app.display_name,
    scaling_enabled: app.scaling_enabled,
    min_dynos: app.min_dynos,
    max_dynos: app.max_dynos,
    response_time_threshold_ms: app.response_time_threshold_ms,
    memory_threshold_percent: app.memory_threshold_percent,
    scale_up_cooldown_seconds: app.scale_up_cooldown_seconds,
    scale_down_cooldown_seconds: app.scale_down_cooldown_seconds,
    worker_scaling_enabled: app.worker_scaling_enabled,
    worker_min_dynos: app.worker_min_dynos,
    worker_max_dynos: app.worker_max_dynos,
    worker_queue_size_threshold: app.worker_queue_size_threshold,
    worker_queue_latency_threshold_ms: app.worker_queue_latency_threshold_ms,
    worker_memory_threshold_percent: app.worker_memory_threshold_percent,
    worker_scale_up_cooldown_seconds: app.worker_scale_up_cooldown_seconds,
    worker_scale_down_cooldown_seconds: app.worker_scale_down_cooldown_seconds,
    heroku_api_key: app.heroku_api_key ?? "",
  };

  const webFormation = formations.find((f) => f.process_type === "web");
  const workerFormation = formations.find((f) => f.process_type === "worker");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{app.display_name}</h1>
        <StatusBadge
          scalingEnabled={app.scaling_enabled}
          workerScalingEnabled={app.worker_scaling_enabled}
          liveScaling={app.live_scaling}
          refreshing={refreshing}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        <Link href="/apps" className="underline-offset-4 hover:underline">
          ← Back to dashboard
        </Link>
        {lastReportedAt && (
          <> · Last metric report: {new Date(lastReportedAt).toLocaleString()}</>
        )}
      </p>

      {message && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Webhook integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Use this URL and the app&apos;s webhook secret in your reporter.
          </p>
          <div>
            <p className="mb-1 text-sm text-muted-foreground">URL</p>
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs break-all">
              {webhookUrl}
            </pre>
          </div>
          <p className="text-sm text-muted-foreground">
            Payload field: <code className="font-mono text-xs">app_name: &quot;{app.app_name}&quot;</code>
          </p>
          <Button type="button" variant="outline" onClick={regenerateSecret}>
            Regenerate secret
          </Button>
          {newSecret && (
            <Alert>
              <AlertDescription>
                <p className="mb-2">New webhook secret (copy now):</p>
                <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs break-all">
                  {newSecret}
                </pre>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {webFormation && <FormationPanel formation={webFormation} />}
      {workerFormation && <FormationPanel formation={workerFormation} />}

      <EventsTable slug={slug} reloadToken={eventsReloadToken} />

      <AppForm
        key={slug}
        mode="edit"
        initial={formValues}
        onSubmit={handleSubmit}
        submitLabel="Save settings"
        hasAppHerokuApiKey={app.has_app_heroku_api_key}
        hasPlatformHerokuApiKey={app.has_platform_heroku_api_key}
      />

      <Card>
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="destructive" onClick={deleteApp}>
            Delete app
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

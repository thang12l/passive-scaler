"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppForm, type AppFormValues } from "@/components/app-form";
import { AdminLogin } from "@/components/admin-login";
import { EventsTable } from "@/components/events-table";
import { FormationPanel } from "@/components/formation-panel";
import { StatusBadge } from "@/components/status-badge";
import { adminFetch, getAdminToken } from "@/lib/admin-client";

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

  const loadApp = useCallback(async () => {
    setLoading(true);
    const response = await adminFetch(`/api/apps/${slug}`);
    if (response.status === 401) {
      setAuthenticated(false);
      setLoading(false);
      return;
    }
    if (!response.ok) {
      setLoading(false);
      return;
    }
    const data = await response.json();
    setApp(data.app);
    setFormations(data.formations ?? []);
    setLastReportedAt(data.last_reported_at ?? null);
    setWebhookUrl(data.webhook_url);
    setAuthenticated(true);
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    if (getAdminToken()) loadApp();
    else setLoading(false);
  }, [loadApp]);

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
        heroku_api_key: values.heroku_api_key || "",
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
    return <p className="muted">Loading…</p>;
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
    heroku_api_key: "",
  };

  const webFormation = formations.find((f) => f.process_type === "web");
  const workerFormation = formations.find((f) => f.process_type === "worker");

  return (
    <>
      <div className="actions" style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>{app.display_name}</h1>
        <StatusBadge
          scalingEnabled={app.scaling_enabled}
          workerScalingEnabled={app.worker_scaling_enabled}
          liveScaling={app.live_scaling}
        />
      </div>

      <p className="muted">
        <Link href="/apps">← Back to apps</Link>
        {lastReportedAt && (
          <> · Last metric report: {new Date(lastReportedAt).toLocaleString()}</>
        )}
      </p>

      {message && <div className="alert success">{message}</div>}

      <div className="card">
        <h3>Webhook integration</h3>
        <p className="muted">Use this URL and the app&apos;s webhook secret in your reporter.</p>
        <p className="muted">URL</p>
        <div className="secret-box">{webhookUrl}</div>
        <p className="muted">Payload field: <code>app_name: &quot;{app.app_name}&quot;</code></p>
        <div className="actions">
          <button type="button" onClick={regenerateSecret}>
            Regenerate secret
          </button>
        </div>
        {newSecret && (
          <div className="alert info" style={{ marginTop: "1rem" }}>
            <p>New webhook secret (copy now):</p>
            <div className="secret-box">{newSecret}</div>
          </div>
        )}
      </div>

      {webFormation && <FormationPanel formation={webFormation} />}
      {workerFormation && <FormationPanel formation={workerFormation} />}

      <EventsTable slug={slug} />

      <AppForm
        mode="edit"
        initial={formValues}
        onSubmit={handleSubmit}
        submitLabel="Save settings"
        hasAppHerokuApiKey={app.has_app_heroku_api_key}
        hasPlatformHerokuApiKey={app.has_platform_heroku_api_key}
      />

      <div className="card">
        <h3>Danger zone</h3>
        <button type="button" className="danger" onClick={deleteApp}>
          Delete app
        </button>
      </div>
    </>
  );
}

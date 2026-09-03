"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppForm, type AppFormValues } from "@/components/app-form";
import { AdminLogin } from "@/components/admin-login";
import { adminFetch, getAdminToken } from "@/lib/admin-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const defaultValues: AppFormValues = {
  app_name: "",
  display_name: "",
  scaling_enabled: false,
  min_dynos: 1,
  max_dynos: 10,
  response_time_threshold_ms: 2000,
  memory_threshold_percent: 85,
  scale_up_cooldown_seconds: 300,
  scale_down_cooldown_seconds: 600,
  worker_scaling_enabled: false,
  worker_min_dynos: 1,
  worker_max_dynos: 5,
  worker_queue_size_threshold: 10,
  worker_queue_latency_threshold_ms: 5000,
  worker_memory_threshold_percent: 85,
  worker_scale_up_cooldown_seconds: 300,
  worker_scale_down_cooldown_seconds: 600,
  heroku_api_key: "",
};

export default function NewAppPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(Boolean(getAdminToken()));
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [hasPlatformHerokuApiKey, setHasPlatformHerokuApiKey] = useState(false);

  useEffect(() => {
    if (!getAdminToken()) return;
    adminFetch("/api/apps").then(async (response) => {
      if (response.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (!response.ok) return;
      const data = await response.json();
      setHasPlatformHerokuApiKey(Boolean(data.has_platform_heroku_api_key));
    });
  }, []);

  async function handleSubmit(values: AppFormValues) {
    const payload = {
      app_name: values.app_name,
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
      heroku_api_key: values.heroku_api_key || undefined,
    };

    const response = await adminFetch("/api/apps", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      setAuthenticated(false);
      throw new Error("Unauthorized");
    }

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error ?? "Failed to create app");
    }

    const data = await response.json();
    setCreatedSecret(data.webhook_secret);
    setWebhookUrl(data.webhook_url);
  }

  if (!authenticated) {
    return <AdminLogin onAuthenticated={() => setAuthenticated(true)} />;
  }

  if (createdSecret) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>App created</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              Copy the webhook secret now — it will not be shown again.
            </AlertDescription>
          </Alert>
          <div>
            <p className="mb-1 text-sm text-muted-foreground">Webhook URL</p>
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs break-all">
              {webhookUrl}
            </pre>
          </div>
          <div>
            <p className="mb-1 text-sm text-muted-foreground">Webhook secret</p>
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs break-all">
              {createdSecret}
            </pre>
          </div>
          <Button type="button" onClick={() => router.push("/apps")}>
            Back to apps
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Add app</h1>
      <AppForm
        mode="create"
        initial={defaultValues}
        onSubmit={handleSubmit}
        submitLabel="Create app"
        hasPlatformHerokuApiKey={hasPlatformHerokuApiKey}
      />
    </div>
  );
}

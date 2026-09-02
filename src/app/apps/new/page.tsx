"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppForm, type AppFormValues } from "@/components/app-form";
import { AdminLogin } from "@/components/admin-login";
import { adminFetch, getAdminToken } from "@/lib/admin-client";

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
  heroku_api_key: "",
};

export default function NewAppPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(Boolean(getAdminToken()));
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!getAdminToken()) return;
    adminFetch("/api/apps").then((response) => {
      if (response.status === 401) setAuthenticated(false);
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
      <div className="card">
        <h2>App created</h2>
        <div className="alert info">
          Copy the webhook secret now — it will not be shown again.
        </div>
        <p className="muted">Webhook URL</p>
        <div className="secret-box">{webhookUrl}</div>
        <p className="muted">Webhook secret</p>
        <div className="secret-box">{createdSecret}</div>
        <div className="actions" style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className="primary"
            onClick={() => router.push("/apps")}
          >
            Back to apps
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <h1>Add app</h1>
      <AppForm
        mode="create"
        initial={defaultValues}
        onSubmit={handleSubmit}
        submitLabel="Create app"
      />
    </>
  );
}

"use client";

import { FormEvent, useState } from "react";

export interface AppFormValues {
  app_name?: string;
  display_name: string;
  scaling_enabled: boolean;
  min_dynos: number;
  max_dynos: number;
  response_time_threshold_ms: number;
  memory_threshold_percent: number;
  scale_up_cooldown_seconds: number;
  scale_down_cooldown_seconds: number;
  heroku_api_key: string;
}

interface AppFormProps {
  initial: AppFormValues;
  mode: "create" | "edit";
  onSubmit: (values: AppFormValues) => Promise<void>;
  submitLabel: string;
}

export function AppForm({ initial, mode, onSubmit, submitLabel }: AppFormProps) {
  const [values, setValues] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof AppFormValues>(key: K, value: AppFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card">
      <label htmlFor="app_name">App name (sent as app_name in webhook payload and used for Heroku API)</label>
      <input
        id="app_name"
        type="text"
        value={values.app_name ?? ""}
        onChange={(e) => updateField("app_name", e.target.value.toLowerCase())}
        pattern="[a-zA-Z0-9_-]+"
        required
        readOnly={mode === "edit"}
      />
      {mode === "edit" && (
        <p className="muted">App name cannot be changed after creation.</p>
      )}

      <label htmlFor="display_name">Display name</label>
      <input
        id="display_name"
        type="text"
        value={values.display_name}
        onChange={(e) => updateField("display_name", e.target.value)}
        required
      />

      <label>
        <input
          type="checkbox"
          checked={values.scaling_enabled}
          onChange={(e) => updateField("scaling_enabled", e.target.checked)}
        />
        Scaling enabled (uncheck to record metrics only)
      </label>

      <h3>Thresholds</h3>
      <div className="grid-2">
        <div>
          <label htmlFor="min_dynos">Min dynos</label>
          <input
            id="min_dynos"
            type="number"
            min={1}
            value={values.min_dynos}
            onChange={(e) => updateField("min_dynos", Number(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="max_dynos">Max dynos</label>
          <input
            id="max_dynos"
            type="number"
            min={1}
            value={values.max_dynos}
            onChange={(e) => updateField("max_dynos", Number(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="response_time_threshold_ms">Response time threshold (ms)</label>
          <input
            id="response_time_threshold_ms"
            type="number"
            min={1}
            value={values.response_time_threshold_ms}
            onChange={(e) => updateField("response_time_threshold_ms", Number(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="memory_threshold_percent">Memory threshold (%)</label>
          <input
            id="memory_threshold_percent"
            type="number"
            min={1}
            max={100}
            value={values.memory_threshold_percent}
            onChange={(e) => updateField("memory_threshold_percent", Number(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="scale_up_cooldown_seconds">Scale-up cooldown (s)</label>
          <input
            id="scale_up_cooldown_seconds"
            type="number"
            min={0}
            value={values.scale_up_cooldown_seconds}
            onChange={(e) => updateField("scale_up_cooldown_seconds", Number(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="scale_down_cooldown_seconds">Scale-down cooldown (s)</label>
          <input
            id="scale_down_cooldown_seconds"
            type="number"
            min={0}
            value={values.scale_down_cooldown_seconds}
            onChange={(e) => updateField("scale_down_cooldown_seconds", Number(e.target.value))}
          />
        </div>
      </div>

      <label htmlFor="heroku_api_key">Heroku API key (optional, per-app override)</label>
      <input
        id="heroku_api_key"
        type="password"
        value={values.heroku_api_key}
        onChange={(e) => updateField("heroku_api_key", e.target.value)}
        placeholder="Leave empty to use platform HEROKU_API_KEY"
      />

      {error && <div className="alert error">{error}</div>}

      <button type="submit" className="primary" disabled={loading}>
        {loading ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

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
  worker_scaling_enabled: boolean;
  worker_min_dynos: number;
  worker_max_dynos: number;
  worker_queue_size_threshold: number;
  worker_queue_latency_threshold_ms: number;
  worker_memory_threshold_percent: number;
  worker_scale_up_cooldown_seconds: number;
  worker_scale_down_cooldown_seconds: number;
  heroku_api_key: string;
}

interface AppFormProps {
  initial: AppFormValues;
  mode: "create" | "edit";
  onSubmit: (values: AppFormValues) => Promise<void>;
  submitLabel: string;
  hasAppHerokuApiKey?: boolean;
  hasPlatformHerokuApiKey?: boolean;
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M3 3l18 18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.8 10.8 0 0 1 12 5c7 0 10 7 10 7a18.5 18.5 0 0 1-3.2 3.8M6.1 6.1A18.3 18.3 0 0 0 2 12s3 7 10 7a10.4 10.4 0 0 0 4.2-.9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function AppForm({
  initial,
  mode,
  onSubmit,
  submitLabel,
  hasAppHerokuApiKey = false,
  hasPlatformHerokuApiKey = false,
}: AppFormProps) {
  const [values, setValues] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHerokuApiKey, setShowHerokuApiKey] = useState(false);

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

      <h3>Web scaling</h3>
      <label>
        <input
          type="checkbox"
          checked={values.scaling_enabled}
          onChange={(e) => updateField("scaling_enabled", e.target.checked)}
        />
        Web scaling enabled
      </label>

      <div className="grid-2">
        <div>
          <label htmlFor="min_dynos">Min web dynos</label>
          <input
            id="min_dynos"
            type="number"
            min={1}
            value={values.min_dynos}
            onChange={(e) => updateField("min_dynos", Number(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="max_dynos">Max web dynos</label>
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
          <label htmlFor="scale_up_cooldown_seconds">Web scale-up cooldown (s)</label>
          <input
            id="scale_up_cooldown_seconds"
            type="number"
            min={0}
            value={values.scale_up_cooldown_seconds}
            onChange={(e) => updateField("scale_up_cooldown_seconds", Number(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="scale_down_cooldown_seconds">Web scale-down cooldown (s)</label>
          <input
            id="scale_down_cooldown_seconds"
            type="number"
            min={0}
            value={values.scale_down_cooldown_seconds}
            onChange={(e) => updateField("scale_down_cooldown_seconds", Number(e.target.value))}
          />
        </div>
      </div>

      <h3>Worker scaling</h3>
      <label>
        <input
          type="checkbox"
          checked={values.worker_scaling_enabled}
          onChange={(e) => updateField("worker_scaling_enabled", e.target.checked)}
        />
        Worker scaling enabled
      </label>

      <div className="grid-2">
        <div>
          <label htmlFor="worker_min_dynos">Min worker dynos</label>
          <input
            id="worker_min_dynos"
            type="number"
            min={1}
            value={values.worker_min_dynos}
            onChange={(e) => updateField("worker_min_dynos", Number(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="worker_max_dynos">Max worker dynos</label>
          <input
            id="worker_max_dynos"
            type="number"
            min={1}
            value={values.worker_max_dynos}
            onChange={(e) => updateField("worker_max_dynos", Number(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="worker_queue_size_threshold">Jobs per dyno (queue ratio)</label>
          <input
            id="worker_queue_size_threshold"
            type="number"
            min={1}
            value={values.worker_queue_size_threshold}
            onChange={(e) => updateField("worker_queue_size_threshold", Number(e.target.value))}
          />
          <p className="muted">
            Target dynos = ceil(queue size / this value), then clamped to min/max.
            Example: 10 means queue 11–20 → 2 dynos, 21–30 → 3.
          </p>
        </div>
        <div>
          <label htmlFor="worker_queue_latency_threshold_ms">Queue latency threshold (ms)</label>
          <input
            id="worker_queue_latency_threshold_ms"
            type="number"
            min={1}
            value={values.worker_queue_latency_threshold_ms}
            onChange={(e) =>
              updateField("worker_queue_latency_threshold_ms", Number(e.target.value))
            }
          />
        </div>
        <div>
          <label htmlFor="worker_memory_threshold_percent">Worker memory threshold (%)</label>
          <input
            id="worker_memory_threshold_percent"
            type="number"
            min={1}
            max={100}
            value={values.worker_memory_threshold_percent}
            onChange={(e) =>
              updateField("worker_memory_threshold_percent", Number(e.target.value))
            }
          />
        </div>
        <div>
          <label htmlFor="worker_scale_up_cooldown_seconds">Worker scale-up cooldown (s)</label>
          <input
            id="worker_scale_up_cooldown_seconds"
            type="number"
            min={0}
            value={values.worker_scale_up_cooldown_seconds}
            onChange={(e) =>
              updateField("worker_scale_up_cooldown_seconds", Number(e.target.value))
            }
          />
        </div>
        <div>
          <label htmlFor="worker_scale_down_cooldown_seconds">Worker scale-down cooldown (s)</label>
          <input
            id="worker_scale_down_cooldown_seconds"
            type="number"
            min={0}
            value={values.worker_scale_down_cooldown_seconds}
            onChange={(e) =>
              updateField("worker_scale_down_cooldown_seconds", Number(e.target.value))
            }
          />
        </div>
      </div>

      <label htmlFor="heroku_api_key">Heroku API key (optional, per-app override)</label>
      <p className="muted">
        Per-app key: {hasAppHerokuApiKey ? "set" : "not set"}. Platform HEROKU_API_KEY:{" "}
        {hasPlatformHerokuApiKey ? "set" : "not set"}.{" "}
        {hasAppHerokuApiKey
          ? "This app will use its own key."
          : hasPlatformHerokuApiKey
            ? "This app will use the platform HEROKU_API_KEY."
            : "No Heroku API key is available, so live scaling cannot run."}{" "}
        {mode === "edit" && hasAppHerokuApiKey
          ? "Leave the field unchanged to keep the current key. Clear it and save to fall back to the platform key."
          : "Leave empty to use the platform HEROKU_API_KEY."}
      </p>
      <div className="secret-input">
        <input
          id="heroku_api_key"
          name="heroku_api_key"
          type={showHerokuApiKey ? "text" : "password"}
          value={values.heroku_api_key}
          onChange={(e) => updateField("heroku_api_key", e.target.value)}
          placeholder="Leave empty to use platform HEROKU_API_KEY"
          autoComplete="off"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
        />
        <button
          type="button"
          onClick={() => setShowHerokuApiKey((visible) => !visible)}
          aria-label={showHerokuApiKey ? "Hide API key" : "Show API key"}
          title={showHerokuApiKey ? "Hide API key" : "Show API key"}
        >
          <EyeIcon open={showHerokuApiKey} />
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <button type="submit" className="primary" disabled={loading}>
        {loading ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

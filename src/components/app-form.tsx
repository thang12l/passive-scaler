"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-2">
            <Label htmlFor="app_name">
              App name (sent as app_name in webhook payload and used for Heroku API)
            </Label>
            <Input
              id="app_name"
              type="text"
              value={values.app_name ?? ""}
              onChange={(e) => updateField("app_name", e.target.value.toLowerCase())}
              pattern="[a-zA-Z0-9_-]+"
              required
              readOnly={mode === "edit"}
            />
            {mode === "edit" && (
              <p className="text-sm text-muted-foreground">
                App name cannot be changed after creation.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              type="text"
              value={values.display_name}
              onChange={(e) => updateField("display_name", e.target.value)}
              required
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-base font-medium">Web scaling</h3>
            <div className="flex items-center gap-2">
              <Checkbox
                id="scaling_enabled"
                checked={values.scaling_enabled}
                onCheckedChange={(checked) =>
                  updateField("scaling_enabled", checked === true)
                }
              />
              <Label htmlFor="scaling_enabled">Web scaling enabled</Label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="min_dynos">Min web dynos</Label>
                <Input
                  id="min_dynos"
                  type="number"
                  min={1}
                  value={values.min_dynos}
                  onChange={(e) => updateField("min_dynos", Number(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="max_dynos">Max web dynos</Label>
                <Input
                  id="max_dynos"
                  type="number"
                  min={1}
                  value={values.max_dynos}
                  onChange={(e) => updateField("max_dynos", Number(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="response_time_threshold_ms">Response time threshold (ms)</Label>
                <Input
                  id="response_time_threshold_ms"
                  type="number"
                  min={1}
                  value={values.response_time_threshold_ms}
                  onChange={(e) =>
                    updateField("response_time_threshold_ms", Number(e.target.value))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="memory_threshold_percent">Memory threshold (%)</Label>
                <Input
                  id="memory_threshold_percent"
                  type="number"
                  min={1}
                  max={100}
                  value={values.memory_threshold_percent}
                  onChange={(e) =>
                    updateField("memory_threshold_percent", Number(e.target.value))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="scale_up_cooldown_seconds">Web scale-up cooldown (s)</Label>
                <Input
                  id="scale_up_cooldown_seconds"
                  type="number"
                  min={0}
                  value={values.scale_up_cooldown_seconds}
                  onChange={(e) =>
                    updateField("scale_up_cooldown_seconds", Number(e.target.value))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="scale_down_cooldown_seconds">Web scale-down cooldown (s)</Label>
                <Input
                  id="scale_down_cooldown_seconds"
                  type="number"
                  min={0}
                  value={values.scale_down_cooldown_seconds}
                  onChange={(e) =>
                    updateField("scale_down_cooldown_seconds", Number(e.target.value))
                  }
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-base font-medium">Worker scaling</h3>
            <div className="flex items-center gap-2">
              <Checkbox
                id="worker_scaling_enabled"
                checked={values.worker_scaling_enabled}
                onCheckedChange={(checked) =>
                  updateField("worker_scaling_enabled", checked === true)
                }
              />
              <Label htmlFor="worker_scaling_enabled">Worker scaling enabled</Label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="worker_min_dynos">Min worker dynos</Label>
                <Input
                  id="worker_min_dynos"
                  type="number"
                  min={0}
                  value={values.worker_min_dynos}
                  onChange={(e) => updateField("worker_min_dynos", Number(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="worker_max_dynos">Max worker dynos</Label>
                <Input
                  id="worker_max_dynos"
                  type="number"
                  min={1}
                  value={values.worker_max_dynos}
                  onChange={(e) => updateField("worker_max_dynos", Number(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="worker_queue_size_threshold">Jobs per dyno (queue ratio)</Label>
                <Input
                  id="worker_queue_size_threshold"
                  type="number"
                  min={1}
                  value={values.worker_queue_size_threshold}
                  onChange={(e) =>
                    updateField("worker_queue_size_threshold", Number(e.target.value))
                  }
                />
                <p className="text-sm text-muted-foreground">
                  Target dynos = ceil(queue size / this value), then clamped to min/max.
                  Example: 10 means queue 11–20 → 2 dynos, 21–30 → 3.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="worker_queue_latency_threshold_ms">
                  Queue latency threshold (ms)
                </Label>
                <Input
                  id="worker_queue_latency_threshold_ms"
                  type="number"
                  min={1}
                  value={values.worker_queue_latency_threshold_ms}
                  onChange={(e) =>
                    updateField("worker_queue_latency_threshold_ms", Number(e.target.value))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="worker_memory_threshold_percent">
                  Worker memory threshold (%)
                </Label>
                <Input
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
              <div className="grid gap-2">
                <Label htmlFor="worker_scale_up_cooldown_seconds">
                  Worker scale-up cooldown (s)
                </Label>
                <Input
                  id="worker_scale_up_cooldown_seconds"
                  type="number"
                  min={0}
                  value={values.worker_scale_up_cooldown_seconds}
                  onChange={(e) =>
                    updateField("worker_scale_up_cooldown_seconds", Number(e.target.value))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="worker_scale_down_cooldown_seconds">
                  Worker scale-down cooldown (s)
                </Label>
                <Input
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
          </div>

          <div className="grid gap-2">
            <Label htmlFor="heroku_api_key">Heroku API key (optional, per-app override)</Label>
            <p className="text-sm text-muted-foreground">
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
            <div className="relative">
              <Input
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
                className="pr-9"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute top-1/2 right-1 -translate-y-1/2"
                onClick={() => setShowHerokuApiKey((visible) => !visible)}
                aria-label={showHerokuApiKey ? "Hide API key" : "Show API key"}
                title={showHerokuApiKey ? "Hide API key" : "Show API key"}
              >
                {showHerokuApiKey ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={loading}>
            {loading ? "Saving…" : submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

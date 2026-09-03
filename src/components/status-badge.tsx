import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({
  scalingEnabled,
  workerScalingEnabled,
  liveScaling,
  refreshing = false,
}: {
  scalingEnabled: boolean;
  workerScalingEnabled?: boolean;
  liveScaling: boolean;
  refreshing?: boolean;
}) {
  const spinner = refreshing ? (
    <Loader2 className="size-3 animate-spin" aria-hidden="true" />
  ) : null;

  if (!scalingEnabled && !workerScalingEnabled) {
    return (
      <Badge variant="secondary" aria-busy={refreshing || undefined}>
        {spinner}
        Metrics only
      </Badge>
    );
  }
  if (liveScaling) {
    return (
      <Badge variant="default" aria-busy={refreshing || undefined}>
        {spinner}
        Live scaling
      </Badge>
    );
  }
  const parts: string[] = [];
  if (scalingEnabled) parts.push("web");
  if (workerScalingEnabled) parts.push("worker");
  return (
    <Badge variant="outline" aria-busy={refreshing || undefined}>
      {spinner}
      {parts.join(" + ")} · no Heroku key
    </Badge>
  );
}

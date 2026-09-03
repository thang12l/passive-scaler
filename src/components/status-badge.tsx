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
  const spinner = refreshing ? <span className="badge-spinner" aria-hidden="true" /> : null;

  if (!scalingEnabled && !workerScalingEnabled) {
    return (
      <span className="badge off" aria-busy={refreshing || undefined}>
        {spinner}
        Metrics only
      </span>
    );
  }
  if (liveScaling) {
    return (
      <span className="badge live" aria-busy={refreshing || undefined}>
        {spinner}
        Live scaling
      </span>
    );
  }
  const parts: string[] = [];
  if (scalingEnabled) parts.push("web");
  if (workerScalingEnabled) parts.push("worker");
  return (
    <span className="badge dry" aria-busy={refreshing || undefined}>
      {spinner}
      {parts.join(" + ")} · no Heroku key
    </span>
  );
}

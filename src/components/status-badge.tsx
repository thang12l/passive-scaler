export function StatusBadge({
  scalingEnabled,
  workerScalingEnabled,
  liveScaling,
}: {
  scalingEnabled: boolean;
  workerScalingEnabled?: boolean;
  liveScaling: boolean;
}) {
  if (!scalingEnabled && !workerScalingEnabled) {
    return <span className="badge off">Metrics only</span>;
  }
  if (liveScaling) {
    return <span className="badge live">Live scaling</span>;
  }
  const parts: string[] = [];
  if (scalingEnabled) parts.push("web");
  if (workerScalingEnabled) parts.push("worker");
  return <span className="badge dry">{parts.join(" + ")} · no Heroku key</span>;
}

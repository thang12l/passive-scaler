export function StatusBadge({
  scalingEnabled,
  liveScaling,
}: {
  scalingEnabled: boolean;
  liveScaling: boolean;
}) {
  if (!scalingEnabled) {
    return <span className="badge off">Metrics only</span>;
  }
  if (liveScaling) {
    return <span className="badge live">Live scaling</span>;
  }
  return <span className="badge dry">No Heroku key</span>;
}

export function StatusBadge({
  scalingEnabled,
  dryRun,
  liveScaling,
}: {
  scalingEnabled: boolean;
  dryRun: boolean;
  liveScaling: boolean;
}) {
  if (!scalingEnabled) {
    return <span className="badge off">Disabled</span>;
  }
  if (liveScaling) {
    return <span className="badge live">Live</span>;
  }
  return <span className="badge dry">{dryRun ? "Dry run" : "No Heroku key"}</span>;
}

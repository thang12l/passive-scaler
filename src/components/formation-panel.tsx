export function FormationPanel({
  formation,
}: {
  formation: {
    process_type: string;
    current_dynos: number | null;
    last_scale_time: string | null;
    last_action: string | null;
    last_metrics: {
      response_time: number | null;
      memory_percent: number | null;
      queue_size: number | null;
      queue_latency: number | null;
    };
    last_reported_at: string;
  };
}) {
  const isWorker = formation.process_type === "worker";
  const label = isWorker ? "Worker" : "Web";

  return (
    <div className="card">
      <h3>{label} formation</h3>
      <div className="grid-2">
        <div>
          <span className="muted">Current dynos</span>
          <div>{formation.current_dynos ?? "—"}</div>
        </div>
        <div>
          <span className="muted">Last action</span>
          <div>{formation.last_action ?? "—"}</div>
        </div>
        <div>
          <span className="muted">Last reported</span>
          <div>{new Date(formation.last_reported_at).toLocaleString()}</div>
        </div>
        <div>
          <span className="muted">Last scale</span>
          <div>
            {formation.last_scale_time
              ? new Date(formation.last_scale_time).toLocaleString()
              : "—"}
          </div>
        </div>
        {!isWorker && (
          <div>
            <span className="muted">Response time</span>
            <div>{formation.last_metrics.response_time ?? "—"} ms</div>
          </div>
        )}
        {isWorker && (
          <>
            <div>
              <span className="muted">Queue size</span>
              <div>{formation.last_metrics.queue_size ?? "—"}</div>
            </div>
            <div>
              <span className="muted">Queue latency</span>
              <div>{formation.last_metrics.queue_latency ?? "—"} ms</div>
            </div>
          </>
        )}
        <div>
          <span className="muted">Memory</span>
          <div>{formation.last_metrics.memory_percent ?? "—"}%</div>
        </div>
      </div>
    </div>
  );
}

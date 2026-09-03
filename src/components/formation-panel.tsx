import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <Card>
      <CardHeader>
        <CardTitle>{label} formation</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-sm text-muted-foreground">Current dynos</div>
            <div>{formation.current_dynos ?? "—"}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Last action</div>
            <div>{formation.last_action ?? "—"}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Last reported</div>
            <div>{new Date(formation.last_reported_at).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Last scale</div>
            <div>
              {formation.last_scale_time
                ? new Date(formation.last_scale_time).toLocaleString()
                : "—"}
            </div>
          </div>
          {!isWorker && (
            <div>
              <div className="text-sm text-muted-foreground">Response time</div>
              <div>{formation.last_metrics.response_time ?? "—"} ms</div>
            </div>
          )}
          {isWorker && (
            <>
              <div>
                <div className="text-sm text-muted-foreground">Queue size</div>
                <div>{formation.last_metrics.queue_size ?? "—"}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Queue latency</div>
                <div>{formation.last_metrics.queue_latency ?? "—"} ms</div>
              </div>
            </>
          )}
          <div>
            <div className="text-sm text-muted-foreground">Memory</div>
            <div>{formation.last_metrics.memory_percent ?? "—"}%</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

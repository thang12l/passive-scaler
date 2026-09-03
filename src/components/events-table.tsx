"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "@/lib/admin-client";

interface ScalingEventRow {
  id: number;
  process_type: string;
  action: string;
  reason: string;
  execution_status: string;
  execution_error: string | null;
  target_dynos: number | null;
  resulting_dynos: number | null;
  created_at: string;
  metrics: {
    dyno: string | null;
    avg_response_time: number | null;
    memory_percent: number | null;
    queue_size: number | null;
    scaled: boolean | null;
  } | null;
}

function executionBadge(status: string) {
  if (status === "succeeded") return { className: "badge live", label: "Succeeded" };
  if (status === "failed") return { className: "badge fail", label: "Failed" };
  if (status === "not_executed") return { className: "badge dry", label: "Not executed" };
  return { className: "badge off", label: status };
}

export function EventsTable({ slug, reloadToken = 0 }: { slug: string; reloadToken?: number }) {
  const [events, setEvents] = useState<ScalingEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<"" | "web" | "worker">("");
  const [loading, setLoading] = useState(true);
  const limit = 20;

  const loadEvents = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (filter) params.set("process_type", filter);

    const response = await adminFetch(`/api/apps/${slug}/events?${params}`);
    if (!response.ok) {
      setLoading(false);
      return;
    }

    const data = await response.json();
    setEvents(data.events);
    setTotal(data.total);
    setLoading(false);
  }, [slug, offset, filter]);

  const loadEventsRef = useRef(loadEvents);
  loadEventsRef.current = loadEvents;

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (reloadToken === 0) return;
    void loadEventsRef.current({ silent: true });
  }, [reloadToken]);

  return (
    <div className="card">
      <div className="actions" style={{ marginBottom: "1rem" }}>
        <h3 style={{ margin: 0, flex: 1 }}>Scaling history</h3>
        <select
          value={filter}
          onChange={(e) => {
            setOffset(0);
            setFilter(e.target.value as "" | "web" | "worker");
          }}
          style={{
            padding: "0.45rem 0.65rem",
            borderRadius: "6px",
            border: "1px solid #3a4254",
            background: "#0f1117",
            color: "#e8eaed",
          }}
        >
          <option value="">All</option>
          <option value="web">Web</option>
          <option value="worker">Worker</option>
        </select>
      </div>

      {loading ? (
        <p className="muted">Loading events…</p>
      ) : events.length === 0 ? (
        <p className="muted">No scaling events yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Action</th>
              <th>Execution</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const execution = executionBadge(event.execution_status);
              return (
                <tr key={event.id}>
                  <td>{new Date(event.created_at).toLocaleString()}</td>
                  <td>{event.process_type}</td>
                  <td>{event.action}</td>
                  <td>
                    <span className={execution.className}>{execution.label}</span>
                    {event.execution_error && (
                      <div className="muted" style={{ fontSize: "0.8rem" }}>
                        {event.execution_error}
                      </div>
                    )}
                  </td>
                  <td>
                    <div>{event.reason}</div>
                    {event.metrics && (
                      <div className="muted" style={{ fontSize: "0.8rem" }}>
                        {event.metrics.dyno ? `${event.metrics.dyno} · ` : ""}
                        {event.metrics.queue_size != null
                          ? `queue ${event.metrics.queue_size}`
                          : event.metrics.avg_response_time != null
                            ? `${event.metrics.avg_response_time}ms`
                            : ""}
                        {event.metrics.memory_percent != null
                          ? ` · mem ${event.metrics.memory_percent}%`
                          : ""}
                        {event.target_dynos != null
                          ? ` · target ${event.target_dynos}`
                          : ""}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="actions" style={{ marginTop: "1rem" }}>
        <button
          type="button"
          disabled={offset === 0 || loading}
          onClick={() => setOffset(Math.max(0, offset - limit))}
        >
          Previous
        </button>
        <span className="muted">
          {total === 0 ? "0 events" : `${offset + 1}–${Math.min(offset + limit, total)} of ${total}`}
        </span>
        <button
          type="button"
          disabled={offset + limit >= total || loading}
          onClick={() => setOffset(offset + limit)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

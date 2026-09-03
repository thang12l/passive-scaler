"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "@/lib/admin-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  if (status === "succeeded") return { variant: "default" as const, label: "Succeeded" };
  if (status === "failed") return { variant: "destructive" as const, label: "Failed" };
  if (status === "not_executed") return { variant: "outline" as const, label: "Not executed" };
  return { variant: "secondary" as const, label: status };
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
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4">
        <CardTitle>Scaling history</CardTitle>
        <Select
          value={filter || "all"}
          onValueChange={(value) => {
            setOffset(0);
            setFilter(value === "all" ? "" : (value as "web" | "worker"));
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="web">Web</SelectItem>
            <SelectItem value="worker">Worker</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading events…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scaling events yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Execution</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => {
                const execution = executionBadge(event.execution_status);
                return (
                  <TableRow key={event.id}>
                    <TableCell>{new Date(event.created_at).toLocaleString()}</TableCell>
                    <TableCell>{event.process_type}</TableCell>
                    <TableCell>{event.action}</TableCell>
                    <TableCell>
                      <Badge variant={execution.variant}>{execution.label}</Badge>
                      {event.execution_error && (
                        <div className="text-xs text-muted-foreground">
                          {event.execution_error}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal">
                      <div>{event.reason}</div>
                      {event.metrics && (
                        <div className="text-xs text-muted-foreground">
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
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {total === 0 ? "0 events" : `${offset + 1}–${Math.min(offset + limit, total)} of ${total}`}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={offset + limit >= total || loading}
            onClick={() => setOffset(offset + limit)}
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

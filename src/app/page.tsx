import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Push-based Scaler</h1>
        <p className="text-muted-foreground">Scale when your app needs it.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Manage apps</CardTitle>
          <CardDescription>
            Add apps, configure scaling thresholds, and enable dry-run mode per app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/apps">Open app dashboard</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>
              <code className="font-mono text-xs">POST /api/webhooks/metrics</code> — receive
              metrics and scale
            </li>
            <li>
              <code className="font-mono text-xs">
                GET /api/status?app=&lt;app_name&gt;
              </code>{" "}
              — current scaling state
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

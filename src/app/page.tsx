import Link from "next/link";

export default function Home() {
  return (
    <>
      <h1>Passive Scaler</h1>
      <p>Push-based auto-scaling service for Heroku apps.</p>

      <div className="card">
        <h2>Manage apps</h2>
        <p className="muted">
          Add apps, configure scaling thresholds, and enable dry-run mode per app.
        </p>
        <Link href="/apps" className="btn primary">
          Open app dashboard
        </Link>
      </div>

      <div className="card">
        <h2>Webhook</h2>
        <ul>
          <li>
            <code>POST /api/webhooks/metrics</code> — receive metrics and scale
          </li>
          <li>
            <code>GET /api/status?app=&lt;app_name&gt;</code> — current scaling state
          </li>
        </ul>
      </div>
    </>
  );
}

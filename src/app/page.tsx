import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Passive Scaler",
  description: "Push-based auto-scaling webhook for Heroku apps",
};

export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: "40rem" }}>
      <h1>Passive Scaler</h1>
      <p>Push-based auto-scaling service for Heroku apps.</p>
      <h2>Endpoints</h2>
      <ul>
        <li>
          <code>POST /api/webhooks/heroku-metrics</code> — receive metrics and scale
        </li>
        <li>
          <code>GET /api/status</code> — current scaling state (requires auth)
        </li>
      </ul>
    </main>
  );
}

"use client";

import { FormEvent, useState } from "react";
import { setAdminToken } from "@/lib/admin-client";

export function AdminLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/apps", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      setError("Invalid admin secret");
      setLoading(false);
      return;
    }

    setAdminToken(token);
    onAuthenticated();
  }

  return (
    <div className="card" style={{ maxWidth: "420px" }}>
      <h2>Admin login</h2>
      <p className="muted">Enter your ADMIN_SECRET to manage apps.</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="admin-token">Admin secret</label>
        <input
          id="admin-token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ADMIN_SECRET"
          required
        />
        {error && <div className="alert error">{error}</div>}
        <button type="submit" className="primary" disabled={loading}>
          {loading ? "Checking…" : "Continue"}
        </button>
      </form>
    </div>
  );
}

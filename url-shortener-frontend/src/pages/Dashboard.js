// src/pages/Dashboard.js
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../api";
import { Card, Badge, Spinner } from "../components/UI";
import { useAuth } from "../context/AuthContext";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--raised)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 14px", fontSize: 12, fontFamily: "var(--font-mono)" }}>
      <div style={{ color: "var(--text2)", marginBottom: 2 }}>{label}</div>
      <div style={{ color: "var(--accent)" }}>{payload[0].value} clicks</div>
    </div>
  );
};

export default function DashboardPage() {
  const { user }    = useAuth();
  const [data, setData]   = useState(null);
  const [loading, setL]   = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.dashboard()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setL(false));
  }, []);

  const countryChart = (data?.top_countries || [])
    .filter(c => c._id)
    .map(c => ({ name: c._id, clicks: c.clicks }))
    .slice(0, 8);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
      <Spinner size={32} color="var(--accent)" />
    </div>
  );

  if (error) return (
    <div style={{ maxWidth: 600, margin: "80px auto", textAlign: "center", padding: 24, color: "var(--red)" }}>{error}</div>
  );

  const urls = data?.top_urls || [];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>

      {/* Header */}
      <div className="fade-up" style={{ marginBottom: 36 }}>
        <div style={{ fontSize: 11, color: "var(--text2)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8, fontFamily: "var(--font-mono)" }}>
          {user?.email}
        </div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 42, letterSpacing: "0.03em" }}>
          YOUR DASHBOARD
        </h1>
      </div>

      {/* Summary stats */}
      <div className="fade-up fade-up-1" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Links", value: urls.length },
          { label: "Total Clicks", value: urls.reduce((s, u) => s + (u.clicks || 0), 0) },
          { label: "Flagged", value: urls.filter(u => u.flagged).length, accent: urls.some(u => u.flagged) ? "var(--red)" : undefined },
        ].map(stat => (
          <Card key={stat.label}>
            <div style={{ fontSize: 11, color: "var(--text2)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{stat.label}</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 40, letterSpacing: "0.02em", color: stat.accent || "var(--accent)" }}>{stat.value}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Country chart */}
        <Card className="fade-up fade-up-2">
          <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 16 }}>Clicks by Country</div>
          {countryChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={countryChart} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text2)" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: "var(--text2)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(232,255,71,0.05)" }} />
                <Bar dataKey="clicks" fill="var(--accent)" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text2)", fontSize: 13 }}>
              No click data yet
            </div>
          )}
        </Card>

        {/* Quick create link */}
        <Card className="fade-up fade-up-2" style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", gap: 16, border: "1px dashed var(--border)" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 48, color: "var(--border)" }}>+</div>
          <div>
            <div style={{ fontWeight: 500, marginBottom: 6 }}>Shorten a new URL</div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>Create a smart link with QR code in seconds</div>
            <Link to="/" style={{
              background: "var(--accent)", color: "#000",
              padding: "9px 20px", borderRadius: "var(--radius)",
              fontSize: 13, fontWeight: 500, letterSpacing: "0.03em",
            }}>
              Create Link →
            </Link>
          </div>
        </Card>
      </div>

      {/* URL table */}
      <Card className="fade-up fade-up-3">
        <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 16 }}>
          All Links — sorted by clicks
        </div>

        {urls.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text2)", fontSize: 14 }}>
            No URLs yet. <Link to="/" style={{ color: "var(--accent)" }}>Create your first one →</Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* Table head */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 100px 80px 80px 100px",
              fontSize: 11, color: "var(--text2)", letterSpacing: "0.06em",
              textTransform: "uppercase", padding: "0 0 10px 0",
              borderBottom: "1px solid var(--border)", marginBottom: 4,
            }}>
              <span>URL</span>
              <span style={{ textAlign: "center" }}>Code</span>
              <span style={{ textAlign: "center" }}>Clicks</span>
              <span style={{ textAlign: "center" }}>Status</span>
              <span style={{ textAlign: "right" }}>Actions</span>
            </div>

            {urls.map((url, i) => (
              <div key={url.short_code || i} style={{
                display: "grid", gridTemplateColumns: "1fr 100px 80px 80px 100px",
                alignItems: "center", padding: "12px 0",
                borderBottom: "1px solid var(--border)",
                animation: `fadeUp 0.3s ease both`,
                animationDelay: `${i * 0.04}s`,
              }}>
                {/* URL */}
                <div style={{ minWidth: 0, paddingRight: 16 }}>
                  <div style={{
                    fontSize: 13, color: "var(--text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {url.long_url}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
                    {url.created_at ? new Date(url.created_at).toLocaleDateString("en-IN") : ""}
                  </div>
                </div>

                {/* Short code */}
                <div style={{ textAlign: "center" }}>
                  <code style={{
                    fontFamily: "var(--font-mono)", fontSize: 12,
                    color: "var(--accent)", background: "var(--raised)",
                    padding: "3px 8px", borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                  }}>
                    {url.short_code}
                  </code>
                </div>

                {/* Clicks */}
                <div style={{ textAlign: "center", fontFamily: "var(--font-display)", fontSize: 22, color: "var(--text)", letterSpacing: "0.02em" }}>
                  {url.clicks || 0}
                </div>

                {/* Status */}
                <div style={{ textAlign: "center" }}>
                  {url.flagged
                    ? <Badge color="var(--red)">Flagged</Badge>
                    : url.expires_at && new Date(url.expires_at) < new Date()
                      ? <Badge color="var(--text2)">Expired</Badge>
                      : <Badge color="var(--green)">Active</Badge>
                  }
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <Link
                    to={`/analytics/${url.short_code}`}
                    style={{
                      fontSize: 11, color: "var(--text2)",
                      border: "1px solid var(--border)", borderRadius: "var(--radius)",
                      padding: "4px 10px", letterSpacing: "0.04em",
                      transition: "color 0.15s, border-color 0.15s",
                    }}
                    onMouseEnter={e => { e.target.style.color = "var(--accent)"; e.target.style.borderColor = "var(--accent)44"; }}
                    onMouseLeave={e => { e.target.style.color = "var(--text2)"; e.target.style.borderColor = "var(--border)"; }}
                  >
                    Stats
                  </Link>
                  <a
                    href={`http://localhost:5000/qr/${url.short_code}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 11, color: "var(--text2)",
                      border: "1px solid var(--border)", borderRadius: "var(--radius)",
                      padding: "4px 10px", letterSpacing: "0.04em",
                    }}
                  >
                    QR
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

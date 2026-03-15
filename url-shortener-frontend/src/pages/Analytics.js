// src/pages/Analytics.js
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { api } from "../api";
import { Card, Badge, Spinner, Divider } from "../components/UI";

const COLORS = ["#e8ff47", "#ff6b35", "#44ff88", "#4499ff", "#ff44cc", "#ffcc44"];

function Stat({ label, value, accent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 11, color: "var(--text2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 28, fontFamily: "var(--font-display)", letterSpacing: "0.02em", color: accent || "var(--text)" }}>{value}</div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--raised)", border: "1px solid var(--border)",
      borderRadius: "var(--radius)", padding: "8px 14px",
      fontSize: 12, fontFamily: "var(--font-mono)",
    }}>
      <div style={{ color: "var(--text2)", marginBottom: 2 }}>{label}</div>
      <div style={{ color: "var(--accent)" }}>{payload[0].value} clicks</div>
    </div>
  );
};

export default function AnalyticsPage() {
  const { short_code } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    api.analytics(short_code)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [short_code]);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
      <Spinner size={32} color="var(--accent)" />
    </div>
  );

  if (error) return (
    <div style={{ maxWidth: 600, margin: "80px auto", textAlign: "center", padding: 24 }}>
      <div style={{ color: "var(--red)", marginBottom: 16 }}>{error}</div>
      <Link to="/" style={{ color: "var(--accent)", fontSize: 14 }}>← Back to home</Link>
    </div>
  );

  const ml   = data?.ml_analytics || {};
  const anom = ml.traffic_anomaly || {};

  // Charts data
  const hourlyData = Object.entries(ml.hourly_distribution || {})
    .map(([h, c]) => ({ hour: `${h}:00`, clicks: c }))
    .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));

  const countryData = Object.entries(ml.top_countries || {})
    .map(([country, clicks]) => ({ name: country || "Unknown", value: clicks }))
    .slice(0, 6);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 24px" }}>

      {/* Header */}
      <div className="fade-up" style={{ marginBottom: 32 }}>
        <Link to="/" style={{ fontSize: 12, color: "var(--text2)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          ← Back
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, letterSpacing: "0.03em" }}>
            ANALYTICS
          </h1>
          <code style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--accent)", background: "var(--raised)", padding: "4px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
            /{short_code}
          </code>
          {anom.is_suspicious && (
            <Badge color="var(--red)">⚠ Suspicious Traffic</Badge>
          )}
          {data?.flagged && (
            <Badge color="var(--red)">Flagged</Badge>
          )}
        </div>
        <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 6, fontFamily: "var(--font-mono)" }}>
          {data?.long_url}
        </div>
      </div>

      {/* Top stats */}
      <div className="fade-up fade-up-1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 24 }}>
        <Card>
          <Stat label="Total Clicks" value={ml.total_clicks ?? data?.clicks ?? 0} accent="var(--accent)" />
        </Card>
        <Card>
          <Stat
            label="Predicted Clicks"
            value={ml.predicted_clicks === "model_not_trained" ? "—" : ml.predicted_clicks ?? "—"}
            accent="var(--text)"
          />
          {ml.predicted_clicks === "model_not_trained" && (
            <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 6 }}>Run train_models.py</div>
          )}
        </Card>
        <Card>
          <Stat label="Anomaly Score" value={anom.score !== undefined ? anom.score.toFixed(3) : "—"} accent={anom.is_suspicious ? "var(--red)" : "var(--green)"} />
          <div style={{ fontSize: 11, color: anom.is_suspicious ? "var(--red)" : "var(--text2)", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {anom.reason || "ok"}
          </div>
        </Card>
        <Card>
          <Stat label="Created" value={data?.created_at ? new Date(data.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"} />
        </Card>
        <Card>
          <Stat label="Expires" value={data?.expires_at ? new Date(data.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Never"} />
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Hourly chart */}
        <Card className="fade-up fade-up-2">
          <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 16 }}>
            Clicks by Hour of Day
          </div>
          {hourlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={hourlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--text2)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} interval={3} />
                <YAxis tick={{ fontSize: 10, fill: "var(--text2)" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(232,255,71,0.05)" }} />
                <Bar dataKey="clicks" fill="var(--accent)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text2)", fontSize: 13 }}>No click data yet</div>
          )}
        </Card>

        {/* Country pie */}
        <Card className="fade-up fade-up-2">
          <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 16 }}>
            Top Countries
          </div>
          {countryData.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <PieChart width={120} height={120}>
                <Pie data={countryData} cx={55} cy={55} innerRadius={32} outerRadius={55} dataKey="value" paddingAngle={3}>
                  {countryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
              </PieChart>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                {countryData.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                    <span style={{ flex: 1, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text2)" }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text2)", fontSize: 13 }}>No geo data yet</div>
          )}
        </Card>
      </div>

      {/* Top cities */}
      <Card className="fade-up fade-up-3">
        <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 16 }}>
          Top Cities
        </div>
        {Object.keys(ml.top_cities || {}).length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
            {Object.entries(ml.top_cities).map(([city, count]) => (
              <div key={city} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "var(--raised)", borderRadius: "var(--radius)", padding: "8px 12px",
                border: "1px solid var(--border)",
              }}>
                <span style={{ fontSize: 13, color: "var(--text)" }}>{city}</span>
                <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>{count}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "var(--text2)", fontSize: 13 }}>No city data yet</div>
        )}
      </Card>

      {/* Raw metadata */}
      {data?.metadata?.length > 0 && (
        <Card className="fade-up fade-up-4" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 16 }}>
            Recent Clicks
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
            {[...data.metadata].reverse().slice(0, 20).map((m, i) => (
              <div key={i} style={{
                display: "flex", gap: 12, fontSize: 12,
                fontFamily: "var(--font-mono)", color: "var(--text2)",
                padding: "6px 0", borderBottom: "1px solid var(--border)",
              }}>
                <span style={{ color: "var(--text)" }}>{m.ip || "—"}</span>
                <span>{m.city || "—"}</span>
                <span>{m.country || "—"}</span>
                {m.timestamp && <span style={{ marginLeft: "auto" }}>{new Date(m.timestamp).toLocaleString("en-IN")}</span>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

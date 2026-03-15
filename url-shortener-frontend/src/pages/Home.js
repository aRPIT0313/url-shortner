// src/pages/Home.js
import { useState } from "react";
import { api } from "../api";
import { Btn, Input, Card, Badge, Spinner } from "../components/UI";

export default function HomePage() {
  const [form, setF]     = useState({ long_url: "", alias: "", expires_in_days: "", password: "", smart_alias: false });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");
  const [copied, setCopied] = useState(false);
  const [showAdv, setShowAdv] = useState(false);

  const handle = async (e) => {
    e.preventDefault();
    setError(""); setResult(null); setLoading(true);
    try {
      const payload = { long_url: form.long_url, smart_alias: form.smart_alias };
      if (form.alias)           payload.alias           = form.alias;
      if (form.expires_in_days) payload.expires_in_days = parseInt(form.expires_in_days);
      if (form.password)        payload.password        = form.password;
      const data = await api.shorten(payload);
      setResult(data);
    } catch (ex) {
      setError(ex.message);
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(result.short_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      minHeight: "calc(100vh - 56px)",
      background: "radial-gradient(ellipse at 30% 0%, #1a1a06 0%, var(--bg) 55%)",
      padding: "60px 24px",
    }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        {/* Hero */}
        <div className="fade-up" style={{ textAlign: "center", marginBottom: 52 }}>
          <div style={{
            display: "inline-block", fontFamily: "var(--font-mono)",
            fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
            color: "var(--accent)", marginBottom: 16,
            padding: "4px 12px", border: "1px solid var(--accent)44",
            borderRadius: "var(--radius)",
          }}>
            ML-Powered URL Shortener
          </div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: "clamp(52px, 10vw, 88px)",
            lineHeight: 0.95, letterSpacing: "0.02em",
            color: "var(--text)", marginBottom: 16,
          }}>
            SHORTEN.<br />
            <span style={{ color: "var(--accent)" }}>TRACK.</span><br />
            DOMINATE.
          </h1>
          <p style={{ color: "var(--text2)", fontSize: 15, maxWidth: 400, margin: "0 auto" }}>
            Smart aliases, QR codes, click analytics and anomaly detection — all in one.
          </p>
        </div>

        {/* Form */}
        <Card className="fade-up fade-up-1" style={{ marginBottom: 24 }}>
          <form onSubmit={handle} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Main URL input */}
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <input
                  type="url"
                  placeholder="Paste a long URL here..."
                  value={form.long_url}
                  onChange={e => setF(p => ({ ...p, long_url: e.target.value }))}
                  required
                  style={{
                    width: "100%", background: "var(--raised)",
                    border: "1px solid var(--border)", borderRadius: "var(--radius)",
                    padding: "12px 16px", color: "var(--text)",
                    fontSize: 15, outline: "none",
                    transition: "border-color 0.15s",
                    fontFamily: "var(--font-mono)",
                  }}
                  onFocus={e  => e.target.style.borderColor = "var(--accent)"}
                  onBlur={e   => e.target.style.borderColor = "var(--border)"}
                />
              </div>
              <Btn type="submit" loading={loading} style={{ whiteSpace: "nowrap", padding: "12px 24px" }}>
                {loading ? "" : "Shorten →"}
              </Btn>
            </div>

            {/* Smart alias toggle */}
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <div
                onClick={() => setF(p => ({ ...p, smart_alias: !p.smart_alias }))}
                style={{
                  width: 36, height: 20, borderRadius: 10,
                  background: form.smart_alias ? "var(--accent)" : "var(--border)",
                  position: "relative", transition: "background 0.2s",
                }}
              >
                <div style={{
                  position: "absolute", top: 3, left: form.smart_alias ? 19 : 3,
                  width: 14, height: 14, borderRadius: "50%",
                  background: form.smart_alias ? "#000" : "var(--text2)",
                  transition: "left 0.2s",
                }} />
              </div>
              <span style={{ fontSize: 13, color: "var(--text2)" }}>
                Use <span style={{ color: "var(--accent)" }}>smart NLP alias</span> — generate a readable slug from the page title
              </span>
            </label>

            {/* Advanced options toggle */}
            <button
              type="button"
              onClick={() => setShowAdv(p => !p)}
              style={{
                background: "none", border: "none", color: "var(--text2)",
                fontSize: 12, cursor: "pointer", textAlign: "left",
                letterSpacing: "0.06em", textTransform: "uppercase",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <span style={{ transition: "transform 0.2s", display: "inline-block", transform: showAdv ? "rotate(90deg)" : "none" }}>▶</span>
              Advanced options
            </button>

            {showAdv && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, paddingTop: 4 }}>
                <Input label="Custom alias" placeholder="my-link"
                  value={form.alias} onChange={e => setF(p => ({ ...p, alias: e.target.value }))} />
                <Input label="Expires in (days)" type="number" placeholder="30"
                  value={form.expires_in_days} onChange={e => setF(p => ({ ...p, expires_in_days: e.target.value }))} />
                <Input label="Password protect" type="password" placeholder="optional"
                  value={form.password} onChange={e => setF(p => ({ ...p, password: e.target.value }))} />
              </div>
            )}

            {error && (
              <div style={{ fontSize: 13, color: "var(--red)", padding: "10px 14px", background: "#ff444410", borderRadius: "var(--radius)", border: "1px solid #ff444422" }}>
                {error}
              </div>
            )}
          </form>
        </Card>

        {/* Result */}
        {result && (
          <Card className="fade-up" style={{ border: "1px solid var(--accent)44" }}>
            <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>

              {/* QR Code */}
              {result.qr_data_uri && (
                <div style={{ flexShrink: 0 }}>
                  <img
                    src={result.qr_data_uri}
                    alt="QR Code"
                    style={{
                      width: 120, height: 120, borderRadius: "var(--radius)",
                      border: "1px solid var(--border)",
                      display: "block",
                    }}
                  />
                  <a
                    href={result.qr_data_uri}
                    download={`qr-${result.short_code}.png`}
                    style={{ display: "block", textAlign: "center", fontSize: 11, color: "var(--text2)", marginTop: 6, letterSpacing: "0.04em" }}
                  >
                    Download QR
                  </a>
                </div>
              )}

              {/* URL details */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Badge color="var(--accent)">Ready</Badge>
                  <span style={{ fontSize: 12, color: "var(--text2)", fontFamily: "var(--font-mono)" }}>
                    /{result.short_code}
                  </span>
                </div>

                {/* Short URL row */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "var(--raised)", borderRadius: "var(--radius)",
                  border: "1px solid var(--border)", padding: "10px 14px",
                  marginBottom: 12,
                }}>
                  <span style={{
                    flex: 1, fontFamily: "var(--font-mono)", fontSize: 14,
                    color: "var(--accent)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {result.short_url}
                  </span>
                  <button
                    onClick={copy}
                    style={{
                      background: copied ? "var(--accent)" : "transparent",
                      border: `1px solid ${copied ? "var(--accent)" : "var(--border)"}`,
                      borderRadius: "var(--radius)", padding: "4px 12px",
                      color: copied ? "#000" : "var(--text2)", fontSize: 12, cursor: "pointer",
                      transition: "all 0.15s", whiteSpace: "nowrap",
                    }}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                  <a
                    href={result.short_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      border: "1px solid var(--border)", borderRadius: "var(--radius)",
                      padding: "4px 12px", fontSize: 12, color: "var(--text2)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Open ↗
                  </a>
                </div>

                {/* Analytics link */}
                <a
                  href={`/analytics/${result.short_code}`}
                  style={{ fontSize: 12, color: "var(--text2)", letterSpacing: "0.04em" }}
                >
                  View analytics →
                </a>
              </div>
            </div>
          </Card>
        )}

        {/* Feature pills */}
        <div className="fade-up fade-up-3" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 40, justifyContent: "center" }}>
          {[
            ["⚡", "Bloom Filter", "O(1) collision check"],
            ["🤖", "ML Prediction", "Click count forecasting"],
            ["🛡️", "Bot Detection", "Isolation Forest model"],
            ["🔤", "Smart Alias", "NLP-powered slugs"],
            ["📊", "Analytics", "Geo + hourly breakdown"],
            ["🔒", "Password Lock", "Protect any link"],
          ].map(([icon, title, desc]) => (
            <div key={title} style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", padding: "8px 14px",
              fontSize: 12, display: "flex", alignItems: "center", gap: 8,
            }}>
              <span>{icon}</span>
              <span style={{ color: "var(--text)", fontWeight: 500 }}>{title}</span>
              <span style={{ color: "var(--muted)" }}>—</span>
              <span style={{ color: "var(--text2)" }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

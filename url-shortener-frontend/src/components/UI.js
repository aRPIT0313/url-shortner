// src/components/UI.js
import { useState } from "react";

/* ── Button ── */
export function Btn({ children, variant = "primary", loading, style, ...props }) {
  const styles = {
    primary: {
      background: "var(--accent)", color: "#000",
      fontWeight: 500, border: "none",
    },
    ghost: {
      background: "transparent", color: "var(--text)",
      border: "1px solid var(--border)",
    },
    danger: {
      background: "transparent", color: "var(--red)",
      border: "1px solid var(--red)",
    },
  };
  return (
    <button
      style={{
        padding: "10px 20px", borderRadius: "var(--radius)",
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.6 : 1,
        display: "inline-flex", alignItems: "center", gap: 8,
        fontSize: 14, letterSpacing: "0.02em",
        transition: "opacity 0.15s, transform 0.15s",
        ...styles[variant], ...style,
      }}
      onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = "0.85"; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = loading ? "0.6" : "1"; }}
      disabled={loading}
      {...props}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

/* ── Input ── */
export function Input({ label, error, style, ...props }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && <label style={{ fontSize: 12, color: "var(--text2)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</label>}
      <input
        style={{
          background: "var(--raised)", border: `1px solid ${error ? "var(--red)" : "var(--border)"}`,
          borderRadius: "var(--radius)", padding: "10px 14px",
          color: "var(--text)", outline: "none", width: "100%",
          transition: "border-color 0.15s",
          ...style,
        }}
        onFocus={e => { e.target.style.borderColor = error ? "var(--red)" : "var(--accent)"; }}
        onBlur={e  => { e.target.style.borderColor = error ? "var(--red)" : "var(--border)"; }}
        {...props}
      />
      {error && <span style={{ fontSize: 12, color: "var(--red)" }}>{error}</span>}
    </div>
  );
}

/* ── Card ── */
export function Card({ children, style, className }) {
  return (
    <div
      className={className}
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: 24,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ── Spinner ── */
export function Spinner({ size = 20, color = "currentColor" }) {
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      border: `2px solid transparent`,
      borderTopColor: color, borderRadius: "50%",
      animation: "spin 0.7s linear infinite",
    }} />
  );
}

/* ── Toast ── */
let _setToast = null;
export function useToast() {
  return (msg, type = "info") => _setToast?.({ msg, type, id: Date.now() });
}
export function ToastContainer() {
  const [toast, setToast] = useState(null);
  _setToast = setToast;
  if (!toast) return null;
  const colors = { info: "var(--accent)", error: "var(--red)", success: "var(--green)" };
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      background: "var(--raised)", border: `1px solid ${colors[toast.type]}`,
      borderRadius: "var(--radius)", padding: "12px 20px",
      fontSize: 14, color: "var(--text)", maxWidth: 320,
      animation: "fadeUp 0.3s ease",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <span>{toast.msg}</span>
        <button onClick={() => setToast(null)} style={{ background: "none", border: "none", color: "var(--text2)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
      </div>
    </div>
  );
}

/* ── Tag / Badge ── */
export function Badge({ children, color = "var(--accent)" }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px",
      background: color + "22", color,
      border: `1px solid ${color}44`,
      borderRadius: "var(--radius)", fontSize: 11,
      fontFamily: "var(--font-mono)", letterSpacing: "0.04em",
    }}>
      {children}
    </span>
  );
}

/* ── Divider ── */
export function Divider({ style }) {
  return <div style={{ height: 1, background: "var(--border)", ...style }} />;
}

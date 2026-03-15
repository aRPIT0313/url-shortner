// src/pages/Auth.js
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Input, Btn, Spinner } from "../components/UI";

function AuthLayout({ children, title, sub }) {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", padding: 24,
      background: "radial-gradient(ellipse at 60% 20%, #1a1a0a 0%, var(--bg) 60%)",
    }}>
      {/* Big decorative letter */}
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        fontFamily: "var(--font-display)", fontSize: "40vw",
        color: "#ffffff04", pointerEvents: "none", userSelect: "none",
        letterSpacing: "-0.05em", lineHeight: 1,
      }}>S</div>

      <div style={{ width: "100%", maxWidth: 420, position: "relative", zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 40, letterSpacing: "0.04em" }}>
            SNIP<span style={{ color: "var(--accent)" }}>.</span>
          </div>
          <div style={{ color: "var(--text2)", fontSize: 13, marginTop: 4 }}>{sub}</div>
        </div>

        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", padding: "32px 32px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 24, color: "var(--text)" }}>{title}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login }    = useAuth();
  const navigate     = useNavigate();
  const [form, setF] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      await login(form.email, form.password);
      navigate("/");
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" sub="Sign in to your account">
      <form onSubmit={handle} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Input label="Email" type="email" placeholder="you@example.com"
          value={form.email} onChange={e => setF(p => ({ ...p, email: e.target.value }))} required />
        <Input label="Password" type="password" placeholder="••••••••"
          value={form.password} onChange={e => setF(p => ({ ...p, password: e.target.value }))} required />
        {err && <div style={{ fontSize: 13, color: "var(--red)", padding: "8px 12px", background: "#ff444411", borderRadius: "var(--radius)", border: "1px solid #ff444422" }}>{err}</div>}
        <Btn type="submit" loading={loading} style={{ marginTop: 4, width: "100%", justifyContent: "center" }}>
          Sign in
        </Btn>
        <p style={{ textAlign: "center", fontSize: 13, color: "var(--text2)", marginTop: 4 }}>
          No account? <Link to="/register" style={{ color: "var(--accent)" }}>Register</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { register }  = useAuth();
  const navigate      = useNavigate();
  const [form, setF]  = useState({ email: "", password: "", confirm: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) { setErr("Passwords don't match"); return; }
    setErr(""); setLoading(true);
    try {
      await register(form.email, form.password);
      navigate("/");
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create account" sub="Start shortening URLs for free">
      <form onSubmit={handle} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Input label="Email" type="email" placeholder="you@example.com"
          value={form.email} onChange={e => setF(p => ({ ...p, email: e.target.value }))} required />
        <Input label="Password" type="password" placeholder="Min. 6 characters"
          value={form.password} onChange={e => setF(p => ({ ...p, password: e.target.value }))} required />
        <Input label="Confirm password" type="password" placeholder="Repeat password"
          value={form.confirm} onChange={e => setF(p => ({ ...p, confirm: e.target.value }))} required />
        {err && <div style={{ fontSize: 13, color: "var(--red)", padding: "8px 12px", background: "#ff444411", borderRadius: "var(--radius)", border: "1px solid #ff444422" }}>{err}</div>}
        <Btn type="submit" loading={loading} style={{ marginTop: 4, width: "100%", justifyContent: "center" }}>
          Create account
        </Btn>
        <p style={{ textAlign: "center", fontSize: 13, color: "var(--text2)", marginTop: 4 }}>
          Have an account? <Link to="/login" style={{ color: "var(--accent)" }}>Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

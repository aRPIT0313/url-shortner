// src/components/Navbar.js
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleLogout = () => { logout(); navigate("/login"); };

  const linkStyle = (path) => ({
    fontSize: 13, letterSpacing: "0.05em", textTransform: "uppercase",
    color: pathname === path ? "var(--accent)" : "var(--text2)",
    transition: "color 0.15s",
    fontWeight: pathname === path ? 500 : 400,
  });

  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 100,
      background: "rgba(10,10,10,0.92)", backdropFilter: "blur(12px)",
      borderBottom: "1px solid var(--border)",
      padding: "0 32px",
    }}>
      <div style={{
        maxWidth: 1100, margin: "0 auto",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 56,
      }}>
        {/* Logo */}
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28,
            background: "var(--accent)", borderRadius: 4,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 7h10M7 2l5 5-5 5" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 22, letterSpacing: "0.04em", color: "var(--text)" }}>
            SNIP<span style={{ color: "var(--accent)" }}>.</span>
          </span>
        </Link>

        {/* Nav links */}
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {user ? (
            <>
              <Link to="/"         style={linkStyle("/")}>Shorten</Link>
              <Link to="/dashboard" style={linkStyle("/dashboard")}>Dashboard</Link>
              <button
                onClick={handleLogout}
                style={{
                  background: "none", border: "1px solid var(--border)",
                  borderRadius: "var(--radius)", padding: "6px 14px",
                  color: "var(--text2)", fontSize: 13, cursor: "pointer",
                  letterSpacing: "0.04em", textTransform: "uppercase",
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={e => { e.target.style.borderColor = "var(--red)"; e.target.style.color = "var(--red)"; }}
                onMouseLeave={e => { e.target.style.borderColor = "var(--border)"; e.target.style.color = "var(--text2)"; }}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login"    style={linkStyle("/login")}>Login</Link>
              <Link to="/register" style={{
                background: "var(--accent)", color: "#000",
                padding: "6px 16px", borderRadius: "var(--radius)",
                fontSize: 13, fontWeight: 500, letterSpacing: "0.04em",
              }}>
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

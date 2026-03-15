// src/App.js
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import { ToastContainer } from "./components/UI";
import { LoginPage, RegisterPage } from "./pages/Auth";
import HomePage from "./pages/Home";
import DashboardPage from "./pages/Dashboard";
import AnalyticsPage from "./pages/Analytics";
import { Spinner } from "./components/UI";

function Protected({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <Spinner size={32} color="var(--accent)" />
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { user, ready } = useAuth();

  if (!ready) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <Spinner size={32} color="var(--accent)" />
    </div>
  );

  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/login"    element={user ? <Navigate to="/" /> : <LoginPage />} />
        <Route path="/register" element={user ? <Navigate to="/" /> : <RegisterPage />} />
        <Route path="/" element={<Protected><HomePage /></Protected>} />
        <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
        <Route path="/analytics/:short_code" element={<Protected><AnalyticsPage /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

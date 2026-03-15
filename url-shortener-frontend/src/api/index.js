// src/api/index.js
const BASE = "";  // proxy handles /user, /shorten, etc. → localhost:5000

async function req(path, options = {}) {
  const token = localStorage.getItem("access_token");
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  register: (email, password) =>
    req("/user/register", { method: "POST", body: JSON.stringify({ email, password }) }),

  login: (email, password) =>
    req("/user/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  refresh: (refresh_token) =>
    req("/user/refresh", { method: "POST", body: JSON.stringify({ refresh_token }) }),

  shorten: (payload) =>
    req("/shorten", { method: "POST", body: JSON.stringify(payload) }),

  analytics: (short_code) =>
    req(`/analytics/${short_code}`),

  dashboard: () =>
    req("/dashboard"),
};

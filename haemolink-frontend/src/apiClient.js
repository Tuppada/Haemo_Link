import { API_BASE, TOKEN_KEY } from "./constants.js";

export function getAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage errors in restrictive browsers
  }
}

async function api(path, options = {}) {
  const token = getAuthToken();
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore invalid JSON error body
    }
    if (res.status === 401 && !path.includes("/auth/login") && !path.includes("/auth/register")) {
      setAuthToken(null);
      message = "Session expired. Please sign in again.";
    }
    throw new Error(message);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const apiClient = {
  getState: () => api("/state"),
  login: async (email, password) => {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (data.token) setAuthToken(data.token);
    return data.user;
  },
  me: () => api("/auth/me"),
  registerDonor: async (body) => {
    const data = await api("/auth/register-donor", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (data.token) setAuthToken(data.token);
    return data.user;
  },
  createDonor: (body) => api("/donors", { method: "POST", body: JSON.stringify(body) }),
  toggleClearance: (id) => api(`/donors/${id}/clearance`, { method: "PATCH" }),
  createInventory: (body) => api("/inventory", { method: "POST", body: JSON.stringify(body) }),
  createRequest: (body) => api("/requests", { method: "POST", body: JSON.stringify(body) }),
  fulfillRequest: (id) => api(`/requests/${id}/fulfill`, { method: "POST" }),
  createOrganDonor: (body) => api("/organ-donors", { method: "POST", body: JSON.stringify(body) }),
  matches: (body) => api("/matches", { method: "POST", body: JSON.stringify(body) }),
  getAppointments: (userId) => api(`/appointments?userId=${encodeURIComponent(userId)}`),
  createAppointment: (body) => api("/appointments", { method: "POST", body: JSON.stringify(body) }),
  cancelAppointment: (id, userId) =>
    api(`/appointments/${id}?userId=${encodeURIComponent(userId)}`, { method: "DELETE" }),
  chat: (prompt, system, messages) =>
    api("/ai/chat", {
      method: "POST",
      body: JSON.stringify({
        prompt: prompt || null,
        system: system || null,
        messages: messages?.length ? messages : null,
      }),
    }),
  saveHospitalCapacity: (hospitalId, capacities) =>
    api(`/hospitals/${encodeURIComponent(hospitalId)}/capacity`, {
      method: "PUT",
      body: JSON.stringify({ capacities }),
    }),
};

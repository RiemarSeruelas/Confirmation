const configuredApiRoot = String(import.meta.env.VITE_API_ROOT || "").trim().replace(/\/$/, "");
const API_ROOT = configuredApiRoot || (
  import.meta.env.DEV
    ? `http://${window.location.hostname || "localhost"}:5057/api`
    : "/api"
);

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
  } catch {
    throw new Error(
      import.meta.env.DEV
        ? "Cannot reach the Power Tool backend on port 5057. Stop the current command, then run npm run dev so the frontend and backend start together."
        : "Cannot reach the Power Tool backend. Please check that the server is running."
    );
  }

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const looksLikeHtml = text.trim().startsWith("<");
      throw new Error(
        looksLikeHtml
          ? `Backend API route ${API_ROOT}${path} returned the frontend page instead of JSON. ${import.meta.env.DEV ? "Run npm run dev from this Power Tool project so the backend starts on port 5057." : "Restart the Power Tool server with the latest files."}`
          : `Backend API route ${API_ROOT}${path} returned invalid JSON.`
      );
    }
  }

  if (!response.ok) {
    throw new Error(data?.error || data?.detail || "Request failed");
  }
  return data;
}

export const api = {
  health: () => request("/health"),
  login: (payload) => request("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  staffAccounts: (adminUsername) => request(`/staff/accounts?adminUsername=${encodeURIComponent(adminUsername)}`),
  createReviewerAccount: (payload) => request("/staff/reviewers", { method: "POST", body: JSON.stringify(payload) }),
  deleteReviewerAccount: (id, payload) => request(`/staff/reviewers/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify(payload) }),
  categories: () => request("/categories"),
  updateCategory: (id, payload) => request(`/categories/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  createRequest: (payload) => request("/requests", { method: "POST", body: JSON.stringify(payload) }),
  requests: (status = "") => request(`/requests${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  requestById: (id) => request(`/requests/${encodeURIComponent(id)}`),
  requestByReference: (referenceId) => request(`/requests/reference/${encodeURIComponent(referenceId)}`),
  approveRequest: (id, payload) => request(`/requests/${id}/approve`, { method: "POST", body: JSON.stringify(payload) }),
  rejectRequest: (id, payload) => request(`/requests/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),
  archiveRequest: (id, payload = {}) => request(`/requests/${id}/archive`, { method: "POST", body: JSON.stringify(payload) }),
  restoreRequest: (id) => request(`/requests/${id}/restore`, { method: "POST", body: JSON.stringify({}) }),
  items: (params = {}) => {
    const qs = new URLSearchParams(params);
    return request(`/items${qs.toString() ? `?${qs}` : ""}`);
  },
  itemByQr: (qrId) => request(`/items/qr/${encodeURIComponent(qrId)}`),
  updateItem: (id, payload) => request(`/items/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  renewItem: (id, payload) => request(`/items/${id}/renew`, { method: "POST", body: JSON.stringify(payload) }),
  archiveItem: (id, payload = {}) => request(`/items/${id}/archive`, { method: "POST", body: JSON.stringify(payload) }),
  restoreItem: (id) => request(`/items/${id}/restore`, { method: "POST", body: JSON.stringify({}) }),
  trackVisit: (payload) => request("/usage/visit", { method: "POST", body: JSON.stringify(payload) }),
  trackUsageEvent: (payload) => request("/usage/event", { method: "POST", body: JSON.stringify(payload) })
};

import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE = "";

async function readJsonResponse(response) {
  const text = await response.text();

  if (!text) {
    throw new Error(
      `API returned empty response. Status ${response.status}. Backend may be down, proxy may have failed, or DB connection failed.`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `API returned non-JSON response. Status ${response.status}. Response: ${text.slice(0, 250)}`
    );
  }
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function App() {
  const [health, setHealth] = useState(null);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState({
    operator_name: "",
    machine_name: "",
    reading_value: "",
    remarks: ""
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadHealth() {
    try {
      const response = await fetch(`${API_BASE}/api/health`);
      const data = await readJsonResponse(response);
      setHealth(data);
    } catch (error) {
      setHealth({ ok: false, message: error.message });
    }
  }

  async function loadRecords() {
    try {
      const response = await fetch(`${API_BASE}/api/records`);
      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to load records");
      }

      setRecords(data.records || []);
    } catch (error) {
      setMessage(`Load failed: ${error.message}`);
    }
  }

  useEffect(() => {
    loadHealth();
    loadRecords();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`${API_BASE}/api/records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(form)
      });

      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.message || data.error || "Insert failed");
      }

      setMessage(`Saved record #${data.record.id} to PostgreSQL.`);
      setForm({
        operator_name: "",
        machine_name: "",
        reading_value: "",
        remarks: ""
      });

      await loadHealth();
      await loadRecords();
    } catch (error) {
      setMessage(`Save failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Fresh start</p>
          <h1>Confirmation DB Only</h1>
          <p className="subtitle">
            This page only inserts a record into PostgreSQL and reads it back.
          </p>
        </div>

        <div className={`status ${health?.ok ? "ok" : "bad"}`}>
          <span className="dot" />
          <div>
            <strong>{health?.ok ? "DB Connected" : "DB Not Connected"}</strong>
            <small>{health?.ok ? formatDate(health.dbTime) : health?.message || "Checking..."}</small>
          </div>
        </div>
      </section>

      <section className="grid">
        <form className="card form" onSubmit={handleSubmit}>
          <h2>Add Test Record</h2>

          <label>
            Operator Name
            <input
              value={form.operator_name}
              onChange={(event) => setForm({ ...form, operator_name: event.target.value })}
              placeholder="Example: Justin"
              required
            />
          </label>

          <label>
            Machine Name
            <input
              value={form.machine_name}
              onChange={(event) => setForm({ ...form, machine_name: event.target.value })}
              placeholder="Example: Mixer Tank 1"
              required
            />
          </label>

          <label>
            Reading Value
            <input
              type="number"
              step="any"
              value={form.reading_value}
              onChange={(event) => setForm({ ...form, reading_value: event.target.value })}
              placeholder="Example: 31.5"
            />
          </label>

          <label>
            Remarks
            <textarea
              value={form.remarks}
              onChange={(event) => setForm({ ...form, remarks: event.target.value })}
              placeholder="Example: DB test only"
              rows={4}
            />
          </label>

          <button disabled={loading} type="submit">
            {loading ? "Saving..." : "Save to DB"}
          </button>

          {message && <p className="message">{message}</p>}
        </form>

        <section className="card table-card">
          <div className="table-header">
            <div>
              <h2>Latest Records</h2>
              <p>Shows the latest 50 rows from app.confirmation_test_records.</p>
            </div>
            <button className="secondary" type="button" onClick={loadRecords}>
              Refresh
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Operator</th>
                  <th>Machine</th>
                  <th>Value</th>
                  <th>Remarks</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="empty">
                      No records yet.
                    </td>
                  </tr>
                ) : (
                  records.map((record) => (
                    <tr key={record.id}>
                      <td>{record.id}</td>
                      <td>{record.operator_name}</td>
                      <td>{record.machine_name}</td>
                      <td>{record.reading_value ?? "-"}</td>
                      <td>{record.remarks || "-"}</td>
                      <td>{formatDate(record.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);

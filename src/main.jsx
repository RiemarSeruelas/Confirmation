import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

async function readApi(response) {
  const text = await response.text();

  if (!text) {
    throw new Error(`Empty API response. Status ${response.status}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON API response. Status ${response.status}: ${text.slice(0, 200)}`);
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

function getCurrentShift(date = new Date()) {
  const manilaNow = new Date(
    date.toLocaleString("en-US", { timeZone: "Asia/Manila" })
  );

  const hour = manilaNow.getHours();

  if (hour >= 6 && hour < 14) return "1st Shift";
  if (hour >= 14 && hour < 22) return "2nd Shift";
  return "3rd Shift";
}

function App() {
  const [health, setHealth] = useState(null);
  const [records, setRecords] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    operator_name: "",
    machine_name: "",
    reading_value: "",
    product: "",
    batch_number: "",
    remarks: ""
  });

  const currentShift = useMemo(() => getCurrentShift(), []);

  async function loadHealth() {
    try {
      const response = await fetch("/api/health");
      const data = await readApi(response);
      setHealth(data);
    } catch (error) {
      setHealth({
        ok: false,
        message: error.message
      });
    }
  }

  async function loadRecords() {
    try {
      const response = await fetch("/api/records");
      const data = await readApi(response);

      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to load records");
      }

      setRecords(data.records || []);
    } catch (error) {
      setMessage(`Load failed: ${error.message}`);
    }
  }

  async function refreshAll() {
    await loadHealth();
    await loadRecords();
  }

  useEffect(() => {
    refreshAll();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/records", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(form)
      });

      const data = await readApi(response);

      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to save record");
      }

      setMessage(`Saved to PostgreSQL. Record ID: ${data.record.id}`);

      setForm({
        operator_name: "",
        machine_name: "",
        reading_value: "",
        product: "",
        batch_number: "",
        remarks: ""
      });

      await refreshAll();
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
          <p className="eyebrow">Simple DB version</p>
          <h1>Confirmation Form</h1>
          <p className="subtitle">
            This saves directly to PostgreSQL through a tiny API in the same project folder.
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

      <section className="shift-row">
        <div className="shift-card">
          <span>Current Shift</span>
          <strong>{currentShift}</strong>
          <small>1st: 6AM-2PM | 2nd: 2PM-10PM | 3rd: 10PM-6AM</small>
        </div>

        <button type="button" className="secondary" onClick={refreshAll}>
          Refresh DB
        </button>
      </section>

      <section className="grid">
        <form className="card form-card" onSubmit={handleSubmit}>
          <h2>New DB Record</h2>

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
            Machine Operating
            <input
              value={form.machine_name}
              onChange={(event) => setForm({ ...form, machine_name: event.target.value })}
              placeholder="Example: Machine 1"
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
            Product / SKU
            <input
              value={form.product}
              onChange={(event) => setForm({ ...form, product: event.target.value })}
              placeholder="Example: Mayo 220ml"
            />
          </label>

          <label>
            Batch Number
            <input
              value={form.batch_number}
              onChange={(event) => setForm({ ...form, batch_number: event.target.value })}
              placeholder="Example: BATCH-001"
            />
          </label>

          <label>
            Remarks
            <textarea
              value={form.remarks}
              onChange={(event) => setForm({ ...form, remarks: event.target.value })}
              placeholder="Type notes here..."
              rows={4}
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save to PostgreSQL"}
          </button>

          {message && <p className="message">{message}</p>}
        </form>

        <section className="card summary-card">
          <div className="card-title-row">
            <div>
              <h2>Latest DB Records</h2>
              <p>Showing rows from app.confirmation_test_records.</p>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Operator</th>
                  <th>Machine</th>
                  <th>Value</th>
                  <th>Shift</th>
                  <th>Product</th>
                  <th>Batch</th>
                  <th>Remarks</th>
                  <th>Saved</th>
                </tr>
              </thead>

              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="empty">
                      No DB records yet.
                    </td>
                  </tr>
                ) : (
                  records.map((record) => (
                    <tr key={record.id}>
                      <td>{record.id}</td>
                      <td>{record.operator_name}</td>
                      <td>{record.machine_name}</td>
                      <td>{record.reading_value ?? "-"}</td>
                      <td>{record.shift_name}</td>
                      <td>{record.product || "-"}</td>
                      <td>{record.batch_number || "-"}</td>
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

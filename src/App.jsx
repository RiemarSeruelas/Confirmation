import { useEffect, useMemo, useState } from "react";

const emptyForm = {
  operator_name: "",
  machine_name: "",
  reading_value: "",
  product: "",
  batch_number: "",
  shift_name: "1st Shift",
  remarks: "",
};

const shiftOptions = ["1st Shift", "2nd Shift", "3rd Shift", "Unknown Shift"];

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function App() {
  const [form, setForm] = useState(emptyForm);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [dbStatus, setDbStatus] = useState("Checking DB...");

  const latestRecord = useMemo(() => records[0], [records]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function checkDb() {
    try {
      const response = await fetch("/api/health");
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "DB connection failed");
      }

      setDbStatus(`Connected • ${formatDateTime(data.dbTime)}`);
    } catch (error) {
      setDbStatus(`Not connected • ${error.message}`);
    }
  }

  async function loadRecords() {
    try {
      setLoading(true);
      const response = await fetch("/api/records?limit=50");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load records");
      }

      setRecords(data.records || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    try {
      setSaving(true);
      const response = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save record");
      }

      setForm(emptyForm);
      setMessage("Saved successfully.");
      setRecords((current) => [data.record, ...current]);
      checkDb();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    checkDb();
    loadRecords();
  }, []);

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Confirmation Test</p>
          <h1>Record Input</h1>
          <p className="subtitle">
            Input operator, machine, reading, product, batch, shift, and remarks. Each save adds a timestamp automatically.
          </p>
        </div>
        <div className="status-pill">{dbStatus}</div>
      </section>

      <section className="content-grid">
        <form className="form-card" onSubmit={handleSubmit}>
          <h2>New Record</h2>

          <label>
            Operator Name <span>*</span>
            <input
              value={form.operator_name}
              onChange={(event) => updateField("operator_name", event.target.value)}
              placeholder="Enter operator name"
              required
            />
          </label>

          <label>
            Machine Name <span>*</span>
            <input
              value={form.machine_name}
              onChange={(event) => updateField("machine_name", event.target.value)}
              placeholder="Enter machine name"
              required
            />
          </label>

          <div className="two-column">
            <label>
              Reading Value
              <input
                type="number"
                step="any"
                value={form.reading_value}
                onChange={(event) => updateField("reading_value", event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label>
              Shift <span>*</span>
              <select
                value={form.shift_name}
                onChange={(event) => updateField("shift_name", event.target.value)}
                required
              >
                {shiftOptions.map((shift) => (
                  <option key={shift} value={shift}>
                    {shift}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="two-column">
            <label>
              Product
              <input
                value={form.product}
                onChange={(event) => updateField("product", event.target.value)}
                placeholder="Product name"
              />
            </label>

            <label>
              Batch Number
              <input
                value={form.batch_number}
                onChange={(event) => updateField("batch_number", event.target.value)}
                placeholder="Batch number"
              />
            </label>
          </div>

          <label>
            Remarks
            <textarea
              value={form.remarks}
              onChange={(event) => updateField("remarks", event.target.value)}
              placeholder="Optional remarks"
              rows="4"
            />
          </label>

          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Record"}
          </button>

          {message && <p className="message">{message}</p>}
        </form>

        <section className="records-card">
          <div className="records-header">
            <div>
              <h2>Latest Records</h2>
              <p>{latestRecord ? `Latest: ${formatDateTime(latestRecord.record_timestamp)}` : "No records yet"}</p>
            </div>
            <button className="secondary-button" type="button" onClick={loadRecords} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Operator</th>
                  <th>Machine</th>
                  <th>Reading</th>
                  <th>Product</th>
                  <th>Batch</th>
                  <th>Shift</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="empty-row">
                      No records found.
                    </td>
                  </tr>
                ) : (
                  records.map((record) => (
                    <tr key={record.id}>
                      <td>{formatDateTime(record.record_timestamp)}</td>
                      <td>{record.operator_name}</td>
                      <td>{record.machine_name}</td>
                      <td>{record.reading_value ?? "—"}</td>
                      <td>{record.product || "—"}</td>
                      <td>{record.batch_number || "—"}</td>
                      <td>{record.shift_name}</td>
                      <td>{record.remarks || "—"}</td>
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

export default App;

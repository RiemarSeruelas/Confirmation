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

const demoRecord = {
  id: "demo",
  operator_name: "Demo Operator",
  machine_name: "Selo 3 Cooker 2",
  reading_value: 31.3,
  product: "BFWM_DE_OBLX_PREPARATION_UP",
  batch_number: "TEMP-BATCH-001",
  shift_name: "1st Shift",
  remarks: "Idle",
  record_timestamp: new Date().toISOString(),
};

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

function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined || value === "") return "0.00";
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "0.00";
  return numberValue.toFixed(decimals);
}

function buildMachineMetrics(record, records) {
  const reading = Number(record?.reading_value ?? 0);
  const safeReading = Number.isFinite(reading) ? reading : 0;
  const healthBase = Math.max(0, Math.min(100, 100 - Math.abs(safeReading - 30) * 1.2));

  return {
    assetName: record?.machine_name || "Selo 3 Cooker 2",
    status: record?.remarks || "Idle",
    totalRecords: records.length || 0,
    sealHealth: healthBase.toFixed(1),
    motorHealth: Math.max(0, healthBase - 1.4).toFixed(1),
    alarms: safeReading > 60 ? 1 : 0,
    lastOperator: record?.operator_name || "—",
    runningVariant: record?.product || "Temporary Product",
    batchNumber: record?.batch_number || "—",
    shiftName: record?.shift_name || "—",
    timestamp: record?.record_timestamp,
    temperature: safeReading,
  };
}

function AuthPage({ onLogin, onRegister }) {
  const [operator, setOperator] = useState("");
  const [password, setPassword] = useState("");

  function handleLogin(event) {
    event.preventDefault();
    onLogin();
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand-mark">U</div>
        <p className="eyebrow">Confirmation System</p>
        <h1>Login / Register</h1>
        <p className="subtitle">
          Login opens the record input page. Register opens the machine interface preview page.
        </p>

        <form className="login-card" onSubmit={handleLogin}>
          <label>
            Operator Name
            <input
              value={operator}
              onChange={(event) => setOperator(event.target.value)}
              placeholder="Enter operator name"
              autoComplete="username"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Temporary only"
              autoComplete="current-password"
            />
          </label>

          <button type="submit">Login</button>
          <button className="secondary-button full-width" type="button" onClick={onRegister}>
            Register / Machine View
          </button>
        </form>
      </section>

      <section className="auth-preview">
        <div className="preview-topline" />
        <div className="preview-card large" />
        <div className="preview-grid">
          <div className="preview-card" />
          <div className="preview-card" />
          <div className="preview-card" />
        </div>
      </section>
    </main>
  );
}

function TopNav({ page, setPage, onLogout }) {
  return (
    <header className="top-nav">
      <div>
        <p className="nav-kicker">Cavite Factory</p>
        <strong>Confirmation Test App</strong>
      </div>

      <nav>
        <button
          className={page === "records" ? "nav-button active" : "nav-button"}
          type="button"
          onClick={() => setPage("records")}
        >
          Record Input
        </button>
        <button
          className={page === "register" ? "nav-button active" : "nav-button"}
          type="button"
          onClick={() => setPage("register")}
        >
          Register View
        </button>
        <button className="nav-button" type="button" onClick={onLogout}>
          Logout
        </button>
      </nav>
    </header>
  );
}

function RecordInputPage() {
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

function InfoRow({ label, value, action }) {
  return (
    <div className="asset-info-row">
      <span>{label}</span>
      <strong>{value}</strong>
      {action && <button type="button">{action}</button>}
    </div>
  );
}

function Callout({ className = "", title, value, unit, timestamp, children }) {
  return (
    <article className={`machine-callout ${className}`}>
      <h3>{title}</h3>
      {value !== undefined && (
        <p className="callout-reading">
          {value} <span>{unit}</span>
        </p>
      )}
      {children}
      <small>{formatDateTime(timestamp)}</small>
    </article>
  );
}

function MachineDrawing() {
  return (
    <div className="machine-drawing" aria-label="Machine illustration">
      <div className="machine-tank" />
      <div className="machine-neck" />
      <div className="machine-body" />
      <div className="machine-base" />
      <div className="machine-left-arm" />
      <div className="machine-right-arm" />
      <div className="machine-leg left" />
      <div className="machine-leg right" />
      <div className="machine-pin temp" />
      <div className="machine-pin current" />
      <div className="machine-pin speed" />
      <div className="machine-pin power" />
    </div>
  );
}

function RegisterViewPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Loading latest values...");

  const latestRecord = records[0] || demoRecord;
  const metrics = useMemo(() => buildMachineMetrics(latestRecord, records), [latestRecord, records]);

  async function loadRegisterValues() {
    try {
      setLoading(true);
      const response = await fetch("/api/records?limit=20");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load records");
      }

      setRecords(data.records || []);
      setStatus(data.records?.length ? "Live DB values" : "Temporary values");
    } catch (error) {
      setStatus(`Temporary values • ${error.message}`);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRegisterValues();
  }, []);

  return (
    <main className="monitor-shell">
      <section className="monitor-toolbar">
        <div>
          <span className="live-dot" />
          <strong>{status}</strong>
          <small>{loading ? "Refreshing..." : `${formatDateTime(metrics.timestamp)} (PHT)`}</small>
        </div>
        <button className="secondary-button" type="button" onClick={loadRegisterValues} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </section>

      <section className="process-header">
        <button type="button" className="square-button">☰</button>
        <button type="button" className="square-button">←</button>
        <button type="button" className="square-button">→</button>
        <h1>Cavite - Home &gt; SELO-3 Process View &gt; {metrics.assetName}</h1>
      </section>

      <section className="monitor-grid">
        <aside className="asset-panel">
          <InfoRow label="Asset Name" value={metrics.assetName} />
          <InfoRow label="Pasteurization Status" value={metrics.status} />
          <InfoRow label="Total Records" value={metrics.totalRecords} />
          <InfoRow label="Seal Health Score" value={metrics.sealHealth} action="View" />
          <InfoRow label="Motor Health Score" value={metrics.motorHealth} action="View" />
          <InfoRow label="Active Alarms" value={metrics.alarms} action="View" />
          <InfoRow label="Last Operator" value={metrics.lastOperator} />
          <InfoRow label="Shift" value={metrics.shiftName} />
          <InfoRow label="Batch Number" value={metrics.batchNumber} />
          <InfoRow label="Running Variant" value={metrics.runningVariant} />
          <InfoRow label="Current Reading" value={`${formatNumber(metrics.temperature)} °C`} />
        </aside>

        <section className="machine-interface-card">
          <div className="connector-line line-temp" />
          <div className="connector-line line-current" />
          <div className="connector-line line-vibration" />
          <div className="connector-line line-pressure" />
          <div className="connector-line line-speed" />
          <div className="connector-line line-power" />

          <Callout
            className="callout-temp"
            title="Motor vibration sensor contact temp"
            value={formatNumber(metrics.temperature)}
            unit="deg C"
            timestamp={metrics.timestamp}
          />

          <Callout
            className="callout-current"
            title="Motor Current"
            value="0.00"
            unit="A"
            timestamp={metrics.timestamp}
          />

          <Callout className="callout-vibration" title="Motor vibration velocity" timestamp={metrics.timestamp}>
            <div className="mini-reading">
              <span>Resultant RMS</span>
              <strong>0 MM/S</strong>
            </div>
            <div className="mini-reading">
              <span>Resultant Peak</span>
              <strong>0 MM/S</strong>
            </div>
          </Callout>

          <Callout
            className="callout-pressure"
            title="Inlet Pressure"
            value="0.00"
            unit="Pascal"
            timestamp={metrics.timestamp}
          />

          <Callout
            className="callout-speed"
            title="Motor Speed"
            value="0.00"
            unit="RPM"
            timestamp={metrics.timestamp}
          />

          <Callout
            className="callout-power"
            title="Motor Power"
            value="0.00"
            unit="kW"
            timestamp={metrics.timestamp}
          />

          <MachineDrawing />
        </section>
      </section>
    </main>
  );
}

function App() {
  const [page, setPage] = useState("auth");

  if (page === "auth") {
    return <AuthPage onLogin={() => setPage("records")} onRegister={() => setPage("register")} />;
  }

  return (
    <>
      <TopNav page={page} setPage={setPage} onLogout={() => setPage("auth")} />
      {page === "register" ? <RegisterViewPage /> : <RecordInputPage />}
    </>
  );
}

export default App;

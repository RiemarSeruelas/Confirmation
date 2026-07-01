import { useEffect, useRef, useState } from "react";

const siteOptions = ["Savoury", "Dressings"];
const roleOptions = ["operator", "admin"];
const shiftOptions = [
  { value: "1st Shift", label: "1st Shift || 6:00 AM - 2:00 PM" },
  { value: "2nd Shift", label: "2nd Shift || 2:00 PM - 10:00 PM" },
  { value: "3rd Shift", label: "3rd Shift || 10:00 PM - 6:00 AM" },
];

function shiftDisplayName(value) {
  return shiftOptions.find((shift) => shift.value === value)?.label || value || "—";
}

function requiredLabel(text) {
  return <span className="label-text">{text}<em>*</em></span>;
}

const emptyRecord = {
  machine_name: "",
  reading_value: "",
  product: "",
  batch_number: "",
  shift_name: "1st Shift",
  remarks: "",
};

const emptyUserForm = {
  operatorName: "",
  employeeId: "",
  siteName: "Savoury",
  department: "",
  roleName: "operator",
  email: "",
  shiftName: "1st Shift",
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
    hour12: false,
  }).format(date);
}

function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined || value === "") return "—";
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "—";
  return numberValue.toFixed(decimals);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

function getCameraHelp() {
  const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (window.isSecureContext || isLocalhost) return "";
  return "Camera needs HTTPS or localhost. Use localhost for testing or add HTTPS for LAN deployment.";
}

function userDisplayName(user) {
  return user?.operator_name || user?.name || "Operator";
}

function userSite(user) {
  return user?.site_name || "Savoury";
}

function userRole(user) {
  return user?.role_name || "operator";
}

function FaceCaptureModal({ title = "Face Capture", description, onClose, onCapture, autoCapture = false, autoCaptureDelayMs = 900 }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const autoCaptureTimerRef = useRef(null);
  const autoCaptureDoneRef = useRef(false);
  const [status, setStatus] = useState("Starting camera...");
  const [busy, setBusy] = useState(false);

  function stopCamera() {
    if (autoCaptureTimerRef.current) {
      clearTimeout(autoCaptureTimerRef.current);
      autoCaptureTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  function scheduleAutoCapture() {
    if (!autoCapture || autoCaptureDoneRef.current) return;
    autoCaptureDoneRef.current = true;
    setStatus("Camera ready. Auto capturing...");
    autoCaptureTimerRef.current = setTimeout(() => {
      handleCapture();
    }, autoCaptureDelayMs);
  }

  async function startCamera() {
    const help = getCameraHelp();
    if (help) {
      setStatus(help);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Camera is not available in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 960 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = scheduleAutoCapture;
      }
      setStatus(autoCapture ? "Camera ready. Auto capturing..." : "Camera ready. Center your face and capture.");
    } catch (error) {
      setStatus(error.name === "NotAllowedError" ? "Camera permission was blocked." : error.message || "Could not start camera.");
    }
  }

  function captureImage() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      throw new Error("Camera is not ready yet.");
    }

    const targetSize = 640;
    const sourceSize = Math.min(video.videoWidth, video.videoHeight);
    const sourceX = Math.floor((video.videoWidth - sourceSize) / 2);
    const sourceY = Math.floor((video.videoHeight - sourceSize) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = targetSize;
    canvas.height = targetSize;
    const context = canvas.getContext("2d");
    context.drawImage(video, sourceX, sourceY, sourceSize, sourceSize, 0, 0, targetSize, targetSize);
    return canvas.toDataURL("image/jpeg", 0.92);
  }

  async function handleCapture() {
    try {
      setBusy(true);
      setStatus("Capturing image...");
      const imageDataUrl = captureImage();
      await onCapture(imageDataUrl);
      stopCamera();
    } catch (error) {
      setStatus(error.message || "Capture failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    startCamera();
    return stopCamera;
  }, []);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="camera-modal glass-card">
        <div className="modal-header">
          <div>
            <p className="eyebrow">AI Facial Recognition</p>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={busy}>×</button>
        </div>

        <div className="camera-frame">
          <video ref={videoRef} autoPlay playsInline muted onCanPlay={scheduleAutoCapture} />
          <div className="face-guide" />
        </div>

        <p className="camera-status">{status}</p>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          {!autoCapture && <button type="button" onClick={handleCapture} disabled={busy}>{busy ? "Processing..." : "Capture"}</button>}
        </div>
      </section>
    </div>
  );
}

function AuthPage({ onFaceLogin, onRegister, onMachineView, onAdmin, onDemoUser }) {
  const [faceOpen, setFaceOpen] = useState(false);
  const [message, setMessage] = useState("");

  async function handleLoginCapture(imageDataUrl) {
    setMessage("Checking face...");
    const data = await fetchJson("/api/face/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl }),
    });

    if (!data.matched || !data.profile) {
      throw new Error(data.error || "No matching face found.");
    }

    setFaceOpen(false);
    setMessage(`Welcome, ${data.profile.operator_name}.`);
    onFaceLogin(data.profile);
  }

  return (
    <main className="landing-page app-gradient">
      <section className="login-card glass-card">
        <div className="brand-mark">CT</div>
        <p className="eyebrow">Confirmation Test</p>
        <h1>Operator Confirmation</h1>
        <div className="login-actions">
          <button type="button" onClick={() => setFaceOpen(true)}>Login</button>
          <button className="secondary-button" type="button" onClick={onRegister}>Register</button>
          <button className="secondary-button" type="button" onClick={onMachineView}>View Machine</button>
          <button className="ghost-button" type="button" onClick={onDemoUser}>Login as User</button>
          <button className="ghost-button" type="button" onClick={onAdmin}>Admin</button>
        </div>

        {message && <p className="message center-message">{message}</p>}
      </section>

      {faceOpen && (
        <FaceCaptureModal
          title="Face Login"
          description="Center your face. The app will capture automatically."
          onClose={() => setFaceOpen(false)}
          onCapture={handleLoginCapture}
          autoCapture
        />
      )}
    </main>
  );
}

function RegisterPage({ onBack, onRegistered }) {
  const [form, setForm] = useState(emptyUserForm);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (!imageDataUrl) {
      setMessage("Capture the face first.");
      return;
    }

    try {
      setSaving(true);
      const data = await fetchJson("/api/face/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, roleName: "operator", imageDataUrl }),
      });
      setMessage(`Registered ${data.profile.operator_name}.`);
      onRegistered(data.profile);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="form-page app-gradient page-pad no-topbar-pad">
      <section className="form-layout single">
        <form className="input-form glass-card" onSubmit={handleSubmit}>
          <div className="form-title-row">
            <div>
              <p className="eyebrow">New Operator</p>
              <h1>Register Profile</h1>
            </div>
            <button className="ghost-button" type="button" onClick={onBack}>Back</button>
          </div>

          <div className="field-grid two">
            <label>
              {requiredLabel("Name")}
              <input value={form.operatorName} onChange={(event) => updateField("operatorName", event.target.value)} placeholder="Operator name" required />
            </label>
            <label>
              {requiredLabel("Site")}
              <select value={form.siteName} onChange={(event) => updateField("siteName", event.target.value)} required>
                {siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}
              </select>
            </label>
            <label>
              {requiredLabel("Shift")}
              <select value={form.shiftName} onChange={(event) => updateField("shiftName", event.target.value)} required>
                {shiftOptions.map((shift) => <option key={shift.value} value={shift.value}>{shift.label}</option>)}
              </select>
            </label>
            <label>
              Employee ID
              <input value={form.employeeId} onChange={(event) => updateField("employeeId", event.target.value)} placeholder="Optional" />
            </label>
            <label>
              Email
              <input value={form.email} onChange={(event) => updateField("email", event.target.value)} placeholder="Optional" />
            </label>
          </div>

          <label>
            Department
            <input value={form.department} onChange={(event) => updateField("department", event.target.value)} placeholder="Optional" />
          </label>

          <div className="face-capture-row">
            <div>
              <strong>Facial Recognition</strong>
            </div>
            <button className="secondary-button" type="button" onClick={() => setCameraOpen(true)}>
              {imageDataUrl ? "Retake Face" : "Capture Face"}
            </button>
          </div>

          <button type="submit" disabled={saving}>{saving ? "Registering..." : "Register"}</button>
          {message && <p className="message">{message}</p>}
        </form>
      </section>

      {cameraOpen && (
        <FaceCaptureModal
          title="Register Face"
          description="Capture a clear front-facing image."
          onClose={() => setCameraOpen(false)}
          onCapture={async (image) => {
            setImageDataUrl(image);
            setCameraOpen(false);
          }}
        />
      )}
    </main>
  );
}

function TopBar({ user, page, setPage, onLogout }) {
  const isAdmin = userRole(user) === "admin";

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="mini-logo">CT</div>
        <div>
          <strong>Confirmation Test</strong>
          <span>{userDisplayName(user)} • {userSite(user)} • {userRole(user)}</span>
        </div>
      </div>
      <nav>
        {isAdmin ? (
          <>
            <button className={page === "machine" ? "active" : ""} type="button" onClick={() => setPage("machine")}>View Machine</button>
            <button className={page === "adminRegister" ? "active" : ""} type="button" onClick={() => setPage("adminRegister")}>Register</button>
            <button className={page === "logs" ? "active" : ""} type="button" onClick={() => setPage("logs")}>Logs</button>
          </>
        ) : (
          <>
            <button className={page === "record" ? "active" : ""} type="button" onClick={() => setPage("record")}>Record Input</button>
            <button className={page === "machine" ? "active" : ""} type="button" onClick={() => setPage("machine")}>View Machine</button>
          </>
        )}
        <button type="button" onClick={onLogout}>Logout</button>
      </nav>
    </header>
  );
}

function RecordInputPage({ user }) {
  const [form, setForm] = useState(emptyRecord);
  const [shiftStatus, setShiftStatus] = useState(null);
  const [records, setRecords] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const assignedShift = user?.shift_name || shiftStatus?.currentShift || "1st Shift";
  const canEditSelectedShift = Boolean(shiftStatus?.currentShift) && shiftStatus.currentShift === assignedShift;

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function loadShiftStatus() {
    const data = await fetchJson("/api/shift-status");
    setShiftStatus(data);
  }

  async function loadMyRecords() {
    try {
      setLoading(true);
      const query = user?.id ? `?operator_id=${user.id}&limit=50` : "?limit=50";
      const data = await fetchJson(`/api/records${query}`);
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
      const data = await fetchJson("/api/records/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          shift_name: assignedShift,
          operator_id: user?.id || null,
          operator_name: userDisplayName(user),
          site_name: userSite(user),
        }),
      });
      setMessage(data.action === "updated" ? "Response updated for this machine." : "Response submitted.");
      await loadMyRecords();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadShiftStatus().catch((error) => setMessage(error.message));
    loadMyRecords();
  }, [user?.id]);

  return (
    <main className="form-page app-gradient page-pad">
      <section className="form-layout">
        <form className="input-form glass-card" onSubmit={handleSubmit}>
          <div className="form-title-row">
            <div>
              <p className="eyebrow">Record Input</p>
              <h1>Confirmation Response</h1>
            </div>
            <span className={canEditSelectedShift ? "shift-badge open" : "shift-badge closed"}>
              {canEditSelectedShift ? "Editable now" : "Locked"}
            </span>
          </div>

          <div className="operator-strip">
            <span>Name: <strong>{userDisplayName(user)}</strong></span>
            <span>Site: <strong>{userSite(user)}</strong></span>
            <span>Shift: <strong>{shiftDisplayName(assignedShift)}</strong></span>
            <span>Now: <strong>{shiftDisplayName(shiftStatus?.currentShift)}</strong></span>
          </div>

          <div className="field-grid two">
            <label>
              {requiredLabel("Machine Name")}
              <input value={form.machine_name} onChange={(event) => updateField("machine_name", event.target.value)} placeholder="Machine name" required />
            </label>
            <label>
              Reading Value
              <input type="number" step="any" value={form.reading_value} onChange={(event) => updateField("reading_value", event.target.value)} placeholder="0.00" />
            </label>
            <label>
              Product
              <input value={form.product} onChange={(event) => updateField("product", event.target.value)} placeholder="Product" />
            </label>
            <label>
              Batch Number
              <input value={form.batch_number} onChange={(event) => updateField("batch_number", event.target.value)} placeholder="Batch number" />
            </label>
          </div>


          <label>
            Remarks
            <textarea rows="4" value={form.remarks} onChange={(event) => updateField("remarks", event.target.value)} placeholder="Remarks" />
          </label>

          <button type="submit" disabled={saving || !canEditSelectedShift}>{saving ? "Saving..." : "Submit / Update Response"}</button>
          {message && <p className="message">{message}</p>}
        </form>

        <section className="side-card glass-card">
          <div className="records-header compact">
            <div>
              <p className="eyebrow">My Logs</p>
              <h2>Recent Responses</h2>
            </div>
            <button className="secondary-button" type="button" onClick={loadMyRecords} disabled={loading}>{loading ? "Loading..." : "Refresh"}</button>
          </div>
          <RecordList records={records} compact />
        </section>
      </section>
    </main>
  );
}

function RecordList({ records, compact = false }) {
  if (!records?.length) return <p className="empty-state">No submissions yet.</p>;

  return (
    <div className="table-wrap">
      <table className={compact ? "compact-table" : ""}>
        <thead>
          <tr>
            <th>When</th>
            <th>Operator</th>
            <th>Site</th>
            <th>Machine</th>
            <th>Reading</th>
            <th>Product</th>
            <th>Batch</th>
            <th>Shift</th>
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td>{formatDateTime(record.record_timestamp)}</td>
              <td>{record.operator_name}</td>
              <td>{record.site_name || "—"}</td>
              <td>{record.machine_name}</td>
              <td>{formatNumber(record.reading_value)}</td>
              <td>{record.product || "—"}</td>
              <td>{record.batch_number || "—"}</td>
              <td>{shiftDisplayName(record.shift_name)}</td>
              <td>{record.remarks || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminRegisterPage({ adminUser }) {
  const [userForm, setUserForm] = useState({ ...emptyUserForm, roleName: "operator" });
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function updateUserField(field, value) {
    setUserForm((current) => ({ ...current, [field]: value }));
  }

  async function loadUsers() {
    const usersData = await fetchJson("/api/admin/users");
    setUsers(usersData.users || []);
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    setMessage("");

    try {
      setSaving(true);
      const data = await fetchJson("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...userForm, imageDataUrl, registeredBy: userDisplayName(adminUser) }),
      });
      setMessage(`Saved ${data.profile.operator_name} as ${data.profile.role_name}.`);
      setUserForm({ ...emptyUserForm, roleName: "operator" });
      setImageDataUrl("");
      await loadUsers();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadUsers().catch((error) => setMessage(error.message));
  }, []);

  return (
    <main className="admin-page app-gradient page-pad">
      <section className="admin-grid register-grid">
        <form className="input-form glass-card" onSubmit={handleCreateUser}>
          <p className="eyebrow">Admin Register</p>
          <h1>Register Anyone</h1>
          <div className="field-grid two">
            <label>
              {requiredLabel("Name")}
              <input value={userForm.operatorName} onChange={(event) => updateUserField("operatorName", event.target.value)} placeholder="Person name" required />
            </label>
            <label>
              Role
              <select value={userForm.roleName} onChange={(event) => updateUserField("roleName", event.target.value)}>
                {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </label>
            <label>
              Site
              <select value={userForm.siteName} onChange={(event) => updateUserField("siteName", event.target.value)}>
                {siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}
              </select>
            </label>
            <label>
              {requiredLabel("Shift")}
              <select value={userForm.shiftName} onChange={(event) => updateUserField("shiftName", event.target.value)} required>
                {shiftOptions.map((shift) => <option key={shift.value} value={shift.value}>{shift.label}</option>)}
              </select>
            </label>
            <label>
              Employee ID
              <input value={userForm.employeeId} onChange={(event) => updateUserField("employeeId", event.target.value)} placeholder="Optional" />
            </label>
            <label>
              Department
              <input value={userForm.department} onChange={(event) => updateUserField("department", event.target.value)} placeholder="Optional" />
            </label>
            <label>
              Email
              <input value={userForm.email} onChange={(event) => updateUserField("email", event.target.value)} placeholder="Optional" />
            </label>
          </div>

          <div className="face-capture-row">
            <div>
              <strong>Face Login Link</strong>
            </div>
            <button className="secondary-button" type="button" onClick={() => setCameraOpen(true)}>{imageDataUrl ? "Retake" : "Capture"}</button>
          </div>

          <button type="submit" disabled={saving}>{saving ? "Saving..." : "Register"}</button>
          {message && <p className="message">{message}</p>}
        </form>

        <section className="glass-card dashboard-summary">
          <p className="eyebrow">Accounts</p>
          <h2>Registered People</h2>
          <div className="user-list compact-users">
            {users.map((user) => (
              <article key={user.id}>
                <strong>{user.operator_name}</strong>
                <span>{user.site_name} • {shiftDisplayName(user.shift_name)} • {user.role_name}</span>
                <small>{user.ai_face_key ? "Face linked" : "Manual account"}</small>
              </article>
            ))}
          </div>
        </section>
      </section>

      {cameraOpen && (
        <FaceCaptureModal
          title="Register Face"
          description="Capture this person's face for future login."
          onClose={() => setCameraOpen(false)}
          onCapture={async (image) => {
            setImageDataUrl(image);
            setCameraOpen(false);
          }}
        />
      )}
    </main>
  );
}

function LogsPage() {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadLogs() {
    try {
      setLoading(true);
      setMessage("");
      const [recordsData, summaryData] = await Promise.all([
        fetchJson("/api/records?limit=300"),
        fetchJson("/api/dashboard/summary"),
      ]);
      setRecords(recordsData.records || []);
      setSummary(summaryData.stats || null);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <main className="logs-page app-gradient page-pad">
      <section className="logs-shell">
        <aside className="logs-right">
          <article className="stat-card glass-card"><span>Total Submissions</span><strong>{summary?.total_submissions ?? 0}</strong></article>
          <article className="stat-card glass-card"><span>Operators</span><strong>{summary?.unique_operators ?? 0}</strong></article>
          <article className="stat-card glass-card"><span>Savoury</span><strong>{summary?.savoury_count ?? 0}</strong></article>
          <article className="stat-card glass-card"><span>Dressings</span><strong>{summary?.dressings_count ?? 0}</strong></article>
        </aside>

        <section className="logs-left glass-card">
          <div className="logs-hero-inline">
            <div>
              <p className="eyebrow">Logs</p>
              <h1>Submission Records</h1>
            </div>
            <button className="secondary-button" type="button" onClick={loadLogs} disabled={loading}>{loading ? "Loading..." : "Refresh"}</button>
          </div>

          {message && <p className="message">{message}</p>}
          <RecordList records={records} />
        </section>
      </section>
    </main>
  );
}

function MachineViewPage() {
  const [summary, setSummary] = useState(null);
  const [records, setRecords] = useState([]);
  const [message, setMessage] = useState("Loading dashboard feed...");

  async function loadDashboard() {
    try {
      const data = await fetchJson("/api/dashboard/summary");
      setSummary(data.stats || null);
      setRecords(data.latest || []);
      setMessage(data.latest?.length ? "Live database feed" : "No submissions yet");
    } catch (error) {
      setMessage(error.message);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const latest = records[0];

  return (
    <main className="machine-page app-gradient page-pad">
      <section className="machine-monitor">
        <aside className="asset-panel">
          <div className="asset-brand">Unilever</div>
          <dl>
            <div><dt>Asset Name</dt><dd>{latest?.machine_name || "Selo 3 Cooker 2"}</dd></div>
            <div><dt>Status</dt><dd className="status-ok">Live</dd></div>
            <div><dt>Latest Reading</dt><dd>{formatNumber(latest?.reading_value)}</dd></div>
            <div><dt>Product</dt><dd>{latest?.product || "—"}</dd></div>
            <div><dt>Batch</dt><dd>{latest?.batch_number || "—"}</dd></div>
            <div><dt>Operator</dt><dd>{latest?.operator_name || "—"}</dd></div>
            <div><dt>Last Update</dt><dd>{formatDateTime(latest?.record_timestamp)}</dd></div>
          </dl>
          <div className="asset-mini-stats" aria-label="Machine dashboard totals">
            <article><span>Average</span><strong>{formatNumber(summary?.avg_reading)}</strong></article>
            <article><span>Savoury</span><strong>{summary?.savoury_count ?? 0}</strong></article>
            <article><span>Dressings</span><strong>{summary?.dressings_count ?? 0}</strong></article>
          </div>
        </aside>

        <section className="process-view">
          <div className="monitor-head">
            <div>
              <p className="eyebrow">Machine Interface</p>
              <h1>{latest?.machine_name || "SELO-3 Cooker 2"}</h1>
            </div>
            <button className="monitor-refresh" type="button" onClick={loadDashboard}>Refresh</button>
          </div>

          <div className="machine-stage">
            <div className="machine-visual" aria-hidden="true">
              <div className="vessel" />
              <div className="motor" />
              <div className="legs left" />
              <div className="legs right" />
              <div className="pipe" />
            </div>

            <article className="callout callout-a">
              <span>Reading Value</span>
              <strong>{formatNumber(latest?.reading_value)}</strong>
              <small>{formatDateTime(latest?.record_timestamp)}</small>
            </article>
            <article className="callout callout-b">
              <span>Machine</span>
              <strong>{latest?.machine_name || "Waiting"}</strong>
              <small>{latest?.shift_name || "No shift yet"}</small>
            </article>
            <article className="callout callout-c">
              <span>Product / Batch</span>
              <strong>{latest?.product || "—"}</strong>
              <small>{latest?.batch_number || "—"}</small>
            </article>
            <article className="callout callout-d">
              <span>Site</span>
              <strong>{latest?.site_name || "—"}</strong>
              <small>{latest?.operator_name || "No operator"}</small>
            </article>
            <article className="callout callout-e">
              <span>Total Submissions</span>
              <strong>{summary?.total_submissions ?? 0}</strong>
              <small>Dashboard feed</small>
            </article>
          </div>
        </section>
      </section>

    </main>
  );
}

function App() {
  const [page, setPage] = useState("auth");
  const [user, setUser] = useState(null);

  function handleAdminSkip() {
    setUser({ id: null, operator_name: "Temporary Admin", site_name: "Admin", role_name: "admin" });
    setPage("machine");
  }

  function handleDemoUser() {
    setUser({ id: null, operator_name: "Temporary User", site_name: "Savoury", role_name: "operator", shift_name: "1st Shift" });
    setPage("record");
  }

  function handleLogout() {
    setUser(null);
    setPage("auth");
  }

  if (page === "auth") {
    return (
      <AuthPage
        onFaceLogin={(profile) => {
          setUser(profile);
          setPage(userRole(profile) === "admin" ? "machine" : "record");
        }}
        onRegister={() => setPage("register")}
        onMachineView={() => setPage("machine")}
        onAdmin={handleAdminSkip}
        onDemoUser={handleDemoUser}
      />
    );
  }

  if (page === "register") {
    return <RegisterPage onBack={() => setPage("auth")} onRegistered={(profile) => { setUser(profile); setPage("record"); }} />;
  }

  if (page === "machine" && !user) {
    return (
      <>
        <button className="floating-back" type="button" onClick={() => setPage("auth")}>Back</button>
        <MachineViewPage />
      </>
    );
  }

  return (
    <>
      <TopBar user={user} page={page} setPage={setPage} onLogout={handleLogout} />
      {page === "adminRegister" ? <AdminRegisterPage adminUser={user} /> : page === "logs" ? <LogsPage /> : page === "machine" ? <MachineViewPage /> : <RecordInputPage user={user} />}
    </>
  );
}

export default App;

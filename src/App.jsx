import { useEffect, useMemo, useRef, useState } from "react";

const siteOptions = ["Savoury", "Dressings"];
const roleOptions = ["operator", "admin"];
const shiftOptions = ["1st Shift", "2nd Shift", "3rd Shift"];

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

function FaceCaptureModal({ title = "Face Capture", description, onClose, onCapture }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState("Starting camera...");
  const [busy, setBusy] = useState(false);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
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
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStatus("Camera ready. Center your face and capture.");
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
      <section className="camera-modal clean-card">
        <div className="modal-header">
          <div>
            <p className="eyebrow">AI Facial Recognition</p>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={busy}>×</button>
        </div>

        <div className="camera-frame">
          <video ref={videoRef} autoPlay playsInline muted />
          <div className="face-guide" />
        </div>

        <p className="camera-status">{status}</p>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" onClick={handleCapture} disabled={busy}>{busy ? "Processing..." : "Capture"}</button>
        </div>
      </section>
    </div>
  );
}

function AuthPage({ onFaceLogin, onRegister, onMachineView, onAdmin }) {
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
    <main className="landing-page gradient-bg">
      <section className="login-shell clean-card">
        <div className="brand-circle">CT</div>
        <p className="eyebrow">Confirmation Test</p>
        <h1>Operator Confirmation</h1>
        <p className="login-subtitle">Clean input, face registration, and shift-based editable responses.</p>

        <div className="login-actions">
          <button type="button" onClick={() => setFaceOpen(true)}>Login</button>
          <button className="secondary-button" type="button" onClick={onRegister}>Register</button>
          <button className="secondary-button" type="button" onClick={onMachineView}>View Machine</button>
          <button className="ghost-button" type="button" onClick={onAdmin}>Admin</button>
        </div>

        {message && <p className="message center-message">{message}</p>}
      </section>

      {faceOpen && (
        <FaceCaptureModal
          title="Face Login"
          description="Capture your face to open the record input page."
          onClose={() => setFaceOpen(false)}
          onCapture={handleLoginCapture}
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
    <main className="form-page gradient-bg">
      <section className="form-layout single">
        <form className="input-form clean-card" onSubmit={handleSubmit}>
          <div className="form-title-row">
            <div>
              <p className="eyebrow">New Operator</p>
              <h1>Register Profile</h1>
              <p>Operator role is used by default. Admins can create admin accounts from the admin page.</p>
            </div>
            <button className="ghost-button" type="button" onClick={onBack}>Back</button>
          </div>

          <div className="field-grid two">
            <label>
              Name <span>*</span>
              <input value={form.operatorName} onChange={(event) => updateField("operatorName", event.target.value)} placeholder="Operator name" required />
            </label>
            <label>
              Site <span>*</span>
              <select value={form.siteName} onChange={(event) => updateField("siteName", event.target.value)} required>
                {siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}
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
              <p>{imageDataUrl ? "Face captured and ready to register." : "Capture the operator face before saving."}</p>
            </div>
            <button className="secondary-button" type="button" onClick={() => setCameraOpen(true)}>
              {imageDataUrl ? "Retake Face" : "Capture Face"}
            </button>
          </div>

          <button type="submit" disabled={saving}>{saving ? "Registering..." : "Register Operator"}</button>
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
      <div>
        <strong>Confirmation Test</strong>
        <span>{userDisplayName(user)} • {userSite(user)} • {userRole(user)}</span>
      </div>
      <nav>
        {isAdmin && <button className={page === "admin" ? "active" : ""} type="button" onClick={() => setPage("admin")}>Admin</button>}
        <button className={page === "record" ? "active" : ""} type="button" onClick={() => setPage("record")}>Record Input</button>
        <button className={page === "machine" ? "active" : ""} type="button" onClick={() => setPage("machine")}>View Machine</button>
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

  const canEditSelectedShift = shiftStatus?.currentShift === form.shift_name;

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function loadShiftStatus() {
    const data = await fetchJson("/api/shift-status");
    setShiftStatus(data);
    setForm((current) => ({ ...current, shift_name: current.shift_name || data.currentShift }));
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
          operator_id: user?.id || null,
          operator_name: userDisplayName(user),
          site_name: userSite(user),
        }),
      });
      setMessage(data.action === "updated" ? "Response updated for this shift." : "Response submitted for this shift.");
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
    <main className="form-page gradient-bg soft-page">
      <section className="form-layout">
        <form className="input-form clean-card" onSubmit={handleSubmit}>
          <div className="form-title-row">
            <div>
              <p className="eyebrow">Record Input</p>
              <h1>Confirmation Response</h1>
              <p>Submit once per shift. You can still edit while the selected shift is active.</p>
            </div>
            <span className={canEditSelectedShift ? "shift-badge open" : "shift-badge closed"}>
              {canEditSelectedShift ? "Editable now" : "Locked for now"}
            </span>
          </div>

          <div className="operator-strip">
            <span>Name: <strong>{userDisplayName(user)}</strong></span>
            <span>Site: <strong>{userSite(user)}</strong></span>
            <span>Current Shift: <strong>{shiftStatus?.currentShift || "—"}</strong></span>
          </div>

          <div className="field-grid two">
            <label>
              Machine Name <span>*</span>
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
            Shift <span>*</span>
            <select value={form.shift_name} onChange={(event) => updateField("shift_name", event.target.value)} required>
              {shiftOptions.map((shift) => <option key={shift} value={shift}>{shift}</option>)}
            </select>
          </label>

          <label>
            Remarks
            <textarea rows="4" value={form.remarks} onChange={(event) => updateField("remarks", event.target.value)} placeholder="Remarks" />
          </label>

          <button type="submit" disabled={saving || !canEditSelectedShift}>{saving ? "Saving..." : "Submit / Update Response"}</button>
          {!canEditSelectedShift && <p className="hint-text">Editing opens only during the selected shift: 6AM-2PM, 2PM-10PM, or 10PM-6AM.</p>}
          {message && <p className="message">{message}</p>}
        </form>

        <section className="side-card clean-card">
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
              <td>{record.shift_name}</td>
              <td>{record.remarks || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminPage({ adminUser }) {
  const [userForm, setUserForm] = useState({ ...emptyUserForm, roleName: "operator" });
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function updateUserField(field, value) {
    setUserForm((current) => ({ ...current, [field]: value }));
  }

  async function loadAdminData() {
    const [usersData, recordsData, summaryData] = await Promise.all([
      fetchJson("/api/admin/users"),
      fetchJson("/api/records?limit=200"),
      fetchJson("/api/dashboard/summary"),
    ]);
    setUsers(usersData.users || []);
    setRecords(recordsData.records || []);
    setSummary(summaryData.stats || null);
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
      await loadAdminData();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadAdminData().catch((error) => setMessage(error.message));
  }, []);

  return (
    <main className="admin-page gradient-bg soft-page">
      <section className="admin-grid">
        <form className="input-form clean-card" onSubmit={handleCreateUser}>
          <p className="eyebrow">Admin</p>
          <h1>Register Anyone</h1>
          <p>Add operators or admins. Face capture is optional for manual accounts, but needed for face login.</p>

          <div className="field-grid two">
            <label>
              Name <span>*</span>
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
              <p>{imageDataUrl ? "Face captured for this account." : "No face captured. Manual admin account only."}</p>
            </div>
            <button className="secondary-button" type="button" onClick={() => setCameraOpen(true)}>{imageDataUrl ? "Retake" : "Capture"}</button>
          </div>

          <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Person"}</button>
          {message && <p className="message">{message}</p>}
        </form>

        <section className="clean-card dashboard-summary">
          <p className="eyebrow">Dashboard Feed</p>
          <h2>Submission Summary</h2>
          <div className="summary-grid">
            <div><strong>{summary?.total_submissions ?? 0}</strong><span>Total</span></div>
            <div><strong>{summary?.unique_operators ?? 0}</strong><span>Operators</span></div>
            <div><strong>{summary?.savoury_count ?? 0}</strong><span>Savoury</span></div>
            <div><strong>{summary?.dressings_count ?? 0}</strong><span>Dressings</span></div>
          </div>
          <button className="secondary-button" type="button" onClick={loadAdminData}>Refresh Data</button>
        </section>
      </section>

      <section className="admin-section clean-card">
        <div className="records-header">
          <div>
            <p className="eyebrow">Logs</p>
            <h2>Who Submitted What</h2>
          </div>
        </div>
        <RecordList records={records} />
      </section>

      <section className="admin-section clean-card">
        <div className="records-header">
          <div>
            <p className="eyebrow">Accounts</p>
            <h2>Registered People</h2>
          </div>
        </div>
        <div className="user-list">
          {users.map((user) => (
            <article key={user.id}>
              <strong>{user.operator_name}</strong>
              <span>{user.site_name} • {user.role_name}</span>
              <small>{user.ai_face_key ? "Face linked" : "Manual account"}</small>
            </article>
          ))}
        </div>
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
    <main className="machine-page gradient-bg soft-page">
      <section className="machine-hero clean-card">
        <div>
          <p className="eyebrow">Machine View</p>
          <h1>Confirmation Dashboard</h1>
          <p>{message}</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadDashboard}>Refresh</button>
      </section>

      <section className="machine-grid">
        <article className="clean-card metric-card">
          <span>Latest Reading</span>
          <strong>{formatNumber(latest?.reading_value)}</strong>
          <p>{latest?.machine_name || "No machine yet"}</p>
        </article>
        <article className="clean-card metric-card">
          <span>Total Submissions</span>
          <strong>{summary?.total_submissions ?? 0}</strong>
          <p>All logs</p>
        </article>
        <article className="clean-card metric-card">
          <span>Average Reading</span>
          <strong>{formatNumber(summary?.avg_reading)}</strong>
          <p>From record inputs</p>
        </article>
      </section>

      <section className="admin-section clean-card">
        <div className="records-header">
          <div>
            <p className="eyebrow">Latest Logs</p>
            <h2>Data Sent to Dashboard</h2>
          </div>
        </div>
        <RecordList records={records} />
      </section>
    </main>
  );
}

function App() {
  const [page, setPage] = useState("auth");
  const [user, setUser] = useState(null);

  function handleAdminSkip() {
    setUser({ id: null, operator_name: "Temporary Admin", site_name: "Admin", role_name: "admin" });
    setPage("admin");
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
          setPage(userRole(profile) === "admin" ? "admin" : "record");
        }}
        onRegister={() => setPage("register")}
        onMachineView={() => setPage("machine")}
        onAdmin={handleAdminSkip}
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
      {page === "admin" ? <AdminPage adminUser={user} /> : page === "machine" ? <MachineViewPage /> : <RecordInputPage user={user} />}
    </>
  );
}

export default App;

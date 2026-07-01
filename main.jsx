import { useEffect, useMemo, useRef, useState } from "react";

const siteOptions = ["Savoury", "Dressings"];
const roleOptions = ["operator", "admin"];
const shiftOptions = [
  { value: "1st Shift", label: "1st Shift || 6:00 AM - 2:00 PM" },
  { value: "2nd Shift", label: "2nd Shift || 2:00 PM - 10:00 PM" },
  { value: "3rd Shift", label: "3rd Shift || 10:00 PM - 6:00 AM" },
];

const defaultMachineFields = [
  { id: "reading_value", label: "Reading Value", type: "number", required: true, mapsTo: "reading_value" },
  { id: "product", label: "Product", type: "text", required: false, mapsTo: "product" },
  { id: "batch_number", label: "Batch Number", type: "text", required: false, mapsTo: "batch_number" },
  { id: "remarks", label: "Remarks", type: "textarea", required: false, mapsTo: "remarks" },
];

const defaultCallouts = [
  { id: "co-reading", title: "Reading Value", valueKey: "reading_value", cardX: 23, cardY: 33, pointX: 43, pointY: 40 },
  { id: "co-machine", title: "Machine", valueKey: "machine_name", cardX: 67, cardY: 27, pointX: 62, pointY: 32 },
  { id: "co-site", title: "Site", valueKey: "site_name", cardX: 68, cardY: 72, pointX: 57, pointY: 65 },
  { id: "co-total", title: "Total Submissions", valueKey: "total_submissions", cardX: 82, cardY: 79, pointX: 77, pointY: 74 },
];

const emptyUserForm = {
  operatorName: "",
  siteName: "Savoury",
  shiftName: "1st Shift",
};

const emptyMachineForm = {
  id: null,
  machine_name: "",
  site_name: "Savoury",
  details: "",
  image_data_url: "",
  threshold_min: "",
  threshold_max: "",
  fields: [],
  callouts: [],
};

function uid(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function imageFileToCompactDataUrl(file, maxWidth = 1280, maxHeight = 820, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No image selected."));

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load image preview."));
      img.onload = () => {
        const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
        const width = Math.max(1, Math.round(img.width * ratio));
        const height = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

function requiredLabel(text) {
  return <span className="label-text">{text}<em>*</em></span>;
}

function shiftDisplayName(value) {
  return shiftOptions.find((shift) => shift.value === value)?.label || value || "—";
}

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
  if (!Number.isFinite(numberValue)) return String(value);
  return numberValue.toFixed(decimals);
}

function normalizeFields(fields) {
  if (!Array.isArray(fields) || !fields.length) return [];
  return fields.map((field, index) => ({
    id: field.id || uid(`field-${index}`),
    label: field.label || `Field ${index + 1}`,
    type: ["text", "number", "textarea"].includes(field.type) ? field.type : "text",
    required: Boolean(field.required),
    mapsTo: field.mapsTo || "custom",
  }));
}

function clampPercent(value, fallback = 50, min = 3, max = 97) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(min, Math.min(max, numberValue));
}

function getCalloutPoint(callout) {
  const oldX = callout?.x;
  const oldY = callout?.y;
  return {
    x: clampPercent(callout?.pointX ?? oldX, 50),
    y: clampPercent(callout?.pointY ?? oldY, 50, 6, 94),
  };
}

function getCalloutCard(callout) {
  const point = getCalloutPoint(callout);
  const fallbackX = point.x < 50 ? Math.max(8, point.x - 20) : Math.min(92, point.x + 20);
  const fallbackY = point.y;
  return {
    x: clampPercent(callout?.cardX, fallbackX, 5, 95),
    y: clampPercent(callout?.cardY, fallbackY, 8, 92),
  };
}

function normalizeCallouts(callouts) {
  const source = Array.isArray(callouts) && callouts.length ? callouts : [];
  return source.map((callout, index) => {
    const point = getCalloutPoint(callout);
    const card = getCalloutCard({ ...callout, pointX: point.x, pointY: point.y });
    return {
      id: callout.id || uid(`callout-${index}`),
      title: callout.title || `Callout ${index + 1}`,
      valueKey: callout.valueKey || "reading_value",
      pointX: point.x,
      pointY: point.y,
      cardX: card.x,
      cardY: card.y,
      // Backwards compatibility for older saved configs.
      x: point.x,
      y: point.y,
    };
  });
}

function calloutLine(callout) {
  const point = getCalloutPoint(callout);
  const card = getCalloutCard(callout);
  return { point, card };
}

function recordDateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function summarizeRecords(records = []) {
  const operatorSet = new Set();
  let savouryCount = 0;
  let dressingsCount = 0;
  for (const record of records) {
    if (record.operator_name) operatorSet.add(String(record.operator_name).trim().toLowerCase());
    const site = String(record.site_name || "").trim().toLowerCase();
    if (site === "savoury") savouryCount += 1;
    if (site === "dressings") dressingsCount += 1;
  }
  return {
    total_submissions: records.length,
    unique_operators: operatorSet.size,
    savoury_count: savouryCount,
    dressings_count: dressingsCount,
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

function getCameraHelp() {
  const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (window.isSecureContext || isLocalhost) return "";
  return "Camera needs HTTPS or localhost.";
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

function valueFromRecord(record, key, summary) {
  if (!record && key !== "total_submissions") return "—";
  if (key === "total_submissions") return summary?.total_submissions ?? 0;
  if (key === "machine_name") return record?.machine_name || "Waiting";
  if (key === "site_name") return record?.site_name || "—";
  if (key === "operator_name") return record?.operator_name || "No operator";
  if (key === "shift_name") return shiftDisplayName(record?.shift_name);
  if (key === "record_timestamp") return formatDateTime(record?.record_timestamp);
  if (key === "reading_value") return formatNumber(record?.reading_value);
  if (key === "product") return record?.product || "—";
  if (key === "batch_number") return record?.batch_number || "—";
  if (key === "remarks") return record?.remarks || "—";
  const extra = record?.response_fields || {};
  const value = extra[key];
  return value === undefined || value === null || value === "" ? "—" : String(value);
}

function FaceCaptureModal({ title = "Face Capture", description, onClose, onCapture, autoCapture = false, autoCaptureDelayMs = 900 }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const capturedRef = useRef(false);
  const [status, setStatus] = useState("Starting camera...");
  const [busy, setBusy] = useState(false);

  function stopCamera() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  function scheduleAutoCapture() {
    if (!autoCapture || capturedRef.current) return;
    capturedRef.current = true;
    setStatus("Camera ready. Auto capturing...");
    timerRef.current = setTimeout(() => handleCapture(), autoCaptureDelayMs);
  }

  async function startCamera() {
    const help = getCameraHelp();
    if (help) return setStatus(help);
    if (!navigator.mediaDevices?.getUserMedia) return setStatus("Camera is not available.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = scheduleAutoCapture;
      }
      setStatus(autoCapture ? "Camera ready. Auto capturing..." : "Camera ready.");
    } catch (error) {
      setStatus(error.name === "NotAllowedError" ? "Camera permission was blocked." : error.message || "Could not start camera.");
    }
  }

  function captureImage() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) throw new Error("Camera is not ready yet.");
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
      capturedRef.current = false;
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
    if (!data.matched || !data.profile) throw new Error(data.error || "No matching face found.");
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
        <p className="login-subtitle">Login, register, and monitor confirmation records in one clean app.</p>
        <div className="login-actions">
          <button type="button" onClick={() => setFaceOpen(true)}>Login</button>
          <button className="secondary-button" type="button" onClick={onRegister}>Register</button>
          <button className="secondary-button" type="button" onClick={onMachineView}>View Machine</button>
          <button className="secondary-button" type="button" onClick={onDemoUser}>Login as User</button>
          <button className="secondary-button" type="button" onClick={onAdmin}>Admin</button>
        </div>
        {message && <p className="message centered center-message">{message}</p>}
      </section>
      {faceOpen && <FaceCaptureModal title="Face Login" description="Hold steady. The app will capture automatically." onClose={() => setFaceOpen(false)} onCapture={handleLoginCapture} autoCapture />}
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
    if (!imageDataUrl) return setMessage("Capture the face first.");
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
    <main className="form-page app-gradient page-pad no-topbar-pad compact-mobile-page">
      <section className="form-layout single">
        <form className="input-form glass-card compact-form" onSubmit={handleSubmit}>
          <div className="form-title-row">
            <div>
              <p className="eyebrow">New Operator</p>
              <h1>Register Profile</h1>
            </div>
            <button className="ghost-button" type="button" onClick={onBack}>Back</button>
          </div>
          <div className="field-grid two only-basic-register">
            <label>{requiredLabel("Name")}<input value={form.operatorName} onChange={(event) => updateField("operatorName", event.target.value)} placeholder="Operator name" required /></label>
            <label>{requiredLabel("Site")}<select value={form.siteName} onChange={(event) => updateField("siteName", event.target.value)} required>{siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}</select></label>
            <label>{requiredLabel("Shift")}<select value={form.shiftName} onChange={(event) => updateField("shiftName", event.target.value)} required>{shiftOptions.map((shift) => <option key={shift.value} value={shift.value}>{shift.label}</option>)}</select></label>
          </div>
          <div className="face-capture-row compact-face-row">
            <strong>Facial Recognition</strong>
            <button className="secondary-button" type="button" onClick={() => setCameraOpen(true)}>{imageDataUrl ? "Retake Face" : "Capture Face"}</button>
          </div>
          <button type="submit" disabled={saving}>{saving ? "Registering..." : "Register"}</button>
          {message && <p className="message">{message}</p>}
        </form>
      </section>
      {cameraOpen && <FaceCaptureModal title="Register Face" description="Capture a clear front-facing image." onClose={() => setCameraOpen(false)} onCapture={async (image) => { setImageDataUrl(image); setCameraOpen(false); }} />}
    </main>
  );
}

function TopBar({ user, page, setPage, onLogout }) {
  const isAdmin = userRole(user) === "admin";
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="mini-logo">CT</div>
        <div><strong>Confirmation Test</strong><span>{userDisplayName(user)} • {userSite(user)} • {userRole(user)}{user?.shift_name ? ` • ${shiftDisplayName(user.shift_name)}` : ""}</span></div>
      </div>
      <nav>
        {isAdmin ? (
          <>
            <button className={page === "machine" ? "active" : ""} type="button" onClick={() => setPage("machine")}>View Machine</button>
            <button className={page === "system" ? "active" : ""} type="button" onClick={() => setPage("system")}>System</button>
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
  const [machines, setMachines] = useState([]);
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [values, setValues] = useState({});
  const [shiftStatus, setShiftStatus] = useState(null);
  const [records, setRecords] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const assignedShift = user?.shift_name || shiftStatus?.currentShift || "1st Shift";
  const canEditSelectedShift = Boolean(shiftStatus?.currentShift) && shiftStatus.currentShift === assignedShift;
  const selectedMachine = machines.find((machine) => String(machine.id) === String(selectedMachineId)) || machines[0];
  const fields = normalizeFields(selectedMachine?.fields);

  function updateValue(fieldId, value) {
    setValues((current) => ({ ...current, [fieldId]: value }));
  }

  async function loadShiftStatus() {
    const data = await fetchJson("/api/shift-status");
    setShiftStatus(data);
  }

  async function loadMachines() {
    const data = await fetchJson(`/api/machines?site=${encodeURIComponent(userSite(user))}`);
    const machineList = data.machines || [];
    setMachines(machineList);
    if (!selectedMachineId && machineList[0]) setSelectedMachineId(String(machineList[0].id));
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

  function extractStandardValues() {
    const output = { reading_value: "", product: "", batch_number: "", remarks: "" };
    for (const field of fields) {
      if (["reading_value", "product", "batch_number", "remarks"].includes(field.mapsTo)) output[field.mapsTo] = values[field.id] ?? "";
    }
    return output;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    if (!selectedMachine) return setMessage("No machine is configured yet. Ask admin to create one.");
    for (const field of fields) {
      if (field.required && !String(values[field.id] ?? "").trim()) return setMessage(`${field.label} is required.`);
    }
    try {
      setSaving(true);
      const standard = extractStandardValues();
      const data = await fetchJson("/api/records/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...standard,
          response_fields: values,
          machine_config_id: selectedMachine.id,
          machine_name: selectedMachine.machine_name,
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
    loadMachines().catch((error) => setMessage(error.message));
    loadMyRecords();
  }, [user?.id]);

  useEffect(() => {
    setValues({});
  }, [selectedMachineId]);

  return (
    <main className="form-page app-gradient page-pad record-page-mobile">
      <section className="form-layout">
        <form className="input-form glass-card" onSubmit={handleSubmit}>
          <div className="form-title-row">
            <div><p className="eyebrow">Record Input</p><h1>Confirmation Response</h1></div>
            <span className={canEditSelectedShift ? "shift-badge open" : "shift-badge closed"}>{canEditSelectedShift ? "Editable now" : "Locked"}</span>
          </div>
          <label>{requiredLabel("Machine")}<select value={selectedMachineId} onChange={(event) => setSelectedMachineId(event.target.value)} required>{!machines.length && <option value="">No machines configured</option>}{machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.machine_name}</option>)}</select></label>
          {selectedMachine?.details && <div className="machine-details-note">{selectedMachine.details}</div>}
          <div className="field-grid two dynamic-field-grid">
            {fields.map((field) => (
              <label key={field.id} className={field.type === "textarea" ? "wide-field" : ""}>
                {field.required ? requiredLabel(field.label) : field.label}
                {field.type === "textarea" ? (
                  <textarea rows="3" value={values[field.id] || ""} onChange={(event) => updateValue(field.id, event.target.value)} placeholder={field.label} required={field.required} />
                ) : (
                  <input type={field.type === "number" ? "number" : "text"} step="any" value={values[field.id] || ""} onChange={(event) => updateValue(field.id, event.target.value)} placeholder={field.label} required={field.required} />
                )}
              </label>
            ))}
          </div>
          <button type="submit" disabled={saving || !canEditSelectedShift || !selectedMachine}>{saving ? "Saving..." : "Submit / Update Response"}</button>
          {message && <p className="message">{message}</p>}
        </form>
        <section className="side-card glass-card">
          <div className="records-header compact"><div><p className="eyebrow">My Logs</p><h2>Recent Responses</h2></div><button className="secondary-button" type="button" onClick={loadMyRecords} disabled={loading}>{loading ? "Loading..." : "Refresh"}</button></div>
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
        <thead><tr><th>When</th><th>Operator</th><th>Site</th><th>Machine</th><th>Reading</th><th>Product</th><th>Batch</th><th>Shift</th><th>Remarks</th></tr></thead>
        <tbody>{records.map((record) => <tr key={record.id}><td data-label="When">{formatDateTime(record.record_timestamp)}</td><td data-label="Operator">{record.operator_name}</td><td data-label="Site">{record.site_name || "—"}</td><td data-label="Machine">{record.machine_name}</td><td data-label="Reading">{formatNumber(record.reading_value)}</td><td data-label="Product">{record.product || "—"}</td><td data-label="Batch">{record.batch_number || "—"}</td><td data-label="Shift">{shiftDisplayName(record.shift_name)}</td><td data-label="Remarks">{record.remarks || "—"}</td></tr>)}</tbody>
      </table>
      <div className="mobile-record-list">{records.map((record) => <article className="mobile-log-card" key={`mobile-${record.id}`}><div className="mobile-log-top"><strong>{record.machine_name}</strong><span>{formatNumber(record.reading_value)}</span></div><div className="mobile-log-grid"><span><b>When</b>{formatDateTime(record.record_timestamp)}</span><span><b>Operator</b>{record.operator_name || "—"}</span><span><b>Site</b>{record.site_name || "—"}</span><span><b>Shift</b>{shiftDisplayName(record.shift_name)}</span><span><b>Product</b>{record.product || "—"}</span><span><b>Batch</b>{record.batch_number || "—"}</span><span className="wide"><b>Remarks</b>{record.remarks || "—"}</span></div></article>)}</div>
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
  const [deletingId, setDeletingId] = useState(null);
  const [deleteMode, setDeleteMode] = useState(false);

  function updateUserField(field, value) { setUserForm((current) => ({ ...current, [field]: value })); }
  async function loadUsers() { const usersData = await fetchJson("/api/admin/users"); setUsers(usersData.users || []); }

  async function handleCreateUser(event) {
    event.preventDefault();
    setMessage("");
    try {
      setSaving(true);
      const data = await fetchJson("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...userForm, imageDataUrl, registeredBy: userDisplayName(adminUser) }) });
      setMessage(`Saved ${data.profile.operator_name} as ${data.profile.role_name}.`);
      setUserForm({ ...emptyUserForm, roleName: "operator" });
      setImageDataUrl("");
      await loadUsers();
    } catch (error) { setMessage(error.message); } finally { setSaving(false); }
  }

  async function handleDeleteUser(user) {
    if (!window.confirm(`Delete ${user?.operator_name || "this person"}? Old submissions stay in logs.`)) return;
    try { setDeletingId(user.id); setMessage(""); await fetchJson(`/api/admin/users/${user.id}`, { method: "DELETE" }); await loadUsers(); }
    catch (error) { setMessage(error.message); }
    finally { setDeletingId(null); }
  }

  useEffect(() => { loadUsers().catch((error) => setMessage(error.message)); }, []);

  return (
    <main className="admin-page app-gradient page-pad compact-mobile-page">
      <section className="admin-grid register-grid">
        <form className="input-form glass-card compact-form" onSubmit={handleCreateUser}>
          <p className="eyebrow">Admin Register</p><h1>Register Anyone</h1>
          <div className="field-grid two only-basic-register">
            <label>{requiredLabel("Name")}<input value={userForm.operatorName} onChange={(event) => updateUserField("operatorName", event.target.value)} placeholder="Person name" required /></label>
            <label>{requiredLabel("Role")}<select value={userForm.roleName} onChange={(event) => updateUserField("roleName", event.target.value)}>{roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
            <label>{requiredLabel("Site")}<select value={userForm.siteName} onChange={(event) => updateUserField("siteName", event.target.value)}>{siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}</select></label>
            <label>{requiredLabel("Shift")}<select value={userForm.shiftName} onChange={(event) => updateUserField("shiftName", event.target.value)} required>{shiftOptions.map((shift) => <option key={shift.value} value={shift.value}>{shift.label}</option>)}</select></label>
          </div>
          <div className="face-capture-row compact-face-row"><strong>Face Login Link</strong><button className="secondary-button" type="button" onClick={() => setCameraOpen(true)}>{imageDataUrl ? "Retake" : "Capture"}</button></div>
          <button type="submit" disabled={saving}>{saving ? "Saving..." : "Register"}</button>{message && <p className="message">{message}</p>}
        </form>
        <section className="glass-card dashboard-summary">
          <p className="eyebrow">Accounts</p><div className="registered-header-row"><h2>Registered People</h2><button className={deleteMode ? "delete-user-button active-delete" : "delete-user-button"} type="button" onClick={() => setDeleteMode((current) => !current)}>{deleteMode ? "Done" : "Delete"}</button></div>
          <div className={deleteMode ? "user-list compact-users delete-mode" : "user-list compact-users"}>{!users.length && <p className="empty-state">No registered people yet.</p>}{users.map((user) => <article key={user.id} className={deleteMode ? "registered-person-row can-delete" : "registered-person-row"} onClick={() => deleteMode && deletingId !== user.id ? handleDeleteUser(user) : undefined} role={deleteMode ? "button" : undefined} tabIndex={deleteMode ? 0 : undefined}><div><strong>{user.operator_name}</strong><span>{user.site_name} • {shiftDisplayName(user.shift_name)} • {user.role_name}</span><small>{deletingId === user.id ? "Deleting..." : user.ai_face_key ? "Face linked" : "Manual account"}</small></div></article>)}</div>
        </section>
      </section>
      {cameraOpen && <FaceCaptureModal title="Register Face" description="Capture this person's face for future login." onClose={() => setCameraOpen(false)} onCapture={async (image) => { setImageDataUrl(image); setCameraOpen(false); }} />}
    </main>
  );
}

function AdminSystemPage() {
  const [machines, setMachines] = useState([]);
  const [form, setForm] = useState(emptyMachineForm);
  const [selectedCalloutId, setSelectedCalloutId] = useState(defaultCallouts[0].id);
  const [markMode, setMarkMode] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setForm({ ...emptyMachineForm, fields: [], callouts: [] });
    setSelectedCalloutId("");
    setMarkMode(null);
    setMessage("New setup ready. Add fields and callouts, then save.");
  }

  function updateForm(field, value) { setForm((current) => ({ ...current, [field]: value })); }
  function updateField(index, key, value) { setForm((current) => ({ ...current, fields: current.fields.map((field, i) => i === index ? { ...field, [key]: value } : field) })); }
  function updateCallout(index, key, value) { setForm((current) => ({ ...current, callouts: current.callouts.map((callout, i) => i === index ? { ...callout, [key]: value } : callout) })); }

  async function loadMachines(selectFirst = false) {
    const data = await fetchJson("/api/admin/machines");
    const machineList = data.machines || [];
    setMachines(machineList);
    if (selectFirst && machineList[0]) editMachine(machineList[0]);
    if (selectFirst && !machineList.length) resetForm();
    return machineList;
  }

  function editMachine(machine) {
    const next = { ...emptyMachineForm, ...machine, fields: normalizeFields(machine.fields), callouts: normalizeCallouts(machine.callouts), threshold_min: machine.threshold_min ?? "", threshold_max: machine.threshold_max ?? "" };
    setForm(next);
    setSelectedCalloutId(next.callouts[0]?.id || "");
    setMarkMode(null);
  }

  async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setMessage("Preparing image...");
      const compactImage = await imageFileToCompactDataUrl(file);
      updateForm("image_data_url", compactImage);
      setMessage("Image ready. Save the machine setup to store it in the database.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  function beginMarking(calloutId, mode) {
    const callout = form.callouts.find((item) => item.id === calloutId);
    setSelectedCalloutId(calloutId);
    setMarkMode(mode);
    setMessage(mode === "card" ? `Click the preview where the ${callout?.title || "callout"} box should sit.` : `Click the exact machine part that ${callout?.title || "this callout"} should point to.`);
  }

  function handlePreviewClick(event) {
    if (!selectedCalloutId || !markMode) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(3, Math.min(97, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(6, Math.min(94, ((event.clientY - rect.top) / rect.height) * 100));
    const roundedX = Math.round(x);
    const roundedY = Math.round(y);
    const selectedName = form.callouts.find((callout) => callout.id === selectedCalloutId)?.title || "callout";
    setForm((current) => ({
      ...current,
      callouts: current.callouts.map((callout) => {
        if (callout.id !== selectedCalloutId) return callout;
        if (markMode === "card") return { ...callout, cardX: roundedX, cardY: roundedY };
        return { ...callout, pointX: roundedX, pointY: roundedY, x: roundedX, y: roundedY };
      }),
    }));
    setMarkMode(null);
    setMessage(`${markMode === "card" ? "Card location" : "Machine point"} marked for ${selectedName}. Save the machine setup to store it.`);
  }

  async function handleSave(event) {
    event.preventDefault();
    setMessage("");
    if (!form.machine_name.trim()) return setMessage("Machine name is required.");
    try {
      setSaving(true);
      const data = await fetchJson("/api/admin/machines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (data.machine) editMachine(data.machine);
      setMessage("Machine setup saved.");
      await loadMachines();
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(machine) {
    if (!machine?.id) return;
    if (!window.confirm(`Delete ${machine.machine_name}?`)) return;
    try {
      await fetchJson(`/api/admin/machines/${machine.id}`, { method: "DELETE" });
      const machineList = await loadMachines();
      if (machineList[0]) editMachine(machineList[0]);
      else resetForm();
    }
    catch (error) { setMessage(error.message); }
  }

  function handleMachineSelect(value) {
    if (!value) return resetForm();
    const machine = machines.find((item) => String(item.id) === String(value));
    if (machine) editMachine(machine);
  }

  useEffect(() => { loadMachines(true).catch((error) => setMessage(error.message)); }, []);

  return (
    <main className="admin-page app-gradient page-pad system-page">
      <section className="system-grid">
        <form className="input-form glass-card machine-builder" onSubmit={handleSave}>
          <div className="form-title-row"><div><p className="eyebrow">Admin System</p><h1>Machine Builder</h1></div><button className={!form.id ? "new-machine-button active" : "new-machine-button"} type="button" onClick={resetForm}>+ New Setup</button></div>
          <div className="field-grid two">
            <label>{requiredLabel("Machine Name")}<input value={form.machine_name} onChange={(event) => updateForm("machine_name", event.target.value)} placeholder="Example: SELO-3 Cooker 2" required /></label>
            <label>{requiredLabel("Site")}<select value={form.site_name} onChange={(event) => updateForm("site_name", event.target.value)} required>{siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}</select></label>
            <label>Threshold Min<input type="number" step="any" value={form.threshold_min} onChange={(event) => updateForm("threshold_min", event.target.value)} placeholder="Optional" /></label>
            <label>Threshold Max<input type="number" step="any" value={form.threshold_max} onChange={(event) => updateForm("threshold_max", event.target.value)} placeholder="Optional" /></label>
          </div>
          <label>Details<textarea rows="3" value={form.details} onChange={(event) => updateForm("details", event.target.value)} placeholder="Machine details, inspection note, or process description" /></label>
          <label>Machine Image<input type="file" accept="image/*" onChange={handleImageUpload} /></label>

          <div className="builder-block"><div className="block-head"><h2>Input Fields</h2><button className="secondary-button small" type="button" onClick={() => updateForm("fields", [...form.fields, { id: uid("field"), label: "New Field", type: "text", required: false, mapsTo: "custom" }])}>Add Field</button></div>{!form.fields.length && <p className="builder-empty-note">No fields yet. Add the fields operators must fill in.</p>}{form.fields.map((field, index) => <div className="builder-row" key={field.id}><input value={field.label} onChange={(event) => updateField(index, "label", event.target.value)} placeholder="Label" /><select value={field.type} onChange={(event) => updateField(index, "type", event.target.value)}><option value="text">Text</option><option value="number">Number</option><option value="textarea">Paragraph</option></select><select value={field.mapsTo} onChange={(event) => updateField(index, "mapsTo", event.target.value)}><option value="custom">Custom</option><option value="reading_value">Reading</option><option value="product">Product</option><option value="batch_number">Batch</option><option value="remarks">Remarks</option></select><label className="mini-check"><input type="checkbox" checked={field.required} onChange={(event) => updateField(index, "required", event.target.checked)} /> Required</label><button className="ghost-button danger" type="button" onClick={() => updateForm("fields", form.fields.filter((_, i) => i !== index))}>×</button></div>)}</div>

          <div className="builder-block callout-builder-block">
            <div className="block-head">
              <h2>Callouts</h2>
              <button className="secondary-button small" type="button" onClick={() => { const next = { id: uid("callout"), title: "New Callout", valueKey: "reading_value", cardX: 30, cardY: 30, pointX: 50, pointY: 50, x: 50, y: 50 }; updateForm("callouts", [...form.callouts, next]); setSelectedCalloutId(next.id); setMarkMode("card"); }}>Add Callout</button>
            </div>
            <div className="callout-help-card">
              <strong>Pointing system:</strong> choose a callout, place its card, then mark the exact machine part. The line will point from the card to the machine.
            </div>
            {!form.callouts.length && <p className="builder-empty-note">No callouts yet. Add a callout, then set its card and point.</p>}
            {form.callouts.map((callout, index) => (
              <div className={selectedCalloutId === callout.id ? "builder-row selected callout-builder-row" : "builder-row callout-builder-row"} key={callout.id}>
                <input value={callout.title} onChange={(event) => updateCallout(index, "title", event.target.value)} placeholder="Title" />
                <select value={callout.valueKey} onChange={(event) => updateCallout(index, "valueKey", event.target.value)}>
                  <option value="reading_value">Reading</option>
                  <option value="machine_name">Machine</option>
                  <option value="site_name">Site</option>
                  <option value="operator_name">Operator</option>
                  <option value="shift_name">Shift</option>
                  <option value="total_submissions">Total</option>
                  {form.fields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
                </select>
                <span className="point-status-chip">{selectedCalloutId === callout.id ? (markMode === "card" ? "Pick card spot" : markMode === "point" ? "Pick machine point" : "Selected") : "Mapped"}</span>
                <button className={selectedCalloutId === callout.id && markMode === "card" ? "secondary-button small active-mark" : "secondary-button small"} type="button" onClick={() => beginMarking(callout.id, "card")}>Card</button>
                <button className={selectedCalloutId === callout.id && markMode === "point" ? "secondary-button small active-mark" : "secondary-button small"} type="button" onClick={() => beginMarking(callout.id, "point")}>Point</button>
                <button className="ghost-button danger" type="button" onClick={() => { updateForm("callouts", form.callouts.filter((_, i) => i !== index)); if (selectedCalloutId === callout.id) setMarkMode(null); }}>×</button>
              </div>
            ))}
          </div>
          <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Machine Setup"}</button>{message && <p className="message">{message}</p>}
        </form>
        <section className="glass-card builder-preview-card">
          <div className="form-title-row preview-title-row">
            <div><p className="eyebrow">Preview</p><h2>Point Map</h2></div>
            <div className="preview-toolbar machine-picker-toolbar">
              <select className="preview-machine-select" value={form.id || ""} onChange={(event) => handleMachineSelect(event.target.value)} aria-label="Select saved machine">
                <option value="" disabled>{machines.length ? "Select machine" : "No machines yet"}</option>
                {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.machine_name}</option>)}
              </select>
              <button className="preview-delete-button" type="button" disabled={!form.id} onClick={() => handleDelete(form)}>Delete</button>
            </div>
          </div>
          <div className={markMode ? "builder-preview locating" : "builder-preview"} onClick={handlePreviewClick}>
            {form.image_data_url ? <img src={form.image_data_url} alt="Machine preview" /> : <div className="machine-visual preview-machine"><div className="vessel" /><div className="motor" /><div className="legs left" /><div className="legs right" /><div className="pipe" /></div>}
            {markMode && <div className="preview-crosshair-hint">{markMode === "card" ? "Click card location" : "Click machine point"}</div>}
            <svg className="callout-line-layer builder-line-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {form.callouts.map((callout) => {
                const { point, card } = calloutLine(callout);
                return <line key={`line-${callout.id}`} x1={card.x} y1={card.y} x2={point.x} y2={point.y} />;
              })}
            </svg>
            {form.callouts.map((callout) => {
              const { point, card } = calloutLine(callout);
              const active = selectedCalloutId === callout.id;
              return (
                <div key={callout.id}>
                  <button
                    type="button"
                    className={active && markMode === "point" ? "preview-target-dot active" : "preview-target-dot"}
                    style={{ left: `${point.x}%`, top: `${point.y}%` }}
                    onClick={(event) => { event.stopPropagation(); beginMarking(callout.id, "point"); }}
                    title="Click, then mark the exact machine point"
                  />
                  <button
                    type="button"
                    className={active ? "preview-callout-card active" : "preview-callout-card"}
                    style={{ left: `${card.x}%`, top: `${card.y}%` }}
                    onClick={(event) => { event.stopPropagation(); beginMarking(callout.id, "card"); }}
                    title="Click, then place the callout card"
                  >
                    {callout.title}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}

function LogsPage() {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ search: "", site: "", shift: "", date: "" });
  function updateFilter(field, value) { setFilters((current) => ({ ...current, [field]: value })); }
  function clearFilters() { setFilters({ search: "", site: "", shift: "", date: "" }); }
  async function loadLogs() { try { setLoading(true); setMessage(""); const [recordsData, summaryData] = await Promise.all([fetchJson("/api/records?limit=300"), fetchJson("/api/dashboard/summary")]); setRecords(recordsData.records || []); setSummary(summaryData.stats || null); } catch (error) { setMessage(error.message); } finally { setLoading(false); } }
  const filteredRecords = useMemo(() => { const search = filters.search.trim().toLowerCase(); return records.filter((record) => { const siteMatch = !filters.site || record.site_name === filters.site; const shiftMatch = !filters.shift || record.shift_name === filters.shift; const dateMatch = !filters.date || recordDateKey(record.record_timestamp) === filters.date; const haystack = [record.operator_name, record.site_name, record.machine_name, record.reading_value, record.product, record.batch_number, record.shift_name, record.remarks, JSON.stringify(record.response_fields || {})].join(" ").toLowerCase(); return siteMatch && shiftMatch && dateMatch && (!search || haystack.includes(search)); }); }, [records, filters]);
  const filteredSummary = useMemo(() => summarizeRecords(filteredRecords), [filteredRecords]);
  const hasFilters = Object.values(filters).some(Boolean);
  useEffect(() => { loadLogs(); }, []);
  return <main className="logs-page app-gradient page-pad"><section className="logs-shell"><aside className="logs-right"><article className="stat-card glass-card"><span>Total</span><strong>{hasFilters ? filteredSummary.total_submissions : summary?.total_submissions ?? 0}</strong></article><article className="stat-card glass-card"><span>Operators</span><strong>{hasFilters ? filteredSummary.unique_operators : summary?.unique_operators ?? 0}</strong></article><article className="stat-card glass-card"><span>Savoury</span><strong>{hasFilters ? filteredSummary.savoury_count : summary?.savoury_count ?? 0}</strong></article><article className="stat-card glass-card"><span>Dressings</span><strong>{hasFilters ? filteredSummary.dressings_count : summary?.dressings_count ?? 0}</strong></article></aside><section className="logs-left glass-card"><div className="logs-hero-inline"><div><p className="eyebrow">Logs</p><h1>Submission Records</h1></div><button className="secondary-button" type="button" onClick={loadLogs} disabled={loading}>{loading ? "Loading..." : "Refresh"}</button></div><div className="logs-filter-bar"><input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Search logs" /><select value={filters.site} onChange={(event) => updateFilter("site", event.target.value)}><option value="">All Sites</option>{siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}</select><select value={filters.shift} onChange={(event) => updateFilter("shift", event.target.value)}><option value="">All Shifts</option>{shiftOptions.map((shift) => <option key={shift.value} value={shift.value}>{shift.label}</option>)}</select><input type="date" value={filters.date} onChange={(event) => updateFilter("date", event.target.value)} /><button className="ghost-button" type="button" onClick={clearFilters} disabled={!hasFilters}>Clear</button></div>{message && <p className="message">{message}</p>}<RecordList records={filteredRecords} /></section></section></main>;
}

function MachineViewPage() {
  const [summary, setSummary] = useState(null);
  const [records, setRecords] = useState([]);
  const [machines, setMachines] = useState([]);
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [message, setMessage] = useState("Loading dashboard feed...");
  const [loading, setLoading] = useState(false);

  async function loadMachines() {
    const machineData = await fetchJson("/api/machines");
    const machineList = machineData.machines || [];
    setMachines(machineList);
    if (!selectedMachineId && machineList[0]) setSelectedMachineId(String(machineList[0].id));
    if (!machineList.length) setMessage("No machines configured yet");
    return machineList;
  }

  async function loadDashboard(machineId = selectedMachineId) {
    try {
      setLoading(true);
      const query = machineId ? `?machine_config_id=${encodeURIComponent(machineId)}` : "";
      const data = await fetchJson(`/api/dashboard/summary${query}`);
      setSummary(data.stats || null);
      setRecords(data.latest || []);
      setMessage(data.latest?.length ? "Live database feed" : "No data for this machine yet");
    } catch (error) {
      setMessage(error.message);
      setRecords([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMachines().catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (selectedMachineId) loadDashboard(selectedMachineId);
  }, [selectedMachineId]);

  const selectedMachine = machines.find((machine) => String(machine.id) === String(selectedMachineId)) || machines[0];
  const latest = records[0] || null;
  const displayRecord = latest || {
    machine_name: selectedMachine?.machine_name || "No Machine",
    site_name: selectedMachine?.site_name || "—",
    operator_name: "No operator",
  };
  const callouts = normalizeCallouts(selectedMachine?.callouts);
  const hasReading = latest?.reading_value !== null && latest?.reading_value !== undefined && latest?.reading_value !== "";
  const isLow = hasReading && selectedMachine?.threshold_min !== null && selectedMachine?.threshold_min !== undefined && Number(latest?.reading_value) < Number(selectedMachine.threshold_min);
  const isHigh = hasReading && selectedMachine?.threshold_max !== null && selectedMachine?.threshold_max !== undefined && Number(latest?.reading_value) > Number(selectedMachine.threshold_max);
  const statusText = !latest ? "No Data" : isLow ? "Below Threshold" : isHigh ? "Above Threshold" : "Live";

  const leftStatusClass = isLow || isHigh ? "status-warn" : latest ? "status-ok" : "";
  const latestRows = [
    ["Status", statusText, leftStatusClass],
    ["Reading", formatNumber(latest?.reading_value), ""],
    ["Product", latest?.product || "—", ""],
    ["Batch", latest?.batch_number || "—", ""],
    ["Operator", latest?.operator_name || "—", ""],
    ["Updated", formatDateTime(latest?.record_timestamp), ""],
  ];

  return (
    <main className="machine-page app-gradient page-pad">
      <section className="machine-monitor scalable-monitor light-monitor">
        <aside className="asset-panel asset-panel-light">
          <div className="asset-brand light-brand">CT</div>
          <div className="asset-title-block">
            <span className="eyebrow">Selected Machine</span>
            <strong>{selectedMachine?.machine_name || "No Machine"}</strong>
            {selectedMachine?.site_name && <small>{selectedMachine.site_name}</small>}
          </div>
          <dl className="asset-compact-list">
            {latestRows.map(([label, value, className]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className={className}>{value}</dd>
              </div>
            ))}
          </dl>
        </aside>
        <section className="process-view process-view-light">
          <div className="monitor-head monitor-head-light">
            <div>
              <p className="eyebrow">Machine Interface</p>
              <h1 title={selectedMachine?.machine_name || "Machine Monitor"}>{selectedMachine?.machine_name || "Machine Monitor"}</h1>
              {selectedMachine?.details && <p className="machine-view-details">{selectedMachine.details}</p>}
            </div>
            <div className="monitor-actions monitor-actions-light">
              <select value={selectedMachineId} onChange={(event) => setSelectedMachineId(event.target.value)} disabled={!machines.length}>
                {!machines.length && <option value="">No machines</option>}
                {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.machine_name}</option>)}
              </select>
              <button className="monitor-refresh" type="button" onClick={() => loadDashboard(selectedMachineId)} disabled={loading || !selectedMachineId}>{loading ? "Loading" : "Refresh"}</button>
            </div>
          </div>
          <div className="machine-stage dynamic-stage anchored-stage">
            <div className="machine-image-frame">
              {selectedMachine?.image_data_url ? <img className="machine-custom-image" src={selectedMachine.image_data_url} alt={selectedMachine.machine_name} /> : <div className="machine-visual" aria-hidden="true"><div className="vessel" /><div className="motor" /><div className="legs left" /><div className="legs right" /><div className="pipe" /></div>}
              <svg className="callout-line-layer machine-line-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {callouts.map((callout) => {
                  const { point, card } = calloutLine(callout);
                  return <line key={`machine-line-${callout.id}`} x1={card.x} y1={card.y} x2={point.x} y2={point.y} />;
                })}
              </svg>
              {callouts.map((callout) => {
                const { point, card } = calloutLine(callout);
                return (
                  <div key={callout.id}>
                    <span className="machine-anchor-dot free-anchor-dot" style={{ left: `${point.x}%`, top: `${point.y}%` }} />
                    <article className="callout dynamic-callout machine-free-callout" style={{ left: `${card.x}%`, top: `${card.y}%` }}>
                      <span>{callout.title}</span>
                      <strong>{valueFromRecord(displayRecord, callout.valueKey, summary)}</strong>
                      <small>{message}</small>
                    </article>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function App() {
  const [page, setPage] = useState("auth");
  const [user, setUser] = useState(null);
  function handleAdminSkip() { setUser({ id: null, operator_name: "Temporary Admin", site_name: "Admin", role_name: "admin" }); setPage("machine"); }
  function handleDemoUser() { setUser({ id: null, operator_name: "Temporary User", site_name: "Savoury", role_name: "operator", shift_name: "1st Shift" }); setPage("record"); }
  function handleLogout() { setUser(null); setPage("auth"); }
  if (page === "auth") return <AuthPage onFaceLogin={(profile) => { setUser(profile); setPage(userRole(profile) === "admin" ? "machine" : "record"); }} onRegister={() => setPage("register")} onMachineView={() => setPage("machine")} onAdmin={handleAdminSkip} onDemoUser={handleDemoUser} />;
  if (page === "register") return <RegisterPage onBack={() => setPage("auth")} onRegistered={(profile) => { setUser(profile); setPage("record"); }} />;
  if (page === "machine" && !user) return <><button className="floating-back" type="button" onClick={() => setPage("auth")}>Back</button><MachineViewPage /></>;
  return <><TopBar user={user} page={page} setPage={setPage} onLogout={handleLogout} />{page === "system" ? <AdminSystemPage /> : page === "adminRegister" ? <AdminRegisterPage adminUser={user} /> : page === "logs" ? <LogsPage /> : page === "machine" ? <MachineViewPage /> : <RecordInputPage user={user} />}</>;
}

export default App;

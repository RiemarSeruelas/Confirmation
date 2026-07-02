import { useEffect, useMemo, useRef, useState } from "react";

const siteOptions = ["Savoury", "Dressings"];
const roleOptions = ["operator", "admin"];
const shiftOptions = [
  { value: "1st Shift", label: "1st Shift || 6:00 AM - 2:00 PM" },
  { value: "2nd Shift", label: "2nd Shift || 2:00 PM - 10:00 PM" },
  { value: "3rd Shift", label: "3rd Shift || 10:00 PM - 6:00 AM" },
];

const defaultMachineFields = [
  { id: "reading_value", label: "Reading Value", type: "number", required: true, mapsTo: "reading_value", thresholdEnabled: false, threshold_min: "", threshold_max: "" },
  { id: "product", label: "Product", type: "text", required: false, mapsTo: "product", thresholdEnabled: false, threshold_min: "", threshold_max: "" },
  { id: "batch_number", label: "Batch Number", type: "text", required: false, mapsTo: "batch_number", thresholdEnabled: false, threshold_min: "", threshold_max: "" },
  { id: "remarks", label: "Remarks", type: "textarea", required: false, mapsTo: "remarks", thresholdEnabled: false, threshold_min: "", threshold_max: "" },
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
};

const emptyMachineForm = {
  id: null,
  machine_name: "",
  site_name: "Savoury",
  details: "",
  image_data_url: "",
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
    thresholdEnabled: Boolean(field.thresholdEnabled || field.threshold_enabled),
    threshold_min: field.threshold_min ?? field.thresholdMin ?? "",
    threshold_max: field.threshold_max ?? field.thresholdMax ?? "",
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

function getMachineReadingThresholds(machine) {
  if (!machine) return { thresholdMin: null, thresholdMax: null };
  const fields = normalizeFields(machine.fields);
  const readingField =
    fields.find((field) => field.mapsTo === "reading_value") ||
    fields.find((field) => field.id === "reading_value") ||
    fields.find((field) => field.type === "number" && field.thresholdEnabled);
  const fieldLimitsEnabled = readingField?.thresholdEnabled && readingField?.type === "number";
  const minSource = fieldLimitsEnabled ? readingField.threshold_min : machine.threshold_min;
  const maxSource = fieldLimitsEnabled ? readingField.threshold_max : machine.threshold_max;
  const min = minSource === "" || minSource === null || minSource === undefined ? null : Number(minSource);
  const max = maxSource === "" || maxSource === null || maxSource === undefined ? null : Number(maxSource);
  return {
    thresholdMin: Number.isFinite(min) ? min : null,
    thresholdMax: Number.isFinite(max) ? max : null,
  };
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
          <button className="secondary-button" type="button" onClick={onMachineView}>Machines</button>
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
        <div><strong>Confirmation Test</strong><span>{userDisplayName(user)} • {userSite(user)} • {userRole(user)}</span></div>
      </div>
      <nav>
        {isAdmin ? (
          <>
            <button className={page === "machine" ? "active" : ""} type="button" onClick={() => setPage("machine")}>Machines</button>
            <button className={page === "trends" ? "active" : ""} type="button" onClick={() => setPage("trends")}>Trends</button>
            <button className={page === "system" ? "active" : ""} type="button" onClick={() => setPage("system")}>System</button>
            <button className={page === "adminRegister" ? "active" : ""} type="button" onClick={() => setPage("adminRegister")}>Register</button>
            <button className={page === "logs" ? "active" : ""} type="button" onClick={() => setPage("logs")}>Logs</button>
          </>
        ) : (
          <>
            <button className={page === "record" ? "active" : ""} type="button" onClick={() => setPage("record")}>Record Input</button>
            <button className={page === "machine" ? "active" : ""} type="button" onClick={() => setPage("machine")}>Machines</button>
            <button className={page === "trends" ? "active" : ""} type="button" onClick={() => setPage("trends")}>Trends</button>
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
  const [records, setRecords] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const selectedMachine = machines.find((machine) => String(machine.id) === String(selectedMachineId)) || machines[0];
  const fields = normalizeFields(selectedMachine?.fields);

  function updateValue(fieldId, value) {
    setValues((current) => ({ ...current, [fieldId]: value }));
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
          operator_id: user?.id || null,
          operator_name: userDisplayName(user),
          site_name: userSite(user),
        }),
      });
      setMessage("Response submitted.");
      await loadMyRecords();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadMachines().catch((error) => setMessage(error.message));
    loadMyRecords();
  }, [user?.id]);

  async function loadLatestMachineValues(machine) {
    if (!machine?.id) {
      setValues({});
      return;
    }

    try {
      const data = await fetchJson(`/api/dashboard/summary?machine_config_id=${machine.id}`);
      const latest = data.latest?.[0];
      if (!latest) {
        setValues({});
        return;
      }

      const latestFields = latest.response_fields && typeof latest.response_fields === "object" ? latest.response_fields : {};
      const nextValues = { ...latestFields };
      for (const field of normalizeFields(machine.fields)) {
        if (nextValues[field.id] !== undefined && nextValues[field.id] !== null) continue;
        if (field.mapsTo === "reading_value") nextValues[field.id] = latest.reading_value ?? "";
        if (field.mapsTo === "product") nextValues[field.id] = latest.product ?? "";
        if (field.mapsTo === "batch_number") nextValues[field.id] = latest.batch_number ?? "";
        if (field.mapsTo === "remarks") nextValues[field.id] = latest.remarks ?? "";
      }
      setValues(nextValues);
    } catch (error) {
      setValues({});
      setMessage(error.message);
    }
  }

  useEffect(() => {
    loadLatestMachineValues(selectedMachine);
  }, [selectedMachineId, selectedMachine?.id]);

  return (
    <main className="form-page app-gradient page-pad record-page-mobile">
      <section className="form-layout">
        <form className="input-form glass-card" onSubmit={handleSubmit}>
          <div className="form-title-row">
            <div><p className="eyebrow">Record Input</p><h1>Confirmation Response</h1></div>
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
          <button type="submit" disabled={saving || !selectedMachine}>{saving ? "Saving..." : "Submit Response"}</button>
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
        <thead><tr><th>When</th><th>Operator</th><th>Site</th><th>Machine</th><th>Reading</th><th>Product</th><th>Batch</th><th>Remarks</th></tr></thead>
        <tbody>{records.map((record) => <tr key={record.id}><td data-label="When">{formatDateTime(record.record_timestamp)}</td><td data-label="Operator">{record.operator_name}</td><td data-label="Site">{record.site_name || "—"}</td><td data-label="Machine">{record.machine_name}</td><td data-label="Reading">{formatNumber(record.reading_value)}</td><td data-label="Product">{record.product || "—"}</td><td data-label="Batch">{record.batch_number || "—"}</td><td data-label="Remarks">{record.remarks || "—"}</td></tr>)}</tbody>
      </table>
      <div className="mobile-record-list">{records.map((record) => <article className="mobile-log-card" key={`mobile-${record.id}`}><div className="mobile-log-top"><strong>{record.machine_name}</strong><span>{formatNumber(record.reading_value)}</span></div><div className="mobile-log-grid"><span><b>When</b>{formatDateTime(record.record_timestamp)}</span><span><b>Operator</b>{record.operator_name || "—"}</span><span><b>Site</b>{record.site_name || "—"}</span><span><b>Product</b>{record.product || "—"}</span><span><b>Batch</b>{record.batch_number || "—"}</span><span className="wide"><b>Remarks</b>{record.remarks || "—"}</span></div></article>)}</div>
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
          </div>
          <div className="face-capture-row compact-face-row"><strong>Face Login Link</strong><button className="secondary-button" type="button" onClick={() => setCameraOpen(true)}>{imageDataUrl ? "Retake" : "Capture"}</button></div>
          <button type="submit" disabled={saving}>{saving ? "Saving..." : "Register"}</button>{message && <p className="message">{message}</p>}
        </form>
        <section className="glass-card dashboard-summary">
          <p className="eyebrow">Accounts</p><div className="registered-header-row"><h2>Registered People</h2><button className={deleteMode ? "delete-user-button active-delete" : "delete-user-button"} type="button" onClick={() => setDeleteMode((current) => !current)}>{deleteMode ? "Done" : "Delete"}</button></div>
          <div className={deleteMode ? "user-list compact-users delete-mode" : "user-list compact-users"}>{!users.length && <p className="empty-state">No registered people yet.</p>}{users.map((user) => <article key={user.id} className={deleteMode ? "registered-person-row can-delete" : "registered-person-row"} onClick={() => deleteMode && deletingId !== user.id ? handleDeleteUser(user) : undefined} role={deleteMode ? "button" : undefined} tabIndex={deleteMode ? 0 : undefined}><div><strong>{user.operator_name}</strong><span>{user.site_name} • {user.role_name}</span><small>{deletingId === user.id ? "Deleting..." : user.ai_face_key ? "Face linked" : "Manual account"}</small></div></article>)}</div>
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
  const [manageMode, setManageMode] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setForm({ ...emptyMachineForm, fields: [], callouts: [] });
    setSelectedCalloutId("");
    setMarkMode(null);
    setManageMode(null);
    setMessage("New setup ready.");
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
    setManageMode(null);
  }

  async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setMessage("Preparing image...");
      const compactImage = await imageFileToCompactDataUrl(file);
      updateForm("image_data_url", compactImage);
      setMessage("Image ready.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  function beginMarking(calloutId, mode) {
    const callout = form.callouts.find((item) => item.id === calloutId);
    setSelectedCalloutId(calloutId);
    setMarkMode(mode);
    setManageMode(null);
    setMessage(mode === "card" ? `Place the ${callout?.title || "callout"} card on the map.` : `Mark the machine point for ${callout?.title || "this callout"}.`);
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
    setMessage(`${markMode === "card" ? "Card" : "Point"} marked for ${selectedName}. Save to store it.`);
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

  function addField() {
    updateForm("fields", [...form.fields, { id: uid("field"), label: "New Field", type: "text", required: false, mapsTo: "custom", thresholdEnabled: false, threshold_min: "", threshold_max: "" }]);
  }

  function addCallout() {
    const next = { id: uid("callout"), title: "New Callout", valueKey: "reading_value", cardX: 30, cardY: 30, pointX: 50, pointY: 50, x: 50, y: 50 };
    updateForm("callouts", [...form.callouts, next]);
    setSelectedCalloutId(next.id);
    setMarkMode(null);
  }

  useEffect(() => { loadMachines(true).catch((error) => setMessage(error.message)); }, []);

  return (
    <main className="admin-page app-gradient page-pad system-page function-system-page">
      <form className="glass-card system-composer" onSubmit={handleSave}>
        <header className="system-composer-top">
          <div>
            <p className="eyebrow">Admin System</p>
            <h1>Machine Builder</h1>
          </div>
          <div className="system-top-actions">
            <button className={!form.id ? "new-machine-button active" : "new-machine-button"} type="button" onClick={resetForm}>+ New Setup</button>
          </div>
        </header>

        <div className="system-workbench">
          <section className="machine-core-panel">
            <div className="field-grid two compact-machine-fields">
              <label>{requiredLabel("Machine Name")}<input value={form.machine_name} onChange={(event) => updateForm("machine_name", event.target.value)} placeholder="SELO-3 Cooker 2" required /></label>
              <label>{requiredLabel("Site")}<select value={form.site_name} onChange={(event) => updateForm("site_name", event.target.value)} required>{siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}</select></label>
            </div>
            <label>Details<textarea rows="2" value={form.details} onChange={(event) => updateForm("details", event.target.value)} placeholder="Machine details" /></label>
            <label>Machine Image<input type="file" accept="image/*" onChange={handleImageUpload} /></label>
            <div className="system-function-buttons">
              <button type="button" onClick={() => setManageMode("fields")}>Input Fields <b>{form.fields.length}</b></button>
              <button type="button" onClick={() => setManageMode("callouts")}>Callouts <b>{form.callouts.length}</b></button>
            </div>
            <button className="save-machine-main" type="submit" disabled={saving}>{saving ? "Saving..." : "Save Machine Setup"}</button>
            {message && <p className="message compact-message">{message}</p>}
          </section>

          <section className="point-map-panel">
            <div className="point-map-head">
              <div><p className="eyebrow">Preview</p><h2>Point Map</h2></div>
              <div className="point-map-controls">
                {markMode && <div className="mark-mode-pill active">{markMode === "card" ? "Place card" : "Mark point"}</div>}
                <select className="preview-machine-select compact-map-picker" value={form.id || ""} onChange={(event) => handleMachineSelect(event.target.value)} aria-label="Select saved machine">
                  <option value="" disabled>{machines.length ? "Saved machines" : "No machines"}</option>
                  {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.machine_name}</option>)}
                </select>
                <button className="preview-delete-button compact-delete" type="button" disabled={!form.id} onClick={() => handleDelete(form)}>Delete</button>
              </div>
            </div>
            <div className={markMode ? "builder-preview locating unified-preview" : "builder-preview unified-preview"} onClick={handlePreviewClick}>
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
                    <button type="button" className={active && markMode === "point" ? "preview-target-dot active" : "preview-target-dot"} style={{ left: `${point.x}%`, top: `${point.y}%` }} onClick={(event) => { event.stopPropagation(); beginMarking(callout.id, "point"); }} title="Mark machine point" />
                    <button type="button" className={active ? "preview-callout-card active" : "preview-callout-card"} style={{ left: `${card.x}%`, top: `${card.y}%` }} onClick={(event) => { event.stopPropagation(); beginMarking(callout.id, "card"); }} title="Place callout card">{callout.title}</button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </form>

      {manageMode === "fields" && (
        <SystemModalShell title="Input Fields" onClose={() => setManageMode(null)}>
          <div className="modal-action-row"><button className="secondary-button" type="button" onClick={addField}>Add Field</button></div>
          <div className="modal-list editor-list">
            {!form.fields.length && <div className="modal-empty">No fields yet.</div>}
            {form.fields.map((field, index) => (
              <div className="builder-row modal-editor-row field-editor-row" key={field.id}>
                <input value={field.label} onChange={(event) => updateField(index, "label", event.target.value)} placeholder="Label" />
                <select value={field.type} onChange={(event) => updateField(index, "type", event.target.value)}><option value="text">Text</option><option value="number">Number</option><option value="textarea">Paragraph</option></select>
                <select value={field.mapsTo} onChange={(event) => updateField(index, "mapsTo", event.target.value)}><option value="custom">Custom</option><option value="reading_value">Reading</option><option value="product">Product</option><option value="batch_number">Batch</option><option value="remarks">Remarks</option></select>
                <label className="mini-check"><input type="checkbox" checked={field.required} onChange={(event) => updateField(index, "required", event.target.checked)} /> Required</label>
                <label className="mini-check limit-check"><input type="checkbox" checked={Boolean(field.thresholdEnabled)} onChange={(event) => updateField(index, "thresholdEnabled", event.target.checked)} disabled={field.type !== "number"} /> Limit</label>
                <input className="threshold-mini" type="number" step="any" value={field.threshold_min ?? ""} onChange={(event) => updateField(index, "threshold_min", event.target.value)} placeholder="Min" disabled={field.type !== "number" || !field.thresholdEnabled} />
                <input className="threshold-mini" type="number" step="any" value={field.threshold_max ?? ""} onChange={(event) => updateField(index, "threshold_max", event.target.value)} placeholder="Max" disabled={field.type !== "number" || !field.thresholdEnabled} />
                <button className="ghost-button danger" type="button" onClick={() => updateForm("fields", form.fields.filter((_, i) => i !== index))}>×</button>
              </div>
            ))}
          </div>
        </SystemModalShell>
      )}

      {manageMode === "callouts" && (
        <SystemModalShell title="Callouts" onClose={() => setManageMode(null)}>
          <div className="modal-action-row"><button className="secondary-button" type="button" onClick={addCallout}>Add Callout</button></div>
          <div className="modal-list editor-list">
            {!form.callouts.length && <div className="modal-empty">No callouts yet.</div>}
            {form.callouts.map((callout, index) => (
              <div className={selectedCalloutId === callout.id ? "builder-row selected callout-builder-row modal-editor-row" : "builder-row callout-builder-row modal-editor-row"} key={callout.id}>
                <input value={callout.title} onChange={(event) => updateCallout(index, "title", event.target.value)} placeholder="Title" />
                <select value={callout.valueKey} onChange={(event) => updateCallout(index, "valueKey", event.target.value)}>
                  <option value="reading_value">Reading</option>
                  <option value="machine_name">Machine</option>
                  <option value="site_name">Site</option>
                  <option value="operator_name">Operator</option>
                  <option value="total_submissions">Total</option>
                  {form.fields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
                </select>
                <button className="secondary-button small" type="button" onClick={() => beginMarking(callout.id, "card")}>Card</button>
                <button className="secondary-button small" type="button" onClick={() => beginMarking(callout.id, "point")}>Point</button>
                <button className="ghost-button danger" type="button" onClick={() => { updateForm("callouts", form.callouts.filter((_, i) => i !== index)); if (selectedCalloutId === callout.id) setMarkMode(null); }}>×</button>
              </div>
            ))}
          </div>
        </SystemModalShell>
      )}
    </main>
  );
}

function SystemModalShell({ title, children, onClose }) {
  return (
    <div className="system-modal-backdrop" role="dialog" aria-modal="true">
      <section className="system-modal glass-card">
        <header className="system-modal-head">
          <h2>{title}</h2>
          <button className="ghost-button" type="button" onClick={onClose}>Close</button>
        </header>
        {children}
      </section>
    </div>
  );
}

function LogsPage() {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [machines, setMachines] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ search: "", machine: "", site: "", date: "" });

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function clearFilters() {
    setFilters({ search: "", machine: "", site: "", date: "" });
  }

  async function loadLogs() {
    try {
      setLoading(true);
      setMessage("");
      const [recordsData, summaryData, machineData] = await Promise.all([
        fetchJson("/api/records?limit=300"),
        fetchJson("/api/dashboard/summary"),
        fetchJson("/api/machines").catch(() => ({ machines: [] })),
      ]);
      setRecords(recordsData.records || []);
      setSummary(summaryData.stats || null);
      setMachines(machineData.machines || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  const machineOptions = useMemo(() => {
    const options = [];
    const seen = new Set();

    for (const machine of machines) {
      const label = machine.machine_name || `Machine ${machine.id}`;
      const value = `id:${machine.id}`;
      options.push({ value, label, id: String(machine.id), name: label });
      seen.add(value);
      seen.add(`name:${label.trim().toLowerCase()}`);
    }

    for (const record of records) {
      const name = String(record.machine_name || "").trim();
      if (!name) continue;
      const key = `name:${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      const value = record.machine_config_id ? `id:${record.machine_config_id}` : `name:${name}`;
      if (seen.has(value)) continue;
      options.push({ value, label: name, id: record.machine_config_id ? String(record.machine_config_id) : "", name });
      seen.add(value);
      seen.add(key);
    }

    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [machines, records]);

  const selectedMachineOption = useMemo(
    () => machineOptions.find((machine) => machine.value === filters.machine),
    [machineOptions, filters.machine]
  );

  const filteredRecords = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return records.filter((record) => {
      const siteMatch = !filters.site || record.site_name === filters.site;
      const dateMatch = !filters.date || recordDateKey(record.record_timestamp) === filters.date;
      const machineMatch = !filters.machine || (() => {
        if (!selectedMachineOption) return true;
        const recordMachineId = record.machine_config_id === null || record.machine_config_id === undefined ? "" : String(record.machine_config_id);
        const recordMachineName = String(record.machine_name || "").trim().toLowerCase();
        return (
          (selectedMachineOption.id && recordMachineId === selectedMachineOption.id) ||
          (selectedMachineOption.name && recordMachineName === selectedMachineOption.name.trim().toLowerCase())
        );
      })();
      const haystack = [
        record.operator_name,
        record.site_name,
        record.machine_name,
        record.reading_value,
        record.product,
        record.batch_number,
        record.remarks,
        JSON.stringify(record.response_fields || {}),
      ].join(" ").toLowerCase();
      return machineMatch && siteMatch && dateMatch && (!search || haystack.includes(search));
    });
  }, [records, filters, selectedMachineOption]);

  const filteredSummary = useMemo(() => summarizeRecords(filteredRecords), [filteredRecords]);
  const hasFilters = Object.values(filters).some(Boolean);
  const activeSummary = hasFilters ? filteredSummary : summary;

  useEffect(() => { loadLogs(); }, []);

  return (
    <main className="logs-page app-gradient page-pad">
      <section className="logs-shell">
        <aside className="logs-right">
          <article className="stat-card glass-card"><span>Total</span><strong>{activeSummary?.total_submissions ?? 0}</strong></article>
          <article className="stat-card glass-card"><span>Operators</span><strong>{activeSummary?.unique_operators ?? 0}</strong></article>
          <article className="stat-card glass-card"><span>Savoury</span><strong>{activeSummary?.savoury_count ?? 0}</strong></article>
          <article className="stat-card glass-card"><span>Dressings</span><strong>{activeSummary?.dressings_count ?? 0}</strong></article>
        </aside>
        <section className="logs-left glass-card">
          <div className="logs-hero-inline">
            <div><p className="eyebrow">Logs</p><h1>Submission Records</h1></div>
            <button className="secondary-button" type="button" onClick={loadLogs} disabled={loading}>{loading ? "Loading..." : "Refresh"}</button>
          </div>
          <div className="logs-filter-bar">
            <input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Search logs" />
            <select value={filters.machine} onChange={(event) => updateFilter("machine", event.target.value)}>
              <option value="">All Machines</option>
              {machineOptions.map((machine) => <option key={machine.value} value={machine.value}>{machine.label}</option>)}
            </select>
            <select value={filters.site} onChange={(event) => updateFilter("site", event.target.value)}>
              <option value="">All Sites</option>
              {siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}
            </select>
            <input type="date" value={filters.date} onChange={(event) => updateFilter("date", event.target.value)} />
            <button className="ghost-button" type="button" onClick={clearFilters} disabled={!hasFilters}>Clear</button>
          </div>
          {filters.machine && selectedMachineOption && (
            <div className="active-machine-filter">
              Showing logs for <strong>{selectedMachineOption.label}</strong>
              <button type="button" onClick={() => updateFilter("machine", "")}>Show all</button>
            </div>
          )}
          {message && <p className="message">{message}</p>}
          <RecordList records={filteredRecords} />
        </section>
      </section>
    </main>
  );
}


function trendStatusLabel(status) {
  if (status === "below") return "Below";
  if (status === "above") return "Above";
  if (status === "normal") return "Normal";
  return "No Data";
}

function trendStatusClass(status) {
  if (status === "below" || status === "above") return "warning";
  if (status === "normal") return "normal";
  return "empty";
}

function TrendMiniChart({ trends = [], thresholdMin, thresholdMax }) {
  const points = trends
    .map((item) => ({ ...item, reading: Number(item.reading_value) }))
    .filter((item) => Number.isFinite(item.reading));

  if (points.length < 2) {
    return <div className="trend-empty">Need at least 2 readings to draw a trend.</div>;
  }

  const values = points.map((item) => item.reading);
  const thresholds = [thresholdMin, thresholdMax].map(Number).filter(Number.isFinite);
  const min = Math.min(...values, ...thresholds);
  const max = Math.max(...values, ...thresholds);
  const range = max === min ? 1 : max - min;
  const width = 100;
  const height = 52;

  const coordinates = points.map((item, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = height - ((item.reading - min) / range) * (height - 8) - 4;
    return { x, y, item };
  });

  const path = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const yForThreshold = (value) => height - ((Number(value) - min) / range) * (height - 8) - 4;

  return (
    <div className="trend-chart-wrap">
      <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="Reading trend">
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(49, 132, 255, 0.28)" />
            <stop offset="100%" stopColor="rgba(49, 132, 255, 0.02)" />
          </linearGradient>
        </defs>
        {Number.isFinite(Number(thresholdMax)) && <line className="threshold-line high" x1="0" x2="100" y1={yForThreshold(thresholdMax)} y2={yForThreshold(thresholdMax)} />}
        {Number.isFinite(Number(thresholdMin)) && <line className="threshold-line low" x1="0" x2="100" y1={yForThreshold(thresholdMin)} y2={yForThreshold(thresholdMin)} />}
        <path className="trend-fill" d={`${path} L100,${height} L0,${height} Z`} />
        <path className="trend-path" d={path} />
        {coordinates.slice(-12).map((point) => <circle key={point.item.id} className={point.item.warning_status === "normal" ? "trend-dot" : "trend-dot warn"} cx={point.x} cy={point.y} r="1.7" />)}
      </svg>
      <div className="trend-axis-labels"><span>{formatNumber(min)}</span><span>{formatNumber(max)}</span></div>
    </div>
  );
}

function TrendWarningPanel({ trends = [], warnings = [], stats = {}, selectedMachine, latest }) {
  const latestStatus = latest?.warning_status || stats?.latest_status || "no-data";
  const latestReading = latest?.reading_value ?? stats?.avg_reading;
  const machineThresholds = getMachineReadingThresholds(selectedMachine);
  const thresholdMin = machineThresholds.thresholdMin ?? stats?.threshold_min;
  const thresholdMax = machineThresholds.thresholdMax ?? stats?.threshold_max;
  const recentWarnings = warnings.slice(0, 4);

  return (
    <aside className="trend-warning-panel">
      <div className="trend-panel-head">
        <div>
          <p className="eyebrow">Trends</p>
          <h2>Reading Trend</h2>
        </div>
        <span className={`trend-status-pill ${trendStatusClass(latestStatus)}`}>{trendStatusLabel(latestStatus)}</span>
      </div>

      <div className="trend-stat-grid">
        <article><span>Latest</span><strong>{formatNumber(latestReading)}</strong></article>
        <article><span>Min</span><strong>{thresholdMin === null || thresholdMin === undefined || thresholdMin === "" ? "—" : formatNumber(thresholdMin)}</strong></article>
        <article><span>Max</span><strong>{thresholdMax === null || thresholdMax === undefined || thresholdMax === "" ? "—" : formatNumber(thresholdMax)}</strong></article>
      </div>

      <TrendMiniChart trends={trends} thresholdMin={thresholdMin} thresholdMax={thresholdMax} />

      <div className="warning-system-card">
        <div className="warning-system-title">
          <span>Warning System</span>
          <strong>{stats?.warning_count || 0}</strong>
        </div>
        {!recentWarnings.length ? (
          <p className="warning-empty">No threshold warning for this machine.</p>
        ) : (
          <div className="warning-list">
            {recentWarnings.map((warning) => (
              <article key={warning.id} className="warning-item">
                <div><strong>{warning.warning_status === "below" ? "Below limit" : "Above limit"}</strong><span>{formatDateTime(warning.record_timestamp)}</span></div>
                <b>{formatNumber(warning.reading_value)}</b>
              </article>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function getRawValueFromRecord(record, key, summary) {
  if (key === "total_submissions") return summary?.total_submissions ?? 0;
  if (!record) return "";
  if (key === "machine_name") return record.machine_name;
  if (key === "site_name") return record.site_name;
  if (key === "operator_name") return record.operator_name;
  if (key === "record_timestamp") return record.record_timestamp;
  if (key === "reading_value") return record.reading_value;
  if (key === "product") return record.product;
  if (key === "batch_number") return record.batch_number;
  if (key === "remarks") return record.remarks;
  return record.response_fields?.[key];
}

function inferMetricUnit(title = "", key = "") {
  const text = `${title} ${key}`.toLowerCase();
  if (text.includes("temp")) return "°C";
  if (text.includes("pressure")) return "bar";
  if (text.includes("current")) return "A";
  if (text.includes("speed") || text.includes("rpm")) return "rpm";
  if (text.includes("power") || text.includes("kw")) return "kW";
  if (text.includes("vibration")) return "mm/s";
  if (text.includes("health") || text.includes("quality") || text.includes("availability") || text.includes("performance")) return "%";
  return "";
}

function defaultRangeForMetric(title = "", key = "") {
  const text = `${title} ${key}`.toLowerCase();
  if (text.includes("vibration")) return { min: 0, max: 4 };
  if (text.includes("current")) return { min: 0, max: 25 };
  if (text.includes("pressure")) return { min: 0, max: 5 };
  if (text.includes("temp")) return { min: 0, max: 120 };
  if (text.includes("speed") || text.includes("rpm")) return { min: 0, max: 3000 };
  if (text.includes("power") || text.includes("kw")) return { min: 0, max: 15 };
  if (text.includes("health")) return { min: 0, max: 100 };
  return { min: null, max: null };
}

function getFieldForMetric(fields, key) {
  return fields.find((field) => field.id === key || field.mapsTo === key) || null;
}

function getMetricThresholds(machine, fields, key, title) {
  const field = getFieldForMetric(fields, key);
  const fieldMin = field?.thresholdEnabled ? Number(field.threshold_min) : NaN;
  const fieldMax = field?.thresholdEnabled ? Number(field.threshold_max) : NaN;
  const machineThresholds = key === "reading_value" ? getMachineReadingThresholds(machine) : { thresholdMin: null, thresholdMax: null };
  const fallback = defaultRangeForMetric(title, key);

  return {
    min: Number.isFinite(fieldMin) ? fieldMin : machineThresholds.thresholdMin ?? fallback.min,
    max: Number.isFinite(fieldMax) ? fieldMax : machineThresholds.thresholdMax ?? fallback.max,
  };
}

function compactMetricValue(value, decimals = 2) {
  if (value === null || value === undefined || value === "") return "—";
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return String(value);
  const maxDigits = Math.abs(numberValue) >= 100 ? 0 : Math.abs(numberValue) >= 10 ? 1 : decimals;
  return numberValue.toLocaleString("en-US", { maximumFractionDigits: maxDigits, minimumFractionDigits: maxDigits === 0 ? 0 : Math.min(maxDigits, decimals) });
}

function metricStatus(value, min, max) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "idle";
  if (Number.isFinite(Number(min)) && numberValue < Number(min)) return "warning";
  if (Number.isFinite(Number(max)) && numberValue > Number(max)) return "warning";
  return "normal";
}

function rangeText(min, max, unit) {
  if (!Number.isFinite(Number(min)) && !Number.isFinite(Number(max))) return "Latest database value";
  const left = Number.isFinite(Number(min)) ? compactMetricValue(min, 1) : "—";
  const right = Number.isFinite(Number(max)) ? compactMetricValue(max, 1) : "—";
  return `Range: ${left} – ${right}${unit ? ` ${unit}` : ""}`;
}

function enhanceFactoryCallouts(configuredCallouts) {
  // Frontend does not invent callouts anymore.
  // What appears here is only what the admin saved in app.machine_configs.callouts.
  return normalizeCallouts(configuredCallouts).slice(0, 8);
}

function buildFactoryMetric(callout, displayRecord, summary, selectedMachine, fields) {
  const rawValue = getRawValueFromRecord(displayRecord, callout.valueKey, summary);
  const unit = inferMetricUnit(callout.title, callout.valueKey);
  const thresholds = getMetricThresholds(selectedMachine, fields, callout.valueKey, callout.title);
  const status = metricStatus(rawValue, thresholds.min, thresholds.max);
  return {
    ...callout,
    rawValue,
    value: compactMetricValue(rawValue),
    unit,
    range: rangeText(thresholds.min, thresholds.max, unit),
    status,
  };
}

function summaryKeyForField(field) {
  if (!field) return "";
  return field.mapsTo && field.mapsTo !== "custom" ? field.mapsTo : field.id;
}

function buildFactorySummaryRows({ selectedMachine, latest, fields, summary, statusText, warningCount }) {
  const rows = [
    ["Asset Name", selectedMachine?.machine_name || "No Machine"],
    ["Status", statusText, warningCount ? "warn" : latest ? "ok" : "idle"],
    ["Latest Record", latest ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }).format(new Date(latest.record_timestamp)) : "—"],
  ];

  for (const field of fields) {
    const key = summaryKeyForField(field);
    if (!key) continue;
    rows.push([field.label, valueFromRecord(latest, key, summary)]);
  }

  rows.push(["Operator", latest?.operator_name || "—"]);
  rows.push(["Last Update", formatDateTime(latest?.record_timestamp)]);

  return rows;
}

function seriesForMetric(records, key) {
  const values = records
    .slice()
    .reverse()
    .map((record) => Number(getRawValueFromRecord(record, key)))
    .filter(Number.isFinite);
  if (values.length >= 2) return values.slice(-24);
  if (values.length === 1) return [values[0], values[0], values[0]];
  return [0, 0, 0];
}

function FactorySparkline({ values = [], warning = false }) {
  const points = values.map(Number).filter(Number.isFinite);
  const safePoints = points.length ? points : [0, 0, 0];
  const min = Math.min(...safePoints);
  const max = Math.max(...safePoints);
  const range = max === min ? 1 : max - min;
  const width = 100;
  const height = 28;
  const path = safePoints.map((value, index) => {
    const x = safePoints.length === 1 ? width / 2 : (index / (safePoints.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 6) - 3;
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");

  return (
    <svg className={warning ? "factory-sparkline warning" : "factory-sparkline"} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function FactoryPumpFallback() {
  return (
    <div className="factory-pump-fallback" aria-hidden="true">
      <div className="factory-base-plate" />
      <div className="factory-motor-shell"><span /><span /><span /><span /><span /></div>
      <div className="factory-motor-cap" />
      <div className="factory-coupling" />
      <div className="factory-shaft" />
      <div className="factory-pump-body" />
      <div className="factory-pump-flange left" />
      <div className="factory-pump-flange right" />
      <div className="factory-pipe-top" />
      <div className="factory-pipe-nozzle" />
      <div className="factory-foot left" />
      <div className="factory-foot right" />
    </div>
  );
}

function FactoryMetricCard({ metric, records }) {
  return (
    <article className={metric.status === "warning" ? "factory-trend-card warning" : "factory-trend-card"}>
      <div>
        <span>{metric.title}</span>
        {metric.status === "warning" && <b>⚠</b>}
      </div>
      <strong>{metric.value}<small>{metric.unit}</small></strong>
      <FactorySparkline values={seriesForMetric(records, metric.valueKey)} warning={metric.status === "warning"} />
    </article>
  );
}

function MachineViewPage({ user = null, setPage = null, onLogout = null, standalone = false }) {
  const [summary, setSummary] = useState(null);
  const [records, setRecords] = useState([]);
  const [machines, setMachines] = useState([]);
  const [selectedArea, setSelectedArea] = useState(siteOptions.includes(userSite(user)) ? userSite(user) : "Savoury");
  const [selectedDate, setSelectedDate] = useState(() => recordDateKey(new Date()));
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [message, setMessage] = useState("Loading machine feed...");
  const [loading, setLoading] = useState(false);

  async function loadMachines(site = selectedArea) {
    const query = site ? `?site=${encodeURIComponent(site)}` : "";
    const machineData = await fetchJson(`/api/machines${query}`);
    const machineList = machineData.machines || [];
    setMachines(machineList);

    const stillAvailable = machineList.find((machine) => String(machine.id) === String(selectedMachineId));
    if (stillAvailable) {
      setSelectedMachineId(String(stillAvailable.id));
    } else {
      setSelectedMachineId(machineList[0] ? String(machineList[0].id) : "");
    }

    if (!machineList.length) {
      setRecords([]);
      setSummary(null);
      setMessage(`No machines configured for ${site}`);
    }

    return machineList;
  }

  async function loadDashboard(machineId = selectedMachineId, date = selectedDate) {
    if (!machineId) return;

    try {
      setLoading(true);
      const params = new URLSearchParams({ machine_config_id: String(machineId), limit: "500" });
      if (date) params.set("date", date);
      const data = await fetchJson(`/api/records?${params.toString()}`);
      const recordList = data.records || [];
      setRecords(recordList);
      setSummary(summarizeRecords(recordList));
      setMessage(recordList.length ? `Database feed for ${date || "all dates"}` : "No data for this machine/date yet");
    } catch (error) {
      setMessage(error.message);
      setRecords([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMachines(selectedArea).catch((error) => setMessage(error.message));
  }, [selectedArea]);

  useEffect(() => {
    if (selectedMachineId) loadDashboard(selectedMachineId, selectedDate);
  }, [selectedMachineId, selectedDate]);

  const selectedMachine = machines.find((machine) => String(machine.id) === String(selectedMachineId)) || machines[0];
  const latest = records[0] || null;
  const displayRecord = latest || {
    machine_name: selectedMachine?.machine_name || "No Machine",
    site_name: selectedMachine?.site_name || selectedArea,
    operator_name: "No operator",
  };
  const fields = normalizeFields(selectedMachine?.fields);
  const factoryCallouts = enhanceFactoryCallouts(selectedMachine?.callouts);
  const metrics = factoryCallouts.map((callout) => buildFactoryMetric(callout, displayRecord, summary, selectedMachine, fields));
  const warningCount = metrics.filter((metric) => metric.status === "warning").length;
  const statusText = !latest ? "No Data" : warningCount ? "Attention" : "Running";
  const isAdmin = userRole(user) === "admin";
  const latestRows = buildFactorySummaryRows({ selectedMachine, latest, fields, summary, statusText, warningCount });

  function go(target) {
    if (target === "overview") return;
    if (!setPage) return;
    if (target === "alarms" || target === "reports") return setPage("logs");
    if (target === "maintenance") return setPage(isAdmin ? "system" : "record");
    setPage(target);
  }

  return (
    <main className="factory-os-page">
      <header className="factory-topbar">
        <button className="factory-brand confirmation-brand" type="button" onClick={() => standalone ? setPage?.("auth") : go("machine")}>
          <span className="confirmation-mark">✓</span>
          <strong>Confirmation</strong>
        </button>
        <nav className="factory-nav-tabs" aria-label="Factory navigation">
          <button type="button" onClick={() => go("overview")}>Overview</button>
          <button className="active" type="button" onClick={() => go("machine")}>Machines</button>
          <button type="button" onClick={() => go("trends")}>Trends</button>
          <button type="button" onClick={() => go("alarms")}>Alarms</button>
          <button type="button" onClick={() => go("reports")}>Reports</button>
          {isAdmin && <button type="button" onClick={() => go("system")}>System</button>}
        </nav>
        <div className="factory-top-actions">
          <label className="factory-date-chip factory-date-filter">
            <span>Calendar</span>
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
          </label>
          <select className="factory-area-chip factory-area-select" value={selectedArea} onChange={(event) => setSelectedArea(event.target.value)}>
            {siteOptions.map((site) => <option key={site} value={site}>{site} Area</option>)}
          </select>
          <button className="factory-bell notification-bell" type="button" onClick={() => go("alarms")} aria-label="Notifications"><span>{warningCount || 0}</span>🔔</button>
          {standalone ? (
            <button className="factory-user-chip" type="button" onClick={() => setPage?.("auth")}>Back</button>
          ) : (
            <button className="factory-user-chip" type="button" onClick={onLogout}>{userDisplayName(user).split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "AD"}</button>
          )}
        </div>
      </header>

      <section className="factory-workspace">
        <div className="factory-toolbar-row">
          <div className="factory-machine-select-group">
            <label>Select Machine</label>
            <select value={selectedMachineId} onChange={(event) => setSelectedMachineId(event.target.value)} disabled={!machines.length}>
              {!machines.length && <option value="">No machines</option>}
              {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.machine_name}</option>)}
            </select>
            <span className={warningCount ? "factory-running-dot warn" : latest ? "factory-running-dot" : "factory-running-dot idle"} />
            <b>{statusText}</b>
          </div>
          <div className="factory-refresh-group">
            <button type="button" onClick={() => loadDashboard(selectedMachineId, selectedDate)} disabled={loading || !selectedMachineId}>⟳ Refresh</button>
            <span>Last updated: {latest ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }).format(new Date(latest.record_timestamp)) : "—"}</span>
          </div>
        </div>

        <section className="factory-main-card">
          <aside className="factory-summary-panel">
            <div className="factory-panel-head">
              <h2>Machine Summary</h2>
              <button type="button">•••</button>
            </div>
            <div className="factory-summary-list">
              {latestRows.map(([label, value, tone]) => (
                <div key={label} className={tone ? `tone-${tone}` : ""}>
                  <span>{label}</span>
                  {label === "Status" ? <strong className="factory-status-badge">{value}<i /></strong> : <strong>{value}</strong>}
                </div>
              ))}
            </div>
            <div className="factory-alarm-box">
              <span>△</span>
              <div><strong>Active Alarms</strong><small>Unacknowledged</small></div>
              <b>{warningCount}</b>
            </div>

          </aside>

          <section className="factory-machine-stage-card">
            <div className="factory-machine-stage">
              <div className="factory-machine-art">
                {selectedMachine?.image_data_url ? <img src={selectedMachine.image_data_url} alt={selectedMachine.machine_name} /> : <FactoryPumpFallback />}
                <svg className="factory-line-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {metrics.map((metric) => {
                    const { point, card } = calloutLine(metric);
                    return <line key={`factory-line-${metric.id}`} x1={card.x} y1={card.y} x2={point.x} y2={point.y} />;
                  })}
                </svg>
                {metrics.map((metric) => {
                  const { point, card } = calloutLine(metric);
                  return (
                    <div key={metric.id}>
                      <span className={metric.status === "warning" ? "factory-target-dot warning" : "factory-target-dot"} style={{ left: `${point.x}%`, top: `${point.y}%` }} />
                      <article className={metric.status === "warning" ? "factory-callout-card warning" : "factory-callout-card"} style={{ left: `${card.x}%`, top: `${card.y}%` }}>
                        <div><span>{metric.title}</span><em>{metric.status === "warning" ? "♧" : "✓"}</em></div>
                        <strong>{metric.value}<small>{metric.unit}</small></strong>
                        <p>{metric.range}</p>
                      </article>
                    </div>
                  );
                })}
              </div>
            </div>

          </section>
        </section>
      </section>
    </main>
  );
}

function TrendsPage() {
  const [machines, setMachines] = useState([]);
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [trendData, setTrendData] = useState({ trends: [], warnings: [], stats: null });
  const [machineTrendMap, setMachineTrendMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Loading trends...");

  async function loadMachines() {
    const machineData = await fetchJson("/api/machines");
    const machineList = machineData.machines || [];
    setMachines(machineList);
    if (!selectedMachineId && machineList[0]) setSelectedMachineId(String(machineList[0].id));
    if (!machineList.length) setMessage("No machines configured yet");
    return machineList;
  }

  async function loadTrend(machineId = selectedMachineId) {
    if (!machineId) return;
    try {
      setLoading(true);
      const data = await fetchJson(`/api/dashboard/trends?machine_config_id=${encodeURIComponent(machineId)}&limit=120`);
      setTrendData({ trends: data.trends || [], warnings: data.warnings || [], stats: data.stats || null });
      setMessage(data.trends?.length ? "Trend data loaded" : "No trend data yet for this machine");
    } catch (error) {
      setMessage(error.message);
      setTrendData({ trends: [], warnings: [], stats: null });
    } finally {
      setLoading(false);
    }
  }

  async function loadSidebarSummaries(machineList = machines) {
    if (!machineList.length) return;
    const entries = await Promise.all(machineList.map(async (machine) => {
      try {
        const data = await fetchJson(`/api/dashboard/trends?machine_config_id=${encodeURIComponent(machine.id)}&limit=20`);
        return [String(machine.id), { trends: data.trends || [], warnings: data.warnings || [], stats: data.stats || null }];
      } catch {
        return [String(machine.id), { trends: [], warnings: [], stats: null }];
      }
    }));
    setMachineTrendMap(Object.fromEntries(entries));
  }

  async function refreshAll() {
    const machineList = await loadMachines();
    await Promise.all([loadSidebarSummaries(machineList), selectedMachineId ? loadTrend(selectedMachineId) : Promise.resolve()]);
  }

  useEffect(() => {
    loadMachines().then((machineList) => loadSidebarSummaries(machineList)).catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (selectedMachineId) loadTrend(selectedMachineId);
  }, [selectedMachineId]);

  const selectedMachine = machines.find((machine) => String(machine.id) === String(selectedMachineId)) || machines[0];
  const trends = trendData.trends || [];
  const warnings = trendData.warnings || [];
  const stats = trendData.stats || {};
  const latest = trends[trends.length - 1] || null;
  const recentPoints = trends.slice(-10).reverse();

  return (
    <main className="trends-page app-gradient page-pad">
      <section className="trends-shell">
        <aside className="trend-machine-sidebar glass-card">
          <div className="trend-side-head">
            <div>
              <p className="eyebrow">Trends</p>
              <h1>Machine Trends</h1>
            </div>
            <button className="secondary-button" type="button" onClick={refreshAll} disabled={loading}>{loading ? "Loading" : "Refresh"}</button>
          </div>
          <div className="trend-machine-list">
            {!machines.length && <p className="empty-state">No machines configured yet.</p>}
            {machines.map((machine) => {
              const mini = machineTrendMap[String(machine.id)] || {};
              const miniStats = mini.stats || {};
              const miniLatest = (mini.trends || []).slice(-1)[0];
              const status = miniStats.latest_status || miniLatest?.warning_status || "no-data";
              return (
                <button key={machine.id} type="button" className={`trend-machine-card ${String(machine.id) === String(selectedMachineId) ? "active" : ""}`} onClick={() => setSelectedMachineId(String(machine.id))}>
                  <span className="trend-card-name">{machine.machine_name}</span>
                  <small>{machine.site_name || "—"}</small>
                  <div><b>{formatNumber(miniLatest?.reading_value ?? miniStats.avg_reading)}</b><em className={`trend-status-pill ${trendStatusClass(status)}`}>{trendStatusLabel(status)}</em></div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="trend-main-panel glass-card">
          <div className="trend-main-head">
            <div>
              <p className="eyebrow">Selected Machine</p>
              <h1>{selectedMachine?.machine_name || "No Machine"}</h1>
            </div>
            <select value={selectedMachineId} onChange={(event) => setSelectedMachineId(event.target.value)} disabled={!machines.length}>
              {!machines.length && <option value="">No machines</option>}
              {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.machine_name}</option>)}
            </select>
          </div>

          {message && <p className="trend-message">{message}</p>}

          <div className="trend-page-grid">
            <TrendWarningPanel trends={trends} warnings={warnings} stats={stats} selectedMachine={selectedMachine} latest={latest} />
            <section className="trend-history-card">
              <div className="trend-history-head">
                <div><p className="eyebrow">History</p><h2>Recent Readings</h2></div>
                <span>{stats.points || 0} points</span>
              </div>
              {!recentPoints.length ? (
                <p className="empty-state">No readings yet.</p>
              ) : (
                <div className="trend-reading-list">
                  {recentPoints.map((point) => (
                    <article key={point.id} className={`trend-reading-row ${trendStatusClass(point.warning_status)}`}>
                      <div><strong>{formatNumber(point.reading_value)}</strong><span>{formatDateTime(point.record_timestamp)}</span></div>
                      <p>{point.operator_name || "—"} • {point.product || "No product"} • {point.batch_number || "No batch"}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
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
  function handleDemoUser() { setUser({ id: null, operator_name: "Temporary User", site_name: "Savoury", role_name: "operator" }); setPage("record"); }
  function handleLogout() { setUser(null); setPage("auth"); }
  if (page === "auth") return <AuthPage onFaceLogin={(profile) => { setUser(profile); setPage(userRole(profile) === "admin" ? "machine" : "record"); }} onRegister={() => setPage("register")} onMachineView={() => setPage("machine")} onAdmin={handleAdminSkip} onDemoUser={handleDemoUser} />;
  if (page === "register") return <RegisterPage onBack={() => setPage("auth")} onRegistered={(profile) => { setUser(profile); setPage("record"); }} />;
  if (page === "machine" && !user) return <MachineViewPage setPage={setPage} standalone />;
  if (page === "machine") return <MachineViewPage user={user} setPage={setPage} onLogout={handleLogout} />;
  return <><TopBar user={user} page={page} setPage={setPage} onLogout={handleLogout} />{page === "system" ? <AdminSystemPage /> : page === "adminRegister" ? <AdminRegisterPage adminUser={user} /> : page === "logs" ? <LogsPage /> : page === "trends" ? <TrendsPage /> : <RecordInputPage user={user} />}</>;
}

export default App;

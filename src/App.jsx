import { useEffect, useMemo, useRef, useState } from "react";

/* Shared helpers/components - kept in this file so all pages reuse one source. */
const siteOptions = ["Savoury", "Dressings"];
const roleOptions = ["operator", "admin"];
const shiftOptions = [
  { value: "1st Shift", label: "1st Shift || 6:00 AM - 2:00 PM" },
  { value: "2nd Shift", label: "2nd Shift || 2:00 PM - 10:00 PM" },
  { value: "3rd Shift", label: "3rd Shift || 10:00 PM - 6:00 AM" },
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

function imageFileToCompactDataUrl(file, maxWidth = 1000, maxHeight = 650, quality = 0.78) {
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


function useFittedImageCanvas(imageDataUrl, padding = 12) {
  const stageRef = useRef(null);
  const [naturalSize, setNaturalSize] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    setNaturalSize(null);
    setCanvasSize({ width: 0, height: 0 });
  }, [imageDataUrl]);

  useEffect(() => {
    if (!imageDataUrl || !naturalSize || !stageRef.current) return undefined;

    function fitImageToStage() {
      const stage = stageRef.current;
      if (!stage) return;

      const rect = stage.getBoundingClientRect();
      const availableWidth = Math.max(1, rect.width - padding);
      const availableHeight = Math.max(1, rect.height - padding);
      const scale = Math.min(availableWidth / naturalSize.width, availableHeight / naturalSize.height);

      setCanvasSize({
        width: Math.max(1, Math.floor(naturalSize.width * scale)),
        height: Math.max(1, Math.floor(naturalSize.height * scale)),
      });
    }

    fitImageToStage();
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fitImageToStage) : null;
    if (resizeObserver) resizeObserver.observe(stageRef.current);
    window.addEventListener("resize", fitImageToStage);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener("resize", fitImageToStage);
    };
  }, [imageDataUrl, naturalSize, padding]);

  function handleImageLoad(event) {
    const image = event.currentTarget;
    if (image.naturalWidth && image.naturalHeight) {
      setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
    }
  }

  const canvasStyle = imageDataUrl && canvasSize.width && canvasSize.height
    ? { width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }
    : undefined;

  return { stageRef, canvasStyle, handleImageLoad };
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

function splitFieldOptions(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[\n,|;]+/);
  const output = [];
  const seen = new Set();

  for (const item of source) {
    const option = String(item || "").trim();
    const key = option.toLowerCase();
    if (!option || seen.has(key)) continue;
    seen.add(key);
    output.push(option);
  }

  return output.slice(0, 40);
}

function optionsToText(options) {
  return splitFieldOptions(options).join("\n");
}

function normalizeMachinePrefix(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripMachinePrefixLabel(label, machineName) {
  const raw = String(label || "").trim();
  const prefix = normalizeMachinePrefix(machineName);
  if (!raw || !prefix) return raw;
  const normalized = normalizeMachinePrefix(raw);
  if (!normalized.startsWith(prefix) || normalized === prefix) return raw;

  const suffixNormalized = normalized.slice(prefix.length);
  const suffixStart = raw.search(new RegExp(suffixNormalized.split("").map((char) => `${char}[^a-zA-Z0-9]*`).join(""), "i"));
  if (suffixStart >= 0) {
    const suffix = raw.slice(suffixStart).replace(/^[\s_\-:]+/, "").trim();
    if (suffix) return suffix;
  }

  return raw.replace(new RegExp(`^${String(machineName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\s_\-:]*`, "i"), "").trim() || raw;
}

function normalizeVariableKey(value, fallback = "variable") {
  const cleaned = String(value || "").trim().replace(/[^a-zA-Z0-9_\-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function makeFieldIdFromLabel(label, existingFields = []) {
  const base = normalizeVariableKey(label, "variable");
  const seen = new Set((existingFields || []).map((field) => String(field.id)));
  if (!seen.has(base)) return base;
  let index = 2;
  while (seen.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function visibleVariableName(field, machineName = "") {
  return stripMachinePrefixLabel(field?.label || field?.id || "Variable", machineName) || "Variable";
}

function makeCalloutForField(field, index = 0) {
  return {
    id: `callout-${field.id || index}`,
    title: field.label || `Variable ${index + 1}`,
    valueKey: field.id,
    cardX: Math.min(88, 18 + (index % 4) * 18),
    cardY: Math.min(88, 18 + Math.floor(index / 4) * 16),
    pointX: 50,
    pointY: 50,
    x: 50,
    y: 50,
  };
}

function normalizeFields(fields) {
  if (!Array.isArray(fields) || !fields.length) return [];
  return fields.map((field, index) => {
    const type = ["text", "number", "textarea", "image", "option"].includes(field.type) ? field.type : "text";
    const options = splitFieldOptions(field.options ?? field.choices ?? field.optionValues ?? field.optionsText);

    return {
      id: field.id || uid(`field-${index}`),
      label: field.label || `Field ${index + 1}`,
      type,
      options: type === "option" ? (options.length ? options : ["Yes", "No"]) : options,
      optionsText: type === "option" ? optionsToText(options.length ? options : ["Yes", "No"]) : optionsToText(options),
      aiTarget: field.aiTarget ?? field.ai_target ?? field.target ?? "",
      required: Boolean(field.required),
      showOnPointMap: field.showOnPointMap !== false,
      mapsTo: field.mapsTo || "custom",
      thresholdEnabled: Boolean(field.thresholdEnabled || field.threshold_enabled),
      threshold_min: field.threshold_min ?? field.thresholdMin ?? "",
      threshold_max: field.threshold_max ?? field.thresholdMax ?? "",
    };
  });
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

export async function fetchJson(url, options = {}) {
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

function isAdminUser(user) {
  return userRole(user) === "admin";
}

function canAccessPage(user, page, standalone = false) {
  if (standalone || !user) return ["auth", "register", "machine", "trends"].includes(page);
  if (isAdminUser(user)) return true;
  return ["record", "machine", "trends"].includes(page);
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

function slugText(value = "") {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function makeAutoFieldId(label, fields = [], selfId = "") {
  const base = normalizeVariableKey(label, "variable");
  const existing = new Set((fields || []).filter((field) => String(field.id) !== String(selfId)).map((field) => String(field.id)));
  if (!existing.has(base)) return base;
  let index = 2;
  while (existing.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function valueFromRecordField(record, field) {
  if (!record || !field) return "";
  const responseFields = record.response_fields && typeof record.response_fields === "object" ? record.response_fields : {};
  if (Object.prototype.hasOwnProperty.call(responseFields, field.id)) return responseFields[field.id];
  if (field.mapsTo === "reading_value") return record.reading_value;
  if (field.mapsTo === "product") return record.product;
  if (field.mapsTo === "batch_number") return record.batch_number;
  if (field.mapsTo === "remarks") return record.remarks;
  return responseFields[field.id];
}

function rawResponseValue(record, key) {
  const responseFields = record?.response_fields && typeof record.response_fields === "object" ? record.response_fields : {};
  return responseFields[key];
}

function numericValueFromField(record, field) {
  const value = valueFromRecordField(record, field);
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function numericTrendFieldsForMachine(machine, records = []) {
  const fields = normalizeFields(machine?.fields).filter((field) => field.type === "number");
  return fields.filter((field) => records.some((record) => numericValueFromField(record, field) !== null));
}

function buildTrendDataFromRecords(machine, records = []) {
  const sorted = [...records].sort((a, b) => new Date(a.record_timestamp).getTime() - new Date(b.record_timestamp).getTime() || Number(a.id || 0) - Number(b.id || 0));
  const numericFields = numericTrendFieldsForMachine(machine, sorted);
  const field = numericFields[0] || normalizeFields(machine?.fields).find((item) => item.type === "number") || null;
  if (!field) {
    return {
      field: null,
      trends: [],
      warnings: [],
      stats: { points: 0, warning_count: 0, latest_status: "no-data", min_reading: null, max_reading: null, avg_reading: null, threshold_min: null, threshold_max: null },
    };
  }

  const thresholdMin = field.thresholdEnabled && field.threshold_min !== "" ? Number(field.threshold_min) : null;
  const thresholdMax = field.thresholdEnabled && field.threshold_max !== "" ? Number(field.threshold_max) : null;
  const safeMin = Number.isFinite(thresholdMin) ? thresholdMin : null;
  const safeMax = Number.isFinite(thresholdMax) ? thresholdMax : null;
  const trends = sorted.map((record) => {
    const reading = numericValueFromField(record, field);
    const below = Number.isFinite(reading) && Number.isFinite(safeMin) && reading < safeMin;
    const above = Number.isFinite(reading) && Number.isFinite(safeMax) && reading > safeMax;
    return {
      ...record,
      reading_value: reading,
      trend_field_id: field.id,
      trend_field_label: field.label,
      threshold_min: safeMin,
      threshold_max: safeMax,
      warning_status: below ? "below" : above ? "above" : Number.isFinite(reading) ? "normal" : "no-reading",
      warning_message: below ? `Below limit: ${reading} < ${safeMin}` : above ? `Above limit: ${reading} > ${safeMax}` : "",
    };
  });
  const numericRows = trends.filter((row) => Number.isFinite(Number(row.reading_value)));
  const numericValues = numericRows.map((row) => Number(row.reading_value));
  const warnings = trends.filter((row) => row.warning_status === "below" || row.warning_status === "above");
  return {
    field,
    trends,
    warnings,
    stats: {
      points: trends.length,
      numeric_points: numericValues.length,
      warning_count: warnings.length,
      latest_status: numericRows[numericRows.length - 1]?.warning_status || "no-data",
      min_reading: numericValues.length ? Math.min(...numericValues) : null,
      max_reading: numericValues.length ? Math.max(...numericValues) : null,
      avg_reading: numericValues.length ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length : null,
      threshold_min: safeMin,
      threshold_max: safeMax,
    },
  };
}

function variableToneClass(label = "") {
  const name = String(label).toLowerCase();
  if (name.includes("temp")) return "tone-temperature";
  if (name.includes("status")) return "tone-status";
  if (name.includes("mode")) return "tone-mode";
  if (name.includes("image") || name.includes("photo")) return "tone-image";
  if (name.includes("parameter")) return "tone-parameter";
  return "tone-default";
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



function ImageScanModal({ field, machine, onClose, onValue }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState("Starting camera...");
  const [busy, setBusy] = useState(false);
  const [brightnessBias, setBrightnessBias] = useState(-35);
  const [autoEnhance, setAutoEnhance] = useState(true);
  const [cropGuideOnly, setCropGuideOnly] = useState(true);
  const [cameraControlStatus, setCameraControlStatus] = useState("");

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  function clampValue(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mapRange(value, inMin, inMax, outMin, outMax) {
    if (inMax === inMin) return outMin;
    const ratio = (value - inMin) / (inMax - inMin);
    return outMin + ratio * (outMax - outMin);
  }

  async function applyCameraBrightness(stream, bias = brightnessBias) {
    const track = stream?.getVideoTracks?.()[0];
    if (!track?.getCapabilities || !track?.applyConstraints) {
      setCameraControlStatus("Using software brightness correction.");
      return;
    }

    try {
      const capabilities = track.getCapabilities();
      const advanced = {};

      if (Array.isArray(capabilities.exposureMode) && capabilities.exposureMode.includes("manual")) {
        advanced.exposureMode = "manual";
      }

      if (capabilities.exposureCompensation) {
        const min = Number(capabilities.exposureCompensation.min ?? -2);
        const max = Number(capabilities.exposureCompensation.max ?? 2);
        const mapped = mapRange(Number(bias), -80, 30, min, max);
        advanced.exposureCompensation = clampValue(mapped, min, max);
      }

      if (capabilities.brightness) {
        const min = Number(capabilities.brightness.min ?? 0);
        const max = Number(capabilities.brightness.max ?? 100);
        const mapped = mapRange(Number(bias), -80, 30, min, max);
        advanced.brightness = clampValue(mapped, min, max);
      }

      if (!Object.keys(advanced).length) {
        setCameraControlStatus("Using software brightness correction.");
        return;
      }

      await track.applyConstraints({ advanced: [advanced] });
      setCameraControlStatus("Camera exposure adjusted when supported.");
    } catch {
      setCameraControlStatus("Using software brightness correction.");
    }
  }

  async function startCamera() {
    const help = getCameraHelp();
    if (help) return setStatus(help);
    if (!navigator.mediaDevices?.getUserMedia) return setStatus("Camera is not available.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          exposureMode: { ideal: "manual" },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      await applyCameraBrightness(stream, brightnessBias);
      setStatus("Front camera ready. Lower brightness if the target looks white.");
    } catch (error) {
      setStatus(error.name === "NotAllowedError" ? "Camera permission was blocked." : error.message || "Could not start camera.");
    }
  }

  function autoEnhanceCanvas(context, width, height) {
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;
    let totalLuma = 0;
    const pixelCount = Math.max(1, data.length / 4);

    for (let index = 0; index < data.length; index += 4) {
      totalLuma += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    }

    const avgLuma = totalLuma / pixelCount;
    let multiplier = 1;
    let contrast = 1.12;

    if (avgLuma > 225) {
      multiplier = 0.42;
      contrast = 1.42;
    } else if (avgLuma > 205) {
      multiplier = 0.55;
      contrast = 1.36;
    } else if (avgLuma > 180) {
      multiplier = 0.72;
      contrast = 1.25;
    } else if (avgLuma < 70) {
      multiplier = 1.22;
      contrast = 1.08;
    }

    for (let index = 0; index < data.length; index += 4) {
      data[index] = clampValue((data[index] * multiplier - 128) * contrast + 128, 0, 255);
      data[index + 1] = clampValue((data[index + 1] * multiplier - 128) * contrast + 128, 0, 255);
      data[index + 2] = clampValue((data[index + 2] * multiplier - 128) * contrast + 128, 0, 255);
    }

    context.putImageData(imageData, 0, 0);
    return avgLuma;
  }

  function captureImage() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) throw new Error("Camera is not ready yet.");

    const source = cropGuideOnly
      ? {
          x: Math.round(video.videoWidth * 0.12),
          y: Math.round(video.videoHeight * 0.18),
          width: Math.round(video.videoWidth * 0.76),
          height: Math.round(video.videoHeight * 0.56),
        }
      : { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight };

    const maxWidth = 1280;
    const scale = Math.min(maxWidth / source.width, 1);
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    const brightnessFactor = clampValue(1 + Number(brightnessBias) / 100, 0.18, 1.35);
    context.filter = `brightness(${brightnessFactor}) contrast(1.18) saturate(0.92)`;
    context.drawImage(video, source.x, source.y, source.width, source.height, 0, 0, width, height);
    context.filter = "none";

    if (autoEnhance) autoEnhanceCanvas(context, width, height);
    return canvas.toDataURL("image/jpeg", 0.92);
  }

  async function handleScan() {
    try {
      setBusy(true);
      setStatus("Capturing image with brightness correction...");
      const imageDataUrl = captureImage();
      setStatus("Sending to AI workstation...");
      const data = await fetchJson("/api/ai/image-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl,
          target: field?.aiTarget || field?.label || "target",
          fieldLabel: field?.label || "Image field",
          machineName: machine?.machine_name || "",
        }),
      });
      const extractedValue = data.value ?? data.weight ?? data.reading ?? "";
      if (extractedValue === "" || extractedValue === null || extractedValue === undefined) {
        setStatus(`AI could not find a readable value for "${field?.aiTarget || field?.label || "target"}". Try darker brightness or move closer.`);
        return;
      }
      onValue(String(extractedValue));
      stopCamera();
      onClose();
    } catch (error) {
      setStatus(error.message || "AI scan failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    startCamera();
    return stopCamera;
  }, []);

  useEffect(() => {
    if (streamRef.current) applyCameraBrightness(streamRef.current, brightnessBias);
  }, [brightnessBias]);

  const videoBrightness = clampValue(1 + Number(brightnessBias) / 100, 0.18, 1.35);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="camera-modal image-scan-modal glass-card">
        <div className="modal-header">
          <div>
            <p className="eyebrow">AI Image Scanner</p>
            <h2>Scan {field?.label || "Image Field"}</h2>
            <p>Target: <strong>{field?.aiTarget || field?.label || "target"}</strong>. The AI will extract the value beside it.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={busy}>×</button>
        </div>
        <div className="camera-frame scan-camera-frame">
          <video ref={videoRef} autoPlay playsInline muted style={{ filter: `brightness(${videoBrightness}) contrast(1.18) saturate(0.92)` }} />
          <div className="scan-guide-box"><span>{cropGuideOnly ? "Only this box will be scanned" : "Keep target + value here"}</span></div>
        </div>
        <div className="scan-controls">
          <label className="scan-range-label">
            <span className="label-text">Camera brightness</span>
            <input className="scan-range" type="range" min="-80" max="30" step="5" value={brightnessBias} onChange={(event) => setBrightnessBias(Number(event.target.value))} disabled={busy} />
            <strong>{brightnessBias}%</strong>
          </label>
          <div className="scan-control-row">
            <button className="secondary-button small" type="button" onClick={() => setBrightnessBias(-65)} disabled={busy}>Darker</button>
            <button className="secondary-button small" type="button" onClick={() => setBrightnessBias(-35)} disabled={busy}>Auto</button>
            <button className="secondary-button small" type="button" onClick={() => setBrightnessBias(0)} disabled={busy}>Normal</button>
          </div>
          <div className="scan-toggle-row">
            <label className="mini-check"><input type="checkbox" checked={autoEnhance} onChange={(event) => setAutoEnhance(event.target.checked)} disabled={busy} /> Auto enhance scan</label>
            <label className="mini-check"><input type="checkbox" checked={cropGuideOnly} onChange={(event) => setCropGuideOnly(event.target.checked)} disabled={busy} /> Scan guide box only</label>
          </div>
          {cameraControlStatus && <p className="scan-preview-note">{cameraControlStatus}</p>}
        </div>
        <p className="camera-status">{status}</p>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" onClick={handleScan} disabled={busy}>{busy ? "Scanning..." : "Scan Image"}</button>
        </div>
      </section>
    </div>
  );
}

function RecordList({ records, compact = false, machines = [] }) {
  if (!records?.length) return <p className="empty-state">No submissions yet.</p>;

  function machineForRecord(record) {
    const recordMachineId = record.machine_config_id === null || record.machine_config_id === undefined ? "" : String(record.machine_config_id);
    const recordMachineName = String(record.machine_name || "").trim().toLowerCase();
    return machines.find((machine) => String(machine.id) === recordMachineId) || machines.find((machine) => String(machine.machine_name || "").trim().toLowerCase() === recordMachineName) || null;
  }

  const columns = [];
  const seen = new Set();
  for (const machine of machines) {
    for (const field of normalizeFields(machine.fields)) {
      const label = visibleVariableName(field, machine.machine_name);
      const key = slugText(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      columns.push({ key, label, type: field.type });
    }
  }
  if (!columns.length) {
    for (const record of records) {
      const responseFields = record.response_fields && typeof record.response_fields === "object" ? record.response_fields : {};
      for (const keyName of Object.keys(responseFields)) {
        const key = slugText(keyName);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        columns.push({ key, label: keyName, type: "text" });
      }
    }
  }

  function valueForColumn(record, column) {
    const machine = machineForRecord(record);
    const field = normalizeFields(machine?.fields).find((item) => slugText(visibleVariableName(item, record.machine_name)) === column.key);
    if (field) {
      const value = valueFromRecordField(record, field);
      if (field.type === "image") return value ? "Image" : "—";
      return value === null || value === undefined || value === "" ? "—" : String(value);
    }
    const responseFields = record.response_fields && typeof record.response_fields === "object" ? record.response_fields : {};
    const directKey = Object.keys(responseFields).find((keyName) => slugText(keyName) === column.key);
    const value = directKey ? responseFields[directKey] : "";
    return value === null || value === undefined || value === "" ? "—" : String(value);
  }

  return (
    <div className="table-wrap">
      <table className={compact ? "compact-table" : ""}>
        <thead>
          <tr>
            <th>Machine</th>
            {columns.map((column) => <th key={column.key} className={`logs-variable-head ${variableToneClass(column.label)}`}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td data-label="Machine">{record.machine_name}</td>
              {columns.map((column) => <td key={`${record.id}-${column.key}`} data-label={column.label}><span className={`logs-variable-value ${variableToneClass(column.label)}`}>{valueForColumn(record, column)}</span></td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mobile-record-list">
        {records.map((record) => (
          <article className="mobile-log-card" key={`mobile-${record.id}`}>
            <div className="mobile-log-top"><strong>{record.machine_name}</strong><span>{formatDateTime(record.record_timestamp)}</span></div>
            <div className="mobile-log-grid">
              {columns.map((column) => <span key={`${record.id}-mobile-${column.key}`}><b>{column.label}</b>{valueForColumn(record, column)}</span>)}
            </div>
          </article>
        ))}
      </div>
    </div>
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
  const field = fields.find((item) => String(item.id) === String(callout.valueKey));
  const isNumericField = field?.type === "number";
  const unit = isNumericField ? inferMetricUnit(callout.title, callout.valueKey) : "";
  const thresholds = getMetricThresholds(selectedMachine, fields, callout.valueKey, callout.title);
  const status = isNumericField ? metricStatus(rawValue, thresholds.min, thresholds.max) : "normal";
  return {
    ...callout,
    rawValue,
    value: compactMetricValue(rawValue),
    unit,
    range: isNumericField ? rangeText(thresholds.min, thresholds.max, unit) : "",
    status,
  };
}

function summaryKeyForField(field) {
  if (!field) return "";
  return field.mapsTo && field.mapsTo !== "custom" ? field.mapsTo : field.id;
}

function buildFactorySummaryRows({ selectedMachine, latest, fields, summary, statusText, warningCount }) {
  const rows = [
    { type: "row", label: "Status", value: statusText, tone: warningCount ? "warn" : latest ? "ok" : "idle" },
    {
      type: "row",
      label: "Latest Record:",
      value: latest
        ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }).format(new Date(latest.record_timestamp))
        : "—",
    },
    { type: "row", label: "Operator:", value: latest?.operator_name || "—" },
    { type: "divider", id: "top-divider" },
  ];

  for (const field of fields) {
    const key = summaryKeyForField(field);
    if (!key) continue;
    rows.push({ type: "row", label: field.label, value: valueFromRecord(latest, key, summary) });
  }

  rows.push({ type: "divider", id: "input-divider" });
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


function getMachineReadingMeta(machine, fieldOverride = null) {
  const fields = normalizeFields(machine?.fields);
  const readingField =
    fieldOverride ||
    fields.find((field) => field.type === "number") ||
    fields.find((field) => field.mapsTo === "reading_value") ||
    fields.find((field) => field.id === "reading_value");

  return {
    label: readingField?.label || "Numeric Value",
    unit: readingField?.unit || readingField?.suffix || readingField?.measurementUnit || "",
  };
}

function formatTrendTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function trendMachineState(status) {
  if (status === "normal") return "Running";
  if (status === "below" || status === "above") return "Warning";
  return "No Data";
}

function formatRangeText(minimum, maximum) {
  const hasMin = minimum !== null && minimum !== undefined && minimum !== "" && Number.isFinite(Number(minimum));
  const hasMax = maximum !== null && maximum !== undefined && maximum !== "" && Number.isFinite(Number(maximum));
  if (!hasMin && !hasMax) return "— — —";
  return `${hasMin ? formatNumber(minimum) : "—"} – ${hasMax ? formatNumber(maximum) : "—"}`;
}

function TrendOverviewChart({ trends = [], thresholdMin, thresholdMax }) {
  const points = trends
    .map((item) => ({ ...item, reading: Number(item.reading_value) }))
    .filter((item) => Number.isFinite(item.reading));

  if (points.length < 2) {
    return <div className="trend-overview-empty">Need at least 2 readings to draw a trend.</div>;
  }

  const values = points.map((item) => item.reading);
  const thresholds = [thresholdMin, thresholdMax].map(Number).filter(Number.isFinite);
  const min = Math.min(...values, ...(thresholds.length ? thresholds : values));
  const max = Math.max(...values, ...(thresholds.length ? thresholds : values));
  const range = max === min ? 1 : max - min;
  const width = 100;
  const height = 60;
  const chartTop = 5;
  const chartBottom = height - 6;

  const coordinates = points.map((item, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = chartBottom - ((item.reading - min) / range) * (chartBottom - chartTop);
    return { x, y, item };
  });

  const path = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const yForThreshold = (value) => chartBottom - ((Number(value) - min) / range) * (chartBottom - chartTop);
  const timeMarks = [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]];

  return (
    <div className="trend-overview-chart-wrap">
      <svg className="trend-overview-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="Machine trend overview chart">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = chartTop + (chartBottom - chartTop) * ratio;
          return <line key={ratio} className="trend-overview-gridline" x1="0" y1={y} x2="100" y2={y} />;
        })}
        {Number.isFinite(Number(thresholdMax)) && <line className="trend-overview-threshold high" x1="0" x2="100" y1={yForThreshold(thresholdMax)} y2={yForThreshold(thresholdMax)} />}
        {Number.isFinite(Number(thresholdMin)) && <line className="trend-overview-threshold low" x1="0" x2="100" y1={yForThreshold(thresholdMin)} y2={yForThreshold(thresholdMin)} />}
        <path className="trend-overview-line" d={path} />
      </svg>
      <div className="trend-overview-axis y"><span>{formatNumber(max)}</span><span>{formatNumber((max + min) / 2)}</span><span>{formatNumber(min)}</span></div>
      <div className="trend-overview-axis x">{timeMarks.map((point, index) => <span key={`${point.id || index}-${index}`}>{formatTrendTime(point.record_timestamp)}</span>)}</div>
    </div>
  );
}


function TrendMultiMachineChart({ seriesItems = [] }) {
  const prepared = seriesItems.map((series, seriesIndex) => {
    const points = (series.data?.trends || [])
      .map((item, pointIndex) => ({
        ...item,
        reading: Number(item.reading_value),
        time: new Date(item.record_timestamp).getTime(),
        pointIndex,
      }))
      .filter((item) => Number.isFinite(item.reading));
    return { ...series, seriesIndex, points };
  }).filter((series) => series.points.length);

  const allPoints = prepared.flatMap((series) => series.points);
  if (allPoints.length < 2 || !prepared.some((series) => series.points.length >= 2)) {
    return <div className="trend-overview-empty">Select machines with at least 2 numeric readings to draw the trend.</div>;
  }

  const values = allPoints.map((point) => point.reading);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max === min ? 1 : max - min;
  const width = 100;
  const height = 60;
  const chartTop = 5;
  const chartBottom = height - 6;
  const finiteTimes = allPoints.map((point) => point.time).filter(Number.isFinite);
  const minTime = finiteTimes.length ? Math.min(...finiteTimes) : 0;
  const maxTime = finiteTimes.length ? Math.max(...finiteTimes) : minTime;
  const timeRange = maxTime === minTime ? 1 : maxTime - minTime;

  function xForPoint(point, points) {
    if (Number.isFinite(point.time) && maxTime !== minTime) return ((point.time - minTime) / timeRange) * width;
    return points.length <= 1 ? width / 2 : (point.pointIndex / (points.length - 1)) * width;
  }

  function yForValue(value) {
    return chartBottom - ((value - min) / range) * (chartBottom - chartTop);
  }

  return (
    <div className="trend-overview-chart-wrap trend-multi-machine-chart-wrap">
      <svg className="trend-overview-chart trend-multi-machine-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="Selected machine trend comparison chart">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = chartTop + (chartBottom - chartTop) * ratio;
          return <line key={ratio} className="trend-overview-gridline" x1="0" y1={y} x2="100" y2={y} />;
        })}
        {prepared.map((series) => {
          if (series.points.length < 2) return null;
          const path = series.points.map((point, index) => {
            const x = xForPoint(point, series.points);
            const y = yForValue(point.reading);
            return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
          }).join(" ");
          return <path key={series.id} className={`trend-series-line series-${series.seriesIndex % 8}`} d={path} />;
        })}
      </svg>
      <div className="trend-overview-axis y"><span>{formatNumber(max)}</span><span>{formatNumber((max + min) / 2)}</span><span>{formatNumber(min)}</span></div>
      <div className="trend-overview-axis x"><span>{finiteTimes.length ? formatTrendTime(minTime) : "Start"}</span><span>{finiteTimes.length ? formatTrendTime(minTime + timeRange / 2) : "Middle"}</span><span>{finiteTimes.length ? formatTrendTime(maxTime) : "End"}</span></div>
    </div>
  );
}

function TrendSparkline({ trends = [], status = "normal" }) {
  const points = trends
    .map((item) => Number(item.reading_value))
    .filter((value) => Number.isFinite(value));

  if (points.length < 2) {
    return <div className="trend-tile-empty-line" aria-hidden="true" />;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max === min ? 1 : max - min;
  const width = 100;
  const height = 28;
  const path = points
    .map((value, index) => {
      const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 6) - 3;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg className={`trend-tile-sparkline ${trendStatusClass(status)}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function TrendProgressRing({ percent = 0 }) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (safePercent / 100) * circumference;

  return (
    <div className="trend-progress-ring" aria-label={`${Math.round(safePercent)} percent of target`}>
      <svg viewBox="0 0 120 120">
        <circle className="ring-track" cx="60" cy="60" r={radius} />
        <circle className="ring-progress" cx="60" cy="60" r={radius} strokeDasharray={circumference} strokeDashoffset={dashOffset} />
      </svg>
      <div>
        <strong>{Math.round(safePercent)}%</strong>
        <span>of target</span>
      </div>
    </div>
  );
}

function TrendMachineTile({ machine, miniData, isSelected, onSelect }) {
  const miniStats = miniData?.stats || {};
  const miniTrends = miniData?.trends || [];
  const latestPoint = miniTrends[miniTrends.length - 1] || null;
  const latestStatus = miniStats.latest_status || latestPoint?.warning_status || "no-data";
  const readingMeta = getMachineReadingMeta(machine, miniData?.field);
  const { thresholdMin, thresholdMax } = getMachineReadingThresholds(machine);
  const latestReading = latestPoint?.reading_value ?? miniStats.avg_reading;
  const hasImage = Boolean(machine?.image_data_url);

  return (
    <button type="button" className={`trend-machine-tile ${isSelected ? "active" : ""}`} onClick={onSelect}>
      <div className="trend-machine-thumb" aria-hidden="true">
        {hasImage && <img src={machine.image_data_url} alt="" />}
      </div>
      <div className="trend-machine-info">
        <div className="trend-machine-tile-head">
          <div>
            <h3>{machine.machine_name}</h3>
            <p>{readingMeta.label}</p>
          </div>
          <span className={`trend-machine-status ${trendStatusClass(latestStatus)}`}>{trendMachineState(latestStatus)}</span>
        </div>
        <div className="trend-machine-value-row">
          <div>
            <strong>{formatNumber(latestReading)}</strong>
            <small>{readingMeta.unit || "value"}</small>
          </div>
          <TrendSparkline trends={miniTrends} status={latestStatus} />
        </div>
        <div className="trend-machine-meta-row">
          <span><b>Target:</b> {thresholdMax !== null ? formatNumber(thresholdMax) : "—"}</span>
          <span><b>Range:</b> {formatRangeText(thresholdMin, thresholdMax)}</span>
        </div>
      </div>
    </button>
  );
}



/* Shared top navigation - every page uses this exact component. */
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function FactoryTopNav({
  activePage = "machine",
  user = null,
  setPage = null,
  onLogout = null,
  standalone = false,
  selectedDate,
  onDateChange,
  warningCount = 0,
}) {
  const [localDate, setLocalDate] = useState(todayKey());
  const dateValue = selectedDate ?? localDate;

  function setDate(value) {
    if (onDateChange) onDateChange(value);
    else setLocalDate(value);
  }


  const isAdmin = isAdminUser(user);

  function go(target) {
    if (!setPage) return;
    const resolved = target === "register" ? "adminRegister" : target;
    if (!isAdmin && ["adminRegister", "system", "logs"].includes(resolved)) {
      setPage("record");
      return;
    }
    setPage(resolved);
  }

  const navItems = isAdmin
    ? [
      { id: "machine", label: "Machines" },
      { id: "trends", label: "Trends" },
      { id: "system", label: "System" },
      { id: "register", label: "Register" },
      { id: "logs", label: "Logs" },
    ]
    : [
      { id: "record", label: "Submit" },
      { id: "machine", label: "Machines" },
      { id: "trends", label: "Trends" },
    ];

  const initials = userDisplayName(user)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "AD";

  return (
    <header className="factory-topbar shared-factory-topbar">
      <button className="factory-brand confirmation-brand" type="button" onClick={() => standalone ? setPage?.("auth") : go("machine")}>
        <span className="confirmation-mark">✓</span>
        <strong>Confirmation</strong>
      </button>

      <nav className="factory-nav-tabs" aria-label="Main navigation">
        {navItems.map((item) => (
          <button key={item.id} className={activePage === item.id ? "active" : ""} type="button" onClick={() => go(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="factory-top-actions factory-top-actions-no-calendar">
        {isAdmin && (
          <button className="factory-bell notification-bell" type="button" onClick={() => go("logs")} aria-label="Notifications">
            <span className="factory-bell-count">{warningCount || 0}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 17H9m9-1.5c-.9-.95-1.35-2.2-1.35-3.75V9.5a4.65 4.65 0 0 0-9.3 0v2.25c0 1.55-.45 2.8-1.35 3.75h12ZM13.45 19.15a1.7 1.7 0 0 1-2.9 0" />
            </svg>
          </button>
        )}
        {standalone ? (
          <button className="factory-user-chip" type="button" onClick={() => setPage?.("auth")}>Back</button>
        ) : (
          <button className="factory-user-chip" type="button" onClick={onLogout}>{initials}</button>
        )}
      </div>
    </header>
  );
}


/* MachinesPage.jsx */
function MachinesPage({ user = null, setPage = null, onLogout = null, standalone = false }) {
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
  const hasMachineImage = Boolean(selectedMachine?.image_data_url);
  const machineImageMap = useFittedImageCanvas(selectedMachine?.image_data_url || "", 16);
  const visibleMetrics = hasMachineImage ? metrics : [];

  function go(target) {
    if (target === "overview") return;
    if (!setPage) return;
    if (target === "alarms" || target === "reports") return setPage("logs");
    if (target === "maintenance") return setPage(isAdmin ? "system" : "record");
    setPage(target);
  }

  return (
    <main className="factory-os-page">
      <FactoryTopNav activePage="machine" user={user} setPage={setPage} onLogout={onLogout} standalone={standalone} selectedDate={selectedDate} onDateChange={setSelectedDate} warningCount={warningCount} />

      <section className="factory-workspace">
        <div className="factory-toolbar-row factory-toolbar-compact">
          <div className="factory-machine-select-group factory-machine-control-compact factory-area-machine-group">
            <select className="factory-area-inline-select" value={selectedArea} onChange={(event) => setSelectedArea(event.target.value)} aria-label="Select area">
              {siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}
            </select>
            <select className="factory-machine-picker" value={selectedMachineId} onChange={(event) => setSelectedMachineId(event.target.value)} disabled={!machines.length} aria-label="Select machine">
              {!machines.length && <option value="">No machines</option>}
              {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.machine_name}</option>)}
            </select>
            <button className="factory-slim-refresh" type="button" onClick={() => loadDashboard(selectedMachineId, selectedDate)} disabled={loading || !selectedMachineId}>⟳ Refresh</button>
          </div>
        </div>

        <section className="factory-main-card">
          <aside className="factory-summary-panel factory-summary-panel-compact">
            <div className="factory-panel-head">
              <h2>Machine Summary</h2>
            </div>
            <div className="factory-summary-list factory-summary-list-soft">
              {latestRows.map((row) => (
                row.type === "divider" ? (
                  <div key={row.id} className="factory-summary-divider" aria-hidden="true" />
                ) : (
                  <div key={row.label} className={row.tone ? `tone-${row.tone}` : ""}>
                    <span>{row.label}</span>
                    {row.label === "Status" ? <strong className="factory-status-badge">{row.value}<i /></strong> : <strong>{row.value}</strong>}
                  </div>
                )
              ))}
            </div>
            <div className="factory-alarm-box factory-alarm-box-compact">
              <span>△</span>
              <div><strong>Active Alarms</strong><small>Unacknowledged</small></div>
              <b>{warningCount}</b>
            </div>

          </aside>

          <section className="factory-machine-stage-card">
            <div ref={machineImageMap.stageRef} className="factory-machine-stage">
              <div className={hasMachineImage ? "factory-machine-art" : "factory-machine-art factory-machine-art-empty"}>
                {hasMachineImage && <img src={selectedMachine.image_data_url} alt={selectedMachine.machine_name} onLoad={machineImageMap.handleImageLoad} />}
                <svg className="factory-line-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {visibleMetrics.map((metric) => {
                    const { point, card } = calloutLine(metric);
                    return <line key={`factory-line-${metric.id}`} x1={card.x} y1={card.y} x2={point.x} y2={point.y} />;
                  })}
                </svg>
                {visibleMetrics.map((metric) => {
                  const { point, card } = calloutLine(metric);
                  return (
                    <div key={metric.id}>
                      <span className={metric.status === "warning" ? "factory-target-dot warning" : "factory-target-dot"} style={{ left: `${point.x}%`, top: `${point.y}%` }} />
                      <article className={metric.status === "warning" ? "factory-callout-card warning" : "factory-callout-card"} style={{ left: `${card.x}%`, top: `${card.y}%` }}>
                        <div><span>{metric.title}</span><em>{metric.status === "warning" ? "♧" : "✓"}</em></div>
                        <strong>{metric.value}<small>{metric.unit}</small></strong>
                        {metric.range && <p>{metric.range}</p>}
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


/* TrendsPage.jsx */
function TrendsPage({ user = null, setPage = null, onLogout = null, standalone = false }) {
  const [machines, setMachines] = useState([]);
  const [selectedArea, setSelectedArea] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => recordDateKey(new Date()));
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [selectedMachineIds, setSelectedMachineIds] = useState([]);
  const [seriesTrendMap, setSeriesTrendMap] = useState({});
  const [machineTrendMap, setMachineTrendMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Select machines to draw trends.");
  const [trendLimit, setTrendLimit] = useState("80");

  async function loadMachines(site = selectedArea) {
    const query = site ? `?site=${encodeURIComponent(site)}` : "";
    const machineData = await fetchJson(`/api/machines${query}`);
    const machineList = machineData.machines || [];
    setMachines(machineList);

    const validIds = new Set(machineList.map((machine) => String(machine.id)));
    setSelectedMachineIds((current) => current.filter((id) => validIds.has(String(id))));
    setSelectedMachineId((current) => validIds.has(String(current)) ? current : String(machineList[0]?.id || ""));

    if (!machineList.length) {
      setMessage(site ? `No machines configured for ${site}` : "No machines configured yet.");
      setSeriesTrendMap({});
    }

    return machineList;
  }

  async function loadTrendForMachine(machineId, limit = trendLimit, machineList = machines) {
    if (!machineId) return { field: null, trends: [], warnings: [], stats: null };
    const machine = machineList.find((item) => String(item.id) === String(machineId)) || machines.find((item) => String(item.id) === String(machineId));
    const data = await fetchJson(`/api/records?machine_config_id=${encodeURIComponent(machineId)}&limit=${encodeURIComponent(limit)}`);
    return buildTrendDataFromRecords(machine, data.records || []);
  }

  async function loadSelectedSeries(machineIds = selectedMachineIds, machineList = machines) {
    if (!machineIds.length) {
      setSeriesTrendMap({});
      return {};
    }

    const entries = await Promise.all(machineIds.map(async (machineId) => {
      try {
        const data = await loadTrendForMachine(machineId, trendLimit, machineList);
        return [String(machineId), data];
      } catch {
        return [String(machineId), { field: null, trends: [], warnings: [], stats: null }];
      }
    }));

    const nextMap = Object.fromEntries(entries);
    setSeriesTrendMap(nextMap);
    return nextMap;
  }

  async function loadGridSummaries(machineList = machines) {
    if (!machineList.length) {
      setMachineTrendMap({});
      return;
    }

    const entries = await Promise.all(machineList.map(async (machine) => {
      try {
        const data = await fetchJson(`/api/records?machine_config_id=${encodeURIComponent(machine.id)}&limit=24`);
        return [String(machine.id), buildTrendDataFromRecords(machine, data.records || [])];
      } catch {
        return [String(machine.id), { field: null, trends: [], warnings: [], stats: null }];
      }
    }));

    setMachineTrendMap(Object.fromEntries(entries));
  }

  async function refreshAll() {
    try {
      setLoading(true);
      const machineList = await loadMachines(selectedArea);
      await Promise.all([loadGridSummaries(machineList), loadSelectedSeries(selectedMachineIds, machineList)]);
      setMessage(selectedMachineIds.length ? "Live trend comparison from the database." : "Select machines to draw trends.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleMachine(machineId) {
    const id = String(machineId);
    setSelectedMachineId(id);
    setSelectedMachineIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function addSelectedMachine() {
    if (!selectedMachineId) return;
    setSelectedMachineIds((current) => current.includes(String(selectedMachineId)) ? current : [...current, String(selectedMachineId)]);
  }

  function clearSelectedMachines() {
    setSelectedMachineIds([]);
    setSeriesTrendMap({});
    setMessage("Selection cleared. Select machines to draw trends.");
  }

  useEffect(() => {
    loadMachines(selectedArea)
      .then((machineList) => Promise.all([loadGridSummaries(machineList), loadSelectedSeries(selectedMachineIds, machineList)]))
      .catch((error) => setMessage(error.message));
  }, [selectedArea]);

  useEffect(() => {
    if (machines.length && selectedMachineIds.length) loadSelectedSeries(selectedMachineIds, machines).catch((error) => setMessage(error.message));
    if (!selectedMachineIds.length) setSeriesTrendMap({});
  }, [selectedMachineIds, trendLimit, machines.length]);

  const seriesItems = selectedMachineIds.map((machineId) => {
    const machine = machines.find((item) => String(item.id) === String(machineId));
    if (!machine) return null;
    const data = seriesTrendMap[String(machineId)] || { field: null, trends: [], warnings: [], stats: null };
    const latest = [...(data.trends || [])].reverse().find((item) => Number.isFinite(Number(item.reading_value))) || null;
    const stats = data.stats || {};
    const meta = getMachineReadingMeta(machine, data.field);
    return {
      id: String(machineId),
      machine,
      data,
      latest,
      stats,
      meta,
      currentValue: latest?.reading_value ?? stats.avg_reading,
    };
  }).filter(Boolean);

  const totalWarnings = seriesItems.reduce((sum, item) => sum + Number(item.stats?.warning_count || 0), 0);
  const isAdmin = userRole(user) === "admin";
  const visibleMachines = machines;

  function go(target) {
    if (target === "overview") return;
    if (!setPage) return;
    if (target === "alarms" || target === "reports") return setPage("logs");
    if (target === "maintenance") return setPage(isAdmin ? "system" : "record");
    setPage(target);
  }

  return (
    <main className="factory-os-page factory-trends-page">
      <FactoryTopNav activePage="trends" user={user} setPage={setPage} onLogout={onLogout} standalone={standalone} selectedDate={selectedDate} onDateChange={setSelectedDate} warningCount={totalWarnings} />

      <section className="factory-trends-workspace">
        <section className="factory-trends-overview-card">
          <div className="factory-trends-chart-panel">
            <div className="factory-trends-card-head">
              <div>
                <p className="eyebrow">Trend Comparison</p>
                <h2>{seriesItems.length ? `${seriesItems.length} selected machine${seriesItems.length > 1 ? "s" : ""}` : "Select machines to compare"}</h2>
                <p><span className="trend-legend-dot" />Overlay numeric machine measurements in one graph.</p>
              </div>
              <div className="factory-trends-actions">
                <select className="factory-area-inline-select" value={selectedArea} onChange={(event) => setSelectedArea(event.target.value)} aria-label="Select area">
                  <option value="">All</option>
                  {siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}
                </select>
                <select value={selectedMachineId} onChange={(event) => setSelectedMachineId(event.target.value)} disabled={loading || !machines.length} aria-label="Select machine">
                  {!machines.length && <option value="">No machines</option>}
                  {machines.map((machine) => (
                    <option key={machine.id} value={String(machine.id)}>{machine.machine_name}</option>
                  ))}
                </select>
                <button className="secondary-button" type="button" onClick={addSelectedMachine} disabled={loading || !selectedMachineId}>Add</button>
                <button type="button" onClick={refreshAll} disabled={loading}>{loading ? "Loading" : "Refresh"}</button>
              </div>
            </div>
            <TrendMultiMachineChart seriesItems={seriesItems} />
          </div>

          <aside className="factory-trends-stats-panel trends-compare-stats-panel">
            <div className="trend-side-header-row">
              <div>
                <span className="trend-side-label">Selected machines</span>
                <strong>{seriesItems.length}</strong>
              </div>
              <button className="ghost-button small" type="button" onClick={clearSelectedMachines} disabled={!seriesItems.length}>Clear</button>
            </div>

            <div className="trend-compare-series-list">
              {!seriesItems.length ? (
                <p className="empty-state">Click machine cards below or use Add above.</p>
              ) : seriesItems.map((item, index) => (
                <article key={item.id} className="trend-compare-series-card">
                  <div className="trend-compare-series-head">
                    <span className={`trend-series-swatch series-${index % 8}`} />
                    <div>
                      <strong>{item.machine.machine_name}</strong>
                      <small>{item.machine.site_name || "—"} • {item.meta.label || "Numeric"}</small>
                    </div>
                    <button className="ghost-button small" type="button" onClick={() => toggleMachine(item.id)}>×</button>
                  </div>
                  <div className="trend-compare-current-grid">
                    <article><span>Current</span><strong>{formatNumber(item.currentValue)}</strong></article>
                    <article><span>Average</span><strong>{formatNumber(item.stats.avg_reading)}</strong></article>
                  </div>
                </article>
              ))}
            </div>
          </aside>
        </section>

        <section className="factory-trends-machine-grid" aria-label="Configured machines">
          {!visibleMachines.length ? (
            <div className="empty-state">No machines configured for {selectedArea || "All"}.</div>
          ) : (
            visibleMachines.map((machine) => (
              <TrendMachineTile
                key={machine.id}
                machine={machine}
                miniData={machineTrendMap[String(machine.id)] || { trends: [], stats: null }}
                isSelected={selectedMachineIds.includes(String(machine.id))}
                onSelect={() => toggleMachine(String(machine.id))}
              />
            ))
          )}
        </section>

        <div className="factory-trends-footer">{message} {machines.length ? `• Showing ${visibleMachines.length} of ${machines.length} machines` : ""}</div>
      </section>
    </main>
  );
}


/* LogsPage.jsx */
function LogsPage({ user = null, setPage = null, onLogout = null, standalone = false }) {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [machines, setMachines] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ search: "", machine: "", site: "", date: "" });
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;
  const isAdmin = userRole(user) === "admin";

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
    setCurrentPage(1);
  }

  function clearFilters() {
    setFilters({ search: "", machine: "", site: "", date: "" });
    setCurrentPage(1);
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

  const selectedMachineOption = useMemo(() => machineOptions.find((machine) => machine.value === filters.machine), [machineOptions, filters.machine]);

  function machineForRecord(record) {
    const recordMachineId = record.machine_config_id === null || record.machine_config_id === undefined ? "" : String(record.machine_config_id);
    const recordMachineName = String(record.machine_name || "").trim().toLowerCase();
    return machines.find((machine) => String(machine.id) === recordMachineId) || machines.find((machine) => String(machine.machine_name || "").trim().toLowerCase() === recordMachineName) || null;
  }

  function fieldsForRecord(record) {
    const machine = machineForRecord(record);
    return machine ? normalizeFields(machine.fields) : [];
  }

  function valueForLogField(record, column) {
    const fields = fieldsForRecord(record);
    const field = fields.find((item) => slugText(visibleVariableName(item, record.machine_name)) === column.key);
    const value = valueFromRecordField(record, field);
    if (field?.type === "image") return value ? "Image" : "—";
    return value === null || value === undefined || value === "" ? "—" : String(value);
  }

  const logColumns = useMemo(() => {
    const columns = [];
    const seen = new Set();
    for (const machine of machines) {
      for (const field of normalizeFields(machine.fields)) {
        const label = visibleVariableName(field, machine.machine_name);
        const key = slugText(label);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        columns.push({ key, label, type: field.type });
      }
    }
    if (!columns.length) {
      for (const record of records) {
        const fields = record.response_fields && typeof record.response_fields === "object" ? Object.keys(record.response_fields) : [];
        for (const keyName of fields) {
          const key = slugText(keyName);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          columns.push({ key, label: keyName, type: "text" });
        }
      }
    }
    return columns;
  }, [machines, records]);

  const filteredRecords = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return records.filter((record) => {
      const siteMatch = !filters.site || record.site_name === filters.site;
      const dateMatch = !filters.date || recordDateKey(record.record_timestamp) === filters.date;
      const machineMatch = !filters.machine || (() => {
        if (!selectedMachineOption) return true;
        const recordMachineId = record.machine_config_id === null || record.machine_config_id === undefined ? "" : String(record.machine_config_id);
        const recordMachineName = String(record.machine_name || "").trim().toLowerCase();
        return ((selectedMachineOption.id && recordMachineId === selectedMachineOption.id) || (selectedMachineOption.name && recordMachineName === selectedMachineOption.name.trim().toLowerCase()));
      })();
      const dynamicValues = logColumns.map((column) => valueForLogField(record, column));
      const haystack = [record.operator_name, record.site_name, record.machine_name, record.reading_value, JSON.stringify(record.response_fields || {}), ...dynamicValues].join(" ").toLowerCase();
      return machineMatch && siteMatch && dateMatch && (!search || haystack.includes(search));
    });
  }, [records, filters, selectedMachineOption, machines, logColumns]);

  const filteredSummary = useMemo(() => summarizeRecords(filteredRecords), [filteredRecords]);
  const hasFilters = Object.values(filters).some(Boolean);
  const activeSummary = hasFilters ? filteredSummary : summary;
  const selectedArea = filters.site || siteOptions[0];
  const bellCount = 0;
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const paginatedRecords = filteredRecords.slice(pageStart, pageStart + pageSize);
  const pageEnd = Math.min(filteredRecords.length, pageStart + pageSize);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => { loadLogs(); }, []);

  function initials(name = "User") {
    return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
  }

  function go(target) {
    if (target === "overview") return;
    if (!setPage) return;
    if (target === "alarms" || target === "reports") return setPage("logs");
    if (target === "register") return setPage("adminRegister");
    if (target === "logout") return onLogout?.();
    setPage(target);
  }

  function statCards() {
    return [
      { key: "total", title: "Total", value: activeSummary?.total_submissions ?? 0, subtitle: "All submissions", icon: "list", tone: "blue", site: "" },
      { key: "sav", title: "Savoury", value: activeSummary?.savoury_count ?? 0, subtitle: "Savoury submissions", icon: "bowl", tone: "purple", site: "Savoury" },
      { key: "dre", title: "Dressings", value: activeSummary?.dressings_count ?? 0, subtitle: "Dressings submissions", icon: "bottle", tone: "orange", site: "Dressings" },
    ];
  }

  function pageNumbers() {
    const pages = [];
    for (let page = 1; page <= totalPages; page += 1) {
      if (page === 1 || page === totalPages || Math.abs(page - safePage) <= 1) pages.push(page);
      else if (pages[pages.length - 1] !== "…") pages.push("…");
    }
    return pages;
  }

  function Icon({ name }) {
    if (name === "list") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h10M8 12h10M8 17h10M4 7h.01M4 12h.01M4 17h.01" /></svg>;
    if (name === "user") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" /></svg>;
    if (name === "bowl") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11h14a7 7 0 0 1-14 0Zm5-5c0 1 .5 1.5 1.5 2.5M14 6c0 1 .5 1.5 1.5 2.5" /></svg>;
    if (name === "bottle") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4h4m-3 0v3l-3 4v7a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-7l-3-4V4" /></svg>;
    if (name === "clipboard") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l1 2h2v14H6V6h2l1-2Zm0 5h6M9 13h6M9 17h4" /></svg>;
    if (name === "machine") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16v8H4zM7 8V5h10v3M7 16v3M17 16v3" /></svg>;
    if (name === "trend") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17V7m0 10h16M7 14l4-4 3 2 4-5" /></svg>;
    if (name === "settings") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm8 3.5-.9-.3a7.9 7.9 0 0 0-.5-1.2l.5-.8-1.7-1.7-.8.5c-.4-.2-.8-.4-1.2-.5L15 5h-6l-.3.9c-.4.1-.8.3-1.2.5l-.8-.5-1.7 1.7.5.8c-.2.4-.4.8-.5 1.2L4 12l.9.3c.1.4.3.8.5 1.2l-.5.8 1.7 1.7.8-.5c.4.2.8.4 1.2.5L9 19h6l.3-.9c.4-.1.8-.3 1.2-.5l.8.5 1.7-1.7-.5-.8c.2-.4.4-.8.5-1.2L20 12Z" /></svg>;
    if (name === "register") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 19a5 5 0 0 0-10 0m5-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 8v-6m-3 3h6" /></svg>;
    if (name === "logs") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h12v14H6zM9 9h6M9 13h6M9 17h4" /></svg>;
    if (name === "logout") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 17l5-5-5-5M20 12H9M12 19H5V5h7" /></svg>;
    return null;
  }

  return (
    <main className="factory-logs-page">
      <FactoryTopNav activePage="logs" user={user} setPage={setPage} onLogout={onLogout} standalone={standalone} selectedDate={filters.date} onDateChange={(value) => updateFilter("date", value)} warningCount={bellCount} />

      <section className="logs-dashboard-shell compact-logs-layout">
        <section className="logs-main-panel">
          <div className="logs-stats-row">
            {statCards().map((card) => (
              <button key={card.key} type="button" className={`logs-stat-card logs-stat-button tone-${card.tone} ${filters.site === card.site ? "active" : ""}`} onClick={() => updateFilter("site", card.site)}>
                <div className="logs-stat-icon"><Icon name={card.icon} /></div>
                <div>
                  <strong>{Number(card.value || 0).toLocaleString("en-US")}</strong>
                  <b>{card.title}</b>
                  <span>{card.subtitle}</span>
                </div>
              </button>
            ))}
          </div>

          <section className="logs-records-card">
            <div className="logs-records-head">
              <div><h1><Icon name="clipboard" />Submission Records</h1></div>
              <button className="logs-refresh-button" type="button" onClick={loadLogs} disabled={loading}>{loading ? "Loading..." : "Refresh"}</button>
            </div>

            <div className="logs-filters-grid">
              <label className="logs-search-input">
                <input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Search operator or user-entered values..." />
                <span>⌕</span>
              </label>
              <label>
                <span>Machine</span>
                <select value={filters.machine} onChange={(event) => updateFilter("machine", event.target.value)}>
                  <option value="">All Machines</option>
                  {machineOptions.map((machine) => <option key={machine.value} value={machine.value}>{machine.label}</option>)}
                </select>
              </label>
              <label>
                <span>Date</span>
                <input type="date" value={filters.date} onChange={(event) => updateFilter("date", event.target.value)} />
              </label>
            </div>

            <div className="logs-active-filters-row">
              <div className="logs-filter-chips">
                {filters.date && <button type="button" className="logs-filter-chip" onClick={() => updateFilter("date", "")}>Date: {filters.date}<i>×</i></button>}
                {filters.machine && selectedMachineOption && <button type="button" className="logs-filter-chip" onClick={() => updateFilter("machine", "")}>Machine: {selectedMachineOption.label}<i>×</i></button>}
                {filters.search && <button type="button" className="logs-filter-chip" onClick={() => updateFilter("search", "")}>Search: {filters.search}<i>×</i></button>}
                {!hasFilters && <span className="logs-filter-hint">No active filters</span>}
              </div>
              <button className="logs-clear-all" type="button" onClick={clearFilters} disabled={!hasFilters}>Clear All</button>
            </div>

            {message && <p className="message">{message}</p>}

            <div className="logs-table-wrap">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>When</th><th>Operator</th><th>Site</th><th>Machine</th>
                    {logColumns.map((column) => <th key={column.key} className={`logs-variable-head ${variableToneClass(column.label)}`}>{column.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {!paginatedRecords.length ? (
                    <tr><td colSpan={4 + logColumns.length} className="logs-empty-cell">No submissions found for the current filters.</td></tr>
                  ) : paginatedRecords.map((record) => (
                    <tr key={record.id}>
                      <td><div className="logs-when-cell"><span className="logs-cell-icon small">◷</span><span>{formatDateTime(record.record_timestamp)}</span></div></td>
                      <td><div className="logs-operator-cell"><span className="logs-avatar">{initials(record.operator_name)}</span><span>{record.operator_name || "—"}</span></div></td>
                      <td>{record.site_name || "—"}</td>
                      <td>{record.machine_name || "—"}</td>
                      {logColumns.map((column) => <td key={`${record.id}-${column.key}`}><span className={`logs-variable-value ${variableToneClass(column.label)}`}>{valueForLogField(record, column)}</span></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="logs-table-footer">
              <span>Showing {filteredRecords.length ? pageStart + 1 : 0} to {pageEnd} of {filteredRecords.length.toLocaleString("en-US")} records</span>
              <div className="logs-pagination">
                <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safePage <= 1}>‹</button>
                {pageNumbers().map((item, index) => item === "…" ? <span key={`ellipsis-${index}`} className="ellipsis">…</span> : <button key={item} type="button" className={item === safePage ? "active" : ""} onClick={() => setCurrentPage(item)}>{item}</button>)}
                <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safePage >= totalPages}>›</button>
                <span className="logs-page-size">{pageSize} / page</span>
              </div>
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}


/* RegisterPage.jsx */
function RegisterAdminPage({ adminUser = null, user = null, setPage = null, onLogout = null, standalone = false }) {
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
      const data = await fetchJson("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...userForm, imageDataUrl, registeredBy: userDisplayName(adminUser || user) }) });
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
    <>
      <FactoryTopNav activePage="register" user={adminUser || user} setPage={setPage} onLogout={onLogout} standalone={standalone} />
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
          <div className={deleteMode ? "user-list compact-users delete-mode" : "user-list compact-users"}>{!users.length && <p className="empty-state">No registered people yet.</p>}{users.map((user) => <article key={user.id} className={deleteMode ? "registered-person-row can-delete" : "registered-person-row"} onClick={() => deleteMode && deletingId !== user.id ? handleDeleteUser(user) : undefined} role={deleteMode ? "button" : undefined} tabIndex={deleteMode ? 0 : undefined}><div className="registered-person-main"><strong>{user.operator_name}</strong><span>{user.site_name}</span>{deletingId === user.id && <small>Deleting...</small>}</div></article>)}</div>
        </section>
      </section>
      {cameraOpen && <FaceCaptureModal title="Register Face" description="Capture this person's face for future login." onClose={() => setCameraOpen(false)} onCapture={async (image) => { setImageDataUrl(image); setCameraOpen(false); }} />}
      </main>
    </>
  );
}


/* SystemRegistrationPage.jsx */
function SystemRegistrationPage({ user = null, setPage = null, onLogout = null, standalone = false }) {
  const [machines, setMachines] = useState([]);
  const [form, setForm] = useState(emptyMachineForm);
  const [selectedCalloutId, setSelectedCalloutId] = useState("");
  const [markMode, setMarkMode] = useState(null);
  const [manageMode, setManageMode] = useState(null);
  const [selectedVariableId, setSelectedVariableId] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState("Autosave ready");
  const autosaveTimerRef = useRef(null);
  const skipAutosaveRef = useRef(true);
  const systemImageMap = useFittedImageCanvas(form.image_data_url, 18);

  function normalizeMachineForm(machine) {
    const fields = normalizeFields(machine?.fields).map((field) => ({
      ...field,
      label: stripMachinePrefixLabel(field.label, machine?.machine_name),
    }));
    const callouts = normalizeCallouts(machine?.callouts).map((callout) => {
      const field = fields.find((item) => String(item.id) === String(callout.valueKey));
      return field ? { ...callout, title: field.label } : callout;
    });

    return {
      ...emptyMachineForm,
      ...machine,
      details: machine?.details || "",
      fields,
      callouts,
      threshold_min: machine?.threshold_min ?? "",
      threshold_max: machine?.threshold_max ?? "",
    };
  }

  function applyFormWithoutAutosave(next) {
    skipAutosaveRef.current = true;
    setForm(next);
  }

  function resetForm() {
    applyFormWithoutAutosave({ ...emptyMachineForm, fields: [], callouts: [] });
    setSelectedCalloutId("");
    setMarkMode(null);
    setManageMode(null);
    setSelectedVariableId("");
    setMessage("New setup ready.");
    setAutosaveStatus("Enter a machine name to autosave");
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateField(index, key, value) {
    setForm((current) => {
      const oldField = current.fields[index];
      if (!oldField) return current;

      const nextFields = current.fields.map((field, i) => {
        if (i !== index) return field;
        if (key === "id") {
          const nextId = normalizeVariableKey(value, oldField.id || `variable_${index + 1}`);
          return { ...field, id: nextId };
        }
        return { ...field, [key]: value };
      });

      const nextField = nextFields[index];
      const nextCallouts = current.callouts.map((callout) => {
        if (String(callout.valueKey) !== String(oldField.id)) return callout;
        if (key === "id") return { ...callout, id: `callout-${nextField.id}`, valueKey: nextField.id };
        if (key === "label") return { ...callout, title: value || nextField.id };
        return callout;
      });

      if (key === "id") setSelectedVariableId(nextField.id);
      return { ...current, fields: nextFields, callouts: nextCallouts };
    });
  }

  function updateFieldType(index, value) {
    setForm((current) => ({
      ...current,
      fields: current.fields.map((field, i) => {
        if (i !== index) return field;
        const next = { ...field, type: value };
        if (value === "option" && !splitFieldOptions(next.options ?? next.optionsText).length) {
          next.options = ["Yes", "No"];
          next.optionsText = "Yes\nNo";
        }
        if (value !== "number") next.thresholdEnabled = false;
        return next;
      }),
    }));
  }

  function updateFieldOptions(index, value) {
    setForm((current) => ({
      ...current,
      fields: current.fields.map((field, i) => (
        i === index ? { ...field, optionsText: value, options: splitFieldOptions(value) } : field
      )),
    }));
  }

  function updateCallout(index, key, value) {
    setForm((current) => ({
      ...current,
      callouts: current.callouts.map((callout, i) => (i === index ? { ...callout, [key]: value } : callout)),
    }));
  }

  async function loadMachines(selectFirst = false) {
    const data = await fetchJson("/api/admin/machines");
    const machineList = data.machines || [];
    setMachines(machineList);
    if (selectFirst && machineList[0]) editMachine(machineList[0]);
    if (selectFirst && !machineList.length) resetForm();
    return machineList;
  }

  function editMachine(machine) {
    const next = normalizeMachineForm(machine);
    applyFormWithoutAutosave(next);
    setSelectedCalloutId(next.callouts[0]?.id || "");
    setMarkMode(null);
    setManageMode(null);
    setSelectedVariableId(next.fields[0]?.id || "");
    setMessage("");
    setAutosaveStatus("Saved");
  }

  async function persistMachine(sourceForm = form, { silent = false } = {}) {
    const cleanMachineName = String(sourceForm.machine_name || "").trim();
    if (!cleanMachineName) {
      if (!silent) setMessage("Machine name is required.");
      setAutosaveStatus("Enter a machine name to autosave");
      return null;
    }

    try {
      setSaving(true);
      if (silent) setAutosaveStatus("Saving...");
      const payload = { ...sourceForm, machine_name: cleanMachineName, details: "" };
      const data = await fetchJson("/api/admin/machines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (data.machine) {
        const next = normalizeMachineForm(data.machine);
        applyFormWithoutAutosave(next);
        setSelectedCalloutId((current) => next.callouts.find((item) => item.id === current)?.id || next.callouts[0]?.id || "");
        setMachines((current) => {
          const exists = current.some((item) => String(item.id) === String(next.id));
          if (exists) return current.map((item) => (String(item.id) === String(next.id) ? data.machine : item));
          return [data.machine, ...current];
        });
      }

      setAutosaveStatus("Saved");
      if (!silent) setMessage("Machine setup saved.");
      return data.machine || null;
    } catch (error) {
      setAutosaveStatus("Autosave failed");
      setMessage(error.message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setMessage("Preparing image and resizing it...");
      const compactImage = await imageFileToCompactDataUrl(file);
      updateForm("image_data_url", compactImage);
      setMessage("Image ready. Autosaving...");
    } catch (error) {
      setMessage(error.message);
    }
  }

  function beginMarking(calloutId, mode) {
    const callout = form.callouts.find((item) => item.id === calloutId);
    const field = form.fields.find((item) => String(item.id) === String(callout?.valueKey));
    setSelectedCalloutId(calloutId);
    if (field) setSelectedVariableId(field.id);
    setMarkMode(mode);
    setManageMode("variable");
    setMessage(mode === "card" ? `Place the ${field?.label || callout?.title || "variable"} card on the map.` : `Mark the machine point for ${field?.label || callout?.title || "this variable"}.`);
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
    setMessage(`${markMode === "card" ? "Card" : "Point"} marked for ${selectedName}. Autosaving...`);
  }

  async function handleSave(event) {
    event.preventDefault();
    await persistMachine(form, { silent: false });
  }

  async function handleDelete(machine) {
    if (!machine?.id) return;
    if (!window.confirm(`Delete ${machine.machine_name}?`)) return;
    try {
      await fetchJson(`/api/admin/machines/${machine.id}`, { method: "DELETE" });
      const machineList = await loadMachines();
      if (machineList[0]) editMachine(machineList[0]);
      else resetForm();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function handleMachineSelect(value) {
    if (!value) return resetForm();
    const machine = machines.find((item) => String(item.id) === String(value));
    if (machine) editMachine(machine);
  }

  function getCalloutForField(field) {
    if (!field || field.showOnPointMap === false) return null;
    return form.callouts.find((callout) => String(callout.valueKey) === String(field.id)) || null;
  }

  function handleFieldLabelChange(index, value) {
    setForm((current) => {
      const oldField = current.fields[index];
      if (!oldField) return current;
      const nextId = makeAutoFieldId(value, current.fields, oldField.id);
      const nextFields = current.fields.map((field, i) => i === index ? { ...field, label: value, id: nextId } : field);
      const nextCallouts = current.callouts.map((callout) => {
        if (String(callout.valueKey) !== String(oldField.id)) return callout;
        return { ...callout, id: `callout-${nextId}`, valueKey: nextId, title: value || nextId };
      });
      setSelectedVariableId(nextId);
      setSelectedCalloutId((currentId) => currentId === `callout-${oldField.id}` ? `callout-${nextId}` : currentId);
      return { ...current, fields: nextFields, callouts: nextCallouts };
    });
  }

  function toggleFieldPointMap(index, checked) {
    setForm((current) => {
      const field = current.fields[index];
      if (!field) return current;
      const nextFields = current.fields.map((item, i) => i === index ? { ...item, showOnPointMap: checked } : item);
      const hasCallout = current.callouts.some((callout) => String(callout.valueKey) === String(field.id));
      const nextCallouts = checked
        ? (hasCallout ? current.callouts : [...current.callouts, makeCalloutForField(field, index)])
        : current.callouts.filter((callout) => String(callout.valueKey) !== String(field.id));
      if (!checked) {
        setSelectedCalloutId("");
        setMarkMode(null);
      }
      return { ...current, fields: nextFields, callouts: nextCallouts };
    });
  }

  function openVariable(fieldId) {
    const field = form.fields.find((item) => String(item.id) === String(fieldId));
    if (!field) return;
    setSelectedVariableId(field.id);
    const existing = getCalloutForField(field);
    if (existing) {
      setSelectedCalloutId(existing.id);
    } else if (field.showOnPointMap !== false) {
      const next = makeCalloutForField(field, form.fields.findIndex((item) => item.id === field.id));
      setForm((current) => ({ ...current, callouts: [...current.callouts, next] }));
      setSelectedCalloutId(next.id);
    } else {
      setSelectedCalloutId("");
    }
    setManageMode("variable");
    setMarkMode(null);
  }

  function addVariable() {
    const label = `Variable ${form.fields.length + 1}`;
    const id = makeFieldIdFromLabel(label, form.fields);
    const field = { id, label, type: "text", options: [], optionsText: "", aiTarget: "", required: false, mapsTo: "custom", thresholdEnabled: false, threshold_min: "", threshold_max: "", showOnPointMap: true };
    const callout = makeCalloutForField(field, form.fields.length);
    setForm((current) => ({
      ...current,
      fields: [...current.fields, field],
      callouts: [...current.callouts, callout],
    }));
    setSelectedVariableId(field.id);
    setSelectedCalloutId(callout.id);
    setManageMode("variable");
    setMarkMode(null);
  }

  function ensureVariableCallout(field) {
    if (!field || field.showOnPointMap === false) return null;
    const existing = getCalloutForField(field);
    if (existing) return existing;
    const next = makeCalloutForField(field, form.fields.findIndex((item) => item.id === field.id));
    updateForm("callouts", [...form.callouts, next]);
    return next;
  }

  function removeVariable(fieldId) {
    const field = form.fields.find((item) => String(item.id) === String(fieldId));
    if (!field) return;
    setForm((current) => ({
      ...current,
      fields: current.fields.filter((item) => String(item.id) !== String(fieldId)),
      callouts: current.callouts.filter((callout) => String(callout.valueKey) !== String(fieldId)),
    }));
    setSelectedVariableId("");
    setSelectedCalloutId("");
    setMarkMode(null);
    setManageMode(null);
  }

  function addField() {
    addVariable();
  }

  function addCallout() {
    addVariable();
  }

  function previewCardMeta(callout) {
    const mappedField = form.fields.find((field) => String(field.id) === String(callout.valueKey));
    const title = mappedField ? visibleVariableName(mappedField, form.machine_name) : (callout.title || "Value");
    const isNumericField = mappedField?.type === "number";
    const min = isNumericField && mappedField?.thresholdEnabled ? mappedField.threshold_min : "";
    const max = isNumericField && mappedField?.thresholdEnabled ? mappedField.threshold_max : "";
    const detail = isNumericField ? (min || max ? `Range: ${min || "—"} – ${max || "—"}` : "Range: — — —") : "";
    return {
      title,
      value: "—",
      unit: "",
      detail,
      tone: isNumericField && mappedField?.thresholdEnabled ? "warning" : "success",
      icon: "",
    };
  }

  function renderVariableEditor() {
    const fieldIndex = form.fields.findIndex((field) => String(field.id) === String(selectedVariableId));
    const field = form.fields[fieldIndex];
    const callout = getCalloutForField(field);

    if (!field) {
      return (
        <div className="system-inline-editor variable-editor-empty">
          <div className="system-inline-editor-head">
            <button className="ghost-button small" type="button" onClick={() => setManageMode(null)}>← Back</button>
            <div><p className="eyebrow">Variable</p><h2>No variable selected</h2></div>
            <button className="secondary-button small" type="button" onClick={addVariable}>Add Variable</button>
          </div>
          <div className="empty-state">Pick a variable from the list or add a new one.</div>
        </div>
      );
    }

    const activeCallout = callout || makeCalloutForField(field, fieldIndex);

    function handleVariableIdChange(value) {
      updateField(fieldIndex, "id", value);
    }

    function handlePlace(mode) {
      const nextCallout = ensureVariableCallout(field) || activeCallout;
      setSelectedCalloutId(nextCallout.id);
      beginMarking(nextCallout.id, mode);
    }

    return (
      <div className="system-inline-editor variable-editor-panel">
        <div className="system-inline-editor-head">
          <button className="ghost-button small" type="button" onClick={() => { setManageMode(null); setMarkMode(null); }}>← Back</button>
          <div><p className="eyebrow">Variable Setup</p><h2>{field.label || field.id}</h2></div>
          <button className="ghost-button danger small" type="button" onClick={() => removeVariable(field.id)}>Remove</button>
        </div>

        <div className="variable-editor-body">
          <label>User label
            <input value={field.label} onChange={(event) => handleFieldLabelChange(fieldIndex, event.target.value)} placeholder="Status" />
          </label>

          <label>Input type
            <select value={field.type} onChange={(event) => updateFieldType(fieldIndex, event.target.value)}>
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="textarea">Paragraph</option>
              <option value="option">Option</option>
              <option value="image">Image</option>
            </select>
          </label>

          <div className="variable-switch-row">
            <label className="check-pill"><input type="checkbox" checked={Boolean(field.required)} onChange={(event) => updateField(fieldIndex, "required", event.target.checked)} /> Required</label>
            {field.type === "number" && <label className="check-pill"><input type="checkbox" checked={Boolean(field.thresholdEnabled)} onChange={(event) => updateField(fieldIndex, "thresholdEnabled", event.target.checked)} /> Limit</label>}
          </div>

          {field.type === "option" && (
            <label>Choices
              <textarea rows="4" value={field.optionsText ?? optionsToText(field.options)} onChange={(event) => updateFieldOptions(fieldIndex, event.target.value)} placeholder={"On\nOff\nAuto\nManual"} />
            </label>
          )}

          {field.type === "image" && (
            <label>Target / Targets
              <input value={field.aiTarget || ""} onChange={(event) => updateField(fieldIndex, "aiTarget", event.target.value)} placeholder="Target" />
            </label>
          )}

          {field.type === "number" && (
            <div className="variable-editor-two">
              <label>Min
                <input type="number" step="any" value={field.threshold_min ?? ""} onChange={(event) => updateField(fieldIndex, "threshold_min", event.target.value)} placeholder="Min" disabled={!field.thresholdEnabled} />
              </label>
              <label>Max
                <input type="number" step="any" value={field.threshold_max ?? ""} onChange={(event) => updateField(fieldIndex, "threshold_max", event.target.value)} placeholder="Max" disabled={!field.thresholdEnabled} />
              </label>
            </div>
          )}

          <label className="check-pill wide"><input type="checkbox" checked={field.showOnPointMap !== false} onChange={(event) => toggleFieldPointMap(fieldIndex, event.target.checked)} /> Show on point map</label>

          {field.showOnPointMap !== false && (
            <div className="variable-map-tools">
              <div>
                <strong>Point map</strong>
                <span>Place the value card anywhere, then mark the machine point.</span>
              </div>
              <div className="variable-map-buttons">
                <button className="secondary-button small" type="button" onClick={() => handlePlace("card")}>Place Card</button>
                <button className="secondary-button small" type="button" onClick={() => handlePlace("point")}>Mark Point</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }


  useEffect(() => {
    loadMachines(true).catch((error) => setMessage(error.message));
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

    if (!String(form.machine_name || "").trim()) {
      setAutosaveStatus("Enter a machine name to autosave");
      return;
    }

    setAutosaveStatus("Unsaved changes");
    autosaveTimerRef.current = setTimeout(() => {
      persistMachine(form, { silent: true });
    }, 900);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [form]);


  return (
    <>
      <FactoryTopNav activePage="system" user={user} setPage={setPage} onLogout={onLogout} standalone={standalone} />
      <main className="system-builder-page app-gradient">
        <form className={manageMode ? "system-builder-shell system-builder-shell-editing" : "system-builder-shell"} onSubmit={handleSave}>
          <section className={manageMode ? "system-builder-form-card system-builder-form-card-editing" : "system-builder-form-card"}>
            {manageMode === "variable" ? renderVariableEditor() : (
              <>
                <div className="system-builder-card-head">
                  <div><p className="eyebrow">Setup</p><h1>Machine Builder</h1></div>
                  <button className={!form.id ? "system-new-button active" : "system-new-button"} type="button" onClick={resetForm}>+ New</button>
                </div>

                <div className="system-builder-fields">
                  <label>{requiredLabel("Machine Name")}<input value={form.machine_name} onChange={(event) => updateForm("machine_name", event.target.value)} placeholder="SELO-3 Pouch Packer" required /></label>
                  <div className="system-site-upload-row">
                    <label className="system-site-compact">{requiredLabel("Site")}<select value={form.site_name} onChange={(event) => updateForm("site_name", event.target.value)} required>{siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}</select></label>
                    <label className="system-upload-tile compact-upload-tile">
                      <input type="file" accept="image/*" onChange={handleImageUpload} />
                      <span className="system-upload-icon">⇧</span>
                      <strong>{form.image_data_url ? "Change image" : "Upload image"}</strong>
                      <small>PNG/JPG</small>
                    </label>
                  </div>
                </div>

                <div className="system-variable-list-card">
                  <div className="system-variable-list-head">
                    <div>
                      <p className="eyebrow">Variables</p>
                      <strong>{form.fields.length} configured</strong>
                    </div>
                    <button className="secondary-button small" type="button" onClick={addVariable}>Add Variable</button>
                  </div>
                  <div className="system-variable-list">
                    {!form.fields.length && <div className="empty-state">No variables yet. Add Status, Mode, Temperature, Pressure, or anything operators need to answer.</div>}
                    {form.fields.map((field) => {
                      const callout = getCalloutForField(field);
                      return (
                        <button
                          type="button"
                          key={field.id}
                          className={String(selectedVariableId) === String(field.id) ? "system-variable-item active" : "system-variable-item"}
                          onClick={() => openVariable(field.id)}
                        >
                          <span>
                            <strong>{visibleVariableName(field, form.machine_name)}</strong>
                            <small>{field.id}</small>
                          </span>
                          <em>{field.type}{callout ? " • mapped" : ""}</em>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="system-autosave-row">
                  <span className={autosaveStatus === "Saved" ? "autosave-pill saved" : "autosave-pill"}>{saving ? "Saving..." : autosaveStatus}</span>
                  <button className="system-save-button" type="submit" disabled={saving}>{saving ? "Saving" : "Save now"}</button>
                </div>
                {message && <p className="message compact-message">{message}</p>}
              </>
            )}
          </section>

          <section className="system-point-map-card">
            <div className="system-point-map-head">
              <h2>Point Map</h2>
              <div className="system-point-map-tools">
                {markMode && <div className="system-mark-pill">{markMode === "card" ? "Place card" : "Mark point"}</div>}
                <select className="system-map-select" value={form.id || ""} onChange={(event) => handleMachineSelect(event.target.value)} aria-label="Select saved machine">
                  <option value="" disabled>{machines.length ? "Saved machines" : "No machines"}</option>
                  {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.machine_name}</option>)}
                </select>
                <button className="system-delete-button" type="button" disabled={!form.id} onClick={() => handleDelete(form)}>Delete</button>
              </div>
            </div>

            <div ref={systemImageMap.stageRef} className={`${markMode ? "system-map-stage locating" : "system-map-stage"}${form.image_data_url ? "" : " system-map-stage-empty"}`}>
              <div
                className={form.image_data_url ? "system-map-canvas" : "system-map-canvas system-map-canvas-empty"}
                onClick={handlePreviewClick}
              >
                {form.image_data_url && (
                  <img
                    src={form.image_data_url}
                    alt="Machine preview"
                    draggable="false"
                    onLoad={systemImageMap.handleImageLoad}
                  />
                )}
                {markMode && <div className="preview-crosshair-hint">{markMode === "card" ? "Click card location" : "Click machine point"}</div>}
                <svg className="factory-line-layer system-connector-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {form.image_data_url && form.callouts.filter((callout) => form.fields.some((field) => field.showOnPointMap !== false && String(field.id) === String(callout.valueKey))).map((callout) => {
                    const { point, card } = calloutLine(callout);
                    return <line key={`line-${callout.id}`} x1={card.x} y1={card.y} x2={point.x} y2={point.y} />;
                  })}
                </svg>
                {form.image_data_url && form.callouts.filter((callout) => form.fields.some((field) => field.showOnPointMap !== false && String(field.id) === String(callout.valueKey))).map((callout) => {
                  const { point, card } = calloutLine(callout);
                  const active = selectedCalloutId === callout.id;
                  const meta = previewCardMeta(callout);
                  const warning = meta.tone === "warning";
                  return (
                    <div key={callout.id}>
                      <button
                        type="button"
                        className={warning ? "factory-target-dot warning system-clickable-dot" : "factory-target-dot system-clickable-dot"}
                        style={{ left: `${point.x}%`, top: `${point.y}%` }}
                        onClick={(event) => { event.stopPropagation(); beginMarking(callout.id, "point"); }}
                        title="Mark machine point"
                      />
                      <button
                        type="button"
                        className={warning ? `factory-callout-card warning system-builder-callout-button ${active ? "active" : ""}` : `factory-callout-card system-builder-callout-button ${active ? "active" : ""}`}
                        style={{ left: `${card.x}%`, top: `${card.y}%` }}
                        onClick={(event) => { event.stopPropagation(); beginMarking(callout.id, "card"); }}
                        title="Place callout card"
                      >
                        <div><span>{meta.title}</span>{meta.icon && <em>{meta.icon}</em>}</div>
                        <strong>{meta.value}<small>{meta.unit}</small></strong>
                        {meta.detail && <p>{meta.detail}</p>}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </form>
      </main>
    </>
  );
}


/* App shell/auth/register/record pages */
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

function OperatorRegisterPage({ onBack, onRegistered }) {
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
  const [selectedArea, setSelectedArea] = useState(siteOptions.includes(userSite(user)) ? userSite(user) : "Savoury");
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [values, setValues] = useState({});
  const [records, setRecords] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [scanField, setScanField] = useState(null);

  const selectedMachine = machines.find((machine) => String(machine.id) === String(selectedMachineId)) || machines[0];
  const fields = normalizeFields(selectedMachine?.fields);

  function updateValue(fieldId, value) {
    setValues((current) => ({ ...current, [fieldId]: value }));
  }

  async function loadMachines(site = selectedArea) {
    const data = await fetchJson(`/api/machines?site=${encodeURIComponent(site)}`);
    const machineList = data.machines || [];
    setMachines(machineList);
    const stillAvailable = machineList.find((machine) => String(machine.id) === String(selectedMachineId));
    if (stillAvailable) {
      setSelectedMachineId(String(stillAvailable.id));
    } else {
      setSelectedMachineId(machineList[0] ? String(machineList[0].id) : "");
    }
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
          site_name: selectedArea,
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
    loadMachines(selectedArea).catch((error) => setMessage(error.message));
  }, [selectedArea]);

  useEffect(() => {
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
          <div className="record-machine-pickers">
            <label>{requiredLabel("Area")}<select value={selectedArea} onChange={(event) => setSelectedArea(event.target.value)} required>{siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}</select></label>
            <label>{requiredLabel("Machine")}<select value={selectedMachineId} onChange={(event) => setSelectedMachineId(event.target.value)} required>{!machines.length && <option value="">No machines configured</option>}{machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.machine_name}</option>)}</select></label>
          </div>
          {selectedMachine?.details && <div className="machine-details-note">{selectedMachine.details}</div>}
          <div className="field-grid two dynamic-field-grid">
            {fields.map((field) => (
              <label key={field.id} className={field.type === "textarea" || field.type === "image" ? "wide-field" : ""}>
                {field.required ? requiredLabel(field.label) : field.label}
                {field.type === "textarea" ? (
                  <textarea rows="3" value={values[field.id] || ""} onChange={(event) => updateValue(field.id, event.target.value)} placeholder={field.label} required={field.required} />
                ) : field.type === "image" ? (
                  <div className="image-answer-row">
                    <input type="text" value={values[field.id] || ""} onChange={(event) => updateValue(field.id, event.target.value)} placeholder={`AI value for ${field.aiTarget || field.label || "target"}`} required={field.required} />
                    <button className="secondary-button image-scan-button" type="button" onClick={() => setScanField(field)}>Image</button>
                  </div>
                ) : field.type === "option" ? (
                  <select className="option-answer-select" value={values[field.id] || ""} onChange={(event) => updateValue(field.id, event.target.value)} required={field.required}>
                    <option value="">Select {field.label}</option>
                    {splitFieldOptions(field.options ?? field.optionsText).map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
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
          <RecordList records={records} compact machines={machines} />
        </section>
      </section>
      {scanField && (
        <ImageScanModal
          field={scanField}
          machine={selectedMachine}
          onClose={() => setScanField(null)}
          onValue={(value) => updateValue(scanField.id, value)}
        />
      )}
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
    setUser({ id: null, operator_name: "Temporary User", site_name: "Savoury", role_name: "operator" });
    setPage("record");
  }

  function handleLogout() {
    setUser(null);
    setPage("auth");
  }

  function renderRecordPage() {
    return <><TopBar user={user} page="record" setPage={setPage} onLogout={handleLogout} /><RecordInputPage user={user} /></>;
  }

  if (page === "auth") {
    return <AuthPage onFaceLogin={(profile) => { setUser(profile); setPage(isAdminUser(profile) ? "machine" : "record"); }} onRegister={() => setPage("register")} onMachineView={() => setPage("machine")} onAdmin={handleAdminSkip} onDemoUser={handleDemoUser} />;
  }

  if (page === "register") {
    return <OperatorRegisterPage onBack={() => setPage("auth")} onRegistered={(profile) => { setUser(profile); setPage("record"); }} />;
  }

  if (user && !canAccessPage(user, page)) {
    return renderRecordPage();
  }

  if (page === "machine") {
    return <MachinesPage user={user} setPage={setPage} onLogout={handleLogout} standalone={!user} />;
  }

  if (page === "trends") {
    return <TrendsPage user={user} setPage={setPage} onLogout={handleLogout} standalone={!user} />;
  }

  if (page === "logs") {
    if (!isAdminUser(user)) return renderRecordPage();
    return <LogsPage user={user} setPage={setPage} onLogout={handleLogout} standalone={!user} />;
  }

  if (page === "adminRegister") {
    if (!isAdminUser(user)) return renderRecordPage();
    return <RegisterAdminPage adminUser={user} user={user} setPage={setPage} onLogout={handleLogout} standalone={!user} />;
  }

  if (page === "system") {
    if (!isAdminUser(user)) return renderRecordPage();
    return <SystemRegistrationPage user={user} setPage={setPage} onLogout={handleLogout} standalone={!user} />;
  }

  return renderRecordPage();
}

export default App;

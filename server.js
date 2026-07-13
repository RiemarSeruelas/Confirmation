import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { pool, testDbConnection } from "./db.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 5178);
const isProduction = process.env.NODE_ENV === "production";

const AI_FACE_BASE_URLS = getServiceBaseUrls(
  process.env.AI_FACE_BASE_URL || "http://10.156.119.146:5005",
  process.env.AI_FACE_FALLBACK_URL
);
const AI_FACE_REGISTER_PATH = process.env.AI_FACE_REGISTER_PATH || "/register";
const AI_FACE_SEARCH_PATH = process.env.AI_FACE_SEARCH_PATH || "/search";
const AI_FACE_TIMEOUT_MS = Number(process.env.AI_FACE_TIMEOUT_MS || 30000);
const AI_FACE_MODEL_NAME = process.env.AI_FACE_MODEL_NAME || "SFace";
const AI_FACE_DETECTOR_BACKEND = process.env.AI_FACE_DETECTOR_BACKEND || "yunet";
const AI_FACE_ALIGN = process.env.AI_FACE_ALIGN !== "false";
const AI_FACE_L2_NORMALIZE = process.env.AI_FACE_L2_NORMALIZE !== "false";
const AI_FACE_DISTANCE_METRIC = process.env.AI_FACE_DISTANCE_METRIC || "cosine";
const AI_FACE_SEARCH_METHOD = process.env.AI_FACE_SEARCH_METHOD || "exact";
const AI_IMAGE_BASE_URLS = getServiceBaseUrls(
  process.env.AI_IMAGE_BASE_URL || process.env.AI_WORKSTATION_URL || "http://10.156.119.146:11434",
  process.env.AI_IMAGE_FALLBACK_URL || process.env.AI_WORKSTATION_FALLBACK_URL
);
const AI_IMAGE_PATH = process.env.AI_IMAGE_PATH || "/api/generate";
const AI_IMAGE_MODEL = process.env.AI_IMAGE_MODEL || process.env.AI_WORKSTATION_MODEL || "qwen3-vl:8b";
const AI_IMAGE_TIMEOUT_MS = Number(process.env.AI_IMAGE_TIMEOUT_MS || process.env.AI_WORKSTATION_TIMEOUT_MS || 180000);
const MAX_PROOF_IMAGE_BYTES = Number(process.env.MAX_PROOF_IMAGE_BYTES || 6 * 1024 * 1024);

let schemaReadyPromise = null;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

function cleanEnv(value) {
  return String(value || "").trim();
}

function alternateNetworkUrl(value) {
  try {
    const url = new URL(cleanEnv(value));
    if (url.hostname === "10.156.119.146") url.hostname = "172.27.1.92";
    else if (url.hostname === "172.27.1.92") url.hostname = "10.156.119.146";
    else return "";
    return url.origin;
  } catch {
    return "";
  }
}

function getServiceBaseUrls(primaryValue, fallbackValue = "") {
  const primary = cleanEnv(primaryValue);
  const fallback = cleanEnv(fallbackValue) || alternateNetworkUrl(primary);
  return uniqueValues([primary, fallback]);
}

function cleanText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeSite(value) {
  const site = cleanText(value, "Savoury");
  return ["Savoury", "Dressings", "Admin"].includes(site) ? site : "Savoury";
}

function normalizeRole(value) {
  const role = cleanText(value, "operator").toLowerCase();
  return role === "admin" ? "admin" : "operator";
}

function normalizeShift(value) {
  return cleanText(value);
}

function uniqueValues(values) {
  const output = [];
  const seen = new Set();

  for (const value of values || []) {
    const cleaned = cleanText(value);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    output.push(cleaned);
  }

  return output;
}

function toNullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function getFriendlyDbError(error) {
  if (error.code === "ECONNREFUSED") return "PostgreSQL connection refused. Check PGHOST and PGPORT.";
  if (error.code === "ENOTFOUND") return "PostgreSQL host was not found. Check PGHOST.";
  if (error.code === "28P01") return "PostgreSQL username or password is wrong.";
  if (error.code === "3D000") return "Database does not exist. Set PGDATABASE to your existing database, for example mydatabase.";
  if (error.code === "42P01") return "Table does not exist yet. Run npm run setup-db.";
  if (error.code === "42703") return "A database column is missing. Run npm run setup-db.";
  return error.message || "Database error.";
}

async function ensureSchemaReady() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      for (const filename of ["schema.sql", "confirmationproof.sql"]) {
        const sql = await fs.readFile(path.join(__dirname, filename), "utf8");
        await pool.query(sql);
      }
    })();
  }

  return schemaReadyPromise;
}

function buildServiceUrl(baseUrl, endpointPath) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const cleanPath = endpointPath.startsWith("/") ? endpointPath.slice(1) : endpointPath;
  return new URL(cleanPath, base).toString();
}

function parseImageDataUrl(imageDataUrl) {
  const input = cleanText(imageDataUrl);
  if (!input) throw new Error("No image was received.");

  const match = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  const mimeType = match?.[1] || "image/jpeg";
  const base64Data = match?.[2] || input;
  const buffer = Buffer.from(base64Data, "base64");

  if (!buffer.length) throw new Error("Image conversion failed.");

  return {
    dataUrl: input.startsWith("data:") ? input : `data:${mimeType};base64,${base64Data}`,
    mimeType,
    buffer,
    sizeBytes: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

function deepFaceBody({ imageDataUrl, operatorName = "", isRegister = false }) {
  const image = parseImageDataUrl(imageDataUrl);
  const body = {
    model_name: AI_FACE_MODEL_NAME,
    detector_backend: AI_FACE_DETECTOR_BACKEND,
    align: AI_FACE_ALIGN,
    l2_normalize: AI_FACE_L2_NORMALIZE,
    distance_metric: AI_FACE_DISTANCE_METRIC,
    search_method: AI_FACE_SEARCH_METHOD,
    img: image.dataUrl,
  };

  if (isRegister) {
    body.name = operatorName;
    body.identity = operatorName;
    body.person_id = operatorName;
  }

  return body;
}

async function readAiPayload(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  return response.text();
}

async function postJsonWithFallback({ baseUrls, endpointPath, body, timeoutMs, serviceName }) {
  const attempts = [];

  for (const baseUrl of baseUrls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(buildServiceUrl(baseUrl, endpointPath), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = await readAiPayload(response);

      if (response.ok) return { payload, baseUrl };

      const detail = typeof payload === "string" ? payload : JSON.stringify(compactJsonValue(payload, 1500));
      const error = new Error(`${serviceName} returned HTTP ${response.status}. ${detail}`);
      const retryable = response.status === 404 || response.status === 408 || response.status === 429 || response.status >= 500;
      if (!retryable) throw Object.assign(error, { stopFallback: true });
      attempts.push(`${baseUrl}: HTTP ${response.status}`);
    } catch (error) {
      if (error.stopFallback) throw error;
      const reason = error.name === "AbortError" ? "timed out" : error.message || "connection failed";
      attempts.push(`${baseUrl}: ${reason}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`${serviceName} is unavailable on both networks. ${attempts.join(" | ")}`);
}

function generatedTextFromPayload(payload) {
  if (payload === null || payload === undefined) return "";
  if (typeof payload === "string" || typeof payload === "number") return cleanText(payload);

  const candidates = [
    payload?.response,
    payload?.thinking,
    payload?.message?.content,
    payload?.content,
    payload?.text,
    payload?.value,
    payload?.result,
    payload?.answer,
    payload?.output,
    payload?.data?.response,
    payload?.data?.content,
    payload?.data?.text,
    payload?.data?.value,
    payload?.choices?.[0]?.message?.content,
    payload?.choices?.[0]?.text,
  ];

  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;
    if (typeof candidate === "string" || typeof candidate === "number") {
      const text = cleanText(candidate);
      if (text) return text;
    }
    if (Array.isArray(candidate)) {
      const joined = candidate
        .map((item) => {
          if (typeof item === "string" || typeof item === "number") return cleanText(item);
          return cleanText(item?.text ?? item?.content ?? item?.value);
        })
        .filter(Boolean)
        .join(" ");
      if (joined) return joined;
    }
  }

  return "";
}

function scalarText(value) {
  if (value === null || value === undefined) return "";
  if (["string", "number", "boolean"].includes(typeof value)) return cleanText(value);
  return "";
}

function valueFromParsedJson(parsed, target = "") {
  for (const key of ["value", "reading", "weight", "result", "text", "answer", "output"]) {
    const value = scalarText(parsed?.[key]);
    if (value) return value;
  }

  const normalizedTarget = cleanText(target).toLowerCase();
  if (normalizedTarget && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const matchingKey = Object.keys(parsed).find(
      (key) => cleanText(key).toLowerCase() === normalizedTarget
    );
    const targetValue = scalarText(matchingKey ? parsed[matchingKey] : "");
    if (targetValue) return targetValue;
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const scalarValues = Object.values(parsed).map(scalarText).filter(Boolean);
    if (scalarValues.length === 1) return scalarValues[0];
  }

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const value = scalarText(item) || valueFromParsedJson(item, target);
      if (value) return value;
    }
  }

  return scalarText(parsed);
}

function generatedValueFromText(text, target = "") {
  const source = cleanText(text)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (!source) return "";

  try {
    const value = valueFromParsedJson(JSON.parse(source), target);
    if (value) return value;
  } catch {
    // Try embedded JSON or plain text below.
  }

  const jsonCandidate = source.match(/\{[\s\S]*\}/)?.[0];
  if (jsonCandidate) {
    try {
      const value = valueFromParsedJson(JSON.parse(jsonCandidate), target);
      if (value) return value;
    } catch {
      // Fall through.
    }
  }

  const shortPlainText = source.replace(/^["']|["']$/g, "").trim();
  return shortPlainText.length <= 160 ? shortPlainText : "";
}

async function postFaceJson({ endpointType, imageDataUrl, operatorName = "" }) {
  const isRegister = endpointType === "register";
  const { payload } = await postJsonWithFallback({
    baseUrls: AI_FACE_BASE_URLS,
    endpointPath: isRegister ? AI_FACE_REGISTER_PATH : AI_FACE_SEARCH_PATH,
    body: deepFaceBody({ imageDataUrl, operatorName, isRegister }),
    timeoutMs: AI_FACE_TIMEOUT_MS,
    serviceName: "Face AI",
  });

  return normalizeFaceResult(payload);
}

function walkObjects(value, output = [], depth = 0) {
  if (depth > 7 || value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 50)) walkObjects(item, output, depth + 1);
    return output;
  }
  if (typeof value === "object") {
    output.push(value);
    for (const nested of Object.values(value)) {
      if (nested && typeof nested === "object") walkObjects(nested, output, depth + 1);
    }
  }
  return output;
}

function normalizeIdentifierValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (value.$oid) return cleanText(value.$oid);
    if (value.oid) return cleanText(value.oid);
    return "";
  }
  return cleanText(value);
}

function extractFaceIdentifiers(rawResult) {
  const preferredFields = ["embedding_hash", "face_hash", "img_name", "image_name", "face_id", "_id", "id", "sequence"];
  const identifiers = [];
  const fields = {};

  for (const object of walkObjects(rawResult)) {
    for (const field of preferredFields) {
      if (!Object.prototype.hasOwnProperty.call(object, field)) continue;
      const value = normalizeIdentifierValue(object[field]);
      if (!value) continue;
      if (!fields[field]) fields[field] = value;
      identifiers.push(`${field}:${value}`);
      identifiers.push(value);
    }
  }

  const uniqueIdentifiers = uniqueValues(identifiers).slice(0, 80);
  const primaryField = preferredFields.find((field) => fields[field]);

  return {
    aiFaceKey: primaryField ? `${primaryField}:${fields[primaryField]}` : uniqueIdentifiers[0] || "",
    identifiers: uniqueIdentifiers,
    fields,
  };
}

function normalizeFaceResult(rawResult) {
  const identifiers = extractFaceIdentifiers(rawResult);
  const objects = walkObjects(rawResult);
  const firstObject = objects[0] || {};

  const possibleName = cleanText(
    firstObject.name ||
      firstObject.identity ||
      firstObject.person ||
      firstObject.operator_name ||
      firstObject.person_name ||
      ""
  );

  const text = typeof rawResult === "string" ? cleanText(rawResult) : "";
  const lowerText = text.toLowerCase();
  const explicitNoMatch = lowerText.includes("no matching") || lowerText.includes("not found") || lowerText.includes("unknown");
  const matched = Boolean(identifiers.aiFaceKey || possibleName || (text && !explicitNoMatch));

  return {
    matched,
    name: possibleName || (explicitNoMatch ? "" : text),
    identifiers,
    raw: rawResult,
  };
}

function compactJsonValue(value, maxLength = 7000) {
  try {
    const text = JSON.stringify(value, (key, val) => {
      if (String(key).toLowerCase() === "img" && typeof val === "string" && val.length > 120) {
        return `${val.slice(0, 90)}...[truncated]`;
      }
      return val;
    });
    if (text.length <= maxLength) return JSON.parse(text);
    return { compact: text.slice(0, maxLength), truncated: true };
  } catch {
    return { value: String(value || "").slice(0, maxLength) };
  }
}

function makeLocalKey(...parts) {
  return `manual:${crypto.createHash("sha256").update(parts.join("|")).digest("hex")}`;
}

function identityRowToProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    operator_name: row.operator_name,
    employee_id: row.employee_id || "",
    site_name: row.site_name || "Savoury",
    shift_name: row.shift_name || "",
    department: row.department || "",
    role_name: row.role_name || "operator",
    email: row.email || "",
    ai_face_key: row.ai_face_key || "",
    registered_by: row.registered_by || "",
    active: row.active !== false,
    registered_at: row.registered_at,
    last_seen_at: row.last_seen_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function findFaceIdentityByIdentifiers(identifiers) {
  const cleanIdentifiers = uniqueValues(identifiers);
  if (!cleanIdentifiers.length) return null;

  const result = await pool.query(
    `
      SELECT *
      FROM app.face_identities
      WHERE active = TRUE
        AND (
          ai_face_key = ANY($1::text[])
          OR ai_identifiers ?| $1::text[]
        )
      ORDER BY last_seen_at DESC NULLS LAST, id DESC
      LIMIT 1
    `,
    [cleanIdentifiers]
  );

  return result.rows[0] || null;
}

async function saveIdentity({ profile, aiFaceKey, identifiers = [], registerPayload = {}, matchPayload = {}, registeredBy = "" }) {
  const operatorName = cleanText(profile.operatorName || profile.operator_name || profile.name);
  if (!operatorName) throw new Error("Name is required.");

  const siteName = normalizeSite(profile.siteName || profile.site_name);
  const roleName = normalizeRole(profile.roleName || profile.role_name);
  const shiftName = "";
  const employeeId = cleanText(profile.employeeId || profile.employee_id);
  const department = cleanText(profile.department);
  const email = cleanText(profile.email);
  const cleanIdentifiers = uniqueValues([aiFaceKey, ...identifiers]);
  const finalAiFaceKey = aiFaceKey || cleanIdentifiers[0] || makeLocalKey(operatorName, siteName, roleName, Date.now());

  const result = await pool.query(
    `
      INSERT INTO app.face_identities (
        operator_name, employee_id, site_name, shift_name, department, role_name, email,
        ai_face_key, ai_identifiers, ai_register_payload, ai_last_match_payload,
        registered_by, last_seen_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, NOW())
      ON CONFLICT (ai_face_key)
      DO UPDATE SET
        operator_name = EXCLUDED.operator_name,
        employee_id = EXCLUDED.employee_id,
        site_name = EXCLUDED.site_name,
        shift_name = EXCLUDED.shift_name,
        department = EXCLUDED.department,
        role_name = EXCLUDED.role_name,
        email = EXCLUDED.email,
        ai_identifiers = EXCLUDED.ai_identifiers,
        ai_register_payload = EXCLUDED.ai_register_payload,
        ai_last_match_payload = EXCLUDED.ai_last_match_payload,
        registered_by = EXCLUDED.registered_by,
        active = TRUE,
        last_seen_at = NOW()
      RETURNING *
    `,
    [
      operatorName,
      employeeId,
      siteName,
      shiftName,
      department,
      roleName,
      email,
      finalAiFaceKey,
      JSON.stringify(cleanIdentifiers),
      JSON.stringify(compactJsonValue(registerPayload)),
      JSON.stringify(compactJsonValue(matchPayload)),
      registeredBy,
    ]
  );

  return result.rows[0];
}

async function updateIdentitySeen(identityId, matchPayload) {
  const result = await pool.query(
    `
      UPDATE app.face_identities
      SET last_seen_at = NOW(), ai_last_match_payload = $2::jsonb
      WHERE id = $1
      RETURNING *
    `,
    [identityId, JSON.stringify(compactJsonValue(matchPayload))]
  );
  return result.rows[0] || null;
}

function getManilaParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    dateText: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function addDaysToDateText(dateText, days) {
  const [year, month, day] = dateText.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

function getCurrentShiftInfo(date = new Date()) {
  const parts = getManilaParts(date);
  let currentShift = "3rd Shift";
  let workDate = parts.dateText;

  if (parts.hour >= 6 && parts.hour < 14) {
    currentShift = "1st Shift";
  } else if (parts.hour >= 14 && parts.hour < 22) {
    currentShift = "2nd Shift";
  } else {
    currentShift = "3rd Shift";
    if (parts.hour < 6) workDate = addDaysToDateText(parts.dateText, -1);
  }

  return {
    currentShift,
    workDate,
    manilaDate: parts.dateText,
    manilaTime: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
  };
}



function normalizeFieldOptions(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[\n,|;]+/);
  const output = [];
  const seen = new Set();

  for (const item of source) {
    const option = cleanText(item);
    const key = option.toLowerCase();
    if (!option || seen.has(key)) continue;
    seen.add(key);
    output.push(option);
  }

  return output.slice(0, 40);
}

function normalizeMachineFields(fields) {
  const source = Array.isArray(fields) && fields.length ? fields : [];
  return source.map((field, index) => {
    const type = ["text", "number", "textarea", "image", "option"].includes(field?.type) ? field.type : "text";
    const rawOptions = field?.options ?? field?.choices ?? field?.optionValues ?? field?.optionsText;
    const options = normalizeFieldOptions(rawOptions);
    const finalOptions = type === "option" ? (options.length ? options : ["Yes", "No"]) : options;

    return {
      id: cleanText(field?.id, `field_${index + 1}`).replace(/[^a-zA-Z0-9_\-]/g, "_") || `field_${index + 1}`,
      label: cleanText(field?.label, `Field ${index + 1}`),
      type,
      options: finalOptions,
      optionsText: finalOptions.join("\n"),
      aiTarget: cleanText(field?.aiTarget || field?.ai_target || field?.target),
      required: Boolean(field?.required),
      mapsTo: ["reading_value", "product", "batch_number", "remarks", "custom"].includes(field?.mapsTo) ? field.mapsTo : "custom",
      thresholdEnabled: type === "number" && Boolean(field?.thresholdEnabled || field?.threshold_enabled),
      threshold_min: field?.threshold_min === undefined || field?.threshold_min === null ? "" : String(field.threshold_min),
      threshold_max: field?.threshold_max === undefined || field?.threshold_max === null ? "" : String(field.threshold_max),
    };
  }).slice(0, 30);
}

function clampPercentValue(value, fallback, min = 3, max = 97) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(min, Math.min(max, numberValue));
}

function normalizeMachineCallouts(callouts) {
  const source = Array.isArray(callouts) && callouts.length ? callouts : [];
  return source.map((callout, index) => {
    const pointX = clampPercentValue(callout?.pointX ?? callout?.x, 50, 3, 97);
    const pointY = clampPercentValue(callout?.pointY ?? callout?.y, 50, 6, 94);
    const fallbackCardX = pointX < 50 ? Math.max(8, pointX - 20) : Math.min(92, pointX + 20);
    const cardX = clampPercentValue(callout?.cardX, fallbackCardX, 5, 95);
    const cardY = clampPercentValue(callout?.cardY, pointY, 8, 92);

    return {
      id: cleanText(callout?.id, `callout_${index + 1}`).replace(/[^a-zA-Z0-9_\-]/g, "_") || `callout_${index + 1}`,
      title: cleanText(callout?.title, `Callout ${index + 1}`),
      valueKey: cleanText(callout?.valueKey, "reading_value"),
      cardX,
      cardY,
      pointX,
      pointY,
      x: pointX,
      y: pointY,
    };
  }).slice(0, 30);
}

function machineRowToConfig(row) {
  if (!row) return null;
  return {
    id: row.id,
    machine_name: row.machine_name,
    site_name: row.site_name || "Savoury",
    details: row.details || "",
    image_data_url: row.image_data_url || "",
    threshold_min: row.threshold_min,
    threshold_max: row.threshold_max,
    fields: normalizeMachineFields(row.fields),
    callouts: normalizeMachineCallouts(row.callouts),
    active: row.active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getReadingThresholds(machineConfig) {
  if (!machineConfig) return { thresholdMin: null, thresholdMax: null };
  const fields = normalizeMachineFields(machineConfig.fields);
  const readingField =
    fields.find((field) => field.mapsTo === "reading_value") ||
    fields.find((field) => field.id === "reading_value") ||
    fields.find((field) => field.type === "number" && field.thresholdEnabled);

  const fieldLimitsEnabled = readingField?.thresholdEnabled && readingField?.type === "number";
  const minSource = fieldLimitsEnabled ? readingField.threshold_min : machineConfig.threshold_min;
  const maxSource = fieldLimitsEnabled ? readingField.threshold_max : machineConfig.threshold_max;
  const min = minSource === "" || minSource === null || minSource === undefined ? null : Number(minSource);
  const max = maxSource === "" || maxSource === null || maxSource === undefined ? null : Number(maxSource);

  return {
    thresholdMin: Number.isFinite(min) ? min : null,
    thresholdMax: Number.isFinite(max) ? max : null,
  };
}

function toJsonObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

async function getMachineConfigById(id, queryable = pool) {
  if (!id) return null;
  const result = await queryable.query(
    `SELECT * FROM app.machine_configs WHERE id = $1 AND active = TRUE LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}



function proofRowToApi(row) {
  return {
    id: row.id,
    record_id: row.record_id,
    machine_config_id: row.machine_config_id,
    field_id: row.field_id,
    field_label: row.field_label,
    recognized_value: row.recognized_value || "",
    mime_type: row.mime_type,
    image_size_bytes: row.image_size_bytes,
    image_sha256: row.image_sha256,
    image_url: `/api/confirmationproof/${row.id}/image`,
    created_at: row.created_at,
  };
}

async function attachProofs(records, queryable = pool) {
  if (!records.length) return records;

  const recordIds = records.map((record) => Number(record.id)).filter(Number.isInteger);
  if (!recordIds.length) return records.map((record) => ({ ...record, proofs: [] }));

  const proofResult = await queryable.query(
    `
      SELECT
        id,
        record_id,
        machine_config_id,
        field_id,
        field_label,
        recognized_value,
        mime_type,
        image_size_bytes,
        image_sha256,
        created_at
      FROM app.confirmationproof
      WHERE record_id = ANY($1::integer[])
      ORDER BY record_id, id
    `,
    [recordIds]
  );

  const proofMap = new Map();
  for (const row of proofResult.rows) {
    const list = proofMap.get(row.record_id) || [];
    list.push(proofRowToApi(row));
    proofMap.set(row.record_id, list);
  }

  return records.map((record) => ({
    ...record,
    proofs: proofMap.get(record.id) || [],
  }));
}

function normalizeProofPayloads(value, machineFields) {
  const fieldMap = new Map(
    normalizeMachineFields(machineFields)
      .filter((field) => field.type === "image")
      .map((field) => [String(field.id), field])
  );

  const source = Array.isArray(value) ? value : [];
  const proofs = [];
  const seen = new Set();

  for (const item of source.slice(0, 30)) {
    const fieldId = cleanText(item?.field_id);
    if (!fieldId || seen.has(fieldId)) continue;

    const field = fieldMap.get(fieldId);
    if (!field) throw new Error(`Image field "${fieldId}" is not configured for this machine.`);

    const image = parseImageDataUrl(item?.image_data_url);
    if (image.sizeBytes > MAX_PROOF_IMAGE_BYTES) {
      throw new Error(`${field.label} proof is too large. Maximum size is ${Math.round(MAX_PROOF_IMAGE_BYTES / 1024 / 1024)} MB.`);
    }

    proofs.push({
      fieldId,
      fieldLabel: field.label,
      recognizedValue: cleanText(item?.recognized_value),
      mimeType: image.mimeType,
      imageData: image.buffer,
      imageSizeBytes: image.sizeBytes,
      imageSha256: image.sha256,
    });
    seen.add(fieldId);
  }

  return proofs;
}

function validateRecordBody(body) {
  if (!cleanText(body.operator_name)) return "Operator name is required.";
  if (!cleanText(body.machine_name)) return "Machine name is required.";
  if (body.reading_value !== "" && body.reading_value !== null && body.reading_value !== undefined) {
    const numberValue = Number(body.reading_value);
    if (!Number.isFinite(numberValue)) return "Reading value must be a valid number.";
  }
  return "";
}

app.get("/api/health", async (_req, res) => {
  try {
    await ensureSchemaReady();
    const connection = await testDbConnection();
    res.json({ ok: true, dbTime: connection.server_time, shift: getCurrentShiftInfo() });
  } catch (error) {
    schemaReadyPromise = null;
    res.status(500).json({ ok: false, error: getFriendlyDbError(error) });
  }
});

app.get("/api/shift-status", (_req, res) => {
  res.json({ ok: true, ...getCurrentShiftInfo() });
});

app.post("/api/ai/image-field", async (req, res) => {
  if (!req.body?.imageDataUrl) {
    return res.status(400).json({ ok: false, error: "Image is required." });
  }

  try {
    const image = parseImageDataUrl(req.body.imageDataUrl);
    if (image.sizeBytes > MAX_PROOF_IMAGE_BYTES) {
      return res.status(413).json({
        ok: false,
        error: `Image is too large. Maximum size is ${Math.round(MAX_PROOF_IMAGE_BYTES / 1024 / 1024)} MB.`,
      });
    }

    const target = cleanText(req.body?.target || req.body?.fieldLabel, "target value");
    const machineName = cleanText(req.body?.machineName, "machine");
    const prompt = [
      `Inspect this ${machineName} confirmation image.`,
      `Read only the value associated with "${target}".`,
      "The value may be a number, status, word, or short phrase.",
      'Return only strict JSON in this format: {"value":"recognized value"}.',
      "Do not explain the result.",
    ].join(" ");

    const { payload, baseUrl } = await postJsonWithFallback({
      baseUrls: AI_IMAGE_BASE_URLS,
      endpointPath: AI_IMAGE_PATH,
      body: {
        model: AI_IMAGE_MODEL,
        stream: false,
        prompt,
        images: [image.dataUrl.split(",").pop()],
        format: "json",
      },
      timeoutMs: AI_IMAGE_TIMEOUT_MS,
      serviceName: "Image AI",
    });

    const generatedText = generatedTextFromPayload(payload);
    const value = generatedValueFromText(generatedText, target);

    if (!value) {
      console.warn(
        "Image AI returned a successful response but no recognized value could be parsed:",
        compactJsonValue(payload, 2500)
      );
      return res.status(422).json({
        ok: false,
        error: `Image AI responded, but no readable value could be parsed for ${target}.`,
      });
    }

    return res.json({ ok: true, value, service: baseUrl });
  } catch (error) {
    return res.status(502).json({ ok: false, error: error.message || "Image scan failed." });
  }
});

app.get("/api/face/config", (_req, res) => {
  res.json({
    ok: true,
    baseUrl: AI_FACE_BASE_URLS[0],
    fallbackUrl: AI_FACE_BASE_URLS[1] || "",
    registerPath: AI_FACE_REGISTER_PATH,
    searchPath: AI_FACE_SEARCH_PATH,
    modelName: AI_FACE_MODEL_NAME,
    detectorBackend: AI_FACE_DETECTOR_BACKEND,
  });
});

app.post("/api/face/search", async (req, res) => {
  try {
    await ensureSchemaReady();
    const aiResult = await postFaceJson({ endpointType: "search", imageDataUrl: req.body?.imageDataUrl });

    if (!aiResult.matched) {
      return res.json({ ok: true, matched: false, error: "No matching face found.", ai: aiResult });
    }

    const identity = await findFaceIdentityByIdentifiers([
      aiResult.identifiers.aiFaceKey,
      ...(aiResult.identifiers.identifiers || []),
    ]);

    if (!identity) {
      return res.status(404).json({
        ok: false,
        matched: true,
        error: "Face AI recognized this face, but this app has no local profile linked yet. Register this person in the app first.",
        aiFaceKey: aiResult.identifiers.aiFaceKey,
        aiIdentifiers: aiResult.identifiers.identifiers || [],
      });
    }

    const updated = await updateIdentitySeen(identity.id, aiResult.raw);
    res.json({ ok: true, matched: true, profile: identityRowToProfile(updated || identity), ai: aiResult });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Face login failed." });
  }
});

app.post("/api/face/register", async (req, res) => {
  try {
    await ensureSchemaReady();

    const profile = {
      operatorName: cleanText(req.body?.operatorName || req.body?.name),
      employeeId: cleanText(req.body?.employeeId),
      siteName: normalizeSite(req.body?.siteName),
      shiftName: "",
      department: cleanText(req.body?.department),
      roleName: normalizeRole(req.body?.roleName || "operator"),
      email: cleanText(req.body?.email),
    };

    if (!profile.operatorName) return res.status(400).json({ ok: false, error: "Name is required." });
    if (!req.body?.imageDataUrl) return res.status(400).json({ ok: false, error: "Face capture is required." });

    const registerResult = await postFaceJson({
      endpointType: "register",
      imageDataUrl: req.body.imageDataUrl,
      operatorName: profile.operatorName,
    });

    let identifiers = registerResult.identifiers;
    let searchResult = null;

    if (!identifiers.aiFaceKey) {
      searchResult = await postFaceJson({ endpointType: "search", imageDataUrl: req.body.imageDataUrl });
      identifiers = searchResult.identifiers;
    }

    const identity = await saveIdentity({
      profile,
      aiFaceKey: identifiers.aiFaceKey,
      identifiers: identifiers.identifiers || [],
      registerPayload: registerResult.raw,
      matchPayload: searchResult?.raw || {},
      registeredBy: cleanText(req.body?.registeredBy),
    });

    res.json({
      ok: true,
      profile: identityRowToProfile(identity),
      aiFaceKey: identifiers.aiFaceKey,
      aiIdentifiers: identifiers.identifiers || [],
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Face registration failed." });
  }
});

app.post("/api/admin/users", async (req, res) => {
  try {
    await ensureSchemaReady();
    const profile = {
      operatorName: cleanText(req.body?.operatorName || req.body?.name),
      employeeId: cleanText(req.body?.employeeId),
      siteName: normalizeSite(req.body?.siteName),
      shiftName: "",
      department: cleanText(req.body?.department),
      roleName: normalizeRole(req.body?.roleName),
      email: cleanText(req.body?.email),
    };
    if (!profile.operatorName) return res.status(400).json({ ok: false, error: "Name is required." });

    let registerPayload = {};
    let identifiers = { aiFaceKey: "", identifiers: [] };

    if (req.body?.imageDataUrl) {
      const registerResult = await postFaceJson({
        endpointType: "register",
        imageDataUrl: req.body.imageDataUrl,
        operatorName: profile.operatorName,
      });
      registerPayload = registerResult.raw;
      identifiers = registerResult.identifiers;

      if (!identifiers.aiFaceKey) {
        const searchResult = await postFaceJson({ endpointType: "search", imageDataUrl: req.body.imageDataUrl });
        identifiers = searchResult.identifiers;
      }
    }

    const identity = await saveIdentity({
      profile,
      aiFaceKey: identifiers.aiFaceKey,
      identifiers: identifiers.identifiers || [],
      registerPayload,
      registeredBy: cleanText(req.body?.registeredBy || "Admin"),
    });

    res.status(201).json({ ok: true, profile: identityRowToProfile(identity) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Failed to save user." });
  }
});

app.get("/api/admin/users", async (_req, res) => {
  try {
    await ensureSchemaReady();
    const result = await pool.query(
      `
        SELECT *
        FROM app.face_identities
        ORDER BY created_at DESC, id DESC
        LIMIT 300
      `
    );
    res.json({ ok: true, users: result.rows.map(identityRowToProfile) });
  } catch (error) {
    res.status(500).json({ ok: false, error: getFriendlyDbError(error) });
  }
});

app.delete("/api/admin/users/:id", async (req, res) => {
  try {
    await ensureSchemaReady();
    const id = Number(req.params.id || 0);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid registered person ID." });
    }

    const result = await pool.query(
      `
        DELETE FROM app.face_identities
        WHERE id = $1
        RETURNING id, operator_name, role_name, site_name
      `,
      [id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ ok: false, error: "Registered person was not found." });
    }

    res.json({ ok: true, deleted: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, error: getFriendlyDbError(error) });
  }
});



app.get("/api/machines", async (req, res) => {
  try {
    await ensureSchemaReady();
    const site = cleanText(req.query.site);
    const params = [];
    let where = "WHERE active = TRUE";
    if (site) {
      params.push(normalizeSite(site));
      where += ` AND site_name = $${params.length}`;
    }
    const result = await pool.query(
      `
        SELECT *
        FROM app.machine_configs
        ${where}
        ORDER BY site_name ASC, machine_name ASC, id DESC
      `,
      params
    );
    res.json({ ok: true, machines: result.rows.map(machineRowToConfig) });
  } catch (error) {
    res.status(500).json({ ok: false, error: getFriendlyDbError(error) });
  }
});

app.get("/api/admin/machines", async (_req, res) => {
  try {
    await ensureSchemaReady();
    const result = await pool.query(
      `
        SELECT *
        FROM app.machine_configs
        WHERE active = TRUE
        ORDER BY updated_at DESC, id DESC
      `
    );
    res.json({ ok: true, machines: result.rows.map(machineRowToConfig) });
  } catch (error) {
    res.status(500).json({ ok: false, error: getFriendlyDbError(error) });
  }
});

app.post("/api/admin/machines", async (req, res) => {
  try {
    await ensureSchemaReady();
    const id = Number(req.body?.id || 0) || null;
    const machineName = cleanText(req.body?.machine_name);
    if (!machineName) return res.status(400).json({ ok: false, error: "Machine name is required." });
    const siteName = normalizeSite(req.body?.site_name);
    const details = cleanText(req.body?.details);
    const imageDataUrl = cleanText(req.body?.image_data_url);
    const thresholdMin = toNullableNumber(req.body?.threshold_min);
    const thresholdMax = toNullableNumber(req.body?.threshold_max);
    const fields = normalizeMachineFields(req.body?.fields);
    const callouts = normalizeMachineCallouts(req.body?.callouts);

    let result;
    if (id) {
      result = await pool.query(
        `
          UPDATE app.machine_configs
          SET machine_name = $2,
              site_name = $3,
              details = $4,
              image_data_url = $5,
              threshold_min = $6,
              threshold_max = $7,
              fields = $8::jsonb,
              callouts = $9::jsonb,
              active = TRUE
          WHERE id = $1
          RETURNING *
        `,
        [id, machineName, siteName, details, imageDataUrl, thresholdMin, thresholdMax, JSON.stringify(fields), JSON.stringify(callouts)]
      );
      if (!result.rows[0]) return res.status(404).json({ ok: false, error: "Machine was not found." });
    } else {
      result = await pool.query(
        `
          INSERT INTO app.machine_configs (machine_name, site_name, details, image_data_url, threshold_min, threshold_max, fields, callouts)
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
          RETURNING *
        `,
        [machineName, siteName, details, imageDataUrl, thresholdMin, thresholdMax, JSON.stringify(fields), JSON.stringify(callouts)]
      );
    }

    res.status(id ? 200 : 201).json({ ok: true, machine: machineRowToConfig(result.rows[0]) });
  } catch (error) {
    res.status(500).json({ ok: false, error: getFriendlyDbError(error) });
  }
});

app.delete("/api/admin/machines/:id", async (req, res) => {
  try {
    await ensureSchemaReady();
    const id = Number(req.params.id || 0);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: "Invalid machine ID." });
    const result = await pool.query(
      `UPDATE app.machine_configs SET active = FALSE WHERE id = $1 RETURNING id, machine_name`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: "Machine was not found." });
    res.json({ ok: true, deleted: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, error: getFriendlyDbError(error) });
  }
});

app.get("/api/confirmationproof/:id/image", async (req, res) => {
  try {
    await ensureSchemaReady();
    const id = Number(req.params.id || 0);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid proof image ID." });
    }

    const result = await pool.query(
      `
        SELECT mime_type, image_data, image_sha256
        FROM app.confirmationproof
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );

    const proof = result.rows[0];
    if (!proof) return res.status(404).json({ ok: false, error: "Proof image was not found." });

    res.set({
      "Content-Type": proof.mime_type || "image/jpeg",
      "Content-Length": proof.image_data.length,
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: `"${proof.image_sha256}"`,
    });
    return res.send(proof.image_data);
  } catch (error) {
    return res.status(500).json({ ok: false, error: getFriendlyDbError(error) });
  }
});

app.get("/api/records/latest-by-machine", async (req, res) => {
  try {
    await ensureSchemaReady();
    const site = normalizeSite(req.query.site);
    const operatorId = Number(req.query.operator_id || 0);
    const params = [site];
    let operatorFilter = "";

    if (Number.isInteger(operatorId) && operatorId > 0) {
      params.push(operatorId);
      operatorFilter = `AND record.operator_id = $${params.length}`;
    }

    const result = await pool.query(
      `
        SELECT latest.*
        FROM app.machine_configs machine
        JOIN LATERAL (
          SELECT record.*
          FROM app.confirmation_test_records record
          WHERE (
            record.machine_config_id = machine.id
            OR (
              record.machine_config_id IS NULL
              AND lower(record.machine_name) = lower(machine.machine_name)
            )
          )
          ${operatorFilter}
          ORDER BY record.record_timestamp DESC, record.id DESC
          LIMIT 1
        ) latest ON TRUE
        WHERE machine.active = TRUE
          AND machine.site_name = $1
        ORDER BY machine.machine_name
      `,
      params
    );

    const records = await attachProofs(result.rows);
    res.json({ ok: true, records });
  } catch (error) {
    res.status(500).json({ ok: false, error: getFriendlyDbError(error) });
  }
});

app.get("/api/records", async (req, res) => {
  try {
    await ensureSchemaReady();
    const requestedLimit = Number(req.query.limit || 100);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 100;
    const operatorId = Number(req.query.operator_id || 0);
    const machineConfigId = Number(req.query.machine_config_id || 0);
    const machineNameQuery = cleanText(req.query.machine_name);

    const params = [];
    const where = [];

    if (operatorId) {
      params.push(operatorId);
      where.push(`r.operator_id = $${params.length}`);
    }

    if (machineConfigId) {
      const machineConfig = await getMachineConfigById(machineConfigId);
      params.push(machineConfigId);
      const machineIdParam = params.length;

      if (machineConfig?.machine_name) {
        params.push(machineConfig.machine_name);
        const machineNameParam = params.length;
        where.push(`(r.machine_config_id = $${machineIdParam} OR lower(r.machine_name) = lower($${machineNameParam}))`);
      } else {
        where.push(`r.machine_config_id = $${machineIdParam}`);
      }
    } else if (machineNameQuery) {
      params.push(machineNameQuery);
      where.push(`lower(r.machine_name) = lower($${params.length})`);
    }

    const site = cleanText(req.query.site);
    if (site) {
      params.push(normalizeSite(site));
      where.push(`r.site_name = $${params.length}`);
    }

    const shift = cleanText(req.query.shift);
    if (shift) {
      params.push(normalizeShift(shift));
      where.push(`r.shift_name = $${params.length}`);
    }

    const date = cleanText(req.query.date);
    if (date) {
      params.push(date);
      where.push(`(r.record_timestamp AT TIME ZONE 'Asia/Manila')::date = $${params.length}::date`);
    }

    params.push(limit);
    const limitParam = params.length;
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const result = await pool.query(
      `
        SELECT
          r.id,
          r.operator_id,
          r.operator_name,
          r.site_name,
          r.machine_config_id,
          r.machine_name,
          r.reading_value,
          r.product,
          r.batch_number,
          r.shift_name,
          r.shift_work_date,
          r.remarks,
          r.response_fields,
          r.record_timestamp,
          r.created_at,
          r.updated_at,
          f.role_name
        FROM app.confirmation_test_records r
        LEFT JOIN app.face_identities f ON f.id = r.operator_id
        ${whereSql}
        ORDER BY r.record_timestamp DESC, r.id DESC
        LIMIT $${limitParam}
      `,
      params
    );

    const records = await attachProofs(result.rows);
    res.json({ ok: true, records });
  } catch (error) {
    schemaReadyPromise = null;
    res.status(500).json({ ok: false, error: getFriendlyDbError(error) });
  }
});

function requestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function prepareRecordInput(body, queryable = pool) {
  const validationError = validateRecordBody(body || {});
  if (validationError) throw requestError(validationError);

  const operatorId = Number(body.operator_id || 0) || null;
  const operatorName = cleanText(body.operator_name);
  const siteName = normalizeSite(body.site_name);
  const requestedMachineConfigId = Number(body.machine_config_id || 0) || null;
  const machineConfig = await getMachineConfigById(requestedMachineConfigId, queryable);
  const machineConfigId = machineConfig?.id || requestedMachineConfigId;
  const machineName = cleanText(machineConfig?.machine_name || body.machine_name);
  const readingValue = toNullableNumber(body.reading_value);
  const product = cleanText(body.product);
  const batchNumber = cleanText(body.batch_number);
  const remarks = cleanText(body.remarks);
  const responseFields = toJsonObject(body.response_fields);
  const machineFields = normalizeMachineFields(machineConfig?.fields);
  let proofs;

  try {
    proofs = normalizeProofPayloads(body.proofs, machineFields);
  } catch (error) {
    throw requestError(error.message);
  }

  const proofFieldIds = new Set(proofs.map((proof) => proof.fieldId));

  for (const field of machineFields) {
    const value = cleanText(responseFields[field.id]);

    if (field.required && !value) throw requestError(`${field.label} is required.`);

    if (field.type === "image") {
      if (value && !proofFieldIds.has(String(field.id))) {
        throw requestError(`Capture a new proof image for ${field.label}.`);
      }
      if (field.required && !proofFieldIds.has(String(field.id))) {
        throw requestError(`${field.label} needs a new proof image.`);
      }
    }
  }

  return {
    operatorId,
    operatorName,
    siteName,
    machineConfigId,
    machineName,
    readingValue,
    product,
    batchNumber,
    remarks,
    responseFields,
    proofs,
  };
}

async function insertRecordWithProofs(queryable, input) {
  const recordResult = await queryable.query(
    `
      INSERT INTO app.confirmation_test_records (
        operator_id,
        operator_name,
        site_name,
        machine_config_id,
        machine_name,
        reading_value,
        product,
        batch_number,
        shift_name,
        shift_work_date,
        remarks,
        response_fields,
        record_timestamp
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '', NULL, $9, $10::jsonb, NOW())
      RETURNING *
    `,
    [
      input.operatorId,
      input.operatorName,
      input.siteName,
      input.machineConfigId,
      input.machineName,
      input.readingValue,
      input.product,
      input.batchNumber,
      input.remarks,
      JSON.stringify(input.responseFields),
    ]
  );

  const record = recordResult.rows[0];
  const savedProofs = [];

  for (const proof of input.proofs) {
    const proofResult = await queryable.query(
      `
        INSERT INTO app.confirmationproof (
          record_id,
          machine_config_id,
          field_id,
          field_label,
          recognized_value,
          mime_type,
          image_data,
          image_size_bytes,
          image_sha256
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING
          id,
          record_id,
          machine_config_id,
          field_id,
          field_label,
          recognized_value,
          mime_type,
          image_size_bytes,
          image_sha256,
          created_at
      `,
      [
        record.id,
        input.machineConfigId,
        proof.fieldId,
        proof.fieldLabel,
        proof.recognizedValue,
        proof.mimeType,
        proof.imageData,
        proof.imageSizeBytes,
        proof.imageSha256,
      ]
    );
    savedProofs.push(proofRowToApi(proofResult.rows[0]));
  }

  return { ...record, proofs: savedProofs };
}

app.post("/api/records/upsert", async (req, res) => {
  let client;

  try {
    await ensureSchemaReady();
    client = await pool.connect();
    await client.query("BEGIN");
    const input = await prepareRecordInput(req.body || {}, client);
    const record = await insertRecordWithProofs(client, input);
    await client.query("COMMIT");
    res.status(201).json({ ok: true, action: "created", record });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (!error.statusCode) schemaReadyPromise = null;
    res.status(error.statusCode || 500).json({ ok: false, error: error.statusCode ? error.message : getFriendlyDbError(error) });
  } finally {
    client?.release();
  }
});

app.post("/api/records/bulk", async (req, res) => {
  let client;

  try {
    await ensureSchemaReady();
    const source = Array.isArray(req.body?.records) ? req.body.records : [];
    if (!source.length) throw requestError("At least one machine response is required.");
    if (source.length > 50) throw requestError("A maximum of 50 machine responses can be submitted at once.");

    client = await pool.connect();
    await client.query("BEGIN");
    const records = [];

    for (const body of source) {
      const input = await prepareRecordInput(body, client);
      records.push(await insertRecordWithProofs(client, input));
    }

    await client.query("COMMIT");
    res.status(201).json({ ok: true, action: "created", records });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (!error.statusCode) schemaReadyPromise = null;
    res.status(error.statusCode || 500).json({ ok: false, error: error.statusCode ? error.message : getFriendlyDbError(error) });
  } finally {
    client?.release();
  }
});

app.get("/api/dashboard/summary", async (req, res) => {
  try {
    await ensureSchemaReady();

    const machineConfigId = Number(req.query.machine_config_id || 0);
    const machineNameQuery = cleanText(req.query.machine_name);
    const params = [];
    const where = [];
    let machineConfig = null;

    if (machineConfigId) {
      machineConfig = await getMachineConfigById(machineConfigId);
      params.push(machineConfigId);
      const machineIdParam = params.length;

      if (machineConfig?.machine_name) {
        params.push(machineConfig.machine_name);
        const machineNameParam = params.length;
        where.push(`(machine_config_id = $${machineIdParam} OR lower(machine_name) = lower($${machineNameParam}))`);
      } else {
        where.push(`machine_config_id = $${machineIdParam}`);
      }
    } else if (machineNameQuery) {
      params.push(machineNameQuery);
      where.push(`lower(machine_name) = lower($${params.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const latest = await pool.query(
      `
        SELECT *
        FROM app.confirmation_test_records
        ${whereSql}
        ORDER BY record_timestamp DESC, id DESC
        LIMIT 20
      `,
      params
    );

    const stats = await pool.query(
      `
        SELECT
          COUNT(*)::int AS total_submissions,
          COUNT(*) FILTER (WHERE site_name = 'Savoury')::int AS savoury_count,
          COUNT(*) FILTER (WHERE site_name = 'Dressings')::int AS dressings_count,
          COUNT(DISTINCT operator_name)::int AS unique_operators,
          AVG(reading_value)::float AS avg_reading
        FROM app.confirmation_test_records
        ${whereSql}
      `,
      params
    );

    const latestRecords = await attachProofs(latest.rows);

    res.json({
      ok: true,
      stats: stats.rows[0],
      latest: latestRecords,
      machine: machineRowToConfig(machineConfig),
      scoped: Boolean(machineConfigId || machineNameQuery),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: getFriendlyDbError(error) });
  }
});


app.get("/api/dashboard/trends", async (req, res) => {
  try {
    await ensureSchemaReady();

    const machineConfigId = Number(req.query.machine_config_id || 0);
    const machineNameQuery = cleanText(req.query.machine_name);
    const requestedLimit = Number(req.query.limit || 80);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 5), 300) : 80;
    const params = [];
    const where = [];
    let machineConfig = null;

    if (machineConfigId) {
      machineConfig = await getMachineConfigById(machineConfigId);
      params.push(machineConfigId);
      const machineIdParam = params.length;

      if (machineConfig?.machine_name) {
        params.push(machineConfig.machine_name);
        const machineNameParam = params.length;
        where.push(`(machine_config_id = $${machineIdParam} OR lower(machine_name) = lower($${machineNameParam}))`);
      } else {
        where.push(`machine_config_id = $${machineIdParam}`);
      }
    } else if (machineNameQuery) {
      params.push(machineNameQuery);
      where.push(`lower(machine_name) = lower($${params.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    params.push(limit);
    const limitParam = params.length;

    const rowsResult = await pool.query(
      `
        SELECT
          id,
          machine_config_id,
          machine_name,
          reading_value,
          product,
          batch_number,
          operator_name,
          site_name,
          shift_name,
          record_timestamp,
          created_at
        FROM app.confirmation_test_records
        ${whereSql}
        ORDER BY record_timestamp DESC, id DESC
        LIMIT $${limitParam}
      `,
      params
    );

    const { thresholdMin, thresholdMax } = getReadingThresholds(machineConfig);

    const trendRows = rowsResult.rows.map((row) => {
      const reading = row.reading_value === null || row.reading_value === undefined ? null : Number(row.reading_value);
      const below = Number.isFinite(reading) && Number.isFinite(thresholdMin) && reading < thresholdMin;
      const above = Number.isFinite(reading) && Number.isFinite(thresholdMax) && reading > thresholdMax;
      return {
        ...row,
        reading_value: reading,
        threshold_min: thresholdMin,
        threshold_max: thresholdMax,
        warning_status: below ? "below" : above ? "above" : Number.isFinite(reading) ? "normal" : "no-reading",
        warning_message: below
          ? `Below threshold: ${reading} < ${thresholdMin}`
          : above
            ? `Above threshold: ${reading} > ${thresholdMax}`
            : "",
      };
    });

    const warnings = trendRows.filter((row) => row.warning_status === "below" || row.warning_status === "above");
    const numericReadings = trendRows.map((row) => row.reading_value).filter((value) => Number.isFinite(value));
    const latest = trendRows[0] || null;

    res.json({
      ok: true,
      machine: machineRowToConfig(machineConfig),
      trends: trendRows.reverse(),
      latest,
      warnings: warnings.slice(0, 20),
      stats: {
        points: trendRows.length,
        warning_count: warnings.length,
        latest_status: latest?.warning_status || "no-data",
        min_reading: numericReadings.length ? Math.min(...numericReadings) : null,
        max_reading: numericReadings.length ? Math.max(...numericReadings) : null,
        avg_reading: numericReadings.length ? numericReadings.reduce((sum, value) => sum + value, 0) / numericReadings.length : null,
        threshold_min: thresholdMin,
        threshold_max: thresholdMax,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: getFriendlyDbError(error) });
  }
});

if (isProduction) {
  const distPath = path.join(__dirname, "dist");
  app.use(express.static(distPath));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server ready: http://localhost:${PORT}`);
});

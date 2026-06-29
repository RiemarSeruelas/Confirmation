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

const AI_FACE_BASE_URL = process.env.AI_FACE_BASE_URL || "http://10.156.119.146:5005";
const AI_FACE_REGISTER_PATH = process.env.AI_FACE_REGISTER_PATH || "/register";
const AI_FACE_SEARCH_PATH = process.env.AI_FACE_SEARCH_PATH || "/search";
const AI_FACE_IMAGE_FIELD = process.env.AI_FACE_IMAGE_FIELD || "img";
const AI_FACE_NAME_FIELD = process.env.AI_FACE_NAME_FIELD || "name";
const AI_FACE_TIMEOUT_MS = Number(process.env.AI_FACE_TIMEOUT_MS || 30000);
const AI_FACE_PAYLOAD_MODE = process.env.AI_FACE_PAYLOAD_MODE || "json";
const AI_FACE_MODEL_NAME = process.env.AI_FACE_MODEL_NAME || "SFace";
const AI_FACE_DETECTOR_BACKEND = process.env.AI_FACE_DETECTOR_BACKEND || "yunet";
const AI_FACE_ALIGN = process.env.AI_FACE_ALIGN !== "false";
const AI_FACE_L2_NORMALIZE = process.env.AI_FACE_L2_NORMALIZE !== "false";
const AI_FACE_DISTANCE_METRIC = process.env.AI_FACE_DISTANCE_METRIC || "cosine";
const AI_FACE_SEARCH_METHOD = process.env.AI_FACE_SEARCH_METHOD || "exact";

let schemaReadyPromise = null;
let lastWorkingFaceFormat = {
  register: null,
  search: null,
};

app.use(cors());
app.use(express.json({ limit: "15mb" }));

function cleanText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function uniqueValues(values) {
  const seen = new Set();
  const output = [];

  for (const value of values) {
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

function getValidationError(body) {
  const operatorName = cleanText(body.operator_name);
  const machineName = cleanText(body.machine_name);
  const shiftName = cleanText(body.shift_name);

  if (!operatorName) return "Operator name is required.";
  if (!machineName) return "Machine name is required.";
  if (!shiftName) return "Shift name is required.";

  if (body.reading_value !== "" && body.reading_value !== null && body.reading_value !== undefined) {
    const numberValue = Number(body.reading_value);
    if (!Number.isFinite(numberValue)) return "Reading value must be a valid number.";
  }

  return null;
}

function getFriendlyDbError(error) {
  if (error.code === "ECONNREFUSED") {
    return "PostgreSQL connection refused. Check PGHOST, PGPORT, and make sure PostgreSQL is running.";
  }

  if (error.code === "ENOTFOUND") {
    return "PostgreSQL host was not found. Check PGHOST in your .env file.";
  }

  if (error.code === "28P01") {
    return "PostgreSQL username or password is wrong. Check PGUSER and PGPASSWORD.";
  }

  if (error.code === "3D000") {
    return "Database does not exist yet. Run npm run setup-db first.";
  }

  if (error.code === "42P01") {
    return "Table does not exist yet. Run npm run setup-db, then restart the app.";
  }

  if (error.code === "42703") {
    return "A database column is missing. Run npm run setup-db once, then restart the app.";
  }

  return error.message || "Database error.";
}

function parseImageDataUrl(imageDataUrl) {
  const input = cleanText(imageDataUrl);

  if (!input) {
    throw new Error("No face image was received.");
  }

  const dataUrlMatch = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  const mimeType = dataUrlMatch?.[1] || "image/jpeg";
  const base64Data = dataUrlMatch?.[2] || input;
  const buffer = Buffer.from(base64Data, "base64");

  if (!buffer.length) {
    throw new Error("Face image conversion failed.");
  }

  return {
    buffer,
    mimeType,
    base64Data,
    dataUrl: input.startsWith("data:") ? input : `data:${mimeType};base64,${base64Data}`,
  };
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }

  return "";
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  const text = cleanText(value).toLowerCase();
  if (["true", "yes", "1", "matched", "found", "success"].includes(text)) return true;
  if (["false", "no", "0", "unmatched", "not found", "failed"].includes(text)) return false;
  return Boolean(value);
}

function normalizeFaceResult(rawResult) {
  if (Array.isArray(rawResult)) {
    const firstItem = rawResult[0];
    const normalized = firstItem ? normalizeFaceResult(firstItem) : null;

    return {
      matched: rawResult.length > 0 || Boolean(normalized?.matched),
      name: normalized?.name || "",
      confidence: normalized?.confidence ?? null,
      raw: rawResult,
    };
  }

  if (rawResult && typeof rawResult === "object") {
    const firstMatch = Array.isArray(rawResult.matches) ? rawResult.matches[0] : null;
    const firstResult = Array.isArray(rawResult.results) ? rawResult.results[0] : null;
    const firstData = Array.isArray(rawResult.data) ? rawResult.data[0] : null;
    const nestedResult = rawResult.result && typeof rawResult.result === "object" ? rawResult.result : null;
    const identifiers = extractFaceIdentifiers(rawResult);

    const name = cleanText(
      firstNonEmpty(
        rawResult.name,
        rawResult.operator_name,
        rawResult.person,
        rawResult.person_name,
        rawResult.employee_name,
        rawResult.identity,
        rawResult.user,
        rawResult.username,
        rawResult.label,
        nestedResult?.name,
        nestedResult?.person,
        nestedResult?.person_name,
        firstMatch?.name,
        firstMatch?.person,
        firstMatch?.person_name,
        firstResult?.name,
        firstResult?.person,
        firstResult?.person_name,
        firstData?.name,
        firstData?.person,
        firstData?.person_name
      )
    );

    const confidence = firstNonEmpty(
      rawResult.confidence,
      rawResult.score,
      rawResult.similarity,
      rawResult.distance,
      nestedResult?.confidence,
      nestedResult?.score,
      nestedResult?.distance,
      firstMatch?.confidence,
      firstMatch?.score,
      firstMatch?.distance,
      firstResult?.confidence,
      firstResult?.score,
      firstResult?.distance,
      firstData?.confidence,
      firstData?.score,
      firstData?.distance
    );

    const explicitMatched = firstNonEmpty(
      rawResult.matched,
      rawResult.found,
      rawResult.success,
      rawResult.ok,
      nestedResult?.matched,
      nestedResult?.found
    );
    const matchedByName = Boolean(name) && !["unknown", "not found", "none", "null"].includes(name.toLowerCase());
    const matchedByResult = Boolean(firstMatch || firstResult || firstData || nestedResult || identifiers.aiFaceKey);
    const matched = explicitMatched === "" ? matchedByName || matchedByResult : normalizeBoolean(explicitMatched);

    return {
      matched: matched || matchedByName || matchedByResult,
      name,
      confidence: confidence === "" ? null : confidence,
      identifiers,
      raw: rawResult,
    };
  }

  const text = cleanText(rawResult);

  return {
    matched: Boolean(text),
    name: text,
    confidence: null,
    identifiers: { aiFaceKey: "", identifiers: [], fields: {} },
    raw: rawResult,
  };
}

function buildAiUrl(endpointPath) {
  const base = AI_FACE_BASE_URL.endsWith("/") ? AI_FACE_BASE_URL : `${AI_FACE_BASE_URL}/`;
  const cleanPath = endpointPath.startsWith("/") ? endpointPath.slice(1) : endpointPath;
  return new URL(cleanPath, base).toString();
}

async function readAiPayload(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function compactPayload(payload) {
  if (payload === null || payload === undefined) return "";
  if (typeof payload === "string") return payload.slice(0, 350);

  try {
    return JSON.stringify(payload).slice(0, 350);
  } catch {
    return String(payload).slice(0, 350);
  }
}

function compactJsonValue(value, maxLength = 8000) {
  if (value === null || value === undefined) return {};

  try {
    const jsonText = JSON.stringify(value, (key, val) => {
      const lowerKey = String(key).toLowerCase();
      if (["img", "image", "imageDataUrl", "file", "face", "photo", "upload"].includes(lowerKey)) {
        if (typeof val === "string" && val.length > 250) {
          return `${val.slice(0, 120)}...[truncated]`;
        }
      }
      return val;
    });

    if (jsonText.length <= maxLength) return JSON.parse(jsonText);
    return { compact: jsonText.slice(0, maxLength), truncated: true };
  } catch {
    return { value: String(value).slice(0, maxLength) };
  }
}

function makeLocalHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function walkObjects(value, output = [], depth = 0) {
  if (depth > 6 || value === null || value === undefined) return output;

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 25)) {
      walkObjects(item, output, depth + 1);
    }
    return output;
  }

  if (typeof value === "object") {
    output.push(value);
    for (const nested of Object.values(value)) {
      if (nested && typeof nested === "object") {
        walkObjects(nested, output, depth + 1);
      }
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
  const objects = walkObjects(rawResult);
  const preferredFields = [
    "embedding_hash",
    "face_hash",
    "img_name",
    "image_name",
    "face_id",
    "_id",
    "id",
    "sequence",
  ];

  const identifiers = [];
  const fields = {};

  for (const object of objects) {
    for (const field of preferredFields) {
      if (!Object.prototype.hasOwnProperty.call(object, field)) continue;
      const value = normalizeIdentifierValue(object[field]);
      if (!value) continue;

      if (!fields[field]) fields[field] = value;
      identifiers.push(`${field}:${value}`);
      identifiers.push(value);
    }
  }

  const uniqueIdentifiers = uniqueValues(identifiers).slice(0, 60);
  const primaryField = preferredFields.find((field) => fields[field]);
  const aiFaceKey = primaryField ? `${primaryField}:${fields[primaryField]}` : uniqueIdentifiers[0] || "";

  return {
    aiFaceKey,
    identifiers: uniqueIdentifiers,
    fields,
  };
}

function identityRowToProfile(row) {
  if (!row) return null;

  return {
    id: row.id,
    operator_name: row.operator_name,
    employee_id: row.employee_id || "",
    department: row.department || "",
    role_name: row.role_name || "",
    email: row.email || "",
    ai_face_key: row.ai_face_key || "",
    registered_at: row.registered_at,
    last_seen_at: row.last_seen_at,
  };
}

async function findFaceIdentityByIdentifiers(identifiers) {
  const cleanIdentifiers = uniqueValues(identifiers || []);
  if (cleanIdentifiers.length === 0) return null;

  const result = await pool.query(
    `
      SELECT
        id,
        operator_name,
        employee_id,
        department,
        role_name,
        email,
        ai_face_key,
        registered_at,
        last_seen_at
      FROM app."Confirmation_face_identities"
      WHERE ai_face_key = ANY($1::text[])
         OR ai_identifiers ?| $1::text[]
      ORDER BY last_seen_at DESC NULLS LAST, id DESC
      LIMIT 1
    `,
    [cleanIdentifiers]
  );

  return result.rows[0] || null;
}

async function upsertFaceIdentity({ profile, identifiers, aiFaceKey, registerPayload, matchPayload }) {
  const operatorName = cleanText(profile.operatorName || profile.operator_name || profile.name);
  const employeeId = cleanText(profile.employeeId || profile.employee_id);
  const department = cleanText(profile.department);
  const roleName = cleanText(profile.roleName || profile.role_name);
  const email = cleanText(profile.email);
  const cleanIdentifiers = uniqueValues([aiFaceKey, ...(identifiers || [])]);
  const finalAiFaceKey = aiFaceKey || cleanIdentifiers[0] || `local:${makeLocalHash(`${operatorName}|${Date.now()}`)}`;

  const result = await pool.query(
    `
      INSERT INTO app."Confirmation_face_identities" (
        operator_name,
        employee_id,
        department,
        role_name,
        email,
        ai_face_key,
        ai_identifiers,
        ai_register_payload,
        ai_last_match_payload,
        last_seen_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, NOW())
      ON CONFLICT (ai_face_key)
      DO UPDATE SET
        operator_name = EXCLUDED.operator_name,
        employee_id = EXCLUDED.employee_id,
        department = EXCLUDED.department,
        role_name = EXCLUDED.role_name,
        email = EXCLUDED.email,
        ai_identifiers = EXCLUDED.ai_identifiers,
        ai_register_payload = EXCLUDED.ai_register_payload,
        ai_last_match_payload = EXCLUDED.ai_last_match_payload,
        last_seen_at = NOW()
      RETURNING
        id,
        operator_name,
        employee_id,
        department,
        role_name,
        email,
        ai_face_key,
        registered_at,
        last_seen_at
    `,
    [
      operatorName,
      employeeId,
      department,
      roleName,
      email,
      finalAiFaceKey,
      JSON.stringify(cleanIdentifiers),
      JSON.stringify(compactJsonValue(registerPayload)),
      JSON.stringify(compactJsonValue(matchPayload || {})),
    ]
  );

  return result.rows[0];
}

async function updateFaceIdentitySeen(identityId, matchPayload) {
  const result = await pool.query(
    `
      UPDATE app."Confirmation_face_identities"
      SET last_seen_at = NOW(), ai_last_match_payload = $2::jsonb
      WHERE id = $1
      RETURNING
        id,
        operator_name,
        employee_id,
        department,
        role_name,
        email,
        ai_face_key,
        registered_at,
        last_seen_at
    `,
    [identityId, JSON.stringify(compactJsonValue(matchPayload))]
  );

  return result.rows[0] || null;
}

function makeImageBlob(image) {
  return new Blob([image.buffer], { type: image.mimeType });
}

function createDeepFaceJsonBody({ image, operatorName = "", isRegister = false }) {
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

function createFaceCandidates({ endpointType, image, operatorName }) {
  const imageFields = uniqueValues([AI_FACE_IMAGE_FIELD, "img", "file", "image", "face", "photo", "upload"]);
  const nameFields = uniqueValues([AI_FACE_NAME_FIELD, "name", "identity", "person_id", "person_name", "operator_name", "username", "label"]);
  const candidates = [];
  const isRegister = endpointType === "register";

  function addMultipart(imageField, nameField = null) {
    candidates.push({
      label: nameField ? `multipart ${imageField}+${nameField}` : `multipart ${imageField}`,
      run: async (signal) => {
        const formData = new FormData();
        formData.append(imageField, makeImageBlob(image), `face-capture-${Date.now()}.jpg`);

        if (isRegister && operatorName && nameField) {
          formData.append(nameField, operatorName);
        }

        return fetch(buildAiUrl(isRegister ? AI_FACE_REGISTER_PATH : AI_FACE_SEARCH_PATH), {
          method: "POST",
          body: formData,
          signal,
        });
      },
    });
  }

  function addJson(label, body) {
    candidates.push({
      label,
      run: async (signal) => {
        return fetch(buildAiUrl(isRegister ? AI_FACE_REGISTER_PATH : AI_FACE_SEARCH_PATH), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal,
        });
      },
    });
  }

  if (AI_FACE_PAYLOAD_MODE !== "multipart" && AI_FACE_PAYLOAD_MODE !== "raw") {
    addJson(
      isRegister ? "json deepface register img data-url" : "json deepface search img data-url",
      createDeepFaceJsonBody({ image, operatorName, isRegister })
    );

    const nameBody = isRegister
      ? {
          [AI_FACE_NAME_FIELD]: operatorName,
          name: operatorName,
          identity: operatorName,
          person_id: operatorName,
        }
      : {};

    addJson("json img data-url", { ...nameBody, img: image.dataUrl });
    addJson("json img base64", { ...nameBody, img: image.base64Data });
    addJson("json image base64", { ...nameBody, image: image.base64Data });
    addJson("json file base64", { ...nameBody, file: image.base64Data });
    addJson("json face base64", { ...nameBody, face: image.base64Data });
    addJson("json imageDataUrl", { ...nameBody, imageDataUrl: image.dataUrl });
    addJson("json image data-url", { ...nameBody, image: image.dataUrl });
  }

  if (AI_FACE_PAYLOAD_MODE !== "json" && AI_FACE_PAYLOAD_MODE !== "raw") {
    if (isRegister) {
      for (const imageField of imageFields) {
        for (const nameField of nameFields) {
          addMultipart(imageField, nameField);
        }
      }
    } else {
      for (const imageField of imageFields) {
        addMultipart(imageField);
      }
    }
  }

  if (AI_FACE_PAYLOAD_MODE === "raw" || AI_FACE_PAYLOAD_MODE === "auto") {
    candidates.push({
      label: "raw image/jpeg",
      run: async (signal) => {
        const url = new URL(buildAiUrl(isRegister ? AI_FACE_REGISTER_PATH : AI_FACE_SEARCH_PATH));
        if (isRegister && operatorName) {
          url.searchParams.set(AI_FACE_NAME_FIELD, operatorName);
          url.searchParams.set("name", operatorName);
          url.searchParams.set("identity", operatorName);
          url.searchParams.set("person_id", operatorName);
        }

        return fetch(url.toString(), {
          method: "POST",
          headers: { "Content-Type": image.mimeType },
          body: image.buffer,
          signal,
        });
      },
    });
  }

  if (AI_FACE_PAYLOAD_MODE !== "auto") {
    return candidates.filter((candidate) => candidate.label.startsWith(AI_FACE_PAYLOAD_MODE));
  }

  const preferredFormat = lastWorkingFaceFormat[endpointType];
  if (!preferredFormat) return candidates;

  return [
    ...candidates.filter((candidate) => candidate.label === preferredFormat),
    ...candidates.filter((candidate) => candidate.label !== preferredFormat),
  ];
}

async function postFaceImageToAi({ endpointType, imageDataUrl, operatorName }) {
  const image = parseImageDataUrl(imageDataUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_FACE_TIMEOUT_MS);
  const candidates = createFaceCandidates({ endpointType, image, operatorName });
  const attempts = [];

  try {
    for (const candidate of candidates) {
      const response = await candidate.run(controller.signal);
      const payload = await readAiPayload(response);

      if (response.ok) {
        lastWorkingFaceFormat[endpointType] = candidate.label;
        const normalized = normalizeFaceResult(payload);
        return {
          ...normalized,
          faceFormat: candidate.label,
        };
      }

      attempts.push({
        format: candidate.label,
        status: response.status,
        response: compactPayload(payload),
      });

      if (![400, 404, 415, 422].includes(response.status)) {
        break;
      }
    }

    const firstAttempt = attempts[0];
    const lastAttempt = attempts[attempts.length - 1];
    const triedFormats = attempts.map((attempt) => `${attempt.format}=${attempt.status}`).join(", ");
    const serverMessage = compactPayload(lastAttempt?.response || firstAttempt?.response);
    const suffix = serverMessage ? ` Last AI message: ${serverMessage}` : "";

    throw new Error(`Face AI rejected the image format/name fields. Tried: ${triedFormats}.${suffix}`);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Face AI request timed out. Check the AI workstation connection.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureSchemaReady() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const schemaPath = path.join(__dirname, "schema.sql");
      const schemaSql = await fs.readFile(schemaPath, "utf8");
      await pool.query(schemaSql);
    })();
  }

  return schemaReadyPromise;
}

app.get("/api/health", async (_req, res) => {
  try {
    await ensureSchemaReady();
    const connection = await testDbConnection();
    res.json({ ok: true, dbTime: connection.server_time });
  } catch (error) {
    schemaReadyPromise = null;
    res.status(500).json({ ok: false, error: getFriendlyDbError(error) });
  }
});

app.get("/api/face/config", (_req, res) => {
  res.json({
    ok: true,
    baseUrl: AI_FACE_BASE_URL,
    registerPath: AI_FACE_REGISTER_PATH,
    searchPath: AI_FACE_SEARCH_PATH,
    imageField: AI_FACE_IMAGE_FIELD,
    nameField: AI_FACE_NAME_FIELD,
    payloadMode: AI_FACE_PAYLOAD_MODE,
    modelName: AI_FACE_MODEL_NAME,
    detectorBackend: AI_FACE_DETECTOR_BACKEND,
    align: AI_FACE_ALIGN,
    l2Normalize: AI_FACE_L2_NORMALIZE,
    distanceMetric: AI_FACE_DISTANCE_METRIC,
    searchMethod: AI_FACE_SEARCH_METHOD,
    lastWorkingFaceFormat,
  });
});

app.get("/api/face/identities", async (_req, res) => {
  try {
    await ensureSchemaReady();

    const result = await pool.query(
      `
        SELECT
          id,
          operator_name,
          employee_id,
          department,
          role_name,
          email,
          ai_face_key,
          registered_at,
          last_seen_at,
          created_at,
          updated_at
        FROM app."Confirmation_face_identities"
        ORDER BY created_at DESC, id DESC
        LIMIT 200
      `
    );

    res.json({ ok: true, identities: result.rows.map(identityRowToProfile) });
  } catch (error) {
    schemaReadyPromise = null;
    res.status(500).json({ ok: false, error: getFriendlyDbError(error) });
  }
});

app.post("/api/face/search", async (req, res) => {
  try {
    await ensureSchemaReady();

    const result = await postFaceImageToAi({
      endpointType: "search",
      imageDataUrl: req.body?.imageDataUrl,
    });

    if (!result.matched) {
      return res.json({ ok: true, matched: false, error: "No matching face found.", ...result });
    }

    const extracted = result.identifiers || extractFaceIdentifiers(result.raw);
    const identity = await findFaceIdentityByIdentifiers([
      extracted.aiFaceKey,
      ...(extracted.identifiers || []),
    ]);

    if (!identity) {
      return res.status(404).json({
        ok: false,
        matched: true,
        error:
          "Face AI recognized the face, but this app has no local profile linked to that AI face yet. Register the face inside this app first.",
        aiFaceKey: extracted.aiFaceKey,
        aiIdentifiers: extracted.identifiers || [],
        ...result,
      });
    }

    const updatedIdentity = await updateFaceIdentitySeen(identity.id, result.raw);
    const profile = identityRowToProfile(updatedIdentity || identity);

    res.json({
      ok: true,
      matched: true,
      name: profile.operator_name,
      profile,
      aiFaceKey: extracted.aiFaceKey,
      aiIdentifiers: extracted.identifiers || [],
      ...result,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Face search failed." });
  }
});

app.post("/api/face/register", async (req, res) => {
  try {
    await ensureSchemaReady();

    const profile = {
      operatorName: cleanText(req.body?.operatorName || req.body?.name),
      employeeId: cleanText(req.body?.employeeId || req.body?.employee_id),
      department: cleanText(req.body?.department),
      roleName: cleanText(req.body?.roleName || req.body?.role_name),
      email: cleanText(req.body?.email),
    };

    if (!profile.operatorName) {
      return res.status(400).json({ ok: false, error: "Name is required for face registration." });
    }

    const registerResult = await postFaceImageToAi({
      endpointType: "register",
      imageDataUrl: req.body?.imageDataUrl,
      operatorName: profile.operatorName,
    });

    let extracted = registerResult.identifiers || extractFaceIdentifiers(registerResult.raw);
    let matchResult = null;

    // Some Face AI register endpoints only return "success" and do not return the
    // stored face row. Search the same captured image immediately so we can get
    // the AI face id/hash/img_name to link to our local app profile table.
    if (!extracted.aiFaceKey) {
      matchResult = await postFaceImageToAi({
        endpointType: "search",
        imageDataUrl: req.body?.imageDataUrl,
      });
      extracted = matchResult.identifiers || extractFaceIdentifiers(matchResult.raw);
    }

    if (!extracted.aiFaceKey) {
      return res.status(502).json({
        ok: false,
        error:
          "Face AI registered the image, but did not return any usable face identifier like img_name, embedding_hash, face_hash, sequence, or _id. The app cannot link login to a local profile yet.",
        registeredName: profile.operatorName,
      });
    }

    const identity = await upsertFaceIdentity({
      profile,
      aiFaceKey: extracted.aiFaceKey,
      identifiers: extracted.identifiers || [],
      registerPayload: registerResult.raw,
      matchPayload: matchResult?.raw || {},
    });

    res.json({
      ok: true,
      registeredName: profile.operatorName,
      name: profile.operatorName,
      profile: identityRowToProfile(identity),
      aiFaceKey: extracted.aiFaceKey,
      aiIdentifiers: extracted.identifiers || [],
      faceFormat: registerResult.faceFormat,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Face registration failed." });
  }
});


app.get("/api/records", async (req, res) => {
  try {
    await ensureSchemaReady();

    const requestedLimit = Number(req.query.limit || 50);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 50;

    const result = await pool.query(
      `
        SELECT
          id,
          operator_name,
          machine_name,
          reading_value,
          product,
          batch_number,
          shift_name,
          remarks,
          record_timestamp,
          created_at,
          updated_at
        FROM app."Confirmation_confirmation_test_records"
        ORDER BY record_timestamp DESC, id DESC
        LIMIT $1
      `,
      [limit]
    );

    res.json({ records: result.rows });
  } catch (error) {
    schemaReadyPromise = null;
    res.status(500).json({ error: getFriendlyDbError(error) });
  }
});

app.post("/api/records", async (req, res) => {
  try {
    await ensureSchemaReady();

    const validationError = getValidationError(req.body || {});
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const operatorName = cleanText(req.body.operator_name);
    const machineName = cleanText(req.body.machine_name);
    const readingValue = toNullableNumber(req.body.reading_value);
    const product = cleanText(req.body.product);
    const batchNumber = cleanText(req.body.batch_number);
    const shiftName = cleanText(req.body.shift_name);
    const remarks = cleanText(req.body.remarks);

    const result = await pool.query(
      `
        INSERT INTO app."Confirmation_confirmation_test_records" (
          operator_name,
          machine_name,
          reading_value,
          product,
          batch_number,
          shift_name,
          remarks,
          record_timestamp
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING
          id,
          operator_name,
          machine_name,
          reading_value,
          product,
          batch_number,
          shift_name,
          remarks,
          record_timestamp,
          created_at,
          updated_at
      `,
      [operatorName, machineName, readingValue, product, batchNumber, shiftName, remarks]
    );

    res.status(201).json({ record: result.rows[0] });
  } catch (error) {
    schemaReadyPromise = null;
    res.status(500).json({ error: getFriendlyDbError(error) });
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

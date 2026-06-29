import path from "path";
import fs from "fs/promises";
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
const AI_FACE_IMAGE_FIELD = process.env.AI_FACE_IMAGE_FIELD || "file";
const AI_FACE_NAME_FIELD = process.env.AI_FACE_NAME_FIELD || "name";
const AI_FACE_TIMEOUT_MS = Number(process.env.AI_FACE_TIMEOUT_MS || 30000);

let schemaReadyPromise = null;

app.use(cors());
app.use(express.json({ limit: "12mb" }));

function cleanText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
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

  return { buffer, mimeType };
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }

  return "";
}

function normalizeFaceResult(rawResult) {
  if (rawResult && typeof rawResult === "object") {
    const firstMatch = Array.isArray(rawResult.matches) ? rawResult.matches[0] : null;
    const firstResult = Array.isArray(rawResult.results) ? rawResult.results[0] : null;
    const nestedResult = rawResult.result && typeof rawResult.result === "object" ? rawResult.result : null;

    const name = cleanText(
      firstNonEmpty(
        rawResult.name,
        rawResult.operator_name,
        rawResult.person,
        rawResult.person_name,
        rawResult.employee_name,
        rawResult.identity,
        rawResult.user,
        nestedResult?.name,
        nestedResult?.person,
        firstMatch?.name,
        firstMatch?.person,
        firstResult?.name,
        firstResult?.person
      )
    );

    const confidence = firstNonEmpty(
      rawResult.confidence,
      rawResult.score,
      rawResult.similarity,
      nestedResult?.confidence,
      firstMatch?.confidence,
      firstMatch?.score,
      firstResult?.confidence,
      firstResult?.score
    );

    const explicitMatched = firstNonEmpty(rawResult.matched, rawResult.found, rawResult.success, nestedResult?.matched);
    const matchedByName = Boolean(name) && !["unknown", "not found", "none", "null"].includes(name.toLowerCase());
    const matched = explicitMatched === "" ? matchedByName : Boolean(explicitMatched) && explicitMatched !== "false";

    return {
      matched: matched || matchedByName,
      name,
      confidence: confidence === "" ? null : confidence,
      raw: rawResult,
    };
  }

  const text = cleanText(rawResult);

  return {
    matched: Boolean(text),
    name: text,
    confidence: null,
    raw: rawResult,
  };
}

function buildAiUrl(endpointPath) {
  const base = AI_FACE_BASE_URL.endsWith("/") ? AI_FACE_BASE_URL : `${AI_FACE_BASE_URL}/`;
  const cleanPath = endpointPath.startsWith("/") ? endpointPath.slice(1) : endpointPath;
  return new URL(cleanPath, base).toString();
}

async function postFaceImageToAi({ endpointPath, imageDataUrl, operatorName }) {
  const { buffer, mimeType } = parseImageDataUrl(imageDataUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_FACE_TIMEOUT_MS);

  try {
    const formData = new FormData();
    const blob = new Blob([buffer], { type: mimeType });

    formData.append(AI_FACE_IMAGE_FIELD, blob, `face-capture-${Date.now()}.jpg`);

    if (operatorName) {
      formData.append(AI_FACE_NAME_FIELD, operatorName);
      formData.append("operator_name", operatorName);
    }

    const response = await fetch(buildAiUrl(endpointPath), {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();

    if (!response.ok) {
      const errorMessage = typeof payload === "string" ? payload : payload?.error || payload?.message;
      throw new Error(errorMessage || `Face AI returned HTTP ${response.status}`);
    }

    return normalizeFaceResult(payload);
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

app.post("/api/face/search", async (req, res) => {
  try {
    const result = await postFaceImageToAi({
      endpointPath: AI_FACE_SEARCH_PATH,
      imageDataUrl: req.body?.imageDataUrl,
    });

    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Face search failed." });
  }
});

app.post("/api/face/register", async (req, res) => {
  try {
    const operatorName = cleanText(req.body?.operatorName || req.body?.name);

    if (!operatorName) {
      return res.status(400).json({ ok: false, error: "Name is required for face registration." });
    }

    const result = await postFaceImageToAi({
      endpointPath: AI_FACE_REGISTER_PATH,
      imageDataUrl: req.body?.imageDataUrl,
      operatorName,
    });

    res.json({ ok: true, registeredName: operatorName, ...result });
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
        FROM app.confirmation_test_records
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
        INSERT INTO app.confirmation_test_records (
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

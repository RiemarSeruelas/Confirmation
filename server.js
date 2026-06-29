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

let schemaReadyPromise = null;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

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

  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server ready: http://localhost:${PORT}`);
});

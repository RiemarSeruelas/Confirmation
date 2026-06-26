import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { pool, testConnection } from "./db.js";
import { makeDatabase } from "./makeDb.js";

const PORT = Number(process.env.PORT || 5057);
const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_req, res) => {
  try {
    const db = await testConnection();
    res.json({
      ok: true,
      app: "confirmation-db-only",
      dbTime: db.now,
      port: PORT
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Database connection failed",
      error: error.message
    });
  }
});

app.get("/api/records", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        operator_name,
        machine_name,
        reading_value,
        remarks,
        created_at
      FROM app.confirmation_test_records
      ORDER BY created_at DESC
      LIMIT 50
    `);

    res.json({
      ok: true,
      records: result.rows
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Failed to fetch records",
      error: error.message
    });
  }
});

app.post("/api/records", async (req, res) => {
  try {
    const {
      operator_name,
      machine_name,
      reading_value,
      remarks
    } = req.body || {};

    if (!operator_name || !machine_name) {
      return res.status(400).json({
        ok: false,
        message: "operator_name and machine_name are required"
      });
    }

    const value =
      reading_value === "" || reading_value === null || reading_value === undefined
        ? null
        : Number(reading_value);

    if (value !== null && Number.isNaN(value)) {
      return res.status(400).json({
        ok: false,
        message: "reading_value must be a number"
      });
    }

    const result = await pool.query(
      `
        INSERT INTO app.confirmation_test_records
          (operator_name, machine_name, reading_value, remarks)
        VALUES
          ($1, $2, $3, $4)
        RETURNING
          id,
          operator_name,
          machine_name,
          reading_value,
          remarks,
          created_at
      `,
      [
        String(operator_name).trim(),
        String(machine_name).trim(),
        value,
        remarks ? String(remarks).trim() : ""
      ]
    );

    res.status(201).json({
      ok: true,
      record: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Failed to insert record",
      error: error.message
    });
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.resolve(__dirname, "../../client/dist");

app.use(express.static(clientDist));

app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

try {
  await makeDatabase();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Confirmation DB Only running on http://0.0.0.0:${PORT}`);
  });
} catch (error) {
  console.error("Failed to start server because DB maker failed:", error);
  process.exit(1);
}

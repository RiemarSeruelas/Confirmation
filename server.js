import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { pool, testDbConnection } from "./db.js";
import { makeDatabase } from "./makeDb.js";

const PORT = Number(process.env.PORT || 5057);
const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function getCurrentShift(date = new Date()) {
  const manilaDate = new Date(
    date.toLocaleString("en-US", { timeZone: "Asia/Manila" })
  );

  const hour = manilaDate.getHours();

  if (hour >= 6 && hour < 14) return "1st Shift";
  if (hour >= 14 && hour < 22) return "2nd Shift";
  return "3rd Shift";
}

app.get("/api/health", async (_req, res) => {
  try {
    const db = await testDbConnection();

    res.json({
      ok: true,
      app: "confirmation-react-db-simple",
      dbTime: db.db_time,
      port: PORT
    });
  } catch (error) {
    console.error("Health check failed:", error);
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
        product,
        batch_number,
        shift_name,
        remarks,
        created_at,
        updated_at
      FROM app.confirmation_test_records
      ORDER BY updated_at DESC, id DESC
      LIMIT 100
    `);

    res.json({
      ok: true,
      records: result.rows
    });
  } catch (error) {
    console.error("Fetch records failed:", error);
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
      product,
      batch_number,
      remarks
    } = req.body || {};

    if (!operator_name || !String(operator_name).trim()) {
      return res.status(400).json({
        ok: false,
        message: "Operator name is required"
      });
    }

    if (!machine_name || !String(machine_name).trim()) {
      return res.status(400).json({
        ok: false,
        message: "Machine name is required"
      });
    }

    const numericValue =
      reading_value === "" || reading_value === null || reading_value === undefined
        ? null
        : Number(reading_value);

    if (numericValue !== null && Number.isNaN(numericValue)) {
      return res.status(400).json({
        ok: false,
        message: "Reading value must be a number"
      });
    }

    const shiftName = getCurrentShift();

    const result = await pool.query(
      `
        INSERT INTO app.confirmation_test_records
          (
            operator_name,
            machine_name,
            reading_value,
            product,
            batch_number,
            shift_name,
            remarks
          )
        VALUES
          ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
          id,
          operator_name,
          machine_name,
          reading_value,
          product,
          batch_number,
          shift_name,
          remarks,
          created_at,
          updated_at
      `,
      [
        String(operator_name).trim(),
        String(machine_name).trim(),
        numericValue,
        product ? String(product).trim() : "",
        batch_number ? String(batch_number).trim() : "",
        shiftName,
        remarks ? String(remarks).trim() : ""
      ]
    );

    res.status(201).json({
      ok: true,
      record: result.rows[0]
    });
  } catch (error) {
    console.error("Insert record failed:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to save record",
      error: error.message
    });
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "dist");

app.use(express.static(distPath));

app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

try {
  await makeDatabase();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Confirmation React DB Simple API running on http://0.0.0.0:${PORT}`);
  });
} catch (error) {
  console.error("Failed to start server because DB maker failed:", error);
  process.exit(1);
}

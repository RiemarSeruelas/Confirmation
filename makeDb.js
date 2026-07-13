import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { pool, testDbConnection } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const setupFiles = ["schema.sql", "confirmationproof.sql"];

function getDatabaseName() {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    return decodeURIComponent(url.pathname.replace(/^\//, "")) || "mydatabase";
  }

  return process.env.PGDATABASE || "mydatabase";
}

function getConnectionTarget() {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    url.password = "****";
    return url.toString();
  }

  return `${process.env.PGUSER || "postgres"}@${process.env.PGHOST || "localhost"}:${process.env.PGPORT || 5432}/${getDatabaseName()}`;
}

function getFriendlyError(error) {
  const host = process.env.PGHOST || "localhost";
  const port = process.env.PGPORT || 5432;
  const database = getDatabaseName();

  if (error.code === "ECONNREFUSED") {
    return `PostgreSQL refused the connection at ${host}:${port}. Check that PostgreSQL is running and reachable.`;
  }

  if (error.code === "ENOTFOUND") {
    return `PostgreSQL host "${host}" could not be resolved. Check PGHOST.`;
  }

  if (error.code === "28P01") {
    return "PostgreSQL username or password is incorrect. Check PGUSER and PGPASSWORD.";
  }

  if (error.code === "3D000") {
    return `Database "${database}" does not exist. Create it first or set PGDATABASE to the correct existing database.`;
  }

  if (error.code === "42501") {
    return `User "${process.env.PGUSER || "postgres"}" does not have permission to create or update objects in database "${database}".`;
  }

  return error.message || "Database setup failed.";
}

async function runSqlFile(filename) {
  const filePath = path.join(__dirname, filename);

  try {
    const sql = await fs.readFile(filePath, "utf8");

    if (!sql.trim()) {
      console.log(`Skipped empty file: ${filename}`);
      return;
    }

    await pool.query(sql);
    console.log(`Applied: ${filename}`);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Missing setup file: ${filePath}`);
    }

    throw error;
  }
}

async function main() {
  try {
    console.log(`Connection target: ${getConnectionTarget()}`);

    const connection = await testDbConnection();

    if (connection.current_database !== getDatabaseName()) {
      throw new Error(
        `Connected to "${connection.current_database}" instead of "${getDatabaseName()}". Check PGDATABASE or DATABASE_URL.`
      );
    }

    console.log(`Connected to database: ${connection.current_database}`);

    for (const filename of setupFiles) {
      await runSqlFile(filename);
    }

    const result = await pool.query(`
      SELECT
        to_regclass('app.confirmation_test_records') AS confirmation_test_records,
        to_regclass('app.face_identities') AS face_identities,
        to_regclass('app.machine_configs') AS machine_configs,
        to_regclass('app.confirmationproof') AS confirmationproof
    `);

    console.log("Database setup complete.");
    console.table(result.rows[0]);
  } catch (error) {
    console.error(getFriendlyError(error));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();

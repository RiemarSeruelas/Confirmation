import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { pool, testDbConnection } from "./db.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_APP_DATABASE = "confirmation_test_db";

function getTargetDatabaseName() {
  if (process.env.DATABASE_URL) {
    const databaseUrl = new URL(process.env.DATABASE_URL);
    const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
    return databaseName || DEFAULT_APP_DATABASE;
  }

  return process.env.PGDATABASE || DEFAULT_APP_DATABASE;
}

function getPrintableTarget() {
  if (process.env.DATABASE_URL) {
    const databaseUrl = new URL(process.env.DATABASE_URL);
    return databaseUrl.toString().replace(/:[^:@/]+@/, ":****@");
  }

  return `${process.env.PGUSER || "postgres"}@${process.env.PGHOST || "localhost"}:${process.env.PGPORT || 5432}/${getTargetDatabaseName()}`;
}

function explainSetupError(error) {
  const databaseName = getTargetDatabaseName();

  if (error.code === "ECONNREFUSED") {
    return (
      `PostgreSQL refused the connection at ${process.env.PGHOST || "localhost"}:${process.env.PGPORT || 5432}.\n` +
      `Start PostgreSQL, or fix PGHOST/PGPORT in .env.`
    );
  }

  if (error.code === "ENOTFOUND") {
    return `Cannot find PostgreSQL host "${process.env.PGHOST}". Check PGHOST in .env.`;
  }

  if (error.code === "28P01") {
    return "PostgreSQL username/password is wrong. Check PGUSER and PGPASSWORD in .env.";
  }

  if (error.code === "3D000") {
    return (
      `Database "${databaseName}" does not exist.\n` +
      `Create that database manually in PostgreSQL, or change PGDATABASE in .env to the existing database that already has your app schema.`
    );
  }

  if (error.code === "42501") {
    return (
      `PostgreSQL permission error. Your user can connect, but cannot create/update schema or tables in database "${databaseName}".\n` +
      `Ask the DB admin to grant CREATE permission on that database/schema, or run setup-db using an admin account once.`
    );
  }

  return error.message;
}

async function main() {
  try {
    console.log(`🔎 Connection target: ${getPrintableTarget()}`);
    console.log("🔎 setup-db does not create databases.");
    console.log("🔎 It only creates/updates the app schema tables inside the database from .env.");

    const connection = await testDbConnection();
    console.log("✅ Connected to PostgreSQL database:", connection.current_database);

    const schemaPath = path.join(__dirname, "schema.sql");
    const schemaSql = await fs.readFile(schemaPath, "utf8");

    await pool.query(schemaSql);
    console.log("✅ Tables are ready: app.confirmation_test_records + app.face_identities + app.machine_configs");
  } catch (error) {
    console.error("❌ Failed to setup database tables:");
    console.error(explainSetupError(error));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();

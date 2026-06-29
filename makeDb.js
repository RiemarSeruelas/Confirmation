import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";
import { pool, testDbConnection } from "./db.js";

dotenv.config();

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_APP_DATABASE = "confirmation_test_db";
const DEFAULT_MAINTENANCE_DATABASE = "postgres";

function shouldUseSsl() {
  return String(process.env.PGSSL || "false").toLowerCase() === "true";
}

function getTargetDatabaseName() {
  if (process.env.DATABASE_URL) {
    const databaseUrl = new URL(process.env.DATABASE_URL);
    const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
    return databaseName || DEFAULT_APP_DATABASE;
  }

  return process.env.PGDATABASE || DEFAULT_APP_DATABASE;
}

function getMaintenanceDatabaseName() {
  return process.env.PGMAINTENANCE_DATABASE || DEFAULT_MAINTENANCE_DATABASE;
}

function getMaintenancePoolConfig() {
  const useSsl = shouldUseSsl();
  const maintenanceDatabase = getMaintenanceDatabaseName();

  if (process.env.DATABASE_URL) {
    const databaseUrl = new URL(process.env.DATABASE_URL);
    databaseUrl.pathname = `/${encodeURIComponent(maintenanceDatabase)}`;

    return {
      connectionString: databaseUrl.toString(),
      ssl: useSsl ? { rejectUnauthorized: false } : false,
    };
  }

  return {
    host: process.env.PGHOST || "localhost",
    port: Number(process.env.PGPORT || 5432),
    database: maintenanceDatabase,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  };
}

function getPrintableTarget() {
  if (process.env.DATABASE_URL) {
    const databaseUrl = new URL(process.env.DATABASE_URL);
    const safeUrl = databaseUrl.toString().replace(/:[^:@/]+@/, ":****@");
    return safeUrl;
  }

  return `${process.env.PGUSER || "postgres"}@${process.env.PGHOST || "localhost"}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || DEFAULT_APP_DATABASE}`;
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function explainConnectionError(error) {
  if (error.code === "ECONNREFUSED") {
    return (
      `PostgreSQL refused the connection at ${process.env.PGHOST || "localhost"}:${process.env.PGPORT || 5432}.\n` +
      `This usually means PostgreSQL is not running there, or PGHOST/PGPORT is wrong.\n\n` +
      `Fix checklist:\n` +
      `1. Start PostgreSQL service.\n` +
      `2. Confirm PGPORT is usually 5432.\n` +
      `3. If this app runs on Windows and PostgreSQL is installed on Windows, use PGHOST=localhost.\n` +
      `4. If this app runs inside Docker and PostgreSQL is on your PC, use PGHOST=host.docker.internal.\n` +
      `5. If PostgreSQL is another Docker container, use that container/service name as PGHOST.\n` +
      `6. Run npm run check-db to test the connection only.`
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
      `Cannot connect to database. If the app DB is missing, setup-db should create it, but ` +
      `PGMAINTENANCE_DATABASE must already exist. Usually set PGMAINTENANCE_DATABASE=postgres.`
    );
  }

  return error.message;
}

async function ensureDatabaseExists() {
  const targetDatabase = getTargetDatabaseName();
  const maintenanceDatabase = getMaintenanceDatabaseName();

  if (!targetDatabase) {
    throw new Error("Missing target database name. Set PGDATABASE or DATABASE_URL in your .env file.");
  }

  const maintenanceConfig = getMaintenancePoolConfig();
  const adminPool = new Pool(maintenanceConfig);

  try {
    console.log(`🔎 Connection target: ${getPrintableTarget()}`);
    console.log(`🔎 Checking database: ${targetDatabase}`);
    console.log(`🔎 Using maintenance database: ${maintenanceDatabase}`);

    const existingDatabase = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [targetDatabase]
    );

    if (existingDatabase.rowCount > 0) {
      console.log(`✅ Database already exists: ${targetDatabase}`);
      return;
    }

    console.log(`🛠️ Creating database: ${targetDatabase}`);
    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(targetDatabase)}`);
    console.log(`✅ Created database: ${targetDatabase}`);
  } catch (error) {
    if (error.code === "42501") {
      throw new Error(
        `The PostgreSQL user does not have permission to create database "${targetDatabase}". ` +
          `Use a superuser/admin account for npm run setup-db, or create the database manually once.`
      );
    }

    throw new Error(explainConnectionError(error));
  } finally {
    await adminPool.end();
  }
}

async function main() {
  try {
    await ensureDatabaseExists();

    const connection = await testDbConnection();
    console.log("✅ Connected to app database:", connection.server_time);

    const schemaPath = path.join(__dirname, "schema.sql");
    const schemaSql = await fs.readFile(schemaPath, "utf8");

    await pool.query(schemaSql);
    console.log("✅ Database schema is ready: app.confirmation_test_records");
  } catch (error) {
    console.error("❌ Failed to setup database:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();

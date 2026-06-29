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

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function ensureDatabaseExists() {
  const targetDatabase = getTargetDatabaseName();
  const maintenanceDatabase = getMaintenanceDatabaseName();

  if (!targetDatabase) {
    throw new Error("Missing target database name. Set PGDATABASE or DATABASE_URL in your .env file.");
  }

  const adminPool = new Pool(getMaintenancePoolConfig());

  try {
    console.log(`🔎 Checking database: ${targetDatabase}`);

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
    if (error.code === "3D000") {
      throw new Error(
        `Cannot connect to maintenance database "${maintenanceDatabase}". ` +
          `Set PGMAINTENANCE_DATABASE to an existing database, usually "postgres".`
      );
    }

    if (error.code === "42501") {
      throw new Error(
        `The PostgreSQL user does not have permission to create database "${targetDatabase}". ` +
          `Use a superuser/admin account for npm run setup-db, or create the database manually once.`
      );
    }

    throw error;
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

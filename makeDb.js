import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { pool, testDbConnection } from "./db.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATABASE = "confirmation_test_db";

function targetDatabaseName() {
  if (!process.env.DATABASE_URL) return process.env.PGDATABASE || DEFAULT_DATABASE;
  const url = new URL(process.env.DATABASE_URL);
  return decodeURIComponent(url.pathname.replace(/^\//, "")) || DEFAULT_DATABASE;
}

function printableTarget() {
  if (process.env.DATABASE_URL) {
    return new URL(process.env.DATABASE_URL).toString().replace(/:[^:@/]+@/, ":****@");
  }

  return `${process.env.PGUSER || "postgres"}@${process.env.PGHOST || "localhost"}:${process.env.PGPORT || 5432}/${targetDatabaseName()}`;
}

function setupError(error) {
  const messages = {
    ECONNREFUSED: `PostgreSQL refused the connection at ${process.env.PGHOST || "localhost"}:${process.env.PGPORT || 5432}.`,
    ENOTFOUND: `Cannot find PostgreSQL host "${process.env.PGHOST}".`,
    "28P01": "PostgreSQL username or password is incorrect.",
    "3D000": `Database "${targetDatabaseName()}" does not exist.`,
    "42501": `The PostgreSQL user cannot create or update tables in "${targetDatabaseName()}".`,
  };
  return messages[error.code] || error.message;
}

async function runSqlFile(filename) {
  const sql = await fs.readFile(path.join(__dirname, filename), "utf8");
  await pool.query(sql);
}

async function main() {
  try {
    console.log(`Target: ${printableTarget()}`);
    const connection = await testDbConnection();
    console.log(`Connected: ${connection.current_database}`);

    await runSqlFile("schema.sql");
    await runSqlFile("confirmationproof.sql");

    console.log("Tables ready: app.confirmation_test_records, app.face_identities, app.machine_configs, app.confirmationproof");
  } catch (error) {
    console.error(setupError(error));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();

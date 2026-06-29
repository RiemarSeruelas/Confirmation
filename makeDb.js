import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { pool, testDbConnection } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  try {
    const connection = await testDbConnection();
    console.log("✅ Connected to PostgreSQL:", connection.server_time);

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

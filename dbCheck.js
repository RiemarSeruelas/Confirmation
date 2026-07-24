import net from "net";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const DEFAULT_DATABASE = "confirmation_test_db";

function sslConfig() {
  return String(process.env.PGSSL || "false").toLowerCase() === "true"
    ? { rejectUnauthorized: false }
    : false;
}

function connectionInfo() {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    return {
      label: url.toString().replace(/:[^:@/]+@/, ":****@"),
      host: url.hostname || "localhost",
      port: Number(url.port || 5432),
      config: { connectionString: url.toString(), ssl: sslConfig() },
    };
  }

  const host = process.env.PGHOST || "localhost";
  const port = Number(process.env.PGPORT || 5432);
  const database = process.env.PGDATABASE || DEFAULT_DATABASE;
  const user = process.env.PGUSER || "postgres";

  return {
    label: `${user}@${host}:${port}/${database}`,
    host,
    port,
    config: {
      host,
      port,
      database,
      user,
      password: process.env.PGPASSWORD,
      ssl: sslConfig(),
    },
  };
}

function checkPort(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let finished = false;

    const finish = (result) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ ok: true }));
    socket.once("timeout", () => finish({ ok: false, message: `Timed out connecting to ${host}:${port}` }));
    socket.once("error", (error) => finish({ ok: false, message: error.message, code: error.code }));
    socket.connect(port, host);
  });
}

async function main() {
  const info = connectionInfo();
  console.log(`Target: ${info.label}`);

  const portCheck = await checkPort(info.host, info.port);
  if (!portCheck.ok) {
    throw new Error(`${portCheck.code || "CONNECTION_ERROR"}: ${portCheck.message}`);
  }

  const pool = new Pool(info.config);
  try {
    const { rows } = await pool.query(
      "SELECT current_database() AS database_name, NOW() AS server_time"
    );
    console.log(`Database: ${rows[0].database_name}`);
    console.log(`Server time: ${rows[0].server_time}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

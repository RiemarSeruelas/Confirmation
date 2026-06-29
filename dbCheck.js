import net from "net";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

const DEFAULT_APP_DATABASE = "confirmation_test_db";
const DEFAULT_MAINTENANCE_DATABASE = "postgres";

function shouldUseSsl() {
  return String(process.env.PGSSL || "false").toLowerCase() === "true";
}

function getConnectionInfo(databaseOverride) {
  const useSsl = shouldUseSsl();

  if (process.env.DATABASE_URL) {
    const databaseUrl = new URL(process.env.DATABASE_URL);
    if (databaseOverride) {
      databaseUrl.pathname = `/${encodeURIComponent(databaseOverride)}`;
    }

    return {
      label: databaseUrl.toString().replace(/:[^:@/]+@/, ":****@"),
      host: databaseUrl.hostname || "localhost",
      port: Number(databaseUrl.port || 5432),
      config: {
        connectionString: databaseUrl.toString(),
        ssl: useSsl ? { rejectUnauthorized: false } : false,
      },
    };
  }

  const host = process.env.PGHOST || "localhost";
  const port = Number(process.env.PGPORT || 5432);
  const database = databaseOverride || process.env.PGDATABASE || DEFAULT_APP_DATABASE;
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
      ssl: useSsl ? { rejectUnauthorized: false } : false,
    },
  };
}

function checkTcpPort(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    function finish(result) {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    }

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ ok: true }));
    socket.once("timeout", () => finish({ ok: false, message: `Timed out connecting to ${host}:${port}` }));
    socket.once("error", (error) => finish({ ok: false, message: error.message, code: error.code }));
    socket.connect(port, host);
  });
}

async function checkPgConnection(label, config) {
  const pool = new Pool(config);

  try {
    const result = await pool.query("SELECT current_database() AS database_name, NOW() AS server_time");
    const row = result.rows[0];
    console.log(`✅ PostgreSQL connection OK: ${label}`);
    console.log(`   database: ${row.database_name}`);
    console.log(`   server time: ${row.server_time}`);
  } finally {
    await pool.end();
  }
}

async function main() {
  const maintenanceDatabase = process.env.PGMAINTENANCE_DATABASE || DEFAULT_MAINTENANCE_DATABASE;
  const appDatabase = process.env.PGDATABASE || DEFAULT_APP_DATABASE;
  const appInfo = getConnectionInfo();

  console.log("🔎 DB connection check");
  console.log(`   target: ${appInfo.label}`);

  const tcp = await checkTcpPort(appInfo.host, appInfo.port);

  if (!tcp.ok) {
    console.error("❌ PostgreSQL port is not reachable.");
    console.error(`   Host/port tried: ${appInfo.host}:${appInfo.port}`);
    console.error(`   Error: ${tcp.code || "UNKNOWN"} ${tcp.message || ""}`);
    console.error("");
    console.error("Most common fixes:");
    console.error("1. Start PostgreSQL service.");
    console.error("2. Check PGHOST and PGPORT in .env.");
    console.error("3. If the app runs in Docker and PostgreSQL is on your PC, use PGHOST=host.docker.internal.");
    console.error("4. If PostgreSQL is another Docker container, use the container/service name as PGHOST.");
    process.exitCode = 1;
    return;
  }

  console.log(`✅ TCP port is open: ${appInfo.host}:${appInfo.port}`);

  try {
    const maintenanceInfo = getConnectionInfo(maintenanceDatabase);
    await checkPgConnection(`maintenance DB: ${maintenanceInfo.label}`, maintenanceInfo.config);
  } catch (error) {
    console.error("❌ Connected to the port, but PostgreSQL login/query failed for maintenance DB.");
    console.error(`   Error: ${error.message}`);
    console.error("   Check PGUSER, PGPASSWORD, PGMAINTENANCE_DATABASE, and PGSSL.");
    process.exitCode = 1;
    return;
  }

  try {
    const targetInfo = getConnectionInfo(appDatabase);
    await checkPgConnection(`app DB: ${targetInfo.label}`, targetInfo.config);
  } catch (error) {
    console.error("❌ Maintenance DB works, but app DB connection failed.");
    console.error(`   Error: ${error.message}`);
    console.error("   If the app database does not exist yet, run: npm run setup-db");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("❌ Unexpected DB check error:");
  console.error(error);
  process.exitCode = 1;
});

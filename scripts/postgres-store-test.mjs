import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DataType, newDb } from "pg-mem";

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "power-tool-postgres-"));
const memory = newDb();
memory.public.registerFunction({
  name: "hashtext",
  args: [DataType.text],
  returns: DataType.integer,
  implementation: () => 1
});
memory.public.registerFunction({
  name: "pg_advisory_xact_lock",
  args: [DataType.integer],
  returns: DataType.integer,
  implementation: () => 1
});

const adapter = memory.adapters.createPg();
globalThis.__POWER_TOOL_POSTGRES_POOL__ = adapter.Pool;
process.env.POSTGRES_ENABLED = "true";
process.env.POSTGRES_HOST = "memory";
process.env.POSTGRES_PORT = "5432";
process.env.POSTGRES_DB = "mydatabase";
process.env.POSTGRES_USER = "myuser";
process.env.POSTGRES_PASSWORD = "not-logged";
process.env.POSTGRES_SCHEMA = "app";
process.env.POWER_TOOL_DATA_DIR = dataDir;

const legacyDb = {
  meta: { appName: "Power Tool", version: 10, updatedAt: "2026-07-24T00:00:00.000Z" },
  categories: [
    {
      id: "cat-elc",
      name: "ELC",
      description: "",
      detailFields: [{ id: "vendor", label: "Vendor", type: "text", required: true, placeholder: "", options: [] }],
      reviewQuestions: [],
      createdAt: "2026-07-24T00:00:00.000Z"
    },
    {
      id: "cat-portable-tool",
      name: "Portable Tools",
      description: "",
      detailFields: [],
      reviewQuestions: [],
      createdAt: "2026-07-24T00:00:00.000Z"
    }
  ],
  legacyCategories: [],
  staffAccounts: [
    { id: "admin", username: "admin", password: "engineering2026", role: "admin", displayName: "admin", active: true },
    { id: "reviewer", username: "reviewer", password: "1234", role: "reviewer", displayName: "reviewer", active: true }
  ],
  requests: [{ id: "request-imported", status: "pending", itemName: "Imported request" }],
  items: [{ id: "item-imported", qrId: "QR-IMPORTED", itemName: "Imported item", renewalHistory: [] }],
  usage: {
    totalVisits: 4,
    totalQrOpens: 2,
    totalChecklistViews: 1,
    ips: {},
    sessions: {},
    events: {}
  }
};
await fs.writeFile(path.join(dataDir, "db.json"), JSON.stringify(legacyDb, null, 2));

const {
  checkDb,
  closeDb,
  getDbPath,
  initializeDataStore,
  readDb,
  writeDb
} = await import("../server/dataStore.js");

await initializeDataStore();
const imported = await readDb();
assert.equal(imported.requests[0].id, "request-imported");
assert.equal(imported.items[0].qrId, "QR-IMPORTED");
assert.equal(imported.staffAccounts.length, 2);
assert.equal(imported.usage.totalVisits, 4);
assert.equal((await checkDb()).provider, "postgresql");
assert.equal(getDbPath().includes("not-logged"), false);

const writerA = await readDb();
const writerB = await readDb();
writerA.requests.push({ id: "request-a", status: "pending", itemName: "Concurrent A" });
writerB.requests.push({ id: "request-b", status: "pending", itemName: "Concurrent B" });
await Promise.all([writeDb(writerA), writeDb(writerB)]);
const afterConcurrentRecords = await readDb();
assert.ok(afterConcurrentRecords.requests.some((record) => record.id === "request-a"));
assert.ok(afterConcurrentRecords.requests.some((record) => record.id === "request-b"));

function addVisit(snapshot, sessionId, ip) {
  snapshot.usage.totalVisits += 1;
  snapshot.usage.sessions[sessionId] = {
    sessionId,
    ip,
    createdAt: "2026-07-24T01:00:00.000Z",
    lastSeenAt: "2026-07-24T01:00:00.000Z",
    path: "/"
  };
  snapshot.usage.ips[ip] = {
    ip,
    visits: 1,
    qrOpens: 0,
    checklistViews: 0,
    firstSeenAt: "2026-07-24T01:00:00.000Z",
    lastSeenAt: "2026-07-24T01:00:00.000Z",
    lastPath: "/"
  };
}

const duplicateVisitA = await readDb();
const duplicateVisitB = await readDb();
addVisit(duplicateVisitA, "same-session", "10.0.0.8");
addVisit(duplicateVisitB, "same-session", "10.0.0.8");
await Promise.all([writeDb(duplicateVisitA), writeDb(duplicateVisitB)]);
const afterDuplicateVisit = await readDb();
assert.equal(afterDuplicateVisit.usage.totalVisits, 5);
assert.equal(afterDuplicateVisit.usage.ips["10.0.0.8"].visits, 1);
assert.equal(Object.keys(afterDuplicateVisit.usage.sessions).length, 1);

const remover = await readDb();
const creator = await readDb();
remover.staffAccounts = remover.staffAccounts.filter((account) => account.id !== "reviewer");
creator.staffAccounts.push({
  id: "reviewer-new",
  username: "reviewer.new",
  password: "5678",
  role: "reviewer",
  displayName: "reviewer.new",
  active: true
});
await Promise.all([writeDb(remover), writeDb(creator)]);
const afterAccountChanges = await readDb();
assert.equal(afterAccountChanges.staffAccounts.some((account) => account.id === "reviewer"), false);
assert.equal(afterAccountChanges.staffAccounts.some((account) => account.id === "reviewer-new"), true);
assert.equal(afterAccountChanges.staffAccounts.some((account) => account.id === "admin"), true);

await closeDb();
delete globalThis.__POWER_TOOL_POSTGRES_POOL__;
console.log("PostgreSQL store test passed: JSON import, normalized persistence, pooled health check, concurrent inserts, deduplicated usage, and targeted deletion are preserved.");

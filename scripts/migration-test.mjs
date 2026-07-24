import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "power-tool-migration-"));
process.env.POWER_TOOL_DATA_DIR = dataDir;

const oldDb = {
  meta: { appName: "Power Tool", version: 5, updatedAt: "2026-07-23T00:00:00.000Z" },
  categories: [
    {
      id: "cat-elc",
      name: "ELC",
      description: "",
      fields: [{ id: "old-review", label: "Old review question", type: "yesno", required: true, options: [] }],
      createdAt: "2026-07-23T00:00:00.000Z"
    },
    { id: "cat-portable-tool", name: "Portable Tools", description: "", fields: [], createdAt: "2026-07-23T00:00:00.000Z" }
  ],
  legacyCategories: [],
  adminAccount: { id: "admin", username: "admin", password: "5678", displayName: "Existing Admin" },
  requests: [{
    id: "request-keep",
    status: "pending",
    categoryId: "cat-elc",
    powerValues: { vendor: "Keep Vendor" },
    powerFieldsSnapshot: [{ id: "vendor", label: "Vendor", type: "text" }],
    fieldsSnapshot: [{ id: "old-review", label: "Old review question", type: "yesno" }],
    values: {},
    toolImage: "data:image/png;base64,LEGACYREQUEST"
  }],
  items: [{ id: "item-keep", qrId: "QR-KEEP", values: { "old-review": "Yes" }, toolImage: "data:image/png;base64,LEGACYITEM" }],
  usage: { totalVisits: 4, totalQrOpens: 2, totalChecklistViews: 1, ips: {}, sessions: {}, events: {} }
};

await fs.writeFile(path.join(dataDir, "db.json"), JSON.stringify(oldDb, null, 2));
const { readDb, writeDb } = await import("../server/dataStore.js");
const migrated = await readDb();

assert.equal(migrated.meta.version, 10);
assert.equal(migrated.staffAccounts.find((account) => account.role === "admin").username, "admin");
assert.equal(migrated.staffAccounts.find((account) => account.role === "admin").password, "engineering2026");
assert.equal(migrated.staffAccounts.find((account) => account.role === "reviewer").username, "reviewer");
assert.equal(migrated.staffAccounts.find((account) => account.role === "reviewer").password, "1234");
assert.equal(Object.prototype.hasOwnProperty.call(migrated, "adminAccount"), false);
assert.equal(migrated.categories[0].reviewQuestions[0].label, "Old review question");
assert.equal(migrated.categories[0].detailFields.length, 7);
assert.equal(migrated.requests[0].id, "request-keep");
assert.equal(migrated.requests[0].detailValues.vendor, "Keep Vendor");
assert.deepEqual(migrated.requests[0].approvalFlow, ["reviewer", "admin"]);
assert.equal(migrated.requests[0].currentApprovalRole, "reviewer-or-admin");
assert.deepEqual(migrated.requests[0].toolImages, ["data:image/png;base64,LEGACYREQUEST"]);
assert.equal(migrated.items[0].reviewAnswers["old-review"], "Yes");
assert.deepEqual(migrated.items[0].toolImages, ["data:image/png;base64,LEGACYITEM"]);
assert.deepEqual(migrated.items[0].renewalHistory, []);
assert.equal(migrated.usage.totalVisits, 4);

const versionEight = structuredClone(migrated);
versionEight.meta.version = 8;
versionEight.categories[0].detailFields.push({
  id: "custom-detail",
  label: "My saved detail",
  type: "text",
  required: false,
  placeholder: "",
  options: []
});
versionEight.categories[0].reviewQuestions.push({
  id: "custom-question",
  label: "My saved review question",
  type: "yesno",
  required: true,
  placeholder: "",
  options: []
});
versionEight.staffAccounts.find((account) => account.role === "admin").password = "9876";
versionEight.staffAccounts.push({
  id: "reviewer-extra",
  username: "reviewer.two",
  password: "5678",
  role: "reviewer",
  displayName: "Second Reviewer",
  createdAt: "2026-07-23T01:00:00.000Z"
});
await fs.writeFile(path.join(dataDir, "db.json"), JSON.stringify(versionEight, null, 2));
const upgradedVersionEight = await readDb();
assert.equal(upgradedVersionEight.meta.version, 10);
assert.equal(upgradedVersionEight.categories[0].detailFields.at(-1).label, "My saved detail");
assert.equal(upgradedVersionEight.categories[0].reviewQuestions.at(-1).label, "My saved review question");
assert.equal(upgradedVersionEight.staffAccounts.find((account) => account.role === "admin").password, "engineering2026");
assert.equal(upgradedVersionEight.staffAccounts.filter((account) => account.role === "reviewer").length, 2);
assert.equal(upgradedVersionEight.staffAccounts.find((account) => account.username === "reviewer.two").displayName, "reviewer.two");

upgradedVersionEight.staffAccounts.find((account) => account.role === "admin").password = "2468";
await writeDb(upgradedVersionEight);
const manuallyEdited = await readDb();
assert.equal(manuallyEdited.staffAccounts.find((account) => account.role === "admin").password, "2468");

console.log("Migration test passed: v10 preserves Builder content, records, multiple Reviewer accounts, renewal history, legacy images, and applies the protected Admin credentials.");

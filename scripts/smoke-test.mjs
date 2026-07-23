import assert from "node:assert/strict";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:5057/api";
const tinyImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

const categoriesResult = await request("/categories");
assert.equal(categoriesResult.response.status, 200);
assert.deepEqual(categoriesResult.body.map((category) => category.id), ["cat-elc", "cat-portable-tool"]);
assert.deepEqual(categoriesResult.body.map((category) => category.name), ["ELC", "Portable Tools"]);
const elc = categoriesResult.body[0];
const portable = categoriesResult.body[1];
assert.deepEqual(elc.detailFields.map((field) => field.label), [
  "Module Type",
  "Search Type",
  "From Date",
  "To Date",
  "Machine",
  "Power Supply (N/A if none)",
  "Vendor"
]);
assert.deepEqual(elc.reviewQuestions, []);
assert.deepEqual(portable.detailFields, []);

const reviewerLogin = await request("/auth/login", {
  method: "POST",
  body: JSON.stringify({ username: "reviewer", password: "1234", role: "reviewer" })
});
assert.equal(reviewerLogin.response.status, 200);
assert.equal(reviewerLogin.body.role, "reviewer");

const adminLogin = await request("/auth/login", {
  method: "POST",
  body: JSON.stringify({ username: "admin", password: "1234", role: "admin" })
});
assert.equal(adminLogin.response.status, 200);
assert.equal(adminLogin.body.role, "admin");

const reviewerAccounts = await request("/staff/reviewers?adminUsername=admin");
assert.equal(reviewerAccounts.response.status, 200);
assert.equal(reviewerAccounts.body.length, 1);
const addedReviewer = await request("/staff/reviewers", {
  method: "POST",
  body: JSON.stringify({
    adminUsername: "admin",
    displayName: "Second Reviewer",
    username: "reviewer.two",
    password: "5678"
  })
});
assert.equal(addedReviewer.response.status, 201);
assert.equal(addedReviewer.body.displayName, "Second Reviewer");
assert.equal(Object.prototype.hasOwnProperty.call(addedReviewer.body, "password"), false);
const secondReviewerLogin = await request("/auth/login", {
  method: "POST",
  body: JSON.stringify({ username: "reviewer.two", password: "5678", role: "reviewer" })
});
assert.equal(secondReviewerLogin.response.status, 200);

const reviewQuestions = [
  { id: "review-guard", label: "Is the guard complete?", type: "yesno", required: true, options: [] },
  { id: "review-result", label: "Inspection result", type: "radio", required: true, options: ["Pass", "Fail"] }
];
const builderResult = await request(`/categories/${elc.id}`, {
  method: "PUT",
  body: JSON.stringify({ ...elc, reviewQuestions })
});
assert.equal(builderResult.response.status, 200);
assert.deepEqual(builderResult.body.reviewQuestions[1].options, ["Pass", "Fail"]);

const invalidResult = await request("/requests", {
  method: "POST",
  body: JSON.stringify({ itemName: "Test ELC", site: "Engineering", categoryId: elc.id, detailValues: {} })
});
assert.equal(invalidResult.response.status, 400);

const createResult = await request("/requests", {
  method: "POST",
  body: JSON.stringify({
    itemName: "Test ELC",
    site: "Engineering",
    submittedBy: "Smoke Test",
    categoryId: elc.id,
    toolImages: [tinyImage, tinyImage],
    detailValues: {
      moduleType: "Electrical",
      searchType: "Inspection",
      fromDate: "2026-07-23",
      toDate: "2026-12-31",
      machine: "Test Machine",
      powerSupply: "230 VAC",
      vendor: "Test Vendor"
    }
  })
});
assert.equal(createResult.response.status, 201);
assert.match(createResult.body.itemCode, /^PT-/);
assert.equal(createResult.body.toolImages.length, 2);
assert.equal(createResult.body.reviewQuestionsSnapshot.length, 2);
assert.deepEqual(createResult.body.reviewAnswers, {});
const requestId = createResult.body.id;

const requestDetails = await request(`/requests/${requestId}`);
assert.equal(requestDetails.response.status, 200);
assert.equal(requestDetails.body.itemName, "Test ELC");
assert.equal(requestDetails.body.toolImages.length, 2);

const missingReview = await request(`/requests/${requestId}/approve`, {
  method: "POST",
  body: JSON.stringify({ role: "reviewer", approvedBy: "Reviewer" })
});
assert.equal(missingReview.response.status, 400);

const approval = await request(`/requests/${requestId}/approve`, {
  method: "POST",
  body: JSON.stringify({
    role: "reviewer",
    approvedBy: "Reviewer",
    reviewNote: "Guard and inspection result verified.",
    reviewAnswers: { "review-guard": "Yes", "review-result": "Pass" }
  })
});
assert.equal(approval.response.status, 201);
assert.equal(approval.body.complete, true);
assert.equal(approval.body.item.expiresAt, "2026-12-31");
assert.equal(approval.body.item.reviewedRole, "reviewer");

const qrId = approval.body.item.qrId;
const itemResult = await request(`/items/qr/${encodeURIComponent(qrId)}`);
assert.equal(itemResult.response.status, 200);
assert.equal(itemResult.body.toolType, "ELC");
assert.equal(itemResult.body.detailValues.powerSupply, "230 VAC");
assert.equal(itemResult.body.detailsSnapshot.length, 7);
assert.equal(itemResult.body.reviewAnswers["review-result"], "Pass");
assert.equal(itemResult.body.toolImages.length, 2);
assert.equal(itemResult.body.reviewedBy, "Reviewer");
assert.equal(itemResult.body.reviewNote, "Guard and inspection result verified.");

const portableBuilder = await request(`/categories/${portable.id}`, {
  method: "PUT",
  body: JSON.stringify({
    ...portable,
    detailFields: [{ id: "portable-vendor", label: "Vendor", type: "text", required: true, options: [] }],
    reviewQuestions: [{ id: "portable-safe", label: "Safe to use?", type: "yesno", required: true, options: [] }]
  })
});
assert.equal(portableBuilder.response.status, 200);

const portableResult = await request("/requests", {
  method: "POST",
  body: JSON.stringify({
    itemName: "Portable Drill",
    site: "Savoury",
    submittedBy: "Smoke Test",
    categoryId: portable.id,
    detailValues: { "portable-vendor": "Vendor A" }
  })
});
assert.equal(portableResult.response.status, 201);

const rejection = await request(`/requests/${portableResult.body.id}/reject`, {
  method: "POST",
  body: JSON.stringify({
    role: "admin",
    rejectedBy: "Administrator",
    reviewAnswers: { "portable-safe": "No" },
    reviewNote: "Cable damaged"
  })
});
assert.equal(rejection.response.status, 200);
assert.equal(rejection.body.status, "rejected");
assert.equal(rejection.body.rejectedRole, "admin");

const archivedRejection = await request(`/requests/${portableResult.body.id}/archive`, {
  method: "POST",
  body: JSON.stringify({ archiveNote: "Test archive" })
});
assert.ok(archivedRejection.body.archivedAt);
const restoredRejection = await request(`/requests/${portableResult.body.id}/restore`, {
  method: "POST",
  body: JSON.stringify({})
});
assert.equal(restoredRejection.body.archivedAt, null);

const approvedSearch = await request(`/items?status=valid&search=${encodeURIComponent(qrId)}`);
assert.equal(approvedSearch.response.status, 200);
assert.equal(approvedSearch.body.length, 1);

const expiredUpdate = await request(`/items/${approval.body.item.id}`, {
  method: "PATCH",
  body: JSON.stringify({ expiresAt: "2020-01-01" })
});
assert.equal(expiredUpdate.body.validity.status, "expired");
const renewedUpdate = await request(`/items/${approval.body.item.id}/renew`, {
  method: "POST",
  body: JSON.stringify({
    expiresAt: "2030-12-31",
    role: "reviewer",
    renewedBy: "Second Reviewer",
    reviewNote: "Renewal inspection completed.",
    reviewAnswers: { "review-guard": "Yes", "review-result": "Pass" }
  })
});
assert.equal(renewedUpdate.response.status, 200);
assert.equal(renewedUpdate.body.validity.status, "valid");
assert.equal(renewedUpdate.body.reviewedBy, "Second Reviewer");
assert.equal(renewedUpdate.body.renewalHistory.length, 1);
assert.equal(renewedUpdate.body.renewalHistory[0].previousExpiresAt, "2020-01-01");
await request(`/items/${approval.body.item.id}`, {
  method: "PATCH",
  body: JSON.stringify({ expiresAt: "2020-01-01" })
});
const archivedUpdate = await request(`/items/${approval.body.item.id}/archive`, {
  method: "POST",
  body: JSON.stringify({ archiveNote: "Smoke archive" })
});
assert.equal(archivedUpdate.body.validity.status, "archived");
await request(`/items/${approval.body.item.id}/restore`, { method: "POST", body: JSON.stringify({}) });

const usageHeaders = { "x-forwarded-for": "192.0.2.10" };
for (let index = 0; index < 2; index += 1) {
  const visit = await request("/usage/visit", { method: "POST", headers: usageHeaders, body: JSON.stringify({ sessionId: "smoke-session", path: "/" }) });
  assert.equal(visit.body.counted, index === 0);
}
const removedUsagePage = await request("/usage");
assert.equal(removedUsagePage.response.status, 404);

const removedReviewer = await request(`/staff/reviewers/${addedReviewer.body.id}`, {
  method: "DELETE",
  body: JSON.stringify({ adminUsername: "admin" })
});
assert.equal(removedReviewer.response.status, 200);

console.log("Smoke test passed: multiple Reviewer accounts, neutral review data, approval attribution, expired renewal, full-page records, QR records, archive/restore, search, and per-IP console usage.");

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { customAlphabet } from "nanoid";
import QRCode from "qrcode";
import {
  checkDb,
  closeDb,
  getDbPath,
  initializeDataStore,
  readDb,
  writeDb
} from "./dataStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 5057);
const nanoid = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 8);

const TOOL_TYPE_IDS = ["cat-elc", "cat-portable-tool"];
const QUESTION_TYPES = new Set(["text", "number", "date", "textarea", "radio", "checkboxes", "select", "yesno", "image"]);
const OPTION_QUESTION_TYPES = new Set(["radio", "checkboxes", "select"]);
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "20mb" }));

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function hasAnswer(value) {
  if (Array.isArray(value)) return value.some((entry) => normalizeText(entry));
  return Boolean(normalizeText(value));
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "field";
}

function getPublicBaseUrl(req) {
  const configured = normalizeText(process.env.PUBLIC_APP_URL);
  if (configured) return configured.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`.replace(/\/$/, "");
}

function makeItemUrl(req, qrId) {
  return `${getPublicBaseUrl(req)}/item/${encodeURIComponent(qrId)}`;
}

function getQrPayload(req, qrId) {
  const mode = normalizeText(process.env.QR_PAYLOAD_MODE || "url").toLowerCase();
  if (["code", "id", "qr-id", "qr_id"].includes(mode)) {
    return `POWERTOOL:${qrId}`;
  }
  return makeItemUrl(req, qrId);
}

function makeBrandedQrSvg(rawSvg) {
  const badge = `
  <rect x="208" y="208" width="144" height="144" rx="28" fill="#ffffff" stroke="#0f62fe" stroke-width="6"/>
  <circle cx="280" cy="280" r="50" fill="#0f62fe"/>
  <text x="280" y="276" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="900" fill="#ffffff">U</text>
  <text x="280" y="303" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="800" fill="#ffffff">POWER TOOL</text>`;
  return rawSvg.replace("</svg>", `${badge}\n</svg>`);
}

async function createBrandedQrDataUrl(payload) {
  const rawSvg = await QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 2,
    width: 560,
    color: {
      dark: "#122033",
      light: "#ffffff"
    }
  });
  const brandedSvg = makeBrandedQrSvg(rawSvg);
  return `data:image/svg+xml;base64,${Buffer.from(brandedSvg).toString("base64")}`;
}

async function ensureBrandedQrForItem(req, item) {
  const expectedPayload = getQrPayload(req, item.qrId);
  if (item.qrBrand === "power-tool-v2" && item.qrImageDataUrl && item.qrPayload === expectedPayload) return false;
  item.qrPayload = expectedPayload;
  item.qrImageDataUrl = await createBrandedQrDataUrl(item.qrPayload);
  item.qrBrand = "power-tool-v2";
  item.updatedAt = nowIso();
  return true;
}

function getItemValidity(item) {
  const archived = Boolean(item.archivedAt);
  const expiresAt = item.expiresAt ? new Date(item.expiresAt) : null;
  const invalidDate = !expiresAt || Number.isNaN(expiresAt.getTime());
  const expired = invalidDate || expiresAt.getTime() < Date.now();
  const daysLeft = invalidDate
    ? null
    : Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return {
    status: archived ? "archived" : expired ? "expired" : "valid",
    isExpired: expired,
    isArchived: archived,
    daysLeft
  };
}

function validateImageDataUrl(value) {
  const image = normalizeText(value);
  if (!image) return { value: "" };
  if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image)) {
    return { error: "Tool image must be a valid image upload." };
  }
  if (image.length > 12_000_000) {
    return { error: "Tool image is too large. Please upload a smaller image." };
  }
  return { value: image };
}

function validateImageList(values, legacyImage = "") {
  const rawImages = Array.isArray(values)
    ? values
    : (legacyImage ? [legacyImage] : []);
  if (rawImages.length > 8) {
    return { error: "You can upload up to 8 equipment images." };
  }

  const images = [];
  let totalLength = 0;
  for (const rawImage of rawImages) {
    const result = validateImageDataUrl(rawImage);
    if (result.error) return result;
    if (!result.value) continue;
    totalLength += result.value.length;
    if (totalLength > 18_000_000) {
      return { error: "The equipment images are too large. Please use smaller images." };
    }
    images.push(result.value);
  }
  return { value: images };
}

function normalizeIp(req) {
  const forwarded = normalizeText(req.headers["x-forwarded-for"]).split(",")[0].trim();
  return (forwarded || normalizeText(req.socket?.remoteAddress) || "unknown").replace(/^::ffff:/, "");
}

function ensureUsage(db) {
  db.usage = db.usage && typeof db.usage === "object" ? db.usage : {};
  db.usage.totalVisits = Number(db.usage.totalVisits || 0);
  db.usage.totalQrOpens = Number(db.usage.totalQrOpens || 0);
  db.usage.totalChecklistViews = Number(db.usage.totalChecklistViews || 0);
  db.usage.ips = db.usage.ips && typeof db.usage.ips === "object" ? db.usage.ips : {};
  db.usage.sessions = db.usage.sessions && typeof db.usage.sessions === "object" ? db.usage.sessions : {};
  db.usage.events = db.usage.events && typeof db.usage.events === "object" ? db.usage.events : {};
  return db.usage;
}

function usageIpRecord(usage, ip) {
  if (!usage.ips[ip]) {
    usage.ips[ip] = {
      ip,
      visits: 0,
      qrOpens: 0,
      checklistViews: 0,
      firstSeenAt: nowIso(),
      lastSeenAt: nowIso(),
      lastPath: ""
    };
  }
  return usage.ips[ip];
}

function trimUsageHistory(usage, key, limit = 5000) {
  const entries = Object.entries(usage[key] || {});
  if (entries.length <= limit) return;
  entries
    .sort((a, b) => new Date(b[1]?.lastSeenAt || b[1]?.createdAt || 0) - new Date(a[1]?.lastSeenAt || a[1]?.createdAt || 0))
    .slice(limit)
    .forEach(([entryKey]) => delete usage[key][entryKey]);
}

function logUsage(usage, message) {
  const uniqueIps = Object.keys(usage.ips || {}).length;
  console.log(
    `[Usage] ${message} | visits=${usage.totalVisits} uniqueIps=${uniqueIps} qrOpens=${usage.totalQrOpens} checklistViews=${usage.totalChecklistViews}`
  );
}

function logUsageByIp(usage) {
  const records = Object.values(usage.ips || {})
    .sort((a, b) => Number(b.visits || 0) - Number(a.visits || 0))
    .slice(0, 50);
  if (records.length === 0) {
    console.log("[Usage][IP] No application visits recorded yet.");
    return;
  }
  for (const record of records) {
    console.log(
      `[Usage][IP] ${record.ip} | visits=${Number(record.visits || 0)} qrOpens=${Number(record.qrOpens || 0)} checklistViews=${Number(record.checklistViews || 0)} lastSeen=${record.lastSeenAt || "—"}`
    );
  }
}

function publicStaffAccount(account) {
  return {
    id: account.id,
    username: account.username,
    displayName: account.displayName || account.username,
    role: normalizeText(account.role).toLowerCase(),
    active: account.active !== false,
    createdAt: account.createdAt || ""
  };
}

function isAdminActor(db, username, password) {
  const finalUsername = normalizeText(username).toLowerCase();
  const account = (db.staffAccounts || []).find((entry) =>
    normalizeText(entry.username).toLowerCase() === finalUsername
    && normalizeText(entry.role).toLowerCase() === "admin"
    && entry.active !== false
  );
  if (!account) return false;
  if (password === undefined) return true;
  return normalizeText(account.password) === normalizeText(password);
}

function publicReviewerAccount(account) {
  return {
    ...publicStaffAccount(account),
    role: "reviewer"
  };
}

function sortStaffAccounts(accounts) {
  return [...accounts].sort((a, b) => {
    if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
    return a.username.localeCompare(b.username);
  });
}

function ensureRequestWorkflow(request) {
  let changed = false;
  if (!Array.isArray(request.approvalFlow) || request.approvalFlow.join("|") !== "reviewer|admin") {
    request.approvalFlow = ["reviewer", "admin"];
    changed = true;
  }
  if (!Array.isArray(request.approvals)) {
    request.approvals = [];
    changed = true;
  }

  if (request.status === "pending") {
    if (request.currentApprovalRole !== "reviewer-or-admin") {
      request.currentApprovalRole = "reviewer-or-admin";
      changed = true;
    }
  } else if (request.currentApprovalRole) {
    request.currentApprovalRole = "";
    changed = true;
  }

  return changed;
}

function requestCanBeActionedBy(request, role) {
  return request.status === "pending" && ["reviewer", "admin"].includes(normalizeText(role).toLowerCase());
}

function normalizeFields(fields, labelName) {
  const normalizedFields = [];
  const usedIds = new Set();

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const label = normalizeText(field.label);
    if (!label) return { error: `${labelName} ${index + 1} needs a title.` };
    const type = QUESTION_TYPES.has(field.type) ? field.type : "text";
    const options = OPTION_QUESTION_TYPES.has(type)
      ? (Array.isArray(field.options) ? field.options : String(field.options || "").split("\n"))
          .map(normalizeText)
          .filter(Boolean)
      : [];
    if (OPTION_QUESTION_TYPES.has(type) && options.length === 0) {
      return { error: `${label} needs at least one answer option.` };
    }

    let id = normalizeText(field.id) || `field-${slugify(label)}-${index + 1}`;
    if (usedIds.has(id)) id = `${id}-${index + 1}`;
    usedIds.add(id);
    normalizedFields.push({
      id,
      label,
      type,
      required: Boolean(field.required),
      placeholder: normalizeText(field.placeholder),
      options
    });
  }

  return { fields: normalizedFields };
}

function validateCategoryPayload(body, existingId) {
  if (!TOOL_TYPE_IDS.includes(existingId)) return { error: "Only ELC and Portable Tools can be edited." };
  const detailsResult = normalizeFields(Array.isArray(body.detailFields) ? body.detailFields : [], "Detail");
  if (detailsResult.error) return detailsResult;
  const questionsResult = normalizeFields(Array.isArray(body.reviewQuestions) ? body.reviewQuestions : [], "Question");
  if (questionsResult.error) return questionsResult;

  return {
    category: {
      id: existingId,
      name: existingId === "cat-elc" ? "ELC" : "Portable Tools",
      description: "",
      detailFields: detailsResult.fields,
      reviewQuestions: questionsResult.fields,
      createdAt: body.createdAt || nowIso(),
      updatedAt: nowIso()
    }
  };
}

function normalizeAnswers(fields, submittedValues, contextLabel) {
  const values = {};
  for (const field of fields || []) {
    const rawValue = submittedValues?.[field.id];
    let answer;
    if (field.type === "checkboxes") {
      const allowed = new Set(field.options || []);
      answer = (Array.isArray(rawValue) ? rawValue : [])
        .map(normalizeText)
        .filter((entry) => entry && allowed.has(entry));
    } else {
      answer = normalizeText(rawValue);
    }

    if (field.type === "image" && answer) {
      const answerImage = validateImageDataUrl(answer);
      if (answerImage.error) return { error: `${field.label} must be a valid image upload.` };
      answer = answerImage.value;
    }
    if (["radio", "select"].includes(field.type) && answer && !(field.options || []).includes(answer)) {
      return { error: `Choose one of the available answers for ${field.label}.` };
    }
    if (field.type === "yesno" && answer && !["Yes", "No"].includes(answer)) {
      return { error: `${field.label} must be answered Yes or No.` };
    }
    if (field.required && !hasAnswer(answer)) {
      return { error: `${field.label} is required ${contextLabel}.` };
    }
    values[field.id] = answer;
  }
  return { values };
}

function validateRequestPayload(db, body) {
  const itemName = normalizeText(body.itemName);
  const itemCode = normalizeText(body.itemCode) || `PT-${nanoid()}`;
  const site = normalizeText(body.site);
  const submittedBy = normalizeText(body.submittedBy);
  const categoryId = normalizeText(body.categoryId);
  const category = db.categories.find((entry) => entry.id === categoryId);

  if (!itemName) return { error: "Equipment Name is required." };
  if (!site) return { error: "Site is required." };
  if (!submittedBy) return { error: "Submitted by is required." };
  if (!category || !TOOL_TYPE_IDS.includes(category.id)) return { error: "Tool type must be ELC or Portable Tools." };

  const imageResult = validateImageList(body.toolImages, body.toolImage);
  if (imageResult.error) return { error: imageResult.error };

  const submittedDetails = body.detailValues && typeof body.detailValues === "object"
    ? body.detailValues
    : (body.powerValues && typeof body.powerValues === "object" ? body.powerValues : {});
  const detailResult = normalizeAnswers(category.detailFields || [], submittedDetails, "in the user details");
  if (detailResult.error) return detailResult;

  if (detailResult.values.fromDate && detailResult.values.toDate) {
    const fromDate = new Date(detailResult.values.fromDate);
    const toDate = new Date(detailResult.values.toDate);
    if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime()) && toDate < fromDate) {
      return { error: "To Date cannot be earlier than From Date." };
    }
  }

  return {
    request: {
      id: `req-${nanoid()}`,
      referenceId: `REF-${nanoid()}`,
      itemName,
      itemCode,
      site,
      submittedBy,
      categoryId: category.id,
      categoryName: category.name,
      toolType: category.name,
      toolImages: imageResult.value,
      toolImage: imageResult.value[0] || "",
      detailValues: detailResult.values,
      detailsSnapshot: category.detailFields || [],
      reviewQuestionsSnapshot: category.reviewQuestions || [],
      reviewAnswers: {},
      approvalFlow: ["reviewer", "admin"],
      approvals: [],
      currentApprovalRole: "reviewer-or-admin",
      status: "pending",
      archivedAt: null,
      submittedAt: nowIso(),
      reviewedAt: null,
      reviewNote: ""
    }
  };
}

function pickExpiryDate(category, detailValues, explicitExpiresAt) {
  if (explicitExpiresAt) return explicitExpiresAt;
  if (detailValues?.toDate) return detailValues.toDate;
  const dateFields = (category.detailFields || []).filter((field) => field.type === "date");
  const requiredDate = dateFields.find((field) => field.required) || dateFields[0];
  if (requiredDate && detailValues?.[requiredDate.id]) return detailValues[requiredDate.id];
  return null;
}

function sortItemsDefault(a, b) {
  const av = getItemValidity(a);
  const bv = getItemValidity(b);
  const aExpired = av.status === "expired" ? 0 : 1;
  const bExpired = bv.status === "expired" ? 0 : 1;
  if (aExpired !== bExpired) return aExpired - bExpired;
  return new Date(a.expiresAt || 0) - new Date(b.expiresAt || 0);
}

app.get("/api/health", async (req, res) => {
  const database = await checkDb();
  res.json({ ok: true, database, dbPath: getDbPath(), time: nowIso() });
});

app.post("/api/auth/login", async (req, res) => {
  const db = await readDb();
  const username = normalizeText(req.body?.username).toLowerCase();
  const password = normalizeText(req.body?.password);
  const requestedRole = normalizeText(req.body?.role).toLowerCase();
  const account = (db.staffAccounts || []).find((entry) =>
    normalizeText(entry.username).toLowerCase() === username
    && normalizeText(entry.password) === password
    && (!requestedRole || normalizeText(entry.role).toLowerCase() === requestedRole)
    && entry.active !== false
  );
  if (!account) {
    return res.status(401).json({ error: "Wrong username or password." });
  }
  res.json({
    username: account.username,
    displayName: account.displayName || account.username,
    role: account.role
  });
});

app.get("/api/staff/accounts", async (req, res) => {
  const db = await readDb();
  if (!isAdminActor(db, req.query.adminUsername)) {
    return res.status(403).json({ error: "Admin access is required." });
  }
  const accounts = (db.staffAccounts || [])
    .filter((account) => ["admin", "reviewer"].includes(normalizeText(account.role).toLowerCase()))
    .map(publicStaffAccount);
  res.json(sortStaffAccounts(accounts));
});

app.get("/api/staff/reviewers", async (req, res) => {
  const db = await readDb();
  if (!isAdminActor(db, req.query.adminUsername)) {
    return res.status(403).json({ error: "Admin access is required." });
  }
  const reviewers = (db.staffAccounts || [])
    .filter((account) => normalizeText(account.role).toLowerCase() === "reviewer")
    .map(publicReviewerAccount)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  res.json(reviewers);
});

app.post("/api/staff/reviewers", async (req, res) => {
  const db = await readDb();
  if (req.body?.adminPassword === undefined || !isAdminActor(db, req.body?.adminUsername, req.body?.adminPassword)) {
    return res.status(403).json({ error: "The Admin password is incorrect." });
  }

  const username = normalizeText(req.body?.username).toLowerCase();
  const password = normalizeText(req.body?.password);
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    return res.status(400).json({ error: "Reviewer username must be 3–40 characters using letters, numbers, dots, dashes, or underscores." });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: "Reviewer password must contain at least 4 characters." });
  }
  if ((db.staffAccounts || []).some((account) => normalizeText(account.username).toLowerCase() === username)) {
    return res.status(409).json({ error: "That username is already in use." });
  }

  const account = {
    id: `reviewer-${nanoid()}`,
    username,
    password,
    role: "reviewer",
    displayName: username,
    active: true,
    createdAt: nowIso()
  };
  db.staffAccounts.push(account);
  await writeDb(db);
  res.status(201).json(publicReviewerAccount(account));
});

app.delete("/api/staff/reviewers/:id", async (req, res) => {
  const db = await readDb();
  if (req.body?.adminPassword === undefined || !isAdminActor(db, req.body?.adminUsername, req.body?.adminPassword)) {
    return res.status(403).json({ error: "The Admin password is incorrect." });
  }
  const index = (db.staffAccounts || []).findIndex((account) =>
    account.id === req.params.id && normalizeText(account.role).toLowerCase() === "reviewer"
  );
  if (index === -1) return res.status(404).json({ error: "Reviewer account not found." });
  const reviewerCount = db.staffAccounts.filter((account) =>
    normalizeText(account.role).toLowerCase() === "reviewer"
  ).length;
  if (reviewerCount <= 1) {
    return res.status(409).json({ error: "Keep at least one Reviewer account." });
  }
  const [removed] = db.staffAccounts.splice(index, 1);
  await writeDb(db);
  res.json(publicReviewerAccount(removed));
});

app.get("/api/categories", async (req, res) => {
  const db = await readDb();
  res.json(db.categories || []);
});

app.post("/api/categories", async (req, res) => {
  res.status(405).json({ error: "Tool types are fixed to ELC and Portable Tools. Edit their User Details or Review Questions instead." });
});

app.put("/api/categories/:id", async (req, res) => {
  const db = await readDb();
  const index = db.categories.findIndex((entry) => entry.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Category not found." });
  const result = validateCategoryPayload(req.body, req.params.id);
  if (result.error) return res.status(400).json({ error: result.error });
  db.categories[index] = { ...result.category, createdAt: db.categories[index].createdAt };
  await writeDb(db);
  res.json(db.categories[index]);
});

app.delete("/api/categories/:id", async (req, res) => {
  res.status(405).json({ error: "ELC and Portable Tools are fixed tool types and cannot be deleted." });
});

app.post("/api/requests", async (req, res) => {
  const db = await readDb();
  const result = validateRequestPayload(db, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  db.requests.push(result.request);
  await writeDb(db);
  res.status(201).json(result.request);
});

app.get("/api/requests", async (req, res) => {
  const db = await readDb();
  const status = normalizeText(req.query.status);
  let changed = false;
  for (const request of db.requests || []) changed = ensureRequestWorkflow(request) || changed;
  if (changed) await writeDb(db);
  let requests = db.requests || [];
  if (status) requests = requests.filter((entry) => entry.status === status);
  requests = requests.sort((a, b) => {
    const pendingDiff = Number(a.status !== "pending") - Number(b.status !== "pending");
    if (pendingDiff) return pendingDiff;
    return new Date(b.submittedAt) - new Date(a.submittedAt);
  });
  res.json(requests);
});


app.get("/api/requests/reference/:referenceId", async (req, res) => {
  const db = await readDb();
  const referenceId = normalizeText(req.params.referenceId).toUpperCase();
  const request = (db.requests || []).find((entry) =>
    normalizeText(entry.referenceId || entry.id).toUpperCase() === referenceId
  );
  if (!request) return res.status(404).json({ error: "Reference ID not found." });

  const changedWorkflow = ensureRequestWorkflow(request);
  const item = request.itemId
    ? (db.items || []).find((entry) => entry.id === request.itemId)
    : null;

  const changedQr = item ? await ensureBrandedQrForItem(req, item) : false;
  if (changedWorkflow || changedQr) await writeDb(db);

  res.json({
    referenceId: request.referenceId || request.id,
    itemName: request.itemName,
    itemCode: request.itemCode,
    site: request.site,
    categoryName: request.categoryName,
    toolType: request.toolType || request.categoryName,
    toolImages: request.toolImages || (request.toolImage ? [request.toolImage] : []),
    toolImage: request.toolImage || "",
    status: request.status === "approved" ? "accepted" : request.status === "rejected" ? "rejected" : "pending",
    approvalFlow: request.approvalFlow || [],
    approvals: request.approvals || [],
    currentApprovalRole: request.currentApprovalRole || "",
    archivedAt: request.archivedAt || null,
    submittedAt: request.submittedAt,
    reviewedAt: request.reviewedAt,
    reviewNote: request.reviewNote || "",
    reviewedBy: request.reviewedBy || "",
    reviewedRole: request.reviewedRole || "",
    rejectedBy: request.rejectedBy || "",
    rejectedRole: request.rejectedRole || "",
    detailValues: request.detailValues || {},
    detailsSnapshot: request.detailsSnapshot || [],
    reviewQuestionsSnapshot: request.reviewQuestionsSnapshot || [],
    reviewAnswers: request.reviewAnswers || {},
    qrId: item?.qrId || "",
    qrPayload: item?.qrPayload || "",
    qrImageDataUrl: item?.qrImageDataUrl || "",
    expiresAt: item?.expiresAt || "",
    validity: item ? getItemValidity(item) : null
  });
});

app.get("/api/requests/:id", async (req, res) => {
  const db = await readDb();
  const request = (db.requests || []).find((entry) => entry.id === req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found." });
  if (ensureRequestWorkflow(request)) await writeDb(db);
  res.json(request);
});

app.post("/api/requests/:id/approve", async (req, res) => {
  const db = await readDb();
  const request = db.requests.find((entry) => entry.id === req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found." });
  ensureRequestWorkflow(request);
  if (request.status !== "pending") return res.status(409).json({ error: "Only pending requests can be approved." });

  const role = normalizeText(req.body?.role).toLowerCase();
  if (!requestCanBeActionedBy(request, role)) return res.status(403).json({ error: "Reviewer or Admin access is required." });

  const category = [...(db.categories || []), ...(db.legacyCategories || [])]
    .find((entry) => entry.id === request.categoryId);
  if (!category) return res.status(400).json({ error: "Request category no longer exists." });

  const questions = request.reviewQuestionsSnapshot || category.reviewQuestions || [];
  const answerResult = normalizeAnswers(
    questions,
    req.body?.reviewAnswers && typeof req.body.reviewAnswers === "object" ? req.body.reviewAnswers : {},
    "before approval"
  );
  if (answerResult.error) return res.status(400).json({ error: answerResult.error });

  const roleLabel = role === "admin" ? "Admin" : "Reviewer";
  const approvedBy = normalizeText(req.body?.approvedBy) || roleLabel;
  request.approvals = Array.isArray(request.approvals) ? request.approvals : [];
  request.approvals.push({
    role,
    roleLabel,
    approvedBy,
    approvedAt: nowIso(),
    note: normalizeText(req.body?.reviewNote)
  });

  const expiresAt = pickExpiryDate(category, request.detailValues, req.body?.expiresAt);
  if (!expiresAt) return res.status(400).json({ error: "Expiry/validity date is required before final approval." });

  const qrId = `QR-${nanoid()}`;
  const qrPayload = getQrPayload(req, qrId);
  const qrImageDataUrl = await createBrandedQrDataUrl(qrPayload);

  const item = {
    id: `asset-${nanoid()}`,
    qrId,
    qrPayload,
    qrImageDataUrl,
    qrBrand: "power-tool-v2",
    itemName: request.itemName,
    itemCode: request.itemCode,
    site: request.site,
    categoryId: request.categoryId,
    categoryName: request.categoryName,
    toolType: request.toolType || request.categoryName,
    toolImages: request.toolImages || (request.toolImage ? [request.toolImage] : []),
    toolImage: request.toolImage || "",
    detailValues: request.detailValues || {},
    detailsSnapshot: request.detailsSnapshot || category.detailFields || [],
    reviewAnswers: answerResult.values,
    reviewQuestionsSnapshot: questions,
    submittedBy: request.submittedBy,
    requestId: request.id,
    registeredAt: nowIso(),
    approvedAt: nowIso(),
    expiresAt,
    archivedAt: null,
    reviewNote: normalizeText(req.body?.reviewNote),
    reviewedBy: approvedBy,
    reviewedRole: role,
    reviewDecision: "approved",
    approvals: request.approvals || []
  };

  request.status = "approved";
  request.reviewedAt = nowIso();
  request.reviewNote = item.reviewNote;
  request.reviewAnswers = answerResult.values;
  request.reviewedBy = approvedBy;
  request.reviewedRole = role;
  request.currentApprovalRole = "";
  request.itemId = item.id;

  db.items.push(item);
  await writeDb(db);
  res.status(201).json({ request, item: { ...item, validity: getItemValidity(item) }, complete: true });
});

app.post("/api/requests/:id/reject", async (req, res) => {
  const db = await readDb();
  const request = db.requests.find((entry) => entry.id === req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found." });
  ensureRequestWorkflow(request);
  if (request.status !== "pending") return res.status(409).json({ error: "Only pending requests can be rejected." });
  const role = normalizeText(req.body?.role).toLowerCase();
  if (!requestCanBeActionedBy(request, role)) return res.status(403).json({ error: "Reviewer or Admin access is required." });
  const category = [...(db.categories || []), ...(db.legacyCategories || [])]
    .find((entry) => entry.id === request.categoryId);
  const questions = request.reviewQuestionsSnapshot || category?.reviewQuestions || [];
  const answerResult = normalizeAnswers(
    questions,
    req.body?.reviewAnswers && typeof req.body.reviewAnswers === "object" ? req.body.reviewAnswers : {},
    "before rejection"
  );
  if (answerResult.error) return res.status(400).json({ error: answerResult.error });
  request.status = "rejected";
  request.reviewedAt = nowIso();
  request.currentApprovalRole = "";
  request.reviewNote = normalizeText(req.body?.reviewNote);
  request.reviewAnswers = answerResult.values;
  request.rejectedBy = normalizeText(req.body?.rejectedBy) || (role === "admin" ? "Admin" : "Reviewer");
  request.rejectedRole = role;
  await writeDb(db);
  res.json(request);
});

app.post("/api/requests/:id/archive", async (req, res) => {
  const db = await readDb();
  const request = db.requests.find((entry) => entry.id === req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found." });
  if (request.status !== "rejected") return res.status(409).json({ error: "Only rejected requests can be archived here." });
  request.archivedAt = request.archivedAt || nowIso();
  request.archiveNote = normalizeText(req.body?.archiveNote);
  await writeDb(db);
  res.json(request);
});

app.post("/api/requests/:id/restore", async (req, res) => {
  const db = await readDb();
  const request = db.requests.find((entry) => entry.id === req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found." });
  request.archivedAt = null;
  request.archiveNote = "";
  await writeDb(db);
  res.json(request);
});

app.get("/api/items", async (req, res) => {
  const db = await readDb();
  let changedQrBranding = false;
  for (const item of db.items || []) {
    if (await ensureBrandedQrForItem(req, item)) changedQrBranding = true;
  }
  if (changedQrBranding) await writeDb(db);
  const search = normalizeText(req.query.search).toLowerCase();
  const categoryId = normalizeText(req.query.categoryId);
  const site = normalizeText(req.query.site).toLowerCase();
  const status = normalizeText(req.query.status);
  const sort = normalizeText(req.query.sort) || "expiry";
  const includeArchived = req.query.includeArchived === "true";

  let items = (db.items || []).map((item) => ({ ...item, validity: getItemValidity(item) }));

  if (!includeArchived) items = items.filter((item) => !item.archivedAt);
  if (search) {
    items = items.filter((item) => [
      item.itemName,
      item.itemCode,
      item.site,
      item.categoryName,
      item.toolType,
      item.qrId,
      ...Object.values(item.detailValues || {})
    ]
      .some((value) => normalizeText(value).toLowerCase().includes(search)));
  }
  if (categoryId) items = items.filter((item) => item.categoryId === categoryId);
  if (site) items = items.filter((item) => normalizeText(item.site).toLowerCase().includes(site));
  if (status) items = items.filter((item) => item.validity.status === status);

  if (sort === "alpha") items.sort((a, b) => a.itemName.localeCompare(b.itemName));
  else if (sort === "site") items.sort((a, b) => a.site.localeCompare(b.site) || a.itemName.localeCompare(b.itemName));
  else if (sort === "registered") items.sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt));
  else if (sort === "expired") items.sort((a, b) => Number(b.validity.isExpired) - Number(a.validity.isExpired) || sortItemsDefault(a, b));
  else items.sort(sortItemsDefault);

  res.json(items);
});

app.get("/api/items/qr/:qrId", async (req, res) => {
  const db = await readDb();
  const item = db.items.find((entry) => entry.qrId === req.params.qrId);
  if (!item) return res.status(404).json({ error: "QR item not found." });
  if (await ensureBrandedQrForItem(req, item)) await writeDb(db);
  const sourceRequest = (db.requests || []).find((entry) => entry.id === item.requestId || entry.itemId === item.id);
  res.json({
    ...item,
    referenceId: sourceRequest?.referenceId || "",
    validity: getItemValidity(item)
  });
});

app.get("/api/items/:id/qr", async (req, res) => {
  const db = await readDb();
  const item = db.items.find((entry) => entry.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Item not found." });
  if (await ensureBrandedQrForItem(req, item)) await writeDb(db);
  res.json({ qrId: item.qrId, qrPayload: item.qrPayload, qrImageDataUrl: item.qrImageDataUrl, qrBrand: item.qrBrand });
});

app.patch("/api/items/:id", async (req, res) => {
  const db = await readDb();
  const item = db.items.find((entry) => entry.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Item not found." });

  const editable = ["itemName", "itemCode", "site", "expiresAt", "reviewNote"];
  for (const key of editable) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) item[key] = req.body[key];
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "toolImages") || Object.prototype.hasOwnProperty.call(req.body, "toolImage")) {
    const imageResult = validateImageList(req.body.toolImages, req.body.toolImage);
    if (imageResult.error) return res.status(400).json({ error: imageResult.error });
    item.toolImages = imageResult.value;
    item.toolImage = imageResult.value[0] || "";
  }
  if (req.body.detailValues && typeof req.body.detailValues === "object") {
    item.detailValues = { ...(item.detailValues || {}), ...req.body.detailValues };
  }
  if (req.body.reviewAnswers && typeof req.body.reviewAnswers === "object") {
    item.reviewAnswers = { ...(item.reviewAnswers || {}), ...req.body.reviewAnswers };
  }
  item.updatedAt = nowIso();
  await writeDb(db);
  res.json({ ...item, validity: getItemValidity(item) });
});

app.post("/api/items/:id/renew", async (req, res) => {
  const db = await readDb();
  const item = db.items.find((entry) => entry.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Item not found." });
  if (getItemValidity(item).status !== "expired") {
    return res.status(409).json({ error: "Only expired tools can be renewed." });
  }

  const role = normalizeText(req.body?.role).toLowerCase();
  if (!["reviewer", "admin"].includes(role)) {
    return res.status(403).json({ error: "Reviewer or Admin access is required." });
  }

  const questions = item.reviewQuestionsSnapshot || [];
  const answerResult = normalizeAnswers(
    questions,
    req.body?.reviewAnswers && typeof req.body.reviewAnswers === "object" ? req.body.reviewAnswers : {},
    "before renewal"
  );
  if (answerResult.error) return res.status(400).json({ error: answerResult.error });

  const expiresAt = normalizeText(req.body?.expiresAt);
  const expiryDate = expiresAt ? new Date(`${expiresAt}T23:59:59.999Z`) : null;
  if (!expiryDate || Number.isNaN(expiryDate.getTime()) || expiryDate.getTime() < Date.now()) {
    return res.status(400).json({ error: "Choose a new next-check date that has not already expired." });
  }

  const renewedBy = normalizeText(req.body?.renewedBy) || (role === "admin" ? "Admin" : "Reviewer");
  const feedback = normalizeText(req.body?.reviewNote);
  const renewal = {
    id: `renewal-${nanoid()}`,
    previousExpiresAt: item.expiresAt || "",
    expiresAt,
    reviewAnswers: answerResult.values,
    reviewNote: feedback,
    renewedBy,
    renewedRole: role,
    renewedAt: nowIso()
  };

  item.renewalHistory = Array.isArray(item.renewalHistory) ? item.renewalHistory : [];
  item.renewalHistory.push(renewal);
  item.expiresAt = expiresAt;
  item.reviewAnswers = answerResult.values;
  item.reviewNote = feedback;
  item.reviewedBy = renewedBy;
  item.reviewedRole = role;
  item.reviewDecision = "approved";
  item.updatedAt = nowIso();
  await writeDb(db);
  res.json({ ...item, validity: getItemValidity(item) });
});

app.post("/api/items/:id/archive", async (req, res) => {
  const db = await readDb();
  const item = db.items.find((entry) => entry.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Item not found." });
  item.archivedAt = item.archivedAt || nowIso();
  item.archiveNote = normalizeText(req.body?.archiveNote);
  await writeDb(db);
  res.json({ ...item, validity: getItemValidity(item) });
});

app.post("/api/items/:id/restore", async (req, res) => {
  const db = await readDb();
  const item = db.items.find((entry) => entry.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Item not found." });
  item.archivedAt = null;
  item.archiveNote = "";
  await writeDb(db);
  res.json({ ...item, validity: getItemValidity(item) });
});

app.post("/api/usage/visit", async (req, res) => {
  const db = await readDb();
  const usage = ensureUsage(db);
  const ip = normalizeIp(req);
  const sessionId = normalizeText(req.body?.sessionId).slice(0, 120);
  if (!sessionId) return res.status(400).json({ error: "Visit session ID is required." });

  const pathName = normalizeText(req.body?.path).slice(0, 240);
  const existingSession = usage.sessions[sessionId];
  const ipRecord = usageIpRecord(usage, ip);
  ipRecord.lastSeenAt = nowIso();
  ipRecord.lastPath = pathName;

  if (!existingSession) {
    usage.totalVisits += 1;
    ipRecord.visits += 1;
    usage.sessions[sessionId] = {
      sessionId,
      ip,
      createdAt: nowIso(),
      lastSeenAt: nowIso(),
      path: pathName
    };
  } else {
    existingSession.lastSeenAt = nowIso();
    existingSession.path = pathName || existingSession.path;
  }

  trimUsageHistory(usage, "sessions");
  await writeDb(db);
  if (!existingSession) {
    logUsage(usage, `new visit from ${ip} ipVisits=${ipRecord.visits}${pathName ? ` path=${pathName}` : ""}`);
  }
  res.json({ ok: true, counted: !existingSession });
});

app.post("/api/usage/event", async (req, res) => {
  const type = normalizeText(req.body?.type).toLowerCase();
  if (!["qr_open", "checklist_view"].includes(type)) {
    return res.status(400).json({ error: "Unknown usage event." });
  }

  const db = await readDb();
  const usage = ensureUsage(db);
  const ip = normalizeIp(req);
  const sessionId = normalizeText(req.body?.sessionId).slice(0, 120) || `anonymous-${ip}`;
  const targetId = normalizeText(req.body?.targetId).slice(0, 120) || "unknown";
  const eventKey = `${sessionId}:${type}:${targetId}`;
  const ipRecord = usageIpRecord(usage, ip);
  ipRecord.lastSeenAt = nowIso();
  const existingEvent = usage.events[eventKey];

  if (!existingEvent) {
    usage.events[eventKey] = { type, targetId, sessionId, ip, createdAt: nowIso() };
    if (type === "qr_open") {
      usage.totalQrOpens += 1;
      ipRecord.qrOpens += 1;
    } else {
      usage.totalChecklistViews += 1;
      ipRecord.checklistViews += 1;
    }
  }

  trimUsageHistory(usage, "events", 10000);
  await writeDb(db);
  if (!existingEvent) logUsage(usage, `${type} from ${ip} target=${targetId}`);
  res.json({ ok: true, counted: !existingEvent });
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: `API route ${req.method} ${req.originalUrl} was not found.` });
});

const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(distPath, "index.html"), (err) => {
    if (err) next();
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Server error.", detail: err.message });
});

let httpServer;

async function startServer() {
  await initializeDataStore();
  const db = await readDb();
  const usage = ensureUsage(db);

  httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Power Tool backend running on http://0.0.0.0:${PORT}`);
    console.log(`Database: ${getDbPath()}`);
    logUsage(usage, "stored totals");
    logUsageByIp(usage);
  });
}

async function shutdown(signal) {
  console.log(`[Server] ${signal} received. Closing connections.`);
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch((error) => {
    console.error(error);
    process.exit(1);
  });
});
process.on("SIGINT", () => {
  shutdown("SIGINT").catch((error) => {
    console.error(error);
    process.exit(1);
  });
});

startServer().catch((error) => {
  console.error(`[Server] Startup failed: ${error.message}`);
  process.exit(1);
});

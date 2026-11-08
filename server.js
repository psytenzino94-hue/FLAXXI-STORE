require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.SESSION_SECRET || "";
const ADMIN_USER = process.env.ADMIN_USERNAME || "owner";
const ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH || "";
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "licenses.json");

if (SECRET.length < 32) {
  console.error("SESSION_SECRET must be at least 32 characters. Set it in .env.");
  process.exit(1);
}
if (!ADMIN_HASH.startsWith("$2")) {
  console.error("Set ADMIN_PASSWORD_HASH in .env to a bcrypt hash. See README.md.");
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ licenses: [] }, null, 2));

function readDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return { licenses: [] }; }
}
function writeDb(db) {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, DB_FILE);
}
const sessions = new Map();
function sign(value) {
  return crypto.createHmac("sha256", SECRET).update(value).digest("hex");
}
function createSession() {
  const id = crypto.randomBytes(32).toString("hex");
  sessions.set(id, Date.now() + 8 * 60 * 60 * 1000);
  return id + "." + sign(id);
}
function validSession(token) {
  if (!token || !token.includes(".")) return false;
  const [id, mac] = token.split(".");
  const expected = sign(id);
  if (!mac || mac.length !== expected.length) return false;
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (!crypto.timingSafeEqual(a, b)) return false;
  const expires = sessions.get(id);
  if (!expires || expires < Date.now()) { sessions.delete(id); return false; }
  return true;
}
function auth(req, res, next) {
  if (!validSession(req.cookies?.session || req.headers["x-session-token"])) {
    return res.status(401).json({ ok: false, error: "Authentication required" });
  }
  next();
}
// Small cookie parser; no extra dependency.
app.use((req, res, next) => {
  req.cookies = {};
  (req.headers.cookie || "").split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i > -1) req.cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  next();
});
app.use(helmet({ contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:"],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"]
  }
}}));
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });
app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string" ||
      username.length > 80 || password.length > 200) {
    return res.status(400).json({ ok: false, error: "Invalid credentials format" });
  }
  const userOk = crypto.timingSafeEqual(
    Buffer.from(username.padEnd(Math.max(username.length, ADMIN_USER.length))),
    Buffer.from(ADMIN_USER.padEnd(Math.max(username.length, ADMIN_USER.length)))
  );
  const passOk = await bcrypt.compare(password, ADMIN_HASH);
  if (!userOk || !passOk) return res.status(401).json({ ok: false, error: "Incorrect username or password" });
  const token = createSession();
  res.setHeader("Set-Cookie", `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  res.json({ ok: true, username: ADMIN_USER });
});
app.post("/api/auth/logout", (req, res) => {
  const token = req.cookies.session || "";
  const id = token.split(".")[0];
  sessions.delete(id);
  res.setHeader("Set-Cookie", "session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
  res.json({ ok: true });
});
app.get("/api/auth/me", auth, (req, res) => res.json({ ok: true, username: ADMIN_USER }));

function cleanText(value, max = 80) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function makeKey(prefix = "KURO") {
  return prefix + "-" + crypto.randomBytes(4).toString("hex").toUpperCase() + "-" +
    crypto.randomBytes(4).toString("hex").toUpperCase();
}
app.get("/api/licenses", auth, (req, res) => {
  const db = readDb();
  const items = db.licenses.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ ok: true, count: items.length, licenses: items });
});
app.post("/api/licenses", auth, (req, res) => {
  const body = req.body || {};
  const label = cleanText(body.label, 80);
  const keyType = cleanText(body.keyType || "Standard", 24);
  const prefix = cleanText(body.prefix || "KURO", 12).replace(/[^A-Za-z0-9_-]/g, "") || "KURO";
  const durationDays = Number(body.durationDays);
  const deviceLimit = Number(body.deviceLimit);
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650)
    return res.status(400).json({ ok: false, error: "Duration must be 1–3650 days" });
  if (!Number.isInteger(deviceLimit) || deviceLimit < 1 || deviceLimit > 100)
    return res.status(400).json({ ok: false, error: "Device limit must be 1–100" });
  let key = cleanText(body.customKey, 64);
  if (key && !/^[A-Za-z0-9@._-]{4,64}$/.test(key))
    return res.status(400).json({ ok: false, error: "Custom key contains unsupported characters" });
  const db = readDb();
  if (!key) key = makeKey(prefix);
  if (db.licenses.some(x => x.key.toLowerCase() === key.toLowerCase()))
    return res.status(409).json({ ok: false, error: "That key already exists" });
  const createdAt = new Date().toISOString();
  const item = {
    id: crypto.randomUUID(),
    key, keyType, label, durationDays, deviceLimit,
    createdAt,
    expiresAt: new Date(Date.now() + durationDays * 86400000).toISOString(),
    status: "active",
    devices: []
  };
  db.licenses.push(item);
  writeDb(db);
  res.status(201).json({ ok: true, license: item });
});
app.post("/api/licenses/:id/revoke", auth, (req, res) => {
  const db = readDb();
  const item = db.licenses.find(x => x.id === req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: "License not found" });
  item.status = "revoked";
  item.revokedAt = new Date().toISOString();
  writeDb(db);
  res.json({ ok: true, license: item });
});
app.delete("/api/licenses/:id", auth, (req, res) => {
  const db = readDb();
  const before = db.licenses.length;
  db.licenses = db.licenses.filter(x => x.id !== req.params.id);
  if (before === db.licenses.length) return res.status(404).json({ ok: false, error: "License not found" });
  writeDb(db);
  res.json({ ok: true });
});
app.get("/api/health", (req, res) => res.json({ ok: true, service: "KURO License API", time: new Date().toISOString() }));


app.listen(PORT, "0.0.0.0", () => console.log(`KURO dashboard running on port ${PORT}`));

// src/store.js
// Lop luu tru user: dung Postgres khi co DATABASE_URL (luu vinh vien, vd Neon/Supabase),
// nguoc lai dung file JSON (chay local).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const KNOW_FILE = path.join(DATA_DIR, "knowledge.json");
const SKILL_FILE = path.join(DATA_DIR, "skills.json");
const SCHEMATPL_FILE = path.join(DATA_DIR, "schema_templates.json");
const KWSET_FILE = path.join(DATA_DIR, "keyword_sets.json");
const GSC_FILE = path.join(DATA_DIR, "gsc_tokens.json");

let mode = "json"; // "json" | "pg"
let pool = null;
let jsonUsers = {};
let jsonKnow = {}; // id -> { id, owner, website, title, content, createdAt }
let jsonSkill = {}; // id -> { id, owner, title, content, createdAt }
let jsonSchemaTpl = {}; // id -> { id, owner, name, data(graph json), createdAt }
let jsonKwset = {}; // id -> { id, owner, name, keywords:[...], createdAt, updatedAt }
let jsonGsc = {}; // owner -> { owner, refreshToken, siteUrl, updatedAt }

export function storeMode() {
  return mode;
}

function initJson() {
  mode = "json";
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "{}", "utf8");
  try {
    jsonUsers = JSON.parse(fs.readFileSync(USERS_FILE, "utf8")) || {};
  } catch {
    jsonUsers = {};
  }
  try {
    jsonKnow = fs.existsSync(KNOW_FILE) ? (JSON.parse(fs.readFileSync(KNOW_FILE, "utf8")) || {}) : {};
  } catch {
    jsonKnow = {};
  }
  try {
    jsonSkill = fs.existsSync(SKILL_FILE) ? (JSON.parse(fs.readFileSync(SKILL_FILE, "utf8")) || {}) : {};
  } catch {
    jsonSkill = {};
  }
  try {
    jsonSchemaTpl = fs.existsSync(SCHEMATPL_FILE) ? (JSON.parse(fs.readFileSync(SCHEMATPL_FILE, "utf8")) || {}) : {};
  } catch {
    jsonSchemaTpl = {};
  }
  try {
    jsonKwset = fs.existsSync(KWSET_FILE) ? (JSON.parse(fs.readFileSync(KWSET_FILE, "utf8")) || {}) : {};
  } catch {
    jsonKwset = {};
  }
  try {
    jsonGsc = fs.existsSync(GSC_FILE) ? (JSON.parse(fs.readFileSync(GSC_FILE, "utf8")) || {}) : {};
  } catch {
    jsonGsc = {};
  }
}

export async function initStore() {
  const url = (process.env.DATABASE_URL || "").trim();
  if (url) {
    try {
      const { default: pg } = await import("pg");
      // Postgres local (localhost) thuong KHONG bat SSL -> chi bat SSL cho DB tu xa (Neon/Supabase)
      const needSsl = !/localhost|127\.0\.0\.1|sslmode=disable/i.test(url);
      pool = new pg.Pool({
        connectionString: url,
        ssl: needSsl ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 10000,
        max: 5,
      });
      // Tranh loi idle client lam sap process
      pool.on("error", (e) => console.error("  [store] Postgres pool error:", e.message));
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          email      TEXT PRIMARY KEY,
          name       TEXT,
          salt       TEXT NOT NULL,
          hash       TEXT NOT NULL,
          pwenc      TEXT,
          verified   BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      // Bang cu chua co cot pwenc -> them (an toan neu da co)
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pwenc TEXT`);
      // Kho kien thuc website (rieng theo tai khoan)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS knowledge (
          id         TEXT PRIMARY KEY,
          owner      TEXT NOT NULL,
          website    TEXT,
          title      TEXT,
          content    TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS knowledge_owner_idx ON knowledge(owner)`);
      // Thu vien Skill (chi dan viet noi dung ca nhan hoa, kieu GEM) - rieng theo tai khoan
      await pool.query(`
        CREATE TABLE IF NOT EXISTS skills (
          id         TEXT PRIMARY KEY,
          owner      TEXT NOT NULL,
          title      TEXT,
          content    TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS skills_owner_idx ON skills(owner)`);
      // Mau Schema Markup ca nhan hoa (rieng theo tai khoan)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_templates (
          id         TEXT PRIMARY KEY,
          owner      TEXT NOT NULL,
          name       TEXT,
          data       TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS schema_templates_owner_idx ON schema_templates(owner)`);
      // Bo tu khoa da luu (rieng theo tai khoan) - de nghien cuu tiep sau nay
      await pool.query(`
        CREATE TABLE IF NOT EXISTS keyword_sets (
          id         TEXT PRIMARY KEY,
          owner      TEXT NOT NULL,
          name       TEXT,
          data       TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS keyword_sets_owner_idx ON keyword_sets(owner)`);
      // Token Google Search Console (rieng theo tai khoan)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS gsc_tokens (
          owner         TEXT PRIMARY KEY,
          refresh_token TEXT,
          site_url      TEXT,
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      mode = "pg";
      console.log("  [store] Dung Postgres (DATABASE_URL) - tai khoan luu vinh vien.");
      return;
    } catch (e) {
      // DATABASE_URL sai/khong ket noi duoc -> KHONG sap app, tu quay ve JSON
      console.error(
        `  [store] !! Khong ket noi duoc Postgres (${e.message}). ` +
          `Kiem tra lai DATABASE_URL. Tam dung file JSON (tai khoan se KHONG luu vinh vien).`
      );
      try { if (pool) await pool.end(); } catch {}
      pool = null;
    }
  }
  initJson();
  console.log("  [store] Dung file JSON" + (url ? " (do DATABASE_URL loi)" : " (chua co DATABASE_URL)") + ".");
}

function saveJson() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(jsonUsers, null, 2), "utf8");
}

export async function getUser(email) {
  if (mode === "pg") {
    const r = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    return r.rows[0] || null;
  }
  return jsonUsers[email] || null;
}

export async function putUser(u) {
  if (mode === "pg") {
    await pool.query(
      `INSERT INTO users (email, name, salt, hash, pwenc, verified)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (email) DO UPDATE
       SET name=$2, salt=$3, hash=$4, pwenc=$5, verified=$6`,
      [u.email, u.name || "", u.salt, u.hash, u.pwenc || null, u.verified !== false]
    );
    return;
  }
  const prev = jsonUsers[u.email] || {};
  jsonUsers[u.email] = {
    email: u.email, name: u.name || "", salt: u.salt, hash: u.hash,
    pwenc: u.pwenc || prev.pwenc || "",
    verified: u.verified !== false, createdAt: prev.createdAt || new Date().toISOString(),
  };
  saveJson();
}

// ===== Kho kien thuc website (rieng theo tai khoan) =====
function saveJsonKnow() {
  fs.writeFileSync(KNOW_FILE, JSON.stringify(jsonKnow, null, 2), "utf8");
}

// Liet ke kien thuc cua 1 owner (moi nhat truoc)
export async function listKnowledge(owner) {
  if (mode === "pg") {
    const r = await pool.query("SELECT id, owner, website, title, content, created_at FROM knowledge WHERE owner=$1 ORDER BY created_at DESC", [owner]);
    return r.rows.map((x) => ({ ...x, createdAt: x.created_at }));
  }
  return Object.values(jsonKnow)
    .filter((k) => k.owner === owner)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// Them/cap nhat 1 muc kien thuc (upsert theo id)
export async function putKnowledge(k) {
  if (mode === "pg") {
    await pool.query(
      `INSERT INTO knowledge (id, owner, website, title, content)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET website=$3, title=$4, content=$5`,
      [k.id, k.owner, k.website || "", k.title || "", k.content || ""]
    );
    return;
  }
  const prev = jsonKnow[k.id] || {};
  jsonKnow[k.id] = {
    id: k.id, owner: k.owner, website: k.website || "", title: k.title || "",
    content: k.content || "", createdAt: prev.createdAt || new Date().toISOString(),
  };
  saveJsonKnow();
}

// Xoa 1 muc (chi khi dung owner)
export async function deleteKnowledge(id, owner) {
  if (mode === "pg") {
    const r = await pool.query("DELETE FROM knowledge WHERE id=$1 AND owner=$2", [id, owner]);
    return r.rowCount > 0;
  }
  if (jsonKnow[id] && jsonKnow[id].owner === owner) { delete jsonKnow[id]; saveJsonKnow(); return true; }
  return false;
}

// ===== Thu vien Skill (chi dan viet noi dung, rieng theo tai khoan) =====
function saveJsonSkill() {
  fs.writeFileSync(SKILL_FILE, JSON.stringify(jsonSkill, null, 2), "utf8");
}
export async function listSkills(owner) {
  if (mode === "pg") {
    const r = await pool.query("SELECT id, owner, title, content, created_at FROM skills WHERE owner=$1 ORDER BY created_at DESC", [owner]);
    return r.rows.map((x) => ({ ...x, createdAt: x.created_at }));
  }
  return Object.values(jsonSkill)
    .filter((k) => k.owner === owner)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
export async function putSkill(k) {
  if (mode === "pg") {
    await pool.query(
      `INSERT INTO skills (id, owner, title, content) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET title=$3, content=$4`,
      [k.id, k.owner, k.title || "", k.content || ""]
    );
    return;
  }
  const prev = jsonSkill[k.id] || {};
  jsonSkill[k.id] = { id: k.id, owner: k.owner, title: k.title || "", content: k.content || "", createdAt: prev.createdAt || new Date().toISOString() };
  saveJsonSkill();
}
export async function deleteSkill(id, owner) {
  if (mode === "pg") {
    const r = await pool.query("DELETE FROM skills WHERE id=$1 AND owner=$2", [id, owner]);
    return r.rowCount > 0;
  }
  if (jsonSkill[id] && jsonSkill[id].owner === owner) { delete jsonSkill[id]; saveJsonSkill(); return true; }
  return false;
}

// ===== Mau Schema Markup ca nhan hoa (rieng theo tai khoan) =====
function saveJsonSchemaTpl() { fs.writeFileSync(SCHEMATPL_FILE, JSON.stringify(jsonSchemaTpl, null, 2), "utf8"); }
const _tplGraph = (v) => { try { const a = typeof v === "string" ? JSON.parse(v) : v; return Array.isArray(a) ? a : []; } catch { return []; } };
export async function listSchemaTemplates(owner) {
  if (mode === "pg") {
    const r = await pool.query("SELECT id, owner, name, data, created_at FROM schema_templates WHERE owner=$1 ORDER BY created_at DESC", [owner]);
    return r.rows.map((x) => ({ id: x.id, owner: x.owner, name: x.name || "", graph: _tplGraph(x.data), createdAt: x.created_at }));
  }
  return Object.values(jsonSchemaTpl).filter((s) => s.owner === owner).map((s) => ({ ...s, graph: _tplGraph(s.data) })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
export async function getSchemaTemplate(id, owner) {
  if (mode === "pg") {
    const r = await pool.query("SELECT id, owner, name, data FROM schema_templates WHERE id=$1 AND owner=$2", [id, owner]);
    const x = r.rows[0]; return x ? { id: x.id, owner: x.owner, name: x.name || "", graph: _tplGraph(x.data) } : null;
  }
  const s = jsonSchemaTpl[id]; return s && s.owner === owner ? { ...s, graph: _tplGraph(s.data) } : null;
}
export async function putSchemaTemplate(s) {
  const data = JSON.stringify(_tplGraph(s.graph));
  if (mode === "pg") {
    await pool.query(`INSERT INTO schema_templates (id, owner, name, data) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET name=$3, data=$4`, [s.id, s.owner, s.name || "", data]);
    return;
  }
  const prev = jsonSchemaTpl[s.id] || {};
  jsonSchemaTpl[s.id] = { id: s.id, owner: s.owner, name: s.name || "", data, createdAt: prev.createdAt || new Date().toISOString() };
  saveJsonSchemaTpl();
}
export async function deleteSchemaTemplate(id, owner) {
  if (mode === "pg") { const r = await pool.query("DELETE FROM schema_templates WHERE id=$1 AND owner=$2", [id, owner]); return r.rowCount > 0; }
  if (jsonSchemaTpl[id] && jsonSchemaTpl[id].owner === owner) { delete jsonSchemaTpl[id]; saveJsonSchemaTpl(); return true; }
  return false;
}

// ===== Bo tu khoa da luu (rieng theo tai khoan) =====
function saveJsonKwset() {
  fs.writeFileSync(KWSET_FILE, JSON.stringify(jsonKwset, null, 2), "utf8");
}
const _kwArr = (v) => { try { const a = typeof v === "string" ? JSON.parse(v) : v; return Array.isArray(a) ? a : []; } catch { return []; } };

// Liet ke bo tu khoa cua 1 owner (moi cap nhat truoc) - KEM keywords day du
export async function listKeywordSets(owner) {
  if (mode === "pg") {
    const r = await pool.query("SELECT id, owner, name, data, created_at, updated_at FROM keyword_sets WHERE owner=$1 ORDER BY updated_at DESC", [owner]);
    return r.rows.map((x) => ({ id: x.id, owner: x.owner, name: x.name || "", keywords: _kwArr(x.data), createdAt: x.created_at, updatedAt: x.updated_at }));
  }
  return Object.values(jsonKwset)
    .filter((s) => s.owner === owner)
    .map((s) => ({ ...s, keywords: _kwArr(s.keywords) }))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

// Lay 1 bo (chi khi dung owner)
export async function getKeywordSet(id, owner) {
  if (mode === "pg") {
    const r = await pool.query("SELECT id, owner, name, data, created_at, updated_at FROM keyword_sets WHERE id=$1 AND owner=$2", [id, owner]);
    const x = r.rows[0]; if (!x) return null;
    return { id: x.id, owner: x.owner, name: x.name || "", keywords: _kwArr(x.data), createdAt: x.created_at, updatedAt: x.updated_at };
  }
  const s = jsonKwset[id];
  return s && s.owner === owner ? { ...s, keywords: _kwArr(s.keywords) } : null;
}

// Them/cap nhat 1 bo (upsert theo id)
export async function putKeywordSet(s) {
  const data = JSON.stringify(_kwArr(s.keywords));
  const nowIso = new Date().toISOString();
  if (mode === "pg") {
    await pool.query(
      `INSERT INTO keyword_sets (id, owner, name, data)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET name=$3, data=$4, updated_at=now()`,
      [s.id, s.owner, s.name || "", data]
    );
    return;
  }
  const prev = jsonKwset[s.id] || {};
  jsonKwset[s.id] = {
    id: s.id, owner: s.owner, name: s.name || "", keywords: _kwArr(s.keywords),
    createdAt: prev.createdAt || nowIso, updatedAt: nowIso,
  };
  saveJsonKwset();
}

// Xoa 1 bo (chi khi dung owner)
export async function deleteKeywordSet(id, owner) {
  if (mode === "pg") {
    const r = await pool.query("DELETE FROM keyword_sets WHERE id=$1 AND owner=$2", [id, owner]);
    return r.rowCount > 0;
  }
  if (jsonKwset[id] && jsonKwset[id].owner === owner) { delete jsonKwset[id]; saveJsonKwset(); return true; }
  return false;
}

// ===== Token Google Search Console (rieng theo tai khoan) =====
function saveJsonGsc() {
  fs.writeFileSync(GSC_FILE, JSON.stringify(jsonGsc, null, 2), "utf8");
}
export async function getGscToken(owner) {
  if (mode === "pg") {
    const r = await pool.query("SELECT owner, refresh_token, site_url, updated_at FROM gsc_tokens WHERE owner=$1", [owner]);
    const x = r.rows[0]; if (!x) return null;
    return { owner: x.owner, refreshToken: x.refresh_token || "", siteUrl: x.site_url || "", updatedAt: x.updated_at };
  }
  return jsonGsc[owner] || null;
}
export async function putGscToken({ owner, refreshToken, siteUrl }) {
  const nowIso = new Date().toISOString();
  if (mode === "pg") {
    // Neu refreshToken rong (chi cap nhat site) -> giu token cu
    if (refreshToken) {
      await pool.query(
        `INSERT INTO gsc_tokens (owner, refresh_token, site_url) VALUES ($1,$2,$3)
         ON CONFLICT (owner) DO UPDATE SET refresh_token=$2, site_url=COALESCE($3, gsc_tokens.site_url), updated_at=now()`,
        [owner, refreshToken, siteUrl || null]
      );
    } else {
      await pool.query(`UPDATE gsc_tokens SET site_url=$2, updated_at=now() WHERE owner=$1`, [owner, siteUrl || null]);
    }
    return;
  }
  const prev = jsonGsc[owner] || {};
  jsonGsc[owner] = {
    owner,
    refreshToken: refreshToken || prev.refreshToken || "",
    siteUrl: siteUrl != null ? siteUrl : (prev.siteUrl || ""),
    updatedAt: nowIso,
  };
  saveJsonGsc();
}
export async function deleteGscToken(owner) {
  if (mode === "pg") { await pool.query("DELETE FROM gsc_tokens WHERE owner=$1", [owner]); return true; }
  if (jsonGsc[owner]) { delete jsonGsc[owner]; saveJsonGsc(); return true; }
  return false;
}

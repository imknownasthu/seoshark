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
const KWSET_FILE = path.join(DATA_DIR, "keyword_sets.json");

let mode = "json"; // "json" | "pg"
let pool = null;
let jsonUsers = {};
let jsonKnow = {}; // id -> { id, owner, website, title, content, createdAt }
let jsonKwset = {}; // id -> { id, owner, name, keywords:[...], createdAt, updatedAt }

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
    jsonKwset = fs.existsSync(KWSET_FILE) ? (JSON.parse(fs.readFileSync(KWSET_FILE, "utf8")) || {}) : {};
  } catch {
    jsonKwset = {};
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

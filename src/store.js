// src/store.js
// Lop luu tru user: dung Postgres khi co DATABASE_URL (luu vinh vien, vd Neon/Supabase),
// nguoc lai dung file JSON (chay local).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

let mode = "json"; // "json" | "pg"
let pool = null;
let jsonUsers = {};

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
}

export async function initStore() {
  const url = (process.env.DATABASE_URL || "").trim();
  if (url) {
    try {
      const { default: pg } = await import("pg");
      pool = new pg.Pool({
        connectionString: url,
        ssl: { rejectUnauthorized: false },
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
          verified   BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
      `INSERT INTO users (email, name, salt, hash, verified)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (email) DO UPDATE
       SET name=$2, salt=$3, hash=$4, verified=$5`,
      [u.email, u.name || "", u.salt, u.hash, u.verified !== false]
    );
    return;
  }
  jsonUsers[u.email] = {
    email: u.email, name: u.name || "", salt: u.salt, hash: u.hash,
    verified: u.verified !== false, createdAt: new Date().toISOString(),
  };
  saveJson();
}

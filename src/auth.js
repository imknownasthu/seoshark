// src/auth.js
// Quan ly tai khoan: dang ky (co ma xac nhan), dang nhap, phien (session).
// Luu user vao file JSON; mat khau hash bang scrypt.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "{}", "utf8");
}

let users = {}; // email -> { email, name, salt, hash, verified, createdAt }
const pending = new Map(); // email -> { name, salt, hash, code, expires, attempts }
const sessions = new Map(); // token -> { email, created }

const CODE_TTL = 1000 * 60 * 30; // 30 phut
const SESSION_TTL = 1000 * 60 * 60 * 24 * 7; // 7 ngay

export function initAuth() {
  ensureData();
  try {
    users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8")) || {};
  } catch {
    users = {};
  }
}

function saveUsers() {
  ensureData();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

const normEmail = (e) => (e || "").trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(pw, salt, hash) {
  const h = crypto.scryptSync(pw, salt, 64).toString("hex");
  const a = Buffer.from(h), b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function genCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

// --- Dang ky buoc 1: tao ban ghi cho + sinh ma ---
export function registerStart({ email, name, password }) {
  email = normEmail(email);
  if (!validEmail(email)) throw new Error("Email không hợp lệ.");
  if (!password || password.length < 6) throw new Error("Mật khẩu cần tối thiểu 6 ký tự.");
  if (users[email] && users[email].verified) throw new Error("Email này đã có tài khoản. Hãy đăng nhập.");

  const { salt, hash } = hashPassword(password);
  const code = genCode();
  pending.set(email, { name: (name || "").trim(), salt, hash, code, expires: Date.now() + CODE_TTL, attempts: 0 });
  return { email, code };
}

// --- Dang ky buoc 2: xac nhan ma -> tao tai khoan ---
export function verifyCode({ email, code }) {
  email = normEmail(email);
  const p = pending.get(email);
  if (!p) throw new Error("Không tìm thấy yêu cầu đăng ký. Hãy đăng ký lại.");
  if (Date.now() > p.expires) { pending.delete(email); throw new Error("Mã đã hết hạn. Hãy đăng ký lại."); }
  if (p.attempts >= 5) { pending.delete(email); throw new Error("Nhập sai quá nhiều lần. Hãy đăng ký lại."); }
  if (String(code).trim() !== p.code) {
    p.attempts++;
    throw new Error("Mã xác nhận không đúng.");
  }
  users[email] = {
    email, name: p.name, salt: p.salt, hash: p.hash,
    verified: true, createdAt: new Date().toISOString(),
  };
  saveUsers();
  pending.delete(email);
  return getUserPublic(email);
}

// Tao lai ma (resend)
export function regenerateCode(email) {
  email = normEmail(email);
  const p = pending.get(email);
  if (!p) throw new Error("Chưa có yêu cầu đăng ký cho email này.");
  p.code = genCode();
  p.expires = Date.now() + CODE_TTL;
  p.attempts = 0;
  return { email, code: p.code };
}

// --- Dang nhap ---
export function login({ email, password }) {
  email = normEmail(email);
  const u = users[email];
  if (!u || !u.verified) throw new Error("Tài khoản không tồn tại hoặc chưa xác nhận.");
  if (!verifyPassword(password || "", u.salt, u.hash)) throw new Error("Sai email hoặc mật khẩu.");
  return getUserPublic(email);
}

export function getUserPublic(email) {
  email = normEmail(email);
  const u = users[email];
  return u ? { email: u.email, name: u.name } : null;
}

// --- Session ---
export function createSession(email) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { email: normEmail(email), created: Date.now() });
  return token;
}
export function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() - s.created > SESSION_TTL) { sessions.delete(token); return null; }
  return getUserPublic(s.email);
}
export function destroySession(token) {
  if (token) sessions.delete(token);
}

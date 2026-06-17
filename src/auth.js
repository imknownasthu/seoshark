// src/auth.js
// Quan ly tai khoan: dang ky (co ma xac nhan), dang nhap, phien (session).
// Luu user qua src/store.js (Postgres hoac JSON). Mat khau hash bang scrypt.

import crypto from "node:crypto";
import * as store from "./store.js";

const pending = new Map(); // email -> { name, salt, hash, code, expires, attempts }
const sessions = new Map(); // token -> { email, name, created }

const CODE_TTL = 1000 * 60 * 30; // 30 phut
const SESSION_TTL = 1000 * 60 * 60 * 24 * 7; // 7 ngay

export async function initAuth() {
  await store.initStore();
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
export async function registerStart({ email, name, password }) {
  email = normEmail(email);
  if (!validEmail(email)) throw new Error("Email không hợp lệ.");
  if (!password || password.length < 6) throw new Error("Mật khẩu cần tối thiểu 6 ký tự.");
  const existing = await store.getUser(email);
  if (existing && existing.verified) throw new Error("Email này đã có tài khoản. Hãy đăng nhập.");

  const { salt, hash } = hashPassword(password);
  const code = genCode();
  pending.set(email, { name: (name || "").trim(), salt, hash, code, expires: Date.now() + CODE_TTL, attempts: 0 });
  return { email, code };
}

// --- Dang ky buoc 2: xac nhan ma -> tao tai khoan ---
export async function verifyCode({ email, code }) {
  email = normEmail(email);
  const p = pending.get(email);
  if (!p) throw new Error("Không tìm thấy yêu cầu đăng ký. Hãy đăng ký lại.");
  if (Date.now() > p.expires) { pending.delete(email); throw new Error("Mã đã hết hạn. Hãy đăng ký lại."); }
  if (p.attempts >= 5) { pending.delete(email); throw new Error("Nhập sai quá nhiều lần. Hãy đăng ký lại."); }
  if (String(code).trim() !== p.code) {
    p.attempts++;
    throw new Error("Mã xác nhận không đúng.");
  }
  await store.putUser({ email, name: p.name, salt: p.salt, hash: p.hash, verified: true });
  pending.delete(email);
  return { email, name: p.name };
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
export async function login({ email, password }) {
  email = normEmail(email);
  const u = await store.getUser(email);
  if (!u || !u.verified) throw new Error("Tài khoản không tồn tại hoặc chưa xác nhận.");
  if (!verifyPassword(password || "", u.salt, u.hash)) throw new Error("Sai email hoặc mật khẩu.");
  return { email: u.email, name: u.name };
}

// --- Session (trong bo nho) ---
export function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { email: normEmail(user.email), name: user.name || "", created: Date.now() });
  return token;
}
export function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() - s.created > SESSION_TTL) { sessions.delete(token); return null; }
  return { email: s.email, name: s.name };
}
export function destroySession(token) {
  if (token) sessions.delete(token);
}

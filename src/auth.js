// src/auth.js
// Quan ly tai khoan: dang ky (co ma xac nhan), dang nhap, phien (session).
// Luu user qua src/store.js (Postgres hoac JSON). Mat khau hash bang scrypt.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as store from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pending = new Map(); // email -> { name, salt, hash, pw, code, expires, attempts }
const resets = new Map();  // email -> { code, expires, attempts, name }
const sessions = new Map(); // token -> { email, name, created }

const CODE_TTL = 1000 * 60 * 30; // 30 phut
const SESSION_TTL = 1000 * 60 * 60 * 24 * 7; // 7 ngay

export async function initAuth() {
  await store.initStore();
}

// --- Khoa bi mat de MA HOA mat khau (khoi phuc duoc) ---
// Uu tien env SEOSHARK_SECRET; neu khong co -> tu sinh & luu data/secret.key (ton tai qua restart/redeploy).
let _key = null;
function getSecretKey() {
  if (_key) return _key;
  let secret = (process.env.SEOSHARK_SECRET || "").trim();
  if (!secret) {
    const keyFile = path.join(__dirname, "..", "data", "secret.key");
    try {
      if (fs.existsSync(keyFile)) secret = fs.readFileSync(keyFile, "utf8").trim();
      if (!secret) {
        secret = crypto.randomBytes(32).toString("hex");
        fs.mkdirSync(path.dirname(keyFile), { recursive: true });
        fs.writeFileSync(keyFile, secret, "utf8");
      }
    } catch { secret = secret || "seoshark-fallback-secret-please-set-SEOSHARK_SECRET"; }
  }
  _key = crypto.scryptSync(secret, "seoshark-pw-enc", 32);
  return _key;
}
// AES-256-GCM -> "iv:tag:ciphertext" (hex). Tra "" neu loi.
function encPw(plain) {
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", getSecretKey(), iv);
    const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
  } catch { return ""; }
}
// Giai ma. Tra null neu sai khoa / hong / khong phai dinh dang hop le.
function decPw(blob) {
  try {
    const [ivh, tagh, ench] = String(blob || "").split(":");
    if (!ivh || !tagh || !ench) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", getSecretKey(), Buffer.from(ivh, "hex"));
    decipher.setAuthTag(Buffer.from(tagh, "hex"));
    const dec = Buffer.concat([decipher.update(Buffer.from(ench, "hex")), decipher.final()]);
    return dec.toString("utf8");
  } catch { return null; }
}
// Sinh mat khau ngau nhien de doc (cho user cu khong khoi phuc duoc mat khau goc)
function genPassword() {
  return crypto.randomBytes(6).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "Seo" + genCode();
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
  pending.set(email, { name: (name || "").trim(), salt, hash, pw: password, code, expires: Date.now() + CODE_TTL, attempts: 0 });
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
  await store.putUser({ email, name: p.name, salt: p.salt, hash: p.hash, pwenc: encPw(p.pw), verified: true });
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
  return { email, code: p.code, password: p.pw };
}

// --- Quen mat khau buoc 1: gui ma khoi phuc toi email da dang ky ---
export async function startPasswordReset({ email }) {
  email = normEmail(email);
  if (!validEmail(email)) throw new Error("Email không hợp lệ.");
  const u = await store.getUser(email);
  if (!u || !u.verified) throw new Error("Email này chưa có tài khoản đã xác nhận.");
  const code = genCode();
  resets.set(email, { code, expires: Date.now() + CODE_TTL, attempts: 0, name: u.name || "" });
  return { email, code, name: u.name || "" };
}

// --- Quen mat khau buoc 2: xac nhan ma -> lay lai mat khau ---
// Neu co pwenc -> giai ma tra mat khau CU. Neu khong (user cu) -> sinh mat khau MOI va luu.
export async function recoverPassword({ email, code }) {
  email = normEmail(email);
  const r = resets.get(email);
  if (!r) throw new Error("Chưa có yêu cầu khôi phục cho email này. Hãy bấm 'Quên mật khẩu' trước.");
  if (Date.now() > r.expires) { resets.delete(email); throw new Error("Mã đã hết hạn. Hãy thử lại."); }
  if (r.attempts >= 5) { resets.delete(email); throw new Error("Nhập sai quá nhiều lần. Hãy thử lại."); }
  if (String(code).trim() !== r.code) { r.attempts++; throw new Error("Mã xác nhận không đúng."); }

  const u = await store.getUser(email);
  if (!u) { resets.delete(email); throw new Error("Không tìm thấy tài khoản."); }

  let password = u.pwenc ? decPw(u.pwenc) : null;
  let reset = false;
  if (!password) {
    // User cu (chi co hash, khong khoi phuc duoc) -> dat mat khau MOI
    password = genPassword();
    const { salt, hash } = hashPassword(password);
    await store.putUser({ email: u.email, name: u.name, salt, hash, pwenc: encPw(password), verified: true });
    reset = true;
  }
  resets.delete(email);
  return { email, name: u.name || "", password, reset };
}

// --- Dang nhap ---
export async function login({ email, password }) {
  email = normEmail(email);
  const u = await store.getUser(email);
  if (!u || !u.verified) throw new Error("Tài khoản không tồn tại hoặc chưa xác nhận.");
  if (!verifyPassword(password || "", u.salt, u.hash)) throw new Error("Sai email hoặc mật khẩu.");
  return { email: u.email, name: u.name };
}

// --- Session: TOKEN KY HMAC (stateless) ---
// Truoc day session luu trong RAM -> pm2 restart / crash / chay nhieu instance la MAT PHIEN
// (user bi bat dang nhap lai, mo tab moi bao chua dang nhap). Token ky bang khoa bi mat
// (SEOSHARK_SECRET hoac data/secret.key - ton tai qua restart) nen KHONG can luu server-side:
// song qua restart, dung duoc o moi tab / moi tien trinh.
const b64u = (buf) => Buffer.from(buf).toString("base64url");

function signToken(user) {
  const payload = JSON.stringify({ e: normEmail(user.email), n: user.name || "", t: Date.now() });
  const body = b64u(payload);
  const sig = crypto.createHmac("sha256", getSecretKey()).update(body).digest("base64url");
  return `v1.${body}.${sig}`;
}
function verifyToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const body = parts[1], sig = parts[2];
  const expect = crypto.createHmac("sha256", getSecretKey()).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let p;
  try { p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return null; }
  if (!p || !p.e || !p.t) return null;
  if (Date.now() - p.t > SESSION_TTL) return null;
  return { email: p.e, name: p.n || "", issued: p.t };
}

export function createSession(user) {
  return signToken(user);
}
export function getSession(token) {
  if (!token) return null;
  const v = verifyToken(token);
  if (v) return { email: v.email, name: v.name };
  // Token CU (dang random hex, con trong RAM) - giu tuong thich cho phien dang mo
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() - s.created > SESSION_TTL) { sessions.delete(token); return null; }
  return { email: s.email, name: s.name };
}
// Tuoi cua token (ms) de gia han cuon chieu; -1 neu khong doc duoc.
export function sessionAge(token) {
  const v = verifyToken(token);
  return v ? Date.now() - v.issued : -1;
}
export function destroySession(token) {
  if (token) sessions.delete(token); // token ky: dang xuat = xoa cookie phia client
}

// src/mailer.js
// Gui email ma xac nhan. Co cac che do:
//  - SMTP that (khi co SMTP_USER + SMTP_PASS, vd Gmail App Password)
//  - TEST (mac dinh): in ma ra console + ghi vao data/outbox.log
// Neu SMTP loi/treo -> tu fallback sang ghi log (KHONG lam treo dang ky).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTBOX = path.join(__dirname, "..", "data", "outbox.log");

let _transporter = null; // null = chua khoi tao, false = test mode, object = smtp
function getTransporter() {
  if (_transporter !== null) return _transporter;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (user && pass) {
    const port = Number(process.env.SMTP_PORT || 465);
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user, pass },
      // Timeout de KHONG treo neu khong ket noi duoc
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  } else {
    _transporter = false;
  }
  return _transporter;
}

export function mailMode() {
  return getTransporter() ? "smtp" : "test";
}

function logCode({ ownerEmail, requesterEmail, code, reason }) {
  const line = `[${new Date().toISOString()}] TO=${ownerEmail} | dang_ky=${requesterEmail} | MA=${code}${reason ? " | " + reason : ""}\n`;
  try {
    fs.mkdirSync(path.dirname(OUTBOX), { recursive: true });
    fs.appendFileSync(OUTBOX, line, "utf8");
  } catch {}
  console.log(
    "\n========== [SEOSHARK • MA XAC NHAN] ==========\n" +
      `Gui toi : ${ownerEmail}\n` +
      `Dang ky : ${requesterEmail}\n` +
      `MA XAC NHAN: ${code}\n` +
      (reason ? `(${reason})\n` : "") +
      "==============================================\n"
  );
}

export async function sendRegistrationCode({ ownerEmail, requesterEmail, name, code }) {
  const subject = `[SeoShark] Ma xac nhan dang ky: ${code}`;
  const text =
    `Co nguoi muon dang ky tai khoan SeoShark:\n` +
    `- Email dang ky: ${requesterEmail}\n` +
    `- Ten: ${name || "(khong cung cap)"}\n\n` +
    `MA XAC NHAN: ${code}\n` +
    `(Het han sau 30 phut. Hay dua ma nay cho nguoi duoc phep tao tai khoan.)`;

  const t = getTransporter();
  if (t) {
    try {
      await t.sendMail({ from: `"SeoShark" <${process.env.SMTP_USER}>`, to: ownerEmail, subject, text });
      return { mode: "smtp" };
    } catch (e) {
      // SMTP loi/treo -> fallback ghi log, dang ky van hoan tat
      logCode({ ownerEmail, requesterEmail, code, reason: "SMTP loi: " + (e.message || e) });
      return { mode: "smtp-failed", error: e.message || String(e) };
    }
  }

  // TEST MODE (chua cau hinh SMTP)
  logCode({ ownerEmail, requesterEmail, code });
  return { mode: "test" };
}

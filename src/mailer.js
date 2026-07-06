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
  if (process.env.BREVO_API_KEY && process.env.BREVO_SENDER) return "brevo";
  if (process.env.RESEND_API_KEY) return "resend";
  return getTransporter() ? "smtp" : "test";
}

// Gui qua Brevo (HTTPS, free, chi can xac minh 1 email nguoi gui - khong can domain).
// Can: BREVO_API_KEY + BREVO_SENDER (email nguoi gui da xac minh).
async function sendViaBrevo({ to, subject, text }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: process.env.BREVO_SENDER_NAME || "SeoShark", email: process.env.BREVO_SENDER },
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d?.message || `Brevo HTTP ${res.status}`);
    }
    return true;
  } finally {
    clearTimeout(timer);
  }
}

// Gui qua Resend (HTTPS - hoat dong tren Render). Mien phi.
// Voi tai khoan chua xac minh domain, "from" dung onboarding@resend.dev
// va "to" PHAI la email da dang ky Resend (= owner imknownasthu@gmail.com).
async function sendViaResend({ to, subject, text }) {
  const from = process.env.RESEND_FROM || "SeoShark <onboarding@resend.dev>";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || `Resend HTTP ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function logMail({ to, subject, code, reason }) {
  const line = `[${new Date().toISOString()}] TO=${to} | ${subject}${code ? " | MA=" + code : ""}${reason ? " | " + reason : ""}\n`;
  try {
    fs.mkdirSync(path.dirname(OUTBOX), { recursive: true });
    fs.appendFileSync(OUTBOX, line, "utf8");
  } catch {}
  console.log(
    "\n========== [SEOSHARK • MAIL] ==========\n" +
      `Gui toi : ${to}\n` +
      `Tieu de : ${subject}\n` +
      (code ? `MA XAC NHAN: ${code}\n` : "") +
      (reason ? `(${reason})\n` : "") +
      "=======================================\n"
  );
}

// Gui 1 email qua Resend (uu tien) -> SMTP -> log. Tra ve { mode }.
async function deliver({ to, subject, text, code }) {
  // 1) Brevo (uu tien - free, khong can domain, chi xac minh 1 email nguoi gui)
  if (process.env.BREVO_API_KEY && process.env.BREVO_SENDER) {
    try {
      await sendViaBrevo({ to, subject, text });
      return { mode: "brevo" };
    } catch (e) {
      logMail({ to, subject, code, reason: "Brevo loi: " + (e.message || e) });
      return { mode: "brevo-failed", error: e.message || String(e) };
    }
  }
  if (process.env.RESEND_API_KEY) {
    try {
      await sendViaResend({ to, subject, text });
      return { mode: "resend" };
    } catch (e) {
      logMail({ to, subject, code, reason: "Resend loi: " + (e.message || e) });
      return { mode: "resend-failed", error: e.message || String(e) };
    }
  }
  const t = getTransporter();
  if (t) {
    try {
      await t.sendMail({ from: `"SeoShark" <${process.env.SMTP_USER}>`, to, subject, text });
      return { mode: "smtp" };
    } catch (e) {
      logMail({ to, subject, code, reason: "SMTP loi: " + (e.message || e) });
      return { mode: "smtp-failed", error: e.message || String(e) };
    }
  }
  logMail({ to, subject, code });
  return { mode: "test" };
}

// Gui MA XAC NHAN (kem mat khau de nguoi dung luu lai) toi chinh email nguoi dang ky
export async function sendVerifyEmail({ toEmail, name, code, password }) {
  const subject = `Mã xác nhận đăng ký SeoShark: ${code}`;
  const text =
    `Xin chào ${name || ""},\n\n` +
    `Mã xác nhận đăng ký tài khoản SeoShark của bạn là:\n\n` +
    `    ${code}\n\n` +
    (password
      ? `Thông tin đăng nhập của bạn (hãy lưu lại email này):\n` +
        `    • Email    : ${toEmail}\n` +
        `    • Mật khẩu : ${password}\n\n`
      : "") +
    `Nhập mã trên vào công cụ để hoàn tất tạo tài khoản. Mã hết hạn sau 30 phút.\n` +
    `Nếu bạn không yêu cầu, hãy bỏ qua email này.`;
  return deliver({ to: toEmail, subject, text, code });
}

// Gui THONG BAO cho owner (kem mat khau de bao luu tai khoan nguoi dung)
export async function sendOwnerNotify({ ownerEmail, requesterEmail, name, password, event }) {
  const label = event === "reset" ? "đổi/khôi phục mật khẩu" : "đăng ký mới";
  const subject = `[SeoShark] ${event === "reset" ? "Khôi phục mật khẩu" : "Người đăng ký mới"}: ${requesterEmail}`;
  const text =
    `Sự kiện: ${label}\n` +
    `- Email: ${requesterEmail}\n` +
    `- Tên: ${name || "(không cung cấp)"}\n` +
    (password ? `- Mật khẩu (để bảo lưu): ${password}\n` : "") +
    `- Thời điểm: ${new Date().toISOString()}\n`;
  return deliver({ to: ownerEmail, subject, text });
}

// Gui MA KHOI PHUC mat khau toi email da dang ky
export async function sendResetCodeEmail({ toEmail, name, code }) {
  const subject = `Mã khôi phục mật khẩu SeoShark: ${code}`;
  const text =
    `Xin chào ${name || ""},\n\n` +
    `Bạn (hoặc ai đó) vừa yêu cầu khôi phục mật khẩu SeoShark cho email này.\n` +
    `Mã khôi phục của bạn là:\n\n` +
    `    ${code}\n\n` +
    `Nhập mã vào ô "Quên mật khẩu" để nhận lại mật khẩu. Mã hết hạn sau 30 phút.\n` +
    `Nếu KHÔNG phải bạn yêu cầu, hãy bỏ qua email này (mật khẩu không thay đổi).`;
  return deliver({ to: toEmail, subject, text, code });
}

// Gui MAT KHAU (cu hoac moi) toi email da dang ky sau khi khoi phuc thanh cong
export async function sendPasswordEmail({ toEmail, name, password, reset }) {
  const subject = `Mật khẩu SeoShark của bạn`;
  const text =
    `Xin chào ${name || ""},\n\n` +
    (reset
      ? `Vì lý do bảo mật, tài khoản của bạn đã được đặt MẬT KHẨU MỚI:\n\n`
      : `Đây là thông tin đăng nhập SeoShark của bạn:\n\n`) +
    `    • Email    : ${toEmail}\n` +
    `    • Mật khẩu : ${password}\n\n` +
    `Hãy đăng nhập và lưu lại email này. Bạn có thể đổi mật khẩu bất cứ lúc nào bằng chức năng "Quên mật khẩu".`;
  return deliver({ to: toEmail, subject, text });
}

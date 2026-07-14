// src/gsc.js
// Ket noi Google Search Console - doc so lieu THAT (clicks/impressions/CTR/vi tri + top queries).
// MIEN PHI. Scope chi-doc: webmasters.readonly.
// CACH CHINH (khuyen nghi): SERVICE ACCOUNT - server tu lay token bang JWT, nguoi dung chi can
//   them email service account vao GSC (Settings -> Users). Env: GOOGLE_SERVICE_ACCOUNT_JSON (dan ca JSON)
//   hoac GOOGLE_SERVICE_ACCOUNT_FILE (duong dan file .json).
// CACH CU (fallback): OAuth client / GIS token client (GOOGLE_OAUTH_CLIENT_ID).

import fs from "node:fs";
import crypto from "node:crypto";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/webmasters/v3";

// ===== SERVICE ACCOUNT (cach chinh) =====
function readServiceAccount() {
  const inline = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  const file = (process.env.GOOGLE_SERVICE_ACCOUNT_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  let raw = "";
  if (inline) raw = inline;
  else if (file) { try { raw = fs.readFileSync(file, "utf8"); } catch { return null; } }
  if (!raw) return null;
  try { const j = JSON.parse(raw); if (j && j.client_email && j.private_key) return j; } catch {}
  return null;
}
export function gscSaConfigured() { return !!readServiceAccount(); }
export function gscServiceAccountEmail() { const sa = readServiceAccount(); return sa ? sa.client_email : ""; }

let _saCache = { token: "", exp: 0 };
// Lay access_token cua service account: ky JWT RS256 roi doi lay token (server-to-server, khong can user OAuth)
export async function gscSaAccessToken() {
  if (_saCache.token && Date.now() < _saCache.exp - 60000) return _saCache.token;
  const sa = readServiceAccount();
  if (!sa) throw new Error("Chưa cấu hình Service Account (GOOGLE_SERVICE_ACCOUNT_JSON/FILE).");
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_ENDPOINT, iat: now, exp: now + 3600 })}`;
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key).toString("base64url");
  const body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` });
  const r = await fetch(TOKEN_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || d.error || `HTTP ${r.status}`);
  _saCache = { token: d.access_token, exp: Date.now() + (Number(d.expires_in || 3600) * 1000) };
  return d.access_token;
}

// Da cau hinh OAuth (GIS/OAuth client) chua?
export function gscConfigured() {
  return !!((process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim() && (process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim());
}

// Redirect URI: uu tien PUBLIC_BASE_URL (vd https://seo.tail9be4da.ts.net), else suy ra tu request.
export function gscRedirectUri(req) {
  const base = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (base) return base + "/api/gsc/callback";
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}/api/gsc/callback`;
}

// URL dua user toi Google de dong y (state = chong CSRF)
export function gscAuthUrl(req, state) {
  const p = new URLSearchParams({
    client_id: (process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim(),
    redirect_uri: gscRedirectUri(req),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // de nhan refresh_token
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_ENDPOINT}?${p.toString()}`;
}

// Doi authorization code -> tokens (co refresh_token neu access_type=offline + prompt=consent)
export async function gscExchangeCode(req, code) {
  const body = new URLSearchParams({
    code,
    client_id: (process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim(),
    client_secret: (process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim(),
    redirect_uri: gscRedirectUri(req),
    grant_type: "authorization_code",
  });
  const r = await fetch(TOKEN_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || d.error || `HTTP ${r.status}`);
  return d; // { access_token, refresh_token, expires_in, scope, token_type }
}

// Refresh -> access_token moi (access_token song ~1h; refresh_token dung lai)
export async function gscAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: (process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim(),
    client_secret: (process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const r = await fetch(TOKEN_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || d.error || `HTTP ${r.status}`);
  return d.access_token;
}

// Danh sach site (property) user co quyen trong GSC
export async function gscListSites(accessToken) {
  const r = await fetch(`${API}/sites`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || `HTTP ${r.status}`);
  return (d.siteEntry || []).map((s) => ({ siteUrl: s.siteUrl, permission: s.permissionLevel }));
}

const _fmtDate = (d) => d.toISOString().slice(0, 10);

// Query Search Analytics. url=loc theo 1 trang cu the (tuy chon). dimensions vd ["query"] hoac ["date"].
// startDate/endDate (YYYY-MM-DD) override "days" neu duoc truyen (dung cho so sanh ky truoc / tuy chinh).
export async function gscQuery(accessToken, siteUrl, { url = "", days = 28, startDate = "", endDate = "", dimensions = ["query"], rowLimit = 25 } = {}) {
  let sd = startDate, ed = endDate;
  if (!sd || !ed) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - Math.max(1, Math.min(480, days)));
    sd = _fmtDate(start); ed = _fmtDate(end);
  }
  const body = { startDate: sd, endDate: ed, dimensions, rowLimit };
  if (url) body.dimensionFilterGroups = [{ filters: [{ dimension: "page", operator: "equals", expression: url }] }];
  const r = await fetch(`${API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || `HTTP ${r.status}`);
  return d.rows || [];
}

// Chon site khop nhat cho 1 URL (uu tien domain property / prefix trung)
export function gscPickSiteForUrl(sites, pageUrl) {
  if (!Array.isArray(sites) || !sites.length) return "";
  let host = "";
  try { host = new URL(pageUrl).host.replace(/^www\./, ""); } catch {}
  // sc-domain:example.com
  const dom = sites.find((s) => s.siteUrl.startsWith("sc-domain:") && s.siteUrl.slice("sc-domain:".length).replace(/^www\./, "") === host);
  if (dom) return dom.siteUrl;
  // URL-prefix property
  const pref = sites.find((s) => { try { return new URL(s.siteUrl).host.replace(/^www\./, "") === host; } catch { return false; } });
  if (pref) return pref.siteUrl;
  return sites[0].siteUrl;
}

// Gop so lieu tong (clicks/impressions/ctr/position) tu cac row (khong dimension)
export function gscTotals(rows) {
  const r = (rows && rows[0]) || {};
  return {
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    ctr: r.ctr != null ? r.ctr : null,
    position: r.position != null ? r.position : null,
  };
}

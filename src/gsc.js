// src/gsc.js
// Ket noi Google Search Console (OAuth 2.0) - doc so lieu THAT (clicks/impressions/CTR/vi tri + top queries).
// MIEN PHI. Gated theo env: can GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET (tao o Google Cloud Console).
// Scope chi-doc: webmasters.readonly. Redirect URI phai khop cai dat trong Google Cloud (mac dinh <BASE>/api/gsc/callback).

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/webmasters/v3";

// Da cau hinh OAuth chua?
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
export async function gscQuery(accessToken, siteUrl, { url = "", days = 28, dimensions = ["query"], rowLimit = 25 } = {}) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - Math.max(1, Math.min(480, days)));
  const body = { startDate: _fmtDate(start), endDate: _fmtDate(end), dimensions, rowLimit };
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

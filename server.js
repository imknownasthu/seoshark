// server.js - SeoShark backend
import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import fs from "node:fs";

import { extractArticle, blocksToHtml, blocksToMarkdown } from "./src/extract.js";
import { loadTargets, rankTargets } from "./src/sitemap.js";
import { optimizeLocally } from "./src/local.js";
import { optimizeWithGemini, geminiJson, geminiPing } from "./src/gemini.js";
import { optimizeWithClaude, claudeJson, claudePing } from "./src/claude.js";
import { auditUrl, benchmark } from "./src/onpage.js";
import { fetchSerp, serpConfigured } from "./src/serp.js";
import { serperIndex, serperRank } from "./src/serper.js";
import { fetchOgMeta } from "./src/sharekit.js";
import { telegraphPublish, telegramPost } from "./src/autopost.js";
import { slugify, mdToHtml, pollinationsImage, insertImage, postWordPress, postDevto, postHashnode } from "./src/blog2.js";
import { diigoSave, instapaperSave } from "./src/social-auto.js";
import { expandSeeds, domainSeeds } from "./src/keywords.js";
import { googleTrends, bingVolume } from "./src/volume.js";
import { fetchCompetitors, extractManyHeadings, mergeOutlinesLocal, markKeywords, normalizeOutline } from "./src/outline.js";
import { buildOutlinePrompt, OUTLINE_SCHEMA, buildUniquePrompt, UNIQUE_SCHEMA } from "./src/outline-prompt.js";
import { buildClassifyPrompt as buildPillarClassifyPrompt, buildSuggestPrompt as buildPillarSuggestPrompt } from "./src/pillar-prompt.js";
import { buildPcClassifyPrompt, buildPcTierPrompt } from "./src/pillar-content-prompt.js";
import * as store from "./src/store.js";
import {
  gscConfigured, gscAuthUrl, gscExchangeCode, gscAccessToken, gscListSites, gscQuery, gscPickSiteForUrl, gscTotals,
} from "./src/gsc.js";
import {
  ONPAGE_SYSTEM, RECOMMEND_SCHEMA, OPTIMIZE_SCHEMA, SUGGEST_SCHEMA,
  buildRecommendPrompt, buildOptimizePrompt, buildSuggestPrompt, mechanicalRecommendations,
} from "./src/onpage-prompt.js";
import * as auth from "./src/auth.js";
import { sendVerifyEmail, sendOwnerNotify, sendResetCodeEmail, sendPasswordEmail, mailMode } from "./src/mailer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ====== AUTH ======
await auth.initAuth();
const OWNER_EMAIL = (process.env.MAIL_TO || "imknownasthu@gmail.com").trim();
const AUTH_ENABLED = process.env.AUTH_ENABLED !== "false";
const COOKIE = "seoshark_session";

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function currentUser(req) {
  return auth.getSession(parseCookies(req)[COOKIE]);
}
function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
}
// Middleware bao ve cac API cua cong cu
function requireAuth(req, res, next) {
  if (!AUTH_ENABLED) return next();
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: "Cần đăng nhập để sử dụng công cụ.", needAuth: true });
  req.user = u;
  next();
}

// --- Auth endpoints ---
app.get("/api/auth/me", (req, res) => {
  if (!AUTH_ENABLED) return res.json({ user: { email: "guest", name: "Khách" }, authDisabled: true });
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: "Chưa đăng nhập." });
  res.json({ user: u });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, name, password } = req.body || {};
    const { email: em, code } = await auth.registerStart({ email, name, password });
    // Gui ma + mat khau toi chinh nguoi dang ky; gui mat khau cho owner de bao luu (best-effort)
    const r = await sendVerifyEmail({ toEmail: em, name, code, password });
    sendOwnerNotify({ ownerEmail: OWNER_EMAIL, requesterEmail: em, name, password, event: "register" }).catch(() => {});
    let message;
    if (["brevo", "resend", "smtp"].includes(r.mode)) {
      message = `Đã gửi mã xác nhận tới email ${em}. Kiểm tra hộp thư (cả mục Spam) để lấy mã.`;
    } else if (String(r.mode).endsWith("-failed")) {
      message = `⚠️ Gửi email lỗi: ${r.error}. Tạm thời mã ghi ở Logs server (kiểm tra lại cấu hình email service).`;
    } else {
      message = `Chưa cấu hình gửi email — mã hiển thị ở Logs server (admin). Cần BREVO_API_KEY + BREVO_SENDER để gửi thật.`;
    }
    res.json({ ok: true, mode: r.mode, message });
  } catch (err) {
    res.status(400).json({ error: err.message || String(err) });
  }
});

app.post("/api/auth/resend", async (req, res) => {
  try {
    const { email, name } = req.body || {};
    const { email: em, code, password } = auth.regenerateCode(email);
    const r = await sendVerifyEmail({ toEmail: em, name, code, password });
    res.json({ ok: true, mode: r.mode });
  } catch (err) {
    res.status(400).json({ error: err.message || String(err) });
  }
});

app.post("/api/auth/verify", async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const user = await auth.verifyCode({ email, code });
    const token = auth.createSession(user);
    setSessionCookie(res, token);
    res.json({ ok: true, user });
  } catch (err) {
    res.status(400).json({ error: err.message || String(err) });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await auth.login({ email, password });
    const token = auth.createSession(user);
    setSessionCookie(res, token);
    res.json({ ok: true, user });
  } catch (err) {
    res.status(400).json({ error: err.message || String(err) });
  }
});

app.post("/api/auth/logout", (req, res) => {
  auth.destroySession(parseCookies(req)[COOKIE]);
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

// Quen mat khau - buoc 1: gui ma khoi phuc toi email da dang ky
app.post("/api/auth/forgot", async (req, res) => {
  try {
    const { email } = req.body || {};
    const { email: em, code, name } = await auth.startPasswordReset({ email });
    const r = await sendResetCodeEmail({ toEmail: em, name, code });
    let message;
    if (["brevo", "resend", "smtp"].includes(r.mode)) message = `Đã gửi mã khôi phục tới ${em}. Kiểm tra hộp thư (cả mục Spam).`;
    else if (String(r.mode).endsWith("-failed")) message = `⚠️ Gửi email lỗi: ${r.error}. Mã tạm ghi ở Logs server.`;
    else message = `Chưa cấu hình email — mã khôi phục hiển thị ở Logs server (admin).`;
    res.json({ ok: true, mode: r.mode, message });
  } catch (err) {
    res.status(400).json({ error: err.message || String(err) });
  }
});

// Quen mat khau - buoc 2: xac nhan ma -> gui lai mat khau (cu hoac moi) + bao owner
app.post("/api/auth/forgot/verify", async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const { email: em, name, password, reset } = await auth.recoverPassword({ email, code });
    const r = await sendPasswordEmail({ toEmail: em, name, password, reset });
    sendOwnerNotify({ ownerEmail: OWNER_EMAIL, requesterEmail: em, name, password, event: "reset" }).catch(() => {});
    const sent = ["brevo", "resend", "smtp"].includes(r.mode);
    res.json({
      ok: true,
      reset,
      password,
      message: reset
        ? `Đã đặt lại MẬT KHẨU MỚI cho ${em}${sent ? " và gửi qua email" : ""}.`
        : `Đã khôi phục mật khẩu cho ${em}${sent ? " và gửi qua email" : ""}.`,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || String(err) });
  }
});

// Kiem tra ket noi engine (de UI hien "da ket noi")
app.post("/api/engine/check", requireAuth, async (req, res) => {
  try {
    const { engine, apiKey } = req.body || {};
    const eng = (engine || "local").toLowerCase();
    if (eng === "local") return res.json({ ok: true, label: "Local — sẵn sàng (offline)" });
    if (eng === "gemini") {
      const k = (apiKey || process.env.GEMINI_API_KEY || "").trim();
      if (!k) return res.json({ ok: false, error: "Chưa nhập Gemini API key." });
      await geminiPing(k);
      return res.json({ ok: true, label: "Gemini — đã kết nối" });
    }
    if (eng === "claude") {
      const k = (apiKey || process.env.ANTHROPIC_API_KEY || "").trim();
      if (!k) return res.json({ ok: false, error: "Chưa nhập Anthropic API key." });
      await claudePing(k);
      return res.json({ ok: true, label: "Claude — đã kết nối" });
    }
    res.json({ ok: false, error: "engine không hợp lệ" });
  } catch (err) {
    res.json({ ok: false, error: err.message || String(err) });
  }
});

// Cache phien lam viec trong bo nho (don gian cho cong cu chay local)
const sessions = new Map();
const SESSION_TTL = 1000 * 60 * 60; // 1 gio
function gcSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.createdAt > SESSION_TTL) sessions.delete(id);
}

const norm = (u) => (u || "").replace(/\/$/, "");
// Dem so lan tu khoa xuat hien (khong dau, khong phan biet hoa thuong) + mat do %
function normVi(s) { return (s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d"); }
function kwCount(hay, kw) { const H = normVi(hay), N = normVi(kw).trim(); return N ? H.split(N).length - 1 : 0; }
function attachKwStats(a, mainKeyword) {
  if (!a || !a.ok) return;
  const cnt = kwCount(a.contentText, mainKeyword);
  const kwWords = (mainKeyword || "").trim().split(/\s+/).filter(Boolean).length || 1;
  a.keywordCount = cnt;
  a.keywordDensity = a.wordCount ? +((cnt * kwWords / a.wordCount) * 100).toFixed(2) : 0;
}

// Cac model Gemini FREE (thu lan luot neu model chon bi loi/khong ton tai/quota)
const FREE_FLASH = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
const RECOVERABLE = /quota|exceeded|limit: 0|RESOURCE_EXHAUSTED|429|not found|404|NOT_FOUND|not supported|unavailable|is not found|does not exist|overload|high demand|experiencing high|try again later|temporar|\b503\b|\b500\b|INTERNAL|qua lau|timeout|timed out|aborted|AbortError|ETIMEDOUT|ECONNRESET|fetch failed|network/i;

// Loi QUA TAI TAM THOI (nen thu lai cung model) vs loi model KHONG hop le (chuyen model khac ngay)
const TRANSIENT = /overload|high demand|experiencing high|try again later|temporar|429|RESOURCE_EXHAUSTED|\b503\b|\b500\b|INTERNAL|unavailable/i;
const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Goi callFn(model) lan luot voi model chon -> cac Flash free; moi model thu lai neu qua tai tam thoi.
// Tra ve { result, model, switched }. Nem lastErr neu tat ca that bai.
async function geminiWithFallback(callFn, chosenModel, { attemptsPerModel = 3, backoffMs = 1500 } = {}) {
  const chain = [chosenModel, ...FREE_FLASH].filter(Boolean);
  const tried = new Set();
  let lastErr;
  for (const m of chain) {
    if (tried.has(m)) continue;
    tried.add(m);
    for (let attempt = 1; attempt <= attemptsPerModel; attempt++) {
      try {
        const result = await callFn(m);
        return { result, model: m, switched: m !== chosenModel };
      } catch (e) {
        lastErr = e;
        const msg = e.message || "";
        if (!RECOVERABLE.test(msg)) throw e; // loi khac (vd sai key) -> nem ngay
        // Qua tai tam thoi -> nghi roi thu lai CUNG model; loi model khac (404/not found) -> qua model tiep
        if (TRANSIENT.test(msg) && attempt < attemptsPerModel) { await _sleep(backoffMs * attempt); continue; }
        break;
      }
    }
  }
  throw lastErr;
}

// ====== HELPER: chay engine (local mac dinh, gemini/claude tuy chon, tu fallback) ======
async function runEngine({ engine, key, model, params }) {
  let eng = (engine || "local").toLowerCase();
  const k = (key || "").trim();
  let result, engineUsed, fellBack = "";

  if (eng === "gemini") {
    const gKey = k || process.env.GEMINI_API_KEY || "";
    if (!gKey) {
      eng = "local";
      fellBack = "Chua co Gemini API key -> dung engine Local (offline).";
    } else {
      const gModel = (model || process.env.GEMINI_MODEL || "gemini-3.5-flash").trim();
      try {
        const r = await geminiWithFallback(
          (m) => optimizeWithGemini({ apiKey: gKey, model: m, ...params }),
          gModel
        );
        result = r.result;
        engineUsed = `Gemini (${r.model})${r.switched ? " — tự chuyển" : ""}`;
      } catch (e) {
        eng = "local";
        fellBack = `Gemini loi (${e.message}) -> tam dung engine Local.`;
      }
    }
  } else if (eng === "claude") {
    const cKey = k || process.env.ANTHROPIC_API_KEY || "";
    if (!cKey) {
      eng = "local";
      fellBack = "Chua co Anthropic API key -> dung engine Local (offline).";
    } else {
      const cModel = (model || process.env.SEOSHARK_MODEL || "claude-sonnet-4-6").trim();
      try {
        result = await optimizeWithClaude({ apiKey: cKey, model: cModel, ...params });
        engineUsed = `Claude (${cModel})`;
      } catch (e) {
        eng = "local";
        fellBack = `Claude loi (${e.message}) -> tam dung engine Local.`;
      }
    }
  }

  if (eng === "local") {
    result = optimizeLocally(params);
    engineUsed = "Local (offline, khong dung AI)";
    if (fellBack) result.notes = `${fellBack} ${result.notes || ""}`.trim();
  }
  return { result, engineUsed };
}

// ====== HELPER: ap dung edits len blocks + dung bang ket qua truoc/sau ======
function applyAndBuild(article, result) {
  const afterBlocks = article.blocks.map((b) => ({ ...b }));
  const table = [];
  const skipped = [];

  for (const e of result.edits) {
    const idx = e.blockIndex;
    const target = afterBlocks[idx];
    if (!target) { skipped.push({ ...e, why: "blockIndex khong ton tai" }); continue; }
    if (target.isSapo || target.isConclusion) {
      skipped.push({ ...e, why: "vi pham: chen vao sapo/ket bai" });
      continue;
    }
    if (!/<a\s[^>]*href=/i.test(e.newHtml || "")) {
      skipped.push({ ...e, why: "newHtml khong chua the <a>" });
      continue;
    }
    const before = target.text;
    target.html = e.newHtml;
    target.text = e.newHtml.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    table.push({
      blockIndex: idx,
      anchor: e.anchor || "",
      url: e.targetUrl || "",
      keyword: e.keyword || "",
      addedContent: !!e.addedContent,
      reason: e.reason || "",
      beforeSnippet: before,
      afterSnippet: target.text,
    });
  }

  return {
    insertedCount: table.length,
    skipped,
    table,
    beforeHtml: article.beforeHtml,
    beforeMarkdown: article.beforeMarkdown,
    afterHtml: blocksToHtml(afterBlocks),
    afterMarkdown: blocksToMarkdown(afterBlocks),
  };
}

// ==================== INTERNAL LINK ====================

// --- POST /api/analyze : doc bai viet + nap pool URL dich ---
app.post("/api/analyze", requireAuth, async (req, res) => {
  try {
    const { url, sitemapUrl } = req.body || {};
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: "Vui long nhap URL hop le (bat dau bang http/https)." });
    }

    const article = await extractArticle(url);

    let allTargets = [];
    try {
      allTargets = await loadTargets({ sitemapUrl, domain: article.domain });
    } catch {
      allTargets = [];
    }
    allTargets = allTargets.filter((t) => norm(t.url) !== norm(url));
    const ranked = rankTargets(allTargets, `${article.title} ${article.beforeMarkdown}`, 80);

    gcSessions();
    const id = randomUUID();
    sessions.set(id, { type: "internal", createdAt: Date.now(), article, targets: ranked, allTargets });

    res.json({
      id,
      url: article.url,
      host: article.host,
      title: article.title,
      excerpt: article.excerpt,
      wordCount: article.wordCount,
      blockCount: article.blockCount,
      targetCount: allTargets.length,
      pooledCount: ranked.length,
      sampleTargets: ranked.slice(0, 12),
      blocks: article.blocks.map((b) => ({
        i: b.i, tag: b.tag, text: b.text, isSapo: b.isSapo, isConclusion: b.isConclusion,
      })),
      beforeHtml: article.beforeHtml,
      beforeMarkdown: article.beforeMarkdown,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// --- POST /api/optimize : chen internal link ---
app.post("/api/optimize", requireAuth, async (req, res) => {
  try {
    const { id, mode, count, keywords, extraTargets, engine, model, apiKey } = req.body || {};

    const session = sessions.get(id);
    if (!session || session.type !== "internal") {
      return res.status(400).json({ error: "Phien lam viec het han. Hay phan tich lai URL." });
    }
    if (mode !== "auto" && mode !== "keywords") {
      return res.status(400).json({ error: "mode khong hop le (auto | keywords)." });
    }

    const { article } = session;
    let targets = session.targets.slice();
    if (Array.isArray(extraTargets)) {
      for (const t of extraTargets) {
        if (t && t.url) targets.unshift({ url: t.url, title: t.title || t.url });
      }
    }

    const n = Math.max(1, Math.min(20, parseInt(count, 10) || 3));
    const kws = (keywords || [])
      .map((k) => ({ keyword: (k.keyword || "").trim(), url: (k.url || "").trim() }))
      .filter((k) => k.keyword);
    if (mode === "keywords" && !kws.length) {
      return res.status(400).json({ error: "Hay nhap it nhat 1 tu khoa." });
    }
    if (mode === "auto" && !targets.length) {
      return res.status(400).json({
        error: "Khong tim thay URL dich nao. Hay nhap sitemap dung hoac bo sung URL thu cong o Phuong an 2.",
      });
    }

    const params = { article, mode, count: n, keywords: kws, targets, allTargets: session.allTargets };
    const { result, engineUsed } = await runEngine({ engine, key: apiKey, model, params });
    const built = applyAndBuild(article, result);

    res.json({ mode, engine: engineUsed, notes: result.notes || "", usage: result.usage || null, ...built });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ==================== INCOMING LINK ====================

// --- POST /api/incoming/analyze : doc URL dich + goi y bai cung chu de ---
app.post("/api/incoming/analyze", requireAuth, async (req, res) => {
  try {
    const { targetUrl, sitemapUrl } = req.body || {};
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
      return res.status(400).json({ error: "Vui long nhap URL dich hop le (http/https)." });
    }

    const target = await extractArticle(targetUrl);

    let allTargets = [];
    try {
      allTargets = await loadTargets({ sitemapUrl, domain: target.domain });
    } catch {
      allTargets = [];
    }
    // Loai bo chinh URL dich khoi danh sach bai nguon
    allTargets = allTargets.filter((t) => norm(t.url) !== norm(targetUrl));

    // Xep hang theo do lien quan voi noi dung URL dich (pillar / cung chu de)
    const suggestions = rankTargets(
      allTargets,
      `${target.title} ${target.beforeMarkdown}`,
      30,
      true
    );

    gcSessions();
    const id = randomUUID();
    sessions.set(id, {
      type: "incoming",
      createdAt: Date.now(),
      target: { url: target.url, title: target.title, host: target.host },
      allTargets,
    });

    res.json({
      id,
      target: { url: target.url, title: target.title, host: target.host, wordCount: target.wordCount },
      sitemapCount: allTargets.length,
      suggestions: suggestions.map((s) => ({ url: s.url, title: s.title, score: s.score || 0 })),
      // Goi y anchor mac dinh = tieu de bai dich (nguoi dung co the sua)
      defaultAnchorSuggestion: target.title,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// --- POST /api/incoming/insert : chen link tro ve URL dich vao cac bai nguon ---
app.post("/api/incoming/insert", requireAuth, async (req, res) => {
  try {
    const { id, sources, defaultAnchor, engine, model, apiKey } = req.body || {};

    const session = sessions.get(id);
    if (!session || session.type !== "incoming") {
      return res.status(400).json({ error: "Phien lam viec het han. Hay phan tich lai URL dich." });
    }
    if (!Array.isArray(sources) || !sources.length) {
      return res.status(400).json({ error: "Hay chon hoac nhap it nhat 1 bai nguon." });
    }

    const targetUrl = session.target.url;
    const fallbackAnchor = (defaultAnchor || session.target.title || "").trim();

    // Gioi han 10 bai / lan
    const list = sources
      .map((s) => ({ url: (s.url || "").trim(), anchor: (s.anchor || "").trim() }))
      .filter((s) => /^https?:\/\//i.test(s.url))
      .slice(0, 10);
    const truncated = sources.length > list.length;

    const results = [];
    for (const s of list) {
      const anchor = s.anchor || fallbackAnchor;
      if (norm(s.url) === norm(targetUrl)) {
        results.push({ url: s.url, ok: false, error: "Trung voi chinh URL dich." });
        continue;
      }
      if (!anchor) {
        results.push({ url: s.url, ok: false, error: "Thieu anchor text (va khong co anchor mac dinh)." });
        continue;
      }
      try {
        const srcArticle = await extractArticle(s.url);
        const params = {
          article: srcArticle,
          mode: "keywords",
          keywords: [{ keyword: anchor, url: targetUrl }],
          targets: [],
          allTargets: [],
        };
        const { result, engineUsed } = await runEngine({ engine, key: apiKey, model, params });
        const built = applyAndBuild(srcArticle, result);
        results.push({
          url: s.url,
          title: srcArticle.title,
          ok: true,
          anchor,
          engine: engineUsed,
          notes: result.notes || "",
          ...built,
        });
      } catch (e) {
        results.push({ url: s.url, ok: false, error: e.message || String(e) });
      }
    }

    res.json({
      target: session.target,
      processed: results.length,
      truncated,
      results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ==================== ON-PAGE ====================

// Goi AI JSON theo engine (gemini/claude). Tra ve {data, engineUsed}. Throw neu khong dung duoc AI.
async function onpageAI({ engine, key, model, system, user, schema, maxTokens }) {
  const eng = (engine || "local").toLowerCase();
  if (eng === "gemini") {
    const gKey = (key || process.env.GEMINI_API_KEY || "").trim();
    if (!gKey) throw new Error("Chưa có Gemini API key.");
    const gModel = (model || process.env.GEMINI_MODEL || "gemini-3.5-flash").trim();
    const r = await geminiWithFallback(
      (m) => geminiJson({ apiKey: gKey, model: m, system, user, schema, maxTokens }),
      gModel
    );
    return { data: r.result, engineUsed: `Gemini (${r.model})${r.switched ? " — tự chuyển" : ""}` };
  }
  if (eng === "claude") {
    const cKey = (key || process.env.ANTHROPIC_API_KEY || "").trim();
    if (!cKey) throw new Error("Chưa có Anthropic API key.");
    const cModel = (model || process.env.SEOSHARK_MODEL || "claude-sonnet-4-6").trim();
    const data = await claudeJson({ apiKey: cKey, model: cModel, system, user, schema, maxTokens });
    return { data, engineUsed: `Claude (${cModel})` };
  }
  throw new Error("local");
}

// --- POST /api/onpage/audit : audit trang + doi thu + khuyen nghi ---
app.post("/api/onpage/audit", requireAuth, async (req, res) => {
  try {
    const { url, mainKeyword, subKeywords, competitors, engine, model, apiKey } = req.body || {};
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: "Vui lòng nhập URL hợp lệ." });
    }
    if (!mainKeyword || !mainKeyword.trim()) {
      return res.status(400).json({ error: "Vui lòng nhập từ khóa chính." });
    }
    const subs = (Array.isArray(subKeywords) ? subKeywords : String(subKeywords || "").split(","))
      .map((s) => s.trim()).filter(Boolean);

    // 1) Audit trang nguoi dung
    const target = await auditUrl(url);

    // 2) Lay URL doi thu: thu cong (uu tien) hoac tu dong qua CSE
    let compUrls = [];
    let serpMode = "manual";
    const manual = (Array.isArray(competitors) ? competitors : [])
      .map((c) => (c || "").trim()).filter((c) => /^https?:\/\//i.test(c));
    if (manual.length) {
      compUrls = manual.slice(0, 6);
      serpMode = "manual";
    } else if (serpConfigured()) {
      try {
        const serp = await fetchSerp(mainKeyword.trim(), { num: 6, excludeHost: target.host });
        compUrls = serp.map((s) => s.url);
        serpMode = "auto";
      } catch (e) {
        serpMode = "serp-error:" + (e.message || "");
      }
    } else {
      serpMode = "no-serp";
    }

    // 3) Audit doi thu (song song, bo qua loi tung URL)
    const competitorsAudit = (
      await Promise.all(
        compUrls.map((cu) => auditUrl(cu).catch((e) => ({ ok: false, url: cu, error: e.message })))
      )
    );
    const okComps = competitorsAudit.filter((c) => c && c.ok);
    const bench = benchmark(okComps);

    // Mat do tu khoa chinh cho trang muc tieu + tung doi thu
    attachKwStats(target, mainKeyword.trim());
    okComps.forEach((c) => attachKwStats(c, mainKeyword.trim()));

    // 4) Khuyen nghi: AI neu co; nguoc lai co hoc
    let recommendations, summary = "", engineUsed = "Local (cơ học)", contentGap = [];
    try {
      const { data, engineUsed: eu } = await onpageAI({
        engine, key: apiKey, model,
        system: ONPAGE_SYSTEM,
        user: buildRecommendPrompt({ target, competitors: okComps, bench, mainKeyword: mainKeyword.trim(), subKeywords: subs }),
        schema: RECOMMEND_SCHEMA, maxTokens: 4096,
      });
      recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];
      summary = data.summary || "";
      contentGap = Array.isArray(data.contentGap) ? data.contentGap : [];
      engineUsed = eu;
    } catch (e) {
      recommendations = mechanicalRecommendations({ target, bench, mainKeyword: mainKeyword.trim() });
      if (e.message && e.message !== "local") summary = `(AI lỗi: ${e.message} — dùng phân tích cơ học)`;
    }

    gcSessions();
    const id = randomUUID();
    sessions.set(id, {
      type: "onpage", createdAt: Date.now(),
      target, mainKeyword: mainKeyword.trim(), subKeywords: subs, bench,
    });

    res.json({
      id, target, competitors: competitorsAudit, bench,
      recommendations, summary, contentGap, engineUsed, serpMode,
      mainKeyword: mainKeyword.trim(), subKeywords: subs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// --- POST /api/onpage/optimize : viet lai bai chuan SEO (truoc/sau) ---
app.post("/api/onpage/optimize", requireAuth, async (req, res) => {
  try {
    const { id, selected, extra, optimizeMode, engine, model, apiKey } = req.body || {};
    const session = sessions.get(id);
    if (!session || session.type !== "onpage") {
      return res.status(400).json({ error: "Phiên hết hạn. Hãy phân tích On-page lại." });
    }
    const { target, mainKeyword, subKeywords, bench } = session;

    // CHE DO 3: de xuat 3 phuong an cho moi tieu chi da tick
    if (optimizeMode === "suggest") {
      try {
        const { data, engineUsed } = await onpageAI({
          engine, key: apiKey, model,
          system: ONPAGE_SYSTEM,
          user: buildSuggestPrompt({ target, mainKeyword, subKeywords, selected, bench, extra }),
          schema: SUGGEST_SCHEMA, maxTokens: 4096,
        });
        return res.json({ mode: "suggest", suggestions: Array.isArray(data.suggestions) ? data.suggestions : [], engineUsed });
      } catch (e) {
        if (e.message === "local")
          return res.status(400).json({ error: "Chế độ đề xuất cần engine Gemini hoặc Claude. Hãy chọn Gemini ở ⚙️." });
        return res.status(400).json({ error: "AI lỗi: " + e.message });
      }
    }

    let result;
    try {
      const { data, engineUsed } = await onpageAI({
        engine, key: apiKey, model,
        system: ONPAGE_SYSTEM,
        user: buildOptimizePrompt({ target, mainKeyword, subKeywords, selected, bench, extra, optimizeMode }),
        schema: OPTIMIZE_SCHEMA, maxTokens: 8192,
      });
      result = { ...data, engineUsed };
    } catch (e) {
      if (e.message === "local")
        return res.status(400).json({ error: "Bước tối ưu cần engine Gemini hoặc Claude (Local không viết lại được). Hãy chọn Gemini ở ⚙️." });
      return res.status(400).json({ error: "AI lỗi: " + e.message });
    }

    res.json({
      mainKeyword, subKeywords,
      before: { title: target.titleTag, metaDescription: target.metaDescription, markdown: target.contentMarkdown || target.contentText },
      after: { title: result.title, metaDescription: result.metaDescription, markdown: result.optimizedMarkdown, slug: result.slug || "" },
      faq: result.faq || [],
      imageSuggestions: result.imageSuggestions || [],
      internalLinks: result.internalLinks || [],
      schemaJsonLd: result.schemaJsonLd || "",
      changes: result.changes || [],
      notes: result.notes || "",
      engineUsed: result.engineUsed,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ====== SERP: CHECK INDEX + CHECK THU HANG (Serper.dev) ======
// Frontend gui tung "lo" nho (chunk) de co tien trinh + dung duoc khi het luot.
app.post("/api/serp/index", requireAuth, async (req, res) => {
  try {
    const { urls, key, gl, hl } = req.body || {};
    const list = (Array.isArray(urls) ? urls : []).map((u) => String(u || "").trim()).filter(Boolean).slice(0, 20);
    if (!list.length) return res.json({ results: [] });
    const results = [];
    for (const url of list) {
      try {
        const r = await serperIndex({ key, url, gl, hl });
        results.push({ url, indexed: r.indexed, found: r.found });
      } catch (e) {
        if (e.quota) return res.json({ quota: true, error: "Đã hết lượt Serper miễn phí. Đã dừng (không tự chuyển trả phí). Hãy dùng key mới hoặc phương án khác.", results });
        if (e.badKey) return res.status(400).json({ badKey: true, error: "Serper API key sai hoặc thiếu. Kiểm tra lại key (lấy free tại serper.dev)." });
        results.push({ url, error: e.message || String(e) });
      }
    }
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message || "Lỗi server" });
  }
});

app.post("/api/serp/rank", requireAuth, async (req, res) => {
  try {
    const { keywords, domain, key, gl, hl, depth } = req.body || {};
    if (!domain || !String(domain).trim()) return res.status(400).json({ error: "Thiếu domain website (vd: https://nhakhoashark.vn/)." });
    const list = (Array.isArray(keywords) ? keywords : []).map((k) => String(k || "").trim()).filter(Boolean).slice(0, 20);
    if (!list.length) return res.json({ results: [] });
    const num = Math.min(100, Math.max(10, Number(depth) || 10));
    const results = [];
    for (const kw of list) {
      try {
        const r = await serperRank({ key, keyword: kw, domain, gl, hl, num });
        results.push(r);
      } catch (e) {
        if (e.quota) return res.json({ quota: true, error: "Đã hết lượt Serper miễn phí. Đã dừng (không tự chuyển trả phí). Hãy dùng key mới hoặc phương án khác.", results });
        if (e.badKey) return res.status(400).json({ badKey: true, error: "Serper API key sai hoặc thiếu. Kiểm tra lại key (lấy free tại serper.dev)." });
        results.push({ keyword: kw, error: e.message || String(e) });
      }
    }
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message || "Lỗi server" });
  }
});

// ====== SHARE LINK: noi dung (OG + caption RIENG tung nen) + upload anh ======
app.post("/api/share/prepare", requireAuth, async (req, res) => {
  try {
    const { url, keyword, platforms, engine, model, apiKey } = req.body || {};
    if (!url || !String(url).trim()) return res.status(400).json({ error: "Thiếu URL bài viết." });
    const cleanUrl = String(url).trim();
    const plats = (Array.isArray(platforms) ? platforms : []).filter((p) => p && p.id).slice(0, 30);
    const og = await fetchOgMeta(cleanUrl).catch(() => ({ title: "", description: "", image: "" }));

    // Ngon ngu: auto -> dua vao TU KHOA (co dau tieng Viet -> vi, nguoc lai -> en)
    let lang = String(req.body?.lang || "auto").toLowerCase();
    if (lang !== "vi" && lang !== "en") {
      lang = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(keyword || "") ? "vi" : "en";
    }
    const langName = lang === "en" ? "ENGLISH — write 100% in natural, correct English" : "TIẾNG VIỆT — viết 100% bằng tiếng Việt tự nhiên, đúng chính tả";

    let aiItems = []; // [{platform, title, caption}]
    let engineUsed = "Local (cơ học)";
    const eng = (engine || "local").toLowerCase();
    if (plats.length) {
      const sys =
        `NGÔN NGỮ BẮT BUỘC: ${langName}. Toàn bộ TIÊU ĐỀ + NỘI DUNG phải bằng đúng ngôn ngữ này, KHÔNG trộn ngôn ngữ khác — kể cả khi tiêu đề bài gốc là ngôn ngữ khác (hãy dựa vào TỪ KHÓA để xác định ngôn ngữ). ` +
        "Bạn là chuyên gia social media giỏi. Với MỖI nền tảng dưới đây, viết RIÊNG một TIÊU ĐỀ ngắn hấp dẫn + một ĐOẠN NỘI DUNG (2-4 câu) RÕ RÀNG, CHÍNH XÁC, CUỐN HÚT, đúng ngữ pháp, có CTA điều hướng người đọc bấm vào link. KHÔNG spam, KHÔNG nhồi từ khóa; kèm hashtag phù hợp nếu nền đó hợp. " +
        "TUYỆT ĐỐI KHÔNG chèn URL/đường link vào trong caption (link sẽ được thêm riêng ở dạng trần). Mỗi nền PHẢI khác nhau (đa dạng góc tiếp cận). Trả JSON {items:[{platform, title, caption}]} với platform đúng id đã cho.";
      const list = plats.map((p) => `- ${p.id}: ${p.name}${p.style ? " — phong cách: " + p.style : ""}`).join("\n");
      const user =
        `Tiêu đề bài: ${og.title || "(không có)"}\nMô tả: ${og.description || "(không có)"}\nTừ khóa: ${keyword || "(không có)"}\nURL: ${cleanUrl}\n\nDanh sách nền (viết TIÊU ĐỀ + NỘI DUNG riêng, KHÁC NHAU cho TỪNG id):\n${list}`;
      const schema = {
        type: "object",
        properties: { items: { type: "array", items: { type: "object", properties: { platform: { type: "string" }, title: { type: "string" }, caption: { type: "string" } }, required: ["platform", "title", "caption"] } } },
        required: ["items"],
      };
      try {
        if (eng === "gemini") {
          const k = (apiKey || process.env.GEMINI_API_KEY || "").trim();
          if (k) { const d = await geminiJson({ apiKey: k, model: (model || process.env.GEMINI_MODEL || "gemini-3.5-flash").trim(), system: sys, user, schema, maxTokens: 4096 }); aiItems = Array.isArray(d.items) ? d.items : []; engineUsed = "Gemini"; }
        } else if (eng === "claude") {
          const k = (apiKey || process.env.ANTHROPIC_API_KEY || "").trim();
          if (k) { const d = await claudeJson({ apiKey: k, model: (model || process.env.SEOSHARK_MODEL || "claude-sonnet-4-6").trim(), system: sys, user, schema, maxTokens: 4096 }); aiItems = Array.isArray(d.items) ? d.items : []; engineUsed = "Claude"; }
        }
      } catch (e) { /* fallback ben duoi */ }
    }
    // Fallback: dam bao moi nen deu co tieu de + noi dung
    const baseTitle = (lang === "en" && keyword) ? keyword : (og.title || keyword || (lang === "en" ? "Useful article" : "Bài viết hữu ích"));
    const kwTag = (keyword || "").trim() ? " #" + (keyword || "").trim().replace(/\s+/g, "") : "";
    const baseCaption = `${baseTitle}\n${lang === "en" ? "👉 Read the full article below." : "👉 Xem chi tiết trong bài viết bên dưới."}${kwTag}`;
    const map = {};
    aiItems.forEach((c) => { if (c && c.platform) map[c.platform] = { title: (c.title || baseTitle).trim(), caption: (c.caption || baseCaption).trim() }; });
    const out = plats.map((p) => (map[p.id] ? { id: p.id, ...map[p.id] } : { id: p.id, title: baseTitle, caption: baseCaption }));

    res.json({ url: cleanUrl, title: og.title, description: og.description, image: og.image, items: out, base: { title: baseTitle, caption: baseCaption }, engineUsed });
  } catch (e) {
    res.status(500).json({ error: e.message || "Lỗi server" });
  }
});

// Upload anh thumbnail (base64 da nen) -> luu public/uploads -> tra link cong khai
app.post("/api/share/upload", requireAuth, async (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i.exec(String(dataUrl || ""));
    if (!m) return res.status(400).json({ error: "Ảnh không hợp lệ." });
    const ext = m[1].toLowerCase().replace("jpeg", "jpg");
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 6 * 1024 * 1024) return res.status(400).json({ error: "Ảnh quá lớn (>6MB)." });
    const name = `${randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    res.json({ url: `/uploads/${name}` });
  } catch (e) {
    res.status(500).json({ error: e.message || "Lỗi upload" });
  }
});

// ====== AUTO-POST THAT (Telegra.ph khong can login; Telegram qua Bot) ======
app.post("/api/autopost/telegraph", requireAuth, async (req, res) => {
  try {
    const { title, caption, url, image, authorName } = req.body || {};
    if (!url) return res.status(400).json({ error: "Thiếu URL bài viết." });
    const r = await telegraphPublish({ title, caption, url, image, authorName });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi Telegra.ph" }); }
});
app.post("/api/autopost/telegram", requireAuth, async (req, res) => {
  try {
    const { token, chatId, caption, image } = req.body || {};
    if (!token || !chatId) return res.status(400).json({ error: "Thiếu Bot token hoặc Chat ID kênh." });
    const r = await telegramPost({ token, chatId, caption, image });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi Telegram" }); }
});

// ====== BLOG 2.0: sinh bai (AI) + dang tu dong (WordPress/Dev.to/Hashnode) ======
app.post("/api/blog/generate", requireAuth, async (req, res) => {
  try {
    const { items, blogName, engine, model, apiKey, words } = req.body || {};
    const list = (Array.isArray(items) ? items : [])
      .map((it) => ({ keyword: String(it.keyword || "").trim(), url: String(it.url || "").trim() }))
      .filter((it) => it.url).slice(0, 20);
    if (!list.length) return res.status(400).json({ error: "Cần ít nhất 1 cặp từ khóa + URL." });
    const anchors = list.map((it) => ({ url: it.url, anchor: it.keyword && !/^https?:\/\//i.test(it.keyword) ? it.keyword : it.url }));
    const wc = Math.min(2000, Math.max(400, Number(words) || 1000));
    const eng = (engine || "local").toLowerCase();
    const anchorLines = anchors.map((a) => `- [${a.anchor}](${a.url})`).join("\n");
    const sys =
      `Bạn là chuyên gia content SEO tiếng Việt. Viết MỘT bài blog chuẩn SEO khoảng ${wc} từ, văn phong tự nhiên, hữu ích, E-E-A-T, có tiêu đề hấp dẫn; dùng markdown với H2 (##) và H3 (###); đủ mở bài - thân bài - kết bài. ` +
      `BẮT BUỘC chèn TỰ NHIÊN các liên kết sau, MỖI liên kết đúng 1 lần, dạng markdown [anchor](url), đặt anchor trong câu hợp ngữ cảnh (KHÔNG liệt kê thô, KHÔNG nhồi nhét, KHÔNG để ở mục tham khảo). Nếu anchor là một URL thì giữ nguyên URL làm anchor. KHÔNG tự chèn ảnh. Trả JSON {title, markdown}.`;
    const user = `Các liên kết cần chèn:\n${anchorLines}\n\nViết RIÊNG cho blog "${blogName || "blog"}" với góc tiếp cận, bố cục, ví dụ KHÁC BIỆT 100% so với các bản khác.`;
    const schema = { type: "object", properties: { title: { type: "string" }, markdown: { type: "string" } }, required: ["title", "markdown"] };
    let out = null, engineUsed = "";
    try {
      if (eng === "gemini") {
        const k = (apiKey || process.env.GEMINI_API_KEY || "").trim();
        if (k) { out = await geminiJson({ apiKey: k, model: (model || process.env.GEMINI_MODEL || "gemini-3.5-flash").trim(), system: sys, user, schema, maxTokens: 4096 }); engineUsed = "Gemini"; }
      } else if (eng === "claude") {
        const k = (apiKey || process.env.ANTHROPIC_API_KEY || "").trim();
        if (k) { out = await claudeJson({ apiKey: k, model: (model || process.env.SEOSHARK_MODEL || "claude-sonnet-4-6").trim(), system: sys, user, schema, maxTokens: 4096 }); engineUsed = "Claude"; }
      }
    } catch (e) { return res.status(400).json({ error: "AI lỗi: " + (e.message || e) }); }
    if (!out || !out.markdown) return res.status(400).json({ error: "Tính năng này cần engine Gemini hoặc Claude (Local không viết bài được). Hãy chọn Gemini ở ⚙️ và nhập key." });
    const title = String(out.title || anchors[0].anchor || "Bài viết").trim();
    let markdown = String(out.markdown);
    anchors.forEach((a) => { if (!markdown.includes(`(${a.url})`)) markdown += `\n\nXem thêm: [${a.anchor}](${a.url})`; });
    const imageUrl = pollinationsImage(`${title}, nha khoa, minh hoa chuyen nghiep, sach se, hien dai`);
    markdown = insertImage(markdown, imageUrl, title);
    res.json({ title, slug: slugify(title), markdown, html: mdToHtml(markdown), imageUrl, engineUsed });
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi server" }); }
});

app.post("/api/blog/post", requireAuth, async (req, res) => {
  try {
    const { platform, creds, title, slug, markdown, html, imageUrl } = req.body || {};
    const c = creds || {};
    let r;
    if (platform === "wordpress") {
      if (!c.site || !c.user || !c.appPassword) return res.status(400).json({ error: "Thiếu site / user / Application Password." });
      r = await postWordPress({ site: c.site, user: c.user, appPassword: c.appPassword, title, html, slug });
    } else if (platform === "devto") {
      if (!c.apiKey) return res.status(400).json({ error: "Thiếu Dev.to API key." });
      r = await postDevto({ apiKey: c.apiKey, title, markdown, mainImage: imageUrl });
    } else if (platform === "hashnode") {
      if (!c.token || !c.publicationId) return res.status(400).json({ error: "Thiếu Hashnode token / publicationId." });
      r = await postHashnode({ token: c.token, publicationId: c.publicationId, title, markdown });
    } else {
      return res.status(400).json({ error: "Nền này không hỗ trợ tự đăng — hãy copy bài để dán tay." });
    }
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi đăng bài" }); }
});

// ====== SOCIAL AUTO-POST (Diigo / Instapaper / Telegram) — đăng/lưu link trần ======
app.post("/api/social/autopost", requireAuth, async (req, res) => {
  try {
    const { platform, creds, url, title, caption } = req.body || {};
    if (!url) return res.status(400).json({ error: "Thiếu URL." });
    const c = creds || {};
    let r;
    if (platform === "diigo") {
      if (!c.user || !c.password || !c.apiKey) return res.status(400).json({ error: "Thiếu Diigo user / password / API key." });
      r = await diigoSave({ user: c.user, password: c.password, apiKey: c.apiKey, url, title, desc: caption });
    } else if (platform === "instapaper") {
      if (!c.user || !c.password) return res.status(400).json({ error: "Thiếu Instapaper email / password." });
      r = await instapaperSave({ user: c.user, password: c.password, url, title });
    } else if (platform === "telegramauto") {
      if (!c.token || !c.chatId) return res.status(400).json({ error: "Thiếu Telegram bot token / chat id." });
      r = await telegramPost({ token: c.token, chatId: c.chatId, caption: (caption ? caption + "\n" : "") + url, image: "" });
    } else {
      return res.status(400).json({ error: "Nền này không hỗ trợ tự đăng API." });
    }
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi tự đăng" }); }
});

// ====== NGHIEN CUU TU KHOA (free: Google Autocomplete + on-page + AI lam giau) ======
app.post("/api/keywords/research", requireAuth, async (req, res) => {
  try {
    const { mode, input, gl, hl, deep, expand, aiEnrich, engine, model, apiKey, bingKey, wantVolume } = req.body || {};
    const region = { gl: gl || "vn", hl: hl || "vi" };
    let keywords = [];
    if (mode === "domain") {
      if (!input || !String(input).trim()) return res.status(400).json({ error: "Thiếu domain." });
      keywords = await domainSeeds(String(input).trim(), { ...region, expand: !!expand });
    } else {
      const seeds = String(input || "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
      if (!seeds.length) return res.status(400).json({ error: "Nhập ít nhất 1 từ khóa." });
      keywords = await expandSeeds(seeds, { ...region, deep: !!deep });
    }
    keywords = Array.from(new Set(keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean)));
    if (!keywords.length) return res.json({ keywords: [], count: 0, enriched: false });

    let rows = keywords.map((k) => ({ keyword: k }));
    let enriched = false;
    const eng = (engine || "local").toLowerCase();
    if (aiEnrich && (eng === "gemini" || eng === "claude")) {
      const top = keywords.slice(0, 150);
      const sys =
        "Bạn là chuyên gia SEO. Với DANH SÁCH từ khóa dưới đây, với MỖI từ khóa hãy phân loại: " +
        "intent (một trong: Thông tin, Thương mại, Giao dịch, Điều hướng), cluster (tên nhóm chủ đề ngắn gọn), " +
        "difficulty (Thấp/Trung bình/Cao — ước lượng độ cạnh tranh), popularity (Thấp/Trung bình/Cao — ước lượng lượng tìm kiếm tương đối). " +
        "Trả JSON {items:[{keyword, intent, cluster, difficulty, popularity}]} đúng từ khóa đã cho, KHÔNG bịa từ khóa mới.";
      const user = "Danh sách từ khóa:\n" + top.map((k) => "- " + k).join("\n");
      const schema = { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { keyword: { type: "string" }, intent: { type: "string" }, cluster: { type: "string" }, difficulty: { type: "string" }, popularity: { type: "string" } }, required: ["keyword"] } } }, required: ["items"] };
      try {
        let d = null;
        if (eng === "gemini") { const k = (apiKey || process.env.GEMINI_API_KEY || "").trim(); if (k) { const r = await geminiWithFallback((m) => geminiJson({ apiKey: k, model: m, system: sys, user, schema, maxTokens: 8192 }), (model || process.env.GEMINI_MODEL || "gemini-3.5-flash").trim()); d = r.result; } }
        else { const k = (apiKey || process.env.ANTHROPIC_API_KEY || "").trim(); if (k) d = await claudeJson({ apiKey: k, model: (model || process.env.SEOSHARK_MODEL || "claude-sonnet-4-6").trim(), system: sys, user, schema, maxTokens: 8000 }); }
        if (d && Array.isArray(d.items)) {
          const map = {};
          d.items.forEach((it) => { if (it && it.keyword) map[String(it.keyword).trim().toLowerCase()] = it; });
          rows = keywords.map((k) => { const m = map[k] || {}; return { keyword: k, intent: m.intent || "", cluster: m.cluster || "", difficulty: m.difficulty || "", popularity: m.popularity || "" }; });
          enriched = true;
        }
      } catch (e) { /* giu danh sach khong lam giau */ }
    }

    // Volume tim kiem: Google Trends (0-100, khong key) + Bing (so that, neu co key).
    let trendUsed = false, bingUsed = false;
    if (wantVolume !== false) {
      const kwList = rows.map((r) => r.keyword);
      const bKey = (bingKey || process.env.BING_API_KEY || "").trim();
      const [trendMap, bingMap] = await Promise.all([
        googleTrends(kwList, { ...region, cap: 30 }).catch(() => new Map()),
        bKey ? bingVolume(kwList, { key: bKey, ...region, cap: 120 }).catch(() => new Map()) : Promise.resolve(new Map()),
      ]);
      trendUsed = trendMap.size > 0;
      bingUsed = bingMap.size > 0;
      rows.forEach((r) => {
        const t = trendMap.get(r.keyword);
        const v = bingMap.get(r.keyword);
        r.trend = Number.isFinite(t) ? t : null;
        r.volume = Number.isFinite(v) ? v : null;
      });
    }
    res.json({ keywords: rows, count: rows.length, enriched, trendUsed, bingUsed });
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi server" }); }
});

// ===================== PILLAR TOPIC =====================
const _norm = (s) => String(s || "").toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();

// Loc trung NGU NGHIA (khong chi trung y nguyen chu): tach "tu noi dung" (bo stopword/tu hoi) roi
// do do trung lap Jaccard. Vi du "lam rang su bi hoi mieng" ~ "rang su co gay hoi mieng khong".
// LUU Y: kiem tra stopword tren tu CO DAU (de "den"=stopword "den"/"den" KHONG nuot "den"=mau den).
const _VI_STOP = new Set([
  "bị", "có", "không", "được", "gây", "làm", "là", "tại", "sao", "như", "thế", "nào", "bao", "nhiêu",
  "khi", "và", "của", "cho", "với", "ở", "trong", "ra", "vào", "đi", "thì", "mà", "hay", "hoặc",
  "các", "những", "một", "cái", "về", "do", "vì", "nên", "cần", "muốn", "gì", "ai", "đâu", "mỗi",
  "này", "kia", "ấy", "bởi", "từ", "đến", "theo", "hơn", "rất", "quá", "cũng", "vẫn", "sẽ", "đang",
  "loại", "kiểu", "dùng", "khi", "nếu", "để", "bằng", "sau", "trước", "khác",
  "the", "is", "are", "do", "does", "how", "what", "why", "when", "which", "to", "of", "for", "a", "an",
  "and", "or", "in", "on", "with", "your", "you", "my", "vs", "can", "should",
]);
const _stripDia = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d");
function _contentTokens(kw) {
  const low = String(kw || "").toLowerCase().normalize("NFC");
  const out = new Set();
  for (const t of low.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean)) {
    if (_VI_STOP.has(t)) continue;            // bo stopword (tren tu CO DAU)
    const bare = _stripDia(t);                // so sanh o dang khong dau (miệng ~ mieng)
    if (bare.length > 1) out.add(bare);
  }
  return out;
}
// true neu 2 tu qua giong nhau ve noi dung (Jaccard inter/union >= nguong)
function _tooSimilar(aSet, bSet, thr = 0.58) {
  if (!aSet.size || !bSet.size) return false;
  let inter = 0;
  for (const t of aSet) if (bSet.has(t)) inter++;
  return inter / (aSet.size + bSet.size - inter) >= thr;
}
// Goi AI JSON (Gemini co fallback model / Claude); nem loi that neu that bai
async function aiJson(eng, { system, user, schema, maxTokens, model, apiKey }) {
  if (eng === "gemini") {
    const k = (apiKey || process.env.GEMINI_API_KEY || "").trim();
    if (!k) throw new Error("Chưa có Gemini API key (nhập ở ⚙️ hoặc đặt GEMINI_API_KEY trên server).");
    const r = await geminiWithFallback((m) => geminiJson({ apiKey: k, model: m, system, user, schema, maxTokens }), (model || process.env.GEMINI_MODEL || "gemini-3.5-flash").trim());
    return r.result;
  }
  const k = (apiKey || process.env.ANTHROPIC_API_KEY || "").trim();
  if (!k) throw new Error("Chưa có Claude API key (nhập ở ⚙️ hoặc đặt ANTHROPIC_API_KEY trên server).");
  return await claudeJson({ apiKey: k, model: (model || process.env.SEOSHARK_MODEL || "claude-sonnet-4-6").trim(), system, user, schema, maxTokens });
}

// Buoc 1: phan nhom 1 LO tu khoa theo topic (client chia lo, truyen knownTopics de nhat quan; dich VI neu can)
app.post("/api/keywords/pillar/classify", requireAuth, async (req, res) => {
  try {
    const { keywords, knownTopics, needTranslate, engine, model, apiKey } = req.body || {};
    const raw = (Array.isArray(keywords) ? keywords : [])
      .map((k) => (typeof k === "string" ? { keyword: k.trim(), topic: "" } : { keyword: String(k.keyword || "").trim(), topic: String(k.topic || "").trim() }))
      .filter((k) => k.keyword)
      .slice(0, 300); // an toan moi lo (client gui ~120)
    if (!raw.length) return res.status(400).json({ error: "Chưa có từ khóa nào." });
    const known = (Array.isArray(knownTopics) ? knownTopics : []).map((t) => String(t || "").trim()).filter(Boolean).slice(0, 200);
    const tr = !!needTranslate;

    // Khong can AI: da co topic het VA khong can dich
    if (raw.every((k) => k.topic) && !tr) {
      return res.json({ items: raw.map((k) => ({ keyword: k.keyword, topic: k.topic, vi: "" })), aiUsed: false });
    }
    const eng = (engine || "local").toLowerCase();
    if (eng !== "gemini" && eng !== "claude") return res.status(400).json({ error: "Cần bật engine Gemini/Claude để AI phân nhóm topic (hoặc tự nhập cột topic cho mọi từ khóa)." });
    const { system, user, schema } = buildPillarClassifyPrompt(raw, { knownTopics: known, needTranslate: tr });
    const d = await aiJson(eng, { system, user, schema, maxTokens: 16384, model, apiKey });
    const map = {};
    (d.items || []).forEach((it) => { if (it && it.keyword) map[_norm(it.keyword)] = { topic: String(it.topic || "").trim(), vi: String(it.vi || "").trim() }; });
    const items = raw.map((k) => {
      const m = map[_norm(k.keyword)] || {};
      return { keyword: k.keyword, topic: k.topic || m.topic || "Khác", vi: tr ? (m.vi || "") : "" };
    });
    res.json({ items, aiUsed: true });
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi server" }); }
});

// Buoc 3: goi y >=20 tu khoa MOI cho 1 LO topic (client chia lo topic), khong trung ngu nghia, co volume + dich VI
app.post("/api/keywords/pillar/suggest", requireAuth, async (req, res) => {
  try {
    const { topics, allHave, gl, hl, engine, model, apiKey, bingKey, minPerTopic, needTranslate } = req.body || {};
    const region = { gl: gl || "vn", hl: hl || "vi" };
    const eng = (engine || "local").toLowerCase();
    if (eng !== "gemini" && eng !== "claude") return res.status(400).json({ error: "Cần bật engine Gemini/Claude để gợi ý từ khóa bổ sung." });
    const inTopics = (Array.isArray(topics) ? topics : [])
      .map((t) => ({ topic: String(t.topic || "").trim(), have: (Array.isArray(t.have) ? t.have : []).map((k) => String(k || "").trim()).filter(Boolean) }))
      .filter((t) => t.topic).slice(0, 6); // toi da 6 topic/lo
    if (!inTopics.length) return res.status(400).json({ error: "Chưa có topic để gợi ý." });
    const min = Math.max(10, Math.min(40, Number(minPerTopic) || 20));
    const tr = !!needTranslate;

    // Ung vien tu Google Autocomplete cho tung topic (loai trung voi tu da co)
    const topicsInput = [];
    for (const t of inTopics) {
      let candidates = [];
      try { candidates = await expandSeeds([t.topic, ...t.have.slice(0, 3)], { ...region, deep: false }); } catch {}
      const haveSet = new Set(t.have.map(_norm));
      candidates = candidates.filter((c) => !haveSet.has(_norm(c))).slice(0, 60);
      topicsInput.push({ topic: t.topic, have: t.have, candidates });
    }

    const { system, user, schema } = buildPillarSuggestPrompt(topicsInput, { minPerTopic: min, needTranslate: tr });
    const d = await aiJson(eng, { system, user, schema, maxTokens: 16384, model, apiKey });

    // Loai trung voi TOAN BO tu khoa nguoi dung (allHave) + trong noi bo
    const haveGlobal = new Set((Array.isArray(allHave) ? allHave : []).map(_norm));
    inTopics.forEach((t) => t.have.forEach((k) => haveGlobal.add(_norm(k))));
    // Tap "tu noi dung" cua moi tu da co -> loc trung NGU NGHIA (khong chi trung nguyen chu)
    const haveTokenSets = [...haveGlobal].map(_contentTokens).filter((s) => s.size);
    const usedSug = new Set();
    const usedSugSets = []; // token-set cac goi y da nhan -> chong trung y giua cac goi y
    const out = [];
    (d.topics || []).forEach((t) => {
      const topic = String(t.topic || "").trim();
      if (!topic) return;
      const kws = [];
      (t.keywords || []).forEach((kw) => {
        const clean = String(kw && kw.keyword != null ? kw.keyword : kw).trim();
        const vi = String((kw && kw.vi) || "").trim();
        const key = _norm(clean);
        if (!clean || haveGlobal.has(key) || usedSug.has(key)) return;
        const tok = _contentTokens(clean);
        // Bo neu giong ngu nghia voi 1 tu NGUOI DUNG DA CO, hoac voi 1 goi y da nhan
        if (haveTokenSets.some((h) => _tooSimilar(tok, h)) || usedSugSets.some((s) => _tooSimilar(tok, s))) return;
        usedSug.add(key);
        usedSugSets.push(tok);
        kws.push({ keyword: clean, vi });
      });
      if (kws.length) out.push({ topic, keywords: kws });
    });

    const allKw = out.flatMap((t) => t.keywords.map((k) => k.keyword));
    const bKey = (bingKey || process.env.BING_API_KEY || "").trim();
    const [trendMap, bingMap] = await Promise.all([
      googleTrends(allKw, { ...region, cap: 40 }).catch(() => new Map()),
      bKey ? bingVolume(allKw, { key: bKey, ...region, cap: 200 }).catch(() => new Map()) : Promise.resolve(new Map()),
    ]);
    const suggestions = out.map((t) => ({
      topic: t.topic,
      keywords: t.keywords.map((k) => {
        const lk = k.keyword.toLowerCase();
        const trd = trendMap.get(lk); const vo = bingMap.get(lk);
        return { keyword: k.keyword, vi: k.vi, trend: Number.isFinite(trd) ? trd : null, volume: Number.isFinite(vo) ? vo : null };
      }),
    }));
    res.json({ topics: suggestions, count: allKw.length, trendUsed: trendMap.size > 0, bingUsed: bingMap.size > 0 });
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi server" }); }
});

// ===================== XAY DUNG PILLAR CONTENT (tab Internal Link) =====================
// Buoc 1: phan loai Chuyen doi/Tin tuc + gom Topic (theo lo, per-chuyen-muc; dich VI neu can)
app.post("/api/internal/pillar/classify", requireAuth, async (req, res) => {
  try {
    const { rows, knownTopics, needTranslate, engine, model, apiKey } = req.body || {};
    const list = (Array.isArray(rows) ? rows : [])
      .map((r) => ({ keyword: String(r.keyword || "").trim(), url: String(r.url || "").trim(), category: String(r.category || "").trim(), conv: !!r.conv }))
      .filter((r) => r.keyword).slice(0, 300);
    if (!list.length) return res.status(400).json({ error: "Chưa có từ khóa nào." });
    const eng = (engine || "local").toLowerCase();
    if (eng !== "gemini" && eng !== "claude") return res.status(400).json({ error: "Cần bật engine Gemini/Claude để phân loại & gom topic." });
    const known = (Array.isArray(knownTopics) ? knownTopics : []).map((t) => String(t || "").trim()).filter(Boolean).slice(0, 200);
    const tr = !!needTranslate;
    const { system, user, schema } = buildPcClassifyPrompt(list, { knownTopics: known, needTranslate: tr });
    const d = await aiJson(eng, { system, user, schema, maxTokens: 16384, model, apiKey });
    const map = {};
    (d.items || []).forEach((it) => { if (it && it.keyword) map[_norm(it.keyword)] = it; });
    const items = list.map((r) => {
      const m = map[_norm(r.keyword)] || {};
      let phanLoai = String(m.phanLoai || "").trim();
      if (r.conv) phanLoai = "Chuyển đổi";
      if (phanLoai !== "Chuyển đổi" && phanLoai !== "Tin tức") phanLoai = r.conv ? "Chuyển đổi" : "Tin tức";
      return { keyword: r.keyword, url: r.url, category: r.category, phanLoai, topic: String(m.topic || "Khác").trim(), ghiChu: String(m.ghiChu || "").trim(), vi: tr ? String(m.vi || "").trim() : "" };
    });
    res.json({ items });
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi server" }); }
});

// Buoc 2: phan bac 1-5 + cay cha-con cho 1 chuyen muc
app.post("/api/internal/pillar/tier", requireAuth, async (req, res) => {
  try {
    const { rows, category, engine, model, apiKey } = req.body || {};
    const list = (Array.isArray(rows) ? rows : [])
      .map((r) => ({ keyword: String(r.keyword || "").trim(), url: String(r.url || "").trim(), category: String(r.category || "").trim(), phanLoai: String(r.phanLoai || "").trim(), topic: String(r.topic || "").trim(), conv: !!r.conv }))
      .filter((r) => r.keyword).slice(0, 200);
    if (!list.length) return res.status(400).json({ error: "Chưa có từ khóa." });
    const eng = (engine || "local").toLowerCase();
    if (eng !== "gemini" && eng !== "claude") return res.status(400).json({ error: "Cần bật engine Gemini/Claude để phân bậc." });
    const { system, user, schema } = buildPcTierPrompt(list, { category: String(category || "").trim() });
    const d = await aiJson(eng, { system, user, schema, maxTokens: 16384, model, apiKey });
    const roleName = { 1: "Dịch vụ", 2: "Chuyển đổi", 3: "SEO", 4: "Tin tức", 5: "Bổ trợ" };
    const map = {};
    (d.items || []).forEach((it) => { if (it && it.keyword) map[_norm(it.keyword)] = it; });
    const haveKw = new Set(list.map((r) => _norm(r.keyword)));
    const items = list.map((r) => {
      const m = map[_norm(r.keyword)] || {};
      let tier = Number(m.tier); if (!(tier >= 1 && tier <= 5)) tier = r.phanLoai === "Chuyển đổi" ? 2 : 4;
      let cha = String(m.tuKhoaCha || "").trim();
      if (cha && !haveKw.has(_norm(cha))) cha = ""; // cha phai co trong danh sach
      return { keyword: r.keyword, tier, vaiTro: String(m.vaiTro || roleName[tier] || "").trim() || roleName[tier], nhomThuocTinh: String(m.nhomThuocTinh || "").trim(), tuKhoaCha: cha };
    });
    res.json({ items });
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi server" }); }
});

// ===================== KHO KIEN THUC WEBSITE (rieng theo tai khoan) =====================
app.get("/api/knowledge/list", requireAuth, async (req, res) => {
  try {
    const owner = (req.user?.email || "guest").toLowerCase();
    const items = await store.listKnowledge(owner);
    res.json({ items });
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi server" }); }
});

app.post("/api/knowledge/save", requireAuth, async (req, res) => {
  try {
    const owner = (req.user?.email || "guest").toLowerCase();
    const { id, website, title, content } = req.body || {};
    const text = String(content || "").trim();
    if (!text) return res.status(400).json({ error: "Nội dung kiến thức đang trống." });
    const rec = {
      id: id && String(id).trim() ? String(id).trim() : randomUUID(),
      owner,
      website: String(website || "").trim(),
      title: String(title || "").trim() || (String(website || "").trim() || "Kiến thức website"),
      content: text.slice(0, 200000),
    };
    await store.putKnowledge(rec);
    res.json({ ok: true, id: rec.id });
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi server" }); }
});

app.post("/api/knowledge/delete", requireAuth, async (req, res) => {
  try {
    const owner = (req.user?.email || "guest").toLowerCase();
    const { id } = req.body || {};
    const ok = await store.deleteKnowledge(String(id || "").trim(), owner);
    res.json({ ok });
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi server" }); }
});

// ===== Bo tu khoa da luu (Pillar Topic) - de nghien cuu tiep, khong can upload lai =====
const _cleanKwRows = (arr) => (Array.isArray(arr) ? arr : [])
  .map((k) => (typeof k === "string" ? { keyword: k } : (k || {})))
  .map((k) => ({
    keyword: String(k.keyword || "").trim(), topic: String(k.topic || "").trim(),
    vi: String(k.vi || "").trim(), url: String(k.url || "").trim(), category: String(k.category || "").trim(),
  }))
  .filter((k) => k.keyword);

app.get("/api/keywords/sets", requireAuth, async (req, res) => {
  try {
    const owner = (req.user?.email || "guest").toLowerCase();
    const sets = await store.listKeywordSets(owner);
    res.json({ sets: sets.map((s) => ({ id: s.id, name: s.name, count: (s.keywords || []).length, updatedAt: s.updatedAt, keywords: s.keywords || [] })) });
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi server" }); }
});

app.post("/api/keywords/sets/save", requireAuth, async (req, res) => {
  try {
    const owner = (req.user?.email || "guest").toLowerCase();
    const { id, name, keywords, append } = req.body || {};
    const clean = _cleanKwRows(keywords);
    if (!clean.length && !append) return res.status(400).json({ error: "Chưa có từ khóa nào để lưu." });
    let setId = id && String(id).trim() ? String(id).trim() : "";
    let merged = clean, keepName = "";
    if (append && setId) {
      const ex = await store.getKeywordSet(setId, owner);
      if (ex) {
        keepName = ex.name || "";
        const seen = new Set((ex.keywords || []).map((k) => _norm(k.keyword)));
        const add = clean.filter((k) => !seen.has(_norm(k.keyword)));
        merged = (ex.keywords || []).concat(add);
      }
    }
    if (!setId) setId = randomUUID();
    const finalName = String(name || "").trim() || keepName || ("Bộ từ khóa " + new Date().toISOString().slice(0, 10));
    await store.putKeywordSet({ id: setId, owner, name: finalName, keywords: merged.slice(0, 20000) });
    res.json({ ok: true, id: setId, name: finalName, count: merged.length });
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi server" }); }
});

app.post("/api/keywords/sets/delete", requireAuth, async (req, res) => {
  try {
    const owner = (req.user?.email || "guest").toLowerCase();
    const ok = await store.deleteKeywordSet(String((req.body || {}).id || "").trim(), owner);
    res.json({ ok });
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi server" }); }
});

// ===================== GOOGLE SEARCH CONSOLE (engine so lieu that) =====================
// State chong CSRF cho luong OAuth (nonce -> {owner, ts}), song ngan (10 phut)
const _gscStates = new Map();
function _gscNewState(owner) {
  const s = randomUUID();
  _gscStates.set(s, { owner, ts: Date.now() });
  // don state cu
  for (const [k, v] of _gscStates) if (Date.now() - v.ts > 10 * 60 * 1000) _gscStates.delete(k);
  return s;
}
// Lay access_token tu refresh_token da luu (nem loi neu chua ket noi)
async function _gscAccess(owner) {
  const tok = await store.getGscToken(owner);
  if (!tok || !tok.refreshToken) throw new Error("Chưa kết nối Google Search Console.");
  const at = await gscAccessToken(tok.refreshToken);
  return { accessToken: at, siteUrl: tok.siteUrl || "" };
}

app.get("/api/gsc/status", requireAuth, async (req, res) => {
  try {
    const owner = (req.user?.email || "guest").toLowerCase();
    const tok = await store.getGscToken(owner);
    res.json({ configured: gscConfigured(), connected: !!(tok && tok.refreshToken), siteUrl: (tok && tok.siteUrl) || "" });
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi server" }); }
});

app.get("/api/gsc/connect", requireAuth, (req, res) => {
  try {
    if (!gscConfigured()) return res.status(400).send("Chưa cấu hình OAuth (thiếu GOOGLE_OAUTH_CLIENT_ID/SECRET).");
    const owner = (req.user?.email || "guest").toLowerCase();
    const state = _gscNewState(owner);
    res.redirect(gscAuthUrl(req, state));
  } catch (e) { res.status(500).send("Lỗi: " + (e.message || "server")); }
});

app.get("/api/gsc/callback", requireAuth, async (req, res) => {
  try {
    const { code, state, error } = req.query || {};
    if (error) return res.redirect("/?gsc=denied");
    const st = state && _gscStates.get(String(state));
    if (!st) return res.redirect("/?gsc=badstate");
    _gscStates.delete(String(state));
    const owner = (req.user?.email || "guest").toLowerCase();
    const tokens = await gscExchangeCode(req, String(code || ""));
    if (!tokens.refresh_token) {
      // Google chi tra refresh_token lan dau dong y; neu thieu -> van coi la ket noi neu da co truoc do
      const prev = await store.getGscToken(owner);
      if (!prev || !prev.refreshToken) return res.redirect("/?gsc=norefresh");
    } else {
      await store.putGscToken({ owner, refreshToken: tokens.refresh_token, siteUrl: "" });
    }
    res.redirect("/?gsc=connected");
  } catch (e) {
    res.redirect("/?gsc=error&msg=" + encodeURIComponent(e.message || "server"));
  }
});

app.get("/api/gsc/sites", requireAuth, async (req, res) => {
  try {
    const owner = (req.user?.email || "guest").toLowerCase();
    const { accessToken, siteUrl } = await _gscAccess(owner);
    const sites = await gscListSites(accessToken);
    res.json({ sites, siteUrl });
  } catch (e) { res.status(400).json({ error: e.message || "Lỗi GSC" }); }
});

app.post("/api/gsc/site", requireAuth, async (req, res) => {
  try {
    const owner = (req.user?.email || "guest").toLowerCase();
    const siteUrl = String((req.body || {}).siteUrl || "").trim();
    await store.putGscToken({ owner, refreshToken: "", siteUrl });
    res.json({ ok: true, siteUrl });
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi server" }); }
});

app.post("/api/gsc/disconnect", requireAuth, async (req, res) => {
  try {
    const owner = (req.user?.email || "guest").toLowerCase();
    await store.deleteGscToken(owner);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi server" }); }
});

// So lieu thuc te cho 1 URL: tong (clicks/impressions/ctr/vi tri) + top truy van
app.post("/api/gsc/metrics", requireAuth, async (req, res) => {
  try {
    const owner = (req.user?.email || "guest").toLowerCase();
    const url = String((req.body || {}).url || "").trim();
    const days = Number((req.body || {}).days) || 28;
    const { accessToken, siteUrl: savedSite } = await _gscAccess(owner);
    let siteUrl = savedSite;
    if (!siteUrl) {
      const sites = await gscListSites(accessToken);
      siteUrl = gscPickSiteForUrl(sites, url);
      if (siteUrl) await store.putGscToken({ owner, refreshToken: "", siteUrl });
    }
    if (!siteUrl) return res.status(400).json({ error: "Chưa chọn site GSC. Vào ⚙️ chọn property." });
    const [totalRows, queryRows] = await Promise.all([
      gscQuery(accessToken, siteUrl, { url, days, dimensions: [], rowLimit: 1 }),
      gscQuery(accessToken, siteUrl, { url, days, dimensions: ["query"], rowLimit: 25 }),
    ]);
    const totals = gscTotals(totalRows);
    const queries = queryRows.map((r) => ({
      query: (r.keys || [])[0] || "", clicks: r.clicks || 0, impressions: r.impressions || 0,
      ctr: r.ctr != null ? r.ctr : null, position: r.position != null ? r.position : null,
    }));
    res.json({ siteUrl, days, totals, queries });
  } catch (e) { res.status(400).json({ error: e.message || "Lỗi GSC" }); }
});

// ===================== LEN OUTLINE CHUAN SEO =====================
// Buoc 1: lay + boc tach outline cua doi thu (auto SERP hoac dan URL thu cong)
app.post("/api/outline/competitors", requireAuth, async (req, res) => {
  try {
    const { keyword, gl, hl, serperKey, urls } = req.body || {};
    const region = { gl: gl || "vn", hl: hl || "vi" };
    let competitors = [], source = "manual", cap = 6;
    // Dan tay: cho 1-10 URL. Tu dong: chi 1-6 (top SERP).
    const manual = (Array.isArray(urls) ? urls : []).map((u) => String(u || "").trim()).filter(Boolean).slice(0, 10);
    if (manual.length) {
      cap = 10;
      competitors = manual.map((u, i) => ({ url: u, title: u, position: i + 1 }));
    } else {
      const r = await fetchCompetitors(keyword, { ...region, num: 6, serperKey });
      source = r.source; competitors = r.competitors;
    }
    // Boc tach heading tung doi thu (chi noi dung chinh)
    const outlines = await extractManyHeadings(competitors.map((c) => c.url), cap);
    const merged = outlines.map((o, i) => ({
      ...competitors[i],
      ...o,
      headingCount: (o.headings || []).length,
    }));
    res.json({ source, competitors: merged });
  } catch (e) { res.status(400).json({ error: e.message || "Lỗi lấy đối thủ" }); }
});

// Buoc 2: tong hop outline cuoi cung (Local gop co hoc / AI Gemini-Claude)
app.post("/api/outline/generate", requireAuth, async (req, res) => {
  try {
    const { mainKw, subKws, refOutline, knowledge, websiteName, competitors, engine, model, apiKey } = req.body || {};
    const main = String(mainKw || "").trim();
    if (!main) return res.status(400).json({ error: "Thiếu từ khóa chính." });
    const subs = (Array.isArray(subKws) ? subKws : String(subKws || "").split(/[,\n]/)).map((s) => String(s || "").trim()).filter(Boolean);
    const comp = (Array.isArray(competitors) ? competitors : []).filter((c) => c && Array.isArray(c.headings) && c.headings.length);
    if (!comp.length) return res.status(400).json({ error: "Chưa có outline đối thủ nào (hãy phân tích đối thủ trước)." });

    const clampLevel = (l) => (l === 3 ? 3 : l === 4 ? 4 : 2);
    let outline = [], engineUsed = "Local", aiError = "", title = "", metaDescription = "";
    const eng = (engine || "local").toLowerCase();

    if (eng === "gemini" || eng === "claude") {
      const { system, user, schema } = buildOutlinePrompt({ mainKw: main, subKws: subs, refOutline, knowledge, websiteName, competitorOutlines: comp });
      try {
        let d = null, usedModel = "";
        if (eng === "gemini") {
          const k = (apiKey || process.env.GEMINI_API_KEY || "").trim();
          if (!k) throw new Error("Chưa có Gemini API key (nhập ở ⚙️ hoặc đặt GEMINI_API_KEY trên server).");
          const gModel = (model || process.env.GEMINI_MODEL || "gemini-3.5-flash").trim();
          const r = await geminiWithFallback((m) => geminiJson({ apiKey: k, model: m, system, user, schema, maxTokens: 8192 }), gModel);
          d = r.result; usedModel = `Gemini (${r.model})${r.switched ? " — tự chuyển model" : ""}`;
        } else {
          const k = (apiKey || process.env.ANTHROPIC_API_KEY || "").trim();
          if (!k) throw new Error("Chưa có Claude API key (nhập ở ⚙️ hoặc đặt ANTHROPIC_API_KEY trên server).");
          d = await claudeJson({ apiKey: k, model: (model || process.env.SEOSHARK_MODEL || "claude-sonnet-4-6").trim(), system, user, schema, maxTokens: 8000 });
          usedModel = "Claude";
        }
        if (d && Array.isArray(d.outline)) {
          outline = d.outline
            .filter((it) => it && it.text && String(it.text).trim())
            .map((it) => {
              const text = String(it.text).trim();
              return { level: clampLevel(Number(it.level)), text, ...markKeywords(text, main, subs) };
            });
        }
        if (outline.length) {
          engineUsed = usedModel;
          title = String(d.title || "").trim();
          metaDescription = String(d.metaDescription || "").trim();
        } else aiError = "AI trả về kết quả rỗng.";
      } catch (e) {
        aiError = e.message || String(e); // GIU lai loi that de bao cho nguoi dung
      }
    }

    // Fallback / Local: gop co hoc outline doi thu
    if (!outline.length) {
      outline = mergeOutlinesLocal(comp, { mainKw: main, subKws: subs });
      engineUsed = (eng === "gemini" || eng === "claude") ? "Local (AI lỗi)" : "Local";
    }

    // Chuan hoa cau truc (level 2-4; cha co 0 hoac >=2 con -> con don le nang len cung cap) + danh dau tu khoa
    outline = normalizeOutline(outline).map((it) => ({ ...it, ...markKeywords(it.text, main, subs) }));

    // Title/Meta co ban khi AI khong chay (de field khong rong) — AI cho chat luong tot hon nhieu
    if (!title) {
      const cap = main.charAt(0).toUpperCase() + main.slice(1);
      title = `${cap}: chi tiết A-Z ${new Date().getFullYear()}`.slice(0, 60);
    }
    if (!metaDescription) {
      metaDescription = `Tìm hiểu ${main}${subs.length ? ", " + subs.slice(0, 2).join(", ") : ""}. Thông tin đầy đủ, dễ hiểu giúp bạn quyết định đúng. Xem ngay!`.slice(0, 160);
    }

    res.json({ outline, engineUsed, count: outline.length, aiError, title, metaDescription });
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi server" }); }
});

// Goi y noi dung UNIQUE (non-commodity) tu tai lieu kien thuc -> them vao heading phu hop (BAT BUOC AI)
app.post("/api/outline/unique", requireAuth, async (req, res) => {
  try {
    const { mainKw, subKws, websiteName, knowledge, outline, engine, model, apiKey } = req.body || {};
    const main = String(mainKw || "").trim();
    const know = String(knowledge || "").trim();
    const list = (Array.isArray(outline) ? outline : []).filter((it) => it && it.text);
    if (!main) return res.status(400).json({ error: "Thiếu từ khóa chính." });
    if (!know) return res.status(400).json({ error: "Hãy chọn một tài liệu kiến thức website (có nội dung) trước." });
    if (!list.length) return res.status(400).json({ error: "Chưa có outline để gợi ý." });

    const eng = (engine || "local").toLowerCase();
    if (eng !== "gemini" && eng !== "claude") {
      return res.status(400).json({ error: "Gợi ý nội dung unique cần engine Gemini hoặc Claude (bật ở ⚙️)." });
    }
    const subs = (Array.isArray(subKws) ? subKws : String(subKws || "").split(/[,\n]/)).map((s) => String(s || "").trim()).filter(Boolean);
    const { system, user, schema } = buildUniquePrompt({ mainKw: main, subKws: subs, websiteName, knowledge: know, outline: list });

    let d = null;
    if (eng === "gemini") {
      const k = (apiKey || process.env.GEMINI_API_KEY || "").trim();
      if (!k) return res.status(400).json({ error: "Thiếu Gemini API key (nhập ở ⚙️)." });
      const gModel = (model || process.env.GEMINI_MODEL || "gemini-3.5-flash").trim();
      const r = await geminiWithFallback((m) => geminiJson({ apiKey: k, model: m, system, user, schema, maxTokens: 6000 }), gModel);
      d = r.result;
    } else {
      const k = (apiKey || process.env.ANTHROPIC_API_KEY || "").trim();
      if (!k) return res.status(400).json({ error: "Thiếu Claude API key (nhập ở ⚙️)." });
      d = await claudeJson({ apiKey: k, model: (model || process.env.SEOSHARK_MODEL || "claude-sonnet-4-6").trim(), system, user, schema, maxTokens: 6000 });
    }
    const suggestions = (d && Array.isArray(d.suggestions) ? d.suggestions : [])
      .filter((s) => s && s.heading && (s.what || s.how))
      .map((s) => ({ heading: String(s.heading).trim(), what: String(s.what || "").trim(), how: String(s.how || "").trim() }));
    res.json({ suggestions, count: suggestions.length });
  } catch (e) { res.status(500).json({ error: e.message || "Lỗi server" }); }
});

const PORT = process.env.PORT || 5173;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  SeoShark dang chay tai: http://localhost:${PORT}\n`);
});

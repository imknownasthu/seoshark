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
import {
  ONPAGE_SYSTEM, RECOMMEND_SCHEMA, OPTIMIZE_SCHEMA, SUGGEST_SCHEMA,
  buildRecommendPrompt, buildOptimizePrompt, buildSuggestPrompt, mechanicalRecommendations,
} from "./src/onpage-prompt.js";
import * as auth from "./src/auth.js";
import { sendVerifyEmail, sendOwnerNotify, mailMode } from "./src/mailer.js";

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
    // Gui ma toi chinh nguoi dang ky; thong bao cho owner (best-effort)
    const r = await sendVerifyEmail({ toEmail: em, name, code });
    sendOwnerNotify({ ownerEmail: OWNER_EMAIL, requesterEmail: em, name }).catch(() => {});
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
    const { email: em, code } = auth.regenerateCode(email);
    const r = await sendVerifyEmail({ toEmail: em, name, code });
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
const RECOVERABLE = /quota|exceeded|limit: 0|RESOURCE_EXHAUSTED|429|not found|404|NOT_FOUND|not supported|unavailable|is not found|does not exist|overload|high demand|experiencing high|try again later|temporar|\b503\b|\b500\b|INTERNAL/i;

// Goi callFn(model) lan luot voi model chon -> cac Flash free, tra ve { result, model }
async function geminiWithFallback(callFn, chosenModel) {
  const chain = [chosenModel, ...FREE_FLASH].filter(Boolean);
  const tried = new Set();
  let lastErr;
  for (const m of chain) {
    if (tried.has(m)) continue;
    tried.add(m);
    try {
      const result = await callFn(m);
      return { result, model: m, switched: m !== chosenModel };
    } catch (e) {
      lastErr = e;
      if (!RECOVERABLE.test(e.message || "")) throw e; // loi khac (vd sai key) -> nem ngay
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
        if (eng === "gemini") { const k = (apiKey || process.env.GEMINI_API_KEY || "").trim(); if (k) d = await geminiJson({ apiKey: k, model: (model || process.env.GEMINI_MODEL || "gemini-3.5-flash").trim(), system: sys, user, schema, maxTokens: 8192 }); }
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

const PORT = process.env.PORT || 5173;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  SeoShark dang chay tai: http://localhost:${PORT}\n`);
});

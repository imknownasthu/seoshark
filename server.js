// server.js - SeoShark backend
import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { extractArticle, blocksToHtml, blocksToMarkdown } from "./src/extract.js";
import { loadTargets, rankTargets } from "./src/sitemap.js";
import { optimizeLocally } from "./src/local.js";
import { optimizeWithGemini, geminiJson } from "./src/gemini.js";
import { optimizeWithClaude, claudeJson } from "./src/claude.js";
import { auditUrl, benchmark } from "./src/onpage.js";
import { fetchSerp, serpConfigured } from "./src/serp.js";
import {
  ONPAGE_SYSTEM, RECOMMEND_SCHEMA, OPTIMIZE_SCHEMA,
  buildRecommendPrompt, buildOptimizePrompt, mechanicalRecommendations,
} from "./src/onpage-prompt.js";
import * as auth from "./src/auth.js";
import { sendRegistrationCode, mailMode } from "./src/mailer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

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
    const r = await sendRegistrationCode({ ownerEmail: OWNER_EMAIL, requesterEmail: em, name, code });
    let message;
    if (r.mode === "resend" || r.mode === "smtp") {
      message = `Đã gửi mã xác nhận tới ${OWNER_EMAIL}. Lấy mã từ hộp thư đó (kiểm tra cả Spam) để hoàn tất.`;
    } else if (r.mode === "resend-failed") {
      message = `⚠️ Gửi email (Resend) lỗi: ${r.error}. Mã đã ghi vào Logs server. Kiểm tra lại RESEND_API_KEY và email người nhận.`;
    } else if (r.mode === "smtp-failed") {
      message = `⚠️ Gửi email (SMTP) lỗi: ${r.error}. (Render chặn SMTP — nên dùng RESEND_API_KEY.) Mã đã ghi vào Logs server.`;
    } else {
      message = `Đã tạo mã xác nhận (chế độ TEST). Mã hiển thị ở Logs của server (gửi tới ${OWNER_EMAIL} khi bật RESEND_API_KEY).`;
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
    const r = await sendRegistrationCode({ ownerEmail: OWNER_EMAIL, requesterEmail: em, name, code });
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

// Cache phien lam viec trong bo nho (don gian cho cong cu chay local)
const sessions = new Map();
const SESSION_TTL = 1000 * 60 * 60; // 1 gio
function gcSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.createdAt > SESSION_TTL) sessions.delete(id);
}

const norm = (u) => (u || "").replace(/\/$/, "");

// Cac model Gemini FREE (thu lan luot neu model chon bi loi/khong ton tai/quota)
const FREE_FLASH = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
const RECOVERABLE = /quota|exceeded|limit: 0|RESOURCE_EXHAUSTED|429|not found|404|NOT_FOUND|not supported|unavailable|is not found|does not exist/i;

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

    // 4) Khuyen nghi: AI neu co; nguoc lai co hoc
    let recommendations, summary = "", engineUsed = "Local (cơ học)";
    try {
      const { data, engineUsed: eu } = await onpageAI({
        engine, key: apiKey, model,
        system: ONPAGE_SYSTEM,
        user: buildRecommendPrompt({ target, competitors: okComps, bench, mainKeyword: mainKeyword.trim(), subKeywords: subs }),
        schema: RECOMMEND_SCHEMA, maxTokens: 4096,
      });
      recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];
      summary = data.summary || "";
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
      recommendations, summary, engineUsed, serpMode,
      mainKeyword: mainKeyword.trim(), subKeywords: subs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// --- POST /api/onpage/optimize : viet lai bai chuan SEO (truoc/sau) ---
app.post("/api/onpage/optimize", requireAuth, async (req, res) => {
  try {
    const { id, selected, engine, model, apiKey } = req.body || {};
    const session = sessions.get(id);
    if (!session || session.type !== "onpage") {
      return res.status(400).json({ error: "Phiên hết hạn. Hãy phân tích On-page lại." });
    }
    const { target, mainKeyword, subKeywords, bench } = session;

    let result;
    try {
      const { data, engineUsed } = await onpageAI({
        engine, key: apiKey, model,
        system: ONPAGE_SYSTEM,
        user: buildOptimizePrompt({ target, mainKeyword, subKeywords, selected, bench }),
        schema: OPTIMIZE_SCHEMA, maxTokens: 8192,
      });
      result = { ...data, engineUsed };
    } catch (e) {
      if (e.message === "local")
        return res.status(400).json({ error: "Bước tối ưu cần engine Gemini hoặc Claude (Local không viết lại được). Hãy chọn Gemini ở ⚙️." });
      return res.status(400).json({ error: "AI lỗi: " + e.message });
    }

    res.json({
      before: { title: target.titleTag, metaDescription: target.metaDescription, markdown: target.contentText },
      after: { title: result.title, metaDescription: result.metaDescription, markdown: result.optimizedMarkdown, slug: result.slug || "" },
      changes: result.changes || [],
      notes: result.notes || "",
      engineUsed: result.engineUsed,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

const PORT = process.env.PORT || 5173;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  SeoShark dang chay tai: http://localhost:${PORT}\n`);
});

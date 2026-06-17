// server.js - SeoShark backend
import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { extractArticle, blocksToHtml, blocksToMarkdown } from "./src/extract.js";
import { loadTargets, rankTargets } from "./src/sitemap.js";
import { optimizeLocally } from "./src/local.js";
import { optimizeWithGemini } from "./src/gemini.js";
import { optimizeWithClaude } from "./src/claude.js";
import * as auth from "./src/auth.js";
import { sendRegistrationCode, mailMode } from "./src/mailer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ====== AUTH ======
auth.initAuth();
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
    const { email: em, code } = auth.registerStart({ email, name, password });
    const r = await sendRegistrationCode({ ownerEmail: OWNER_EMAIL, requesterEmail: em, name, code });
    res.json({
      ok: true,
      mode: r.mode,
      message:
        r.mode === "smtp"
          ? `Đã gửi mã xác nhận tới ${OWNER_EMAIL}. Lấy mã từ hộp thư đó để hoàn tất.`
          : `Đã tạo mã xác nhận (chế độ TEST). Mã hiển thị ở console/log của server (gửi tới ${OWNER_EMAIL} khi bật SMTP).`,
    });
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

app.post("/api/auth/verify", (req, res) => {
  try {
    const { email, code } = req.body || {};
    const user = auth.verifyCode({ email, code });
    const token = auth.createSession(user.email);
    setSessionCookie(res, token);
    res.json({ ok: true, user });
  } catch (err) {
    res.status(400).json({ error: err.message || String(err) });
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = auth.login({ email, password });
    const token = auth.createSession(user.email);
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
        result = await optimizeWithGemini({ apiKey: gKey, model: gModel, ...params });
        engineUsed = `Gemini (${gModel})`;
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

const PORT = process.env.PORT || 5173;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  SeoShark dang chay tai: http://localhost:${PORT}\n`);
});

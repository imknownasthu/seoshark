// src/outline.js
// Ho tro tinh nang "Len outline chuan SEO":
//  - fetchCompetitors(): lay top doi thu tren SERP (Serper -> Google CSE)
//  - extractHeadings(): boc tach cay heading H1-H4 cua 1 URL doi thu
//  - mergeOutlinesLocal(): gop co hoc outline nhieu doi thu (khong can AI)
//  - markKeywords(): danh dau heading chua tu khoa chinh/phu

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { fetchHtml } from "./extract.js";
import { serperOrganic, serperConfigured } from "./serper.js";
import { fetchSerp, serpConfigured } from "./serp.js";

// ---- Lay doi thu top SERP (uu tien Serper, roi Google CSE) ----
export async function fetchCompetitors(keyword, { gl = "vn", hl = "vi", num = 6, serperKey, excludeHost } = {}) {
  const kw = String(keyword || "").trim();
  if (!kw) throw new Error("Thiếu từ khóa chính để tìm đối thủ.");
  if (serperConfigured(serperKey)) {
    const list = await serperOrganic({ key: serperKey, keyword: kw, gl, hl, num, excludeHost });
    if (list.length) return { source: "serper", competitors: list };
  }
  if (serpConfigured()) {
    const list = await fetchSerp(kw, { num, excludeHost });
    if (list.length) return { source: "cse", competitors: list.map((x, i) => ({ ...x, position: i + 1 })) };
  }
  throw new Error("Chưa có nguồn SERP (Serper key hoặc Google CSE). Hãy dán URL đối thủ thủ công (1–6).");
}

// ---- Boc tach heading tu 1 URL ----
function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

// Parse tho tat ca h1-h4 tu 1 document (khi Readability that bai)
function headingsFromDom(doc) {
  const out = [];
  doc.querySelectorAll("h1, h2, h3, h4").forEach((el) => {
    const text = cleanText(el.textContent);
    const level = Number(el.tagName.substring(1));
    if (!text || text.length < 2 || text.length > 200) return;
    out.push({ level, text });
  });
  return out;
}

export async function extractHeadings(url) {
  const u = (() => { try { return new URL(url); } catch { return null; } })();
  const base = { url, host: u ? u.host : "", title: "", headings: [] };
  let html;
  try { html = await fetchHtml(url); }
  catch (e) { return { ...base, error: e.message || "Không tải được trang" }; }

  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
  base.title = cleanText(doc.querySelector("title")?.textContent) || "";

  // 1) Uu tien Readability (bo boilerplate) -> lay heading trong noi dung chinh
  let headings = [];
  try {
    const reader = new Readability(doc.cloneNode(true));
    const article = reader.parse();
    if (article && article.content) {
      const cdom = new JSDOM(`<body>${article.content}</body>`);
      headings = headingsFromDom(cdom.window.document);
      if (article.title && !base.title) base.title = cleanText(article.title);
    }
  } catch { /* fallthrough */ }

  // 2) Fallback: parse tho toan trang neu Readability khong ra heading
  if (headings.length < 2) headings = headingsFromDom(doc);

  // Bo trung lien tiep
  const dedup = [];
  for (const h of headings) {
    const prev = dedup[dedup.length - 1];
    if (prev && prev.level === h.level && prev.text.toLowerCase() === h.text.toLowerCase()) continue;
    dedup.push(h);
  }
  base.headings = dedup.slice(0, 60);
  return base;
}

// Boc tach nhieu URL song song (gioi han loi tung cai)
export async function extractManyHeadings(urls) {
  const list = (Array.isArray(urls) ? urls : []).map((u) => String(u || "").trim()).filter(Boolean).slice(0, 6);
  const out = [];
  for (let i = 0; i < list.length; i += 3) {
    const chunk = list.slice(i, i + 3);
    const r = await Promise.all(chunk.map((u) => extractHeadings(u).catch((e) => ({ url: u, host: "", title: "", headings: [], error: e.message || String(e) }))));
    out.push(...r);
  }
  return out;
}

// ---- Danh dau heading chua tu khoa chinh/phu ----
const norm = (s) => String(s || "").toLowerCase().normalize("NFC").trim();
export function markKeywords(text, mainKw, subKws) {
  const t = norm(text);
  const main = norm(mainKw);
  const hasMain = main && t.includes(main);
  const subs = (subKws || []).map(norm).filter(Boolean);
  const hitSubs = subs.filter((s) => t.includes(s));
  return { hasMain, hitSubs };
}

// ---- Gop co hoc outline nhieu doi thu (Local, khong AI) ----
// Y tuong: gom cac H2 theo tan suat + vi tri trung binh; H3/H4 gom duoi H2 gan nhat.
function keyOf(text) {
  return norm(text).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

// Heading rac/boilerplate thuong gap (Wikipedia, menu, footer...) -> bo khi gop Local
const JUNK_RE = /^(n[ộo]i dung|m[ụu]c l[ụu]c|contents?|tham kh[ảa]o|references?|li[êe]n k[ếe]t ngo[àa]i|external links?|xem th[êe]m|see also|ch[úu] th[íi]ch|ghi ch[úu]|notes?|h[ìi]nh [ảa]nh|gallery|th[ưu] m[ụu]c|b[ìi]nh lu[ậa]n|comments?|chia s[ẻe]|share|danh m[ụu]c|menu|trang ch[ủu])$/i;

export function mergeOutlinesLocal(competitorOutlines, { mainKw, subKws } = {}) {
  // Thu thap H2 (moc chinh). Voi moi doi thu, duyet heading giu H2 lam nhom, H3/H4 gan vao H2 hien tai.
  const h2map = new Map(); // key -> { text, count, posSum, children: Map(key->{text,count,level}) }
  competitorOutlines.forEach((c) => {
    const hs = (c.headings || []).filter((h) => h.level >= 2 && h.level <= 4);
    let curH2 = null;
    let idx = 0;
    hs.forEach((h) => {
      if (h.level === 2) {
        const k = keyOf(h.text);
        if (!k || JUNK_RE.test(norm(h.text))) { curH2 = null; return; }
        if (!h2map.has(k)) h2map.set(k, { text: h.text, count: 0, posSum: 0, children: new Map() });
        const node = h2map.get(k);
        node.count++; node.posSum += idx++;
        curH2 = node;
      } else if (curH2 && (h.level === 3 || h.level === 4)) {
        const k = keyOf(h.text);
        if (!k || JUNK_RE.test(norm(h.text))) return;
        if (!curH2.children.has(k)) curH2.children.set(k, { text: h.text, count: 0, level: h.level });
        curH2.children.get(k).count++;
      }
    });
  });

  // Sap xep H2 theo count desc, roi vi tri trung binh asc
  const h2list = Array.from(h2map.values())
    .sort((a, b) => b.count - a.count || (a.posSum / a.count) - (b.posSum / b.count));

  const items = [];
  h2list.forEach((h2) => {
    items.push({ level: 2, text: h2.text, count: h2.count });
    Array.from(h2.children.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .forEach((ch) => items.push({ level: ch.level, text: ch.text, count: ch.count }));
  });

  // Danh dau tu khoa
  return items.map((it) => ({ ...it, ...markKeywords(it.text, mainKw, subKws) }));
}

// src/onpage.js
// Audit on-page: doc source cua URL va trich cac yeu to SEO on-page.
// Khong dung AI (thuan co hoc) -> mien phi, nhanh.

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { fetchHtml } from "./extract.js";

function sameHost(href, host, baseUrl) {
  try {
    const u = new URL(href, baseUrl);
    if (!/^https?:$/.test(u.protocol)) return null; // bo qua mailto, tel, #...
    return u.host === host;
  } catch {
    return null;
  }
}

// Lay tat ca @type tu JSON-LD (ho tro mang & @graph)
function collectSchemaTypes(doc) {
  const types = new Set();
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    let json;
    try {
      json = JSON.parse(s.textContent.trim());
    } catch {
      return;
    }
    const visit = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(visit);
      if (node["@type"]) {
        const t = node["@type"];
        (Array.isArray(t) ? t : [t]).forEach((x) => types.add(String(x)));
      }
      if (node["@graph"]) visit(node["@graph"]);
    };
    visit(json);
  });
  return [...types];
}

function hasBreadcrumb(doc, schemaTypes) {
  if (schemaTypes.some((t) => /BreadcrumbList/i.test(t))) return true;
  if (doc.querySelector('[itemtype*="BreadcrumbList" i]')) return true;
  if (doc.querySelector('nav[aria-label*="readcrumb" i], [class*="breadcrumb" i], [id*="breadcrumb" i]')) return true;
  return false;
}

const RICH_TYPES = /Article|NewsArticle|BlogPosting|FAQPage|QAPage|HowTo|Product|Review|AggregateRating|Recipe|VideoObject|Event|BreadcrumbList|Organization|LocalBusiness|Medical|Dentist/i;

// Chon vung NOI DUNG CHINH cua bai de doc heading (bao gom ca heading trong accordion/<details>).
// Doc tu DOM GOC (khong qua Readability) vi Readability HAY BO noi dung accordion/gap-gon -> mat H2.
const CONTENT_SELECTORS = [
  "article", "main", "[role='main']",
  ".entry-content", ".post-content", ".article-content", ".article-body", ".single-content",
  ".post-body", ".blog-content", ".td-post-content", ".elementor-widget-theme-post-content",
  ".content-area .content", "#content .content", ".page-content", "#main-content",
];
function pickContentRoot(doc) {
  for (const sel of CONTENT_SELECTORS) {
    let el;
    try { el = doc.querySelector(sel); } catch { el = null; }
    // Chon container co it nhat 1 heading noi dung
    if (el && el.querySelector("h1,h2,h3,h4")) return el;
  }
  return doc.body || doc;
}

// Cac vung KHONG phai noi dung chinh (loai heading ben trong). Dung class/id PHO BIEN, giu than trong.
const NONCONTENT_TAG = new Set(["nav", "footer", "header", "aside"]);
const NONCONTENT_RE = /(^|[\s_\-])(nav|navbar|menu|breadcrumb|sidebar|widget[-_]?area|footer|site[-_]?header|comment|comments|reply|related|relate[d]?[-_]?post|share|social|pagination|pager|toc|table[-_]?of[-_]?contents|cookie|advert|ads?|promo|newsletter|subscribe|author[-_]?box|post[-_]?nav|breadcumb)([\s_\-]|$)/i;
function inNonContent(el, root) {
  let p = el.parentElement;
  while (p && p !== root && p.tagName) {
    const tag = p.tagName.toLowerCase();
    if (NONCONTENT_TAG.has(tag)) return true;
    const idc = ((p.getAttribute && (p.getAttribute("class") || "")) + " " + (p.id || "")).toLowerCase();
    if (idc && NONCONTENT_RE.test(idc)) return true;
    p = p.parentElement;
  }
  return false;
}

// Trich heading (h1-h6) trong 1 vung, loai vung phu, BAO GOM ca heading trong <details>/accordion.
// JSDOM doc duoc noi dung an bang CSS/<details> (mien la server-render, khong phai JS tai dong).
function extractHeadingsFrom(root) {
  const out = [];
  const seen = new Set();
  root.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h) => {
    const text = (h.textContent || "").replace(/\s+/g, " ").trim();
    if (!text || inNonContent(h, root)) return;
    const key = h.tagName + "|" + text.toLowerCase();
    if (seen.has(key)) return; // bo trung lap
    seen.add(key);
    out.push({ level: Number(h.tagName[1]), text });
  });
  return out;
}

// API cu: tu chon content-root roi trich (dung cho toan doc).
function extractHeadings(doc) {
  return extractHeadingsFrom(pickContentRoot(doc));
}

// DOM noi dung -> Markdown (giu cau truc heading) de hien thi "truoc khi toi uu"
function domToMarkdown(body) {
  const out = [];
  body.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,blockquote").forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === "li" && el.querySelector("p,ul,ol,li")) return;
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    if (/^h[1-6]$/.test(tag)) out.push("#".repeat(Number(tag[1])) + " " + text);
    else if (tag === "li") out.push("- " + text);
    else if (tag === "blockquote") out.push("> " + text);
    else out.push(text);
  });
  return out.join("\n\n");
}

export async function auditUrl(url) {
  const html = await fetchHtml(url);
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
  const u = new URL(url);
  const host = u.host;

  // --- HEAD / META ---
  const titleTag = (doc.querySelector("title")?.textContent || "").trim();
  const metaDesc = (doc.querySelector('meta[name="description" i]')?.getAttribute("content") || "").trim();
  const metaRobots = (doc.querySelector('meta[name="robots" i]')?.getAttribute("content") || "").trim();
  const canonical = (doc.querySelector('link[rel="canonical" i]')?.getAttribute("href") || "").trim();
  const schemaTypes = collectSchemaTypes(doc);
  const breadcrumb = hasBreadcrumb(doc, schemaTypes);
  const richTypes = schemaTypes.filter((t) => RICH_TYPES.test(t));

  // --- CONTENT (uu tien Readability) ---
  let contentHtml = "";
  let contentText = "";
  try {
    const reader = new Readability(doc.cloneNode(true));
    const article = reader.parse();
    if (article && article.content) {
      contentHtml = article.content;
      contentText = article.textContent || "";
    }
  } catch {}
  if (!contentHtml) {
    const el = doc.querySelector("article, main, [role='main']") || doc.body;
    contentHtml = el ? el.innerHTML : "";
    contentText = el ? el.textContent || "" : "";
  }

  const cdom = new JSDOM(`<body>${contentHtml}</body>`);
  const cbody = cdom.window.document.body;

  // Headings: doc tu DOM GOC (content root) de bat duoc CA heading trong accordion/<details>
  // va cac H2 ma Readability hay bo mat. cbody (Readability) chi dung khi doc goc khong ra gi.
  let headings = extractHeadings(doc);
  if (!headings.length) headings = extractHeadingsFrom(cbody);
  const pageH1Count = doc.querySelectorAll("h1").length || cbody.querySelectorAll("h1").length;

  // Anh + alt trong content
  const imgs = [...cbody.querySelectorAll("img")];
  const imgWithAlt = imgs.filter((im) => (im.getAttribute("alt") || "").trim()).length;
  const imgTotal = imgs.length;

  // Internal / external links trong content
  let internal = 0, external = 0;
  cbody.querySelectorAll("a[href]").forEach((a) => {
    const r = sameHost(a.getAttribute("href"), host, url);
    if (r === true) internal++;
    else if (r === false) external++;
  });

  const wordCount = contentText.trim().split(/\s+/).filter(Boolean).length;

  // Video: <video> hoac iframe nhung (youtube/vimeo...) hoac schema VideoObject
  const hasVideo = !!(
    cbody.querySelector("video, iframe[src*='youtube'], iframe[src*='youtu.be'], iframe[src*='vimeo'], iframe[src*='dailymotion'], iframe[src*='player.']") ||
    doc.querySelector("video, iframe[src*='youtube'], iframe[src*='youtu.be'], iframe[src*='vimeo']") ||
    schemaTypes.some((t) => /VideoObject/i.test(t))
  );

  const contentMarkdown = domToMarkdown(cbody).slice(0, 16000);

  return {
    ok: true,
    url,
    host,
    hasVideo,
    contentMarkdown,
    breadcrumb,
    schemaTypes,
    hasSchema: schemaTypes.length > 0,
    richSnippet: richTypes,
    titleTag,
    titleLen: titleTag.length,
    metaDescription: metaDesc,
    metaDescLen: metaDesc.length,
    metaRobots: metaRobots || "(không có)",
    canonical: canonical || "(không có)",
    canonicalSelf: canonical ? canonical.replace(/\/$/, "") === url.replace(/\/$/, "") : false,
    headings,
    headingCount: headings.length,
    h1Count: pageH1Count,
    images: imgTotal,
    imagesWithAlt: imgWithAlt,
    imagesNoAlt: imgTotal - imgWithAlt,
    altEnough: imgTotal === 0 ? true : imgWithAlt === imgTotal,
    internalLinks: internal,
    externalLinks: external,
    wordCount,
    // noi dung de phuc vu buoc toi uu (rut gon)
    contentText: contentText.replace(/\s+/g, " ").trim().slice(0, 12000),
  };
}

// Trung binh cac chi so cua doi thu (de doi chieu nhanh)
export function benchmark(audits) {
  const ok = audits.filter((a) => a && a.ok);
  if (!ok.length) return null;
  const avg = (f) => Math.round(ok.reduce((s, a) => s + (a[f] || 0), 0) / ok.length);
  return {
    count: ok.length,
    wordCount: avg("wordCount"),
    headingCount: avg("headingCount"),
    internalLinks: avg("internalLinks"),
    externalLinks: avg("externalLinks"),
    images: avg("images"),
    titleLen: avg("titleLen"),
    metaDescLen: avg("metaDescLen"),
    withSchema: ok.filter((a) => a.hasSchema).length,
    withBreadcrumb: ok.filter((a) => a.breadcrumb).length,
  };
}

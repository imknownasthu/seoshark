// src/schema.js
// Schema Markup (JSON-LD): trich xuat du lieu bai viet, tao schema CO HOC (khong AI) cho loai cau truc,
// doc schema san co trong SOURCE (cho ca URL nguoi dung & doi thu), va VALIDATE theo yeu cau Google.

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { fetchHtml } from "./extract.js";

// ===== Dinh nghia cac loai schema ho tro (label + required/recommended theo Google) =====
export const SCHEMA_DEFS = {
  Article: { label: "Article / Bài viết", gtype: "Article", req: ["headline"], rec: ["image", "datePublished", "dateModified", "author", "publisher", "mainEntityOfPage"] },
  BlogPosting: { label: "BlogPosting / Blog", gtype: "BlogPosting", req: ["headline"], rec: ["image", "datePublished", "dateModified", "author", "publisher"] },
  NewsArticle: { label: "NewsArticle / Tin tức", gtype: "NewsArticle", req: ["headline"], rec: ["image", "datePublished", "dateModified", "author", "publisher"] },
  BreadcrumbList: { label: "Breadcrumb", gtype: "BreadcrumbList", req: ["itemListElement"], rec: [] },
  FAQPage: { label: "FAQ", gtype: "FAQPage", req: ["mainEntity"], rec: [] },
  HowTo: { label: "HowTo / Hướng dẫn", gtype: "HowTo", req: ["name", "step"], rec: ["image", "totalTime", "tool", "supply"] },
  Product: { label: "Product / Sản phẩm", gtype: "Product", req: ["name"], rec: ["image", "description", "brand", "offers", "aggregateRating", "review", "sku"] },
  Review: { label: "Review / Đánh giá", gtype: "Review", req: ["itemReviewed", "reviewRating", "author"], rec: ["reviewBody", "datePublished"] },
  LocalBusiness: { label: "LocalBusiness / Doanh nghiệp địa phương", gtype: "LocalBusiness", req: ["name", "address"], rec: ["telephone", "image", "url", "openingHours", "geo", "priceRange"] },
  Dentist: { label: "Dentist / Nha khoa", gtype: "Dentist", req: ["name", "address"], rec: ["telephone", "image", "url", "openingHours", "geo", "priceRange", "medicalSpecialty"] },
  Organization: { label: "Organization / Tổ chức", gtype: "Organization", req: ["name", "url"], rec: ["logo", "sameAs", "contactPoint", "description"] },
  Person: { label: "Person / Cá nhân", gtype: "Person", req: ["name"], rec: ["url", "image", "jobTitle", "sameAs", "worksFor"] },
  Event: { label: "Event / Sự kiện", gtype: "Event", req: ["name", "startDate", "location"], rec: ["endDate", "image", "description", "offers", "performer"] },
  Recipe: { label: "Recipe / Công thức", gtype: "Recipe", req: ["name", "image", "recipeIngredient", "recipeInstructions"], rec: ["author", "datePublished", "prepTime", "cookTime", "nutrition"] },
  VideoObject: { label: "Video", gtype: "VideoObject", req: ["name", "description", "thumbnailUrl", "uploadDate"], rec: ["duration", "contentUrl", "embedUrl"] },
  Service: { label: "Service / Dịch vụ", gtype: "Service", req: ["name", "provider"], rec: ["areaServed", "serviceType", "description", "offers"] },
  WebPage: { label: "WebPage / Trang", gtype: "WebPage", req: ["name", "url"], rec: ["description", "breadcrumb", "primaryImageOfPage", "inLanguage"] },
  WebSite: { label: "WebSite / Website", gtype: "WebSite", req: ["name", "url"], rec: ["potentialAction", "inLanguage", "publisher"] },
};
// Loai co the tao CO HOC (khong can AI). Con lai (FAQ/HowTo/Product/Review/Recipe...) can AI doc noi dung.
export const MECHANICAL_TYPES = new Set(["Article", "BlogPosting", "NewsArticle", "BreadcrumbList", "Organization", "Person", "WebPage", "WebSite", "LocalBusiness", "Dentist", "Service"]);

// ===== Doc TAT CA JSON-LD trong SOURCE (dung cho URL nguoi dung & doi thu) =====
export function extractLdJson(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let raw = (m[1] || "").trim().replace(/^\/\*[\s\S]*?\*\//, "").trim();
    try {
      const parsed = JSON.parse(raw);
      (Array.isArray(parsed) ? parsed : [parsed]).forEach((o) => {
        if (o && o["@graph"] && Array.isArray(o["@graph"])) out.push(...o["@graph"]);
        else if (o) out.push(o);
      });
    } catch { /* bo qua block loi */ }
  }
  return out;
}
// Liet ke cac @type co trong 1 danh sach node (phang, ke ca lan nhau)
export function schemaTypesOf(nodes) {
  const t = new Set();
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    const ty = n["@type"];
    if (ty) (Array.isArray(ty) ? ty : [ty]).forEach((x) => t.add(String(x)));
    for (const k of Object.keys(n)) if (k !== "@type" && typeof n[k] === "object") walk(n[k]);
  };
  (Array.isArray(nodes) ? nodes : [nodes]).forEach(walk);
  return [...t];
}

const _abs = (base, u) => { try { return new URL(u, base).href; } catch { return u || ""; } };
const _txt = (el) => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");

// ===== Trich xuat du lieu bai viet (de tao schema) =====
export async function extractPageData(url) {
  const html = await fetchHtml(url);
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
  const meta = (sel, attr = "content") => { const el = doc.querySelector(sel); return el ? (el.getAttribute(attr) || "").trim() : ""; };
  const existingLd = extractLdJson(html);
  const ldPick = (type, prop) => {
    for (const n of existingLd) {
      const ty = n && n["@type"]; const arr = Array.isArray(ty) ? ty : [ty];
      if (arr.includes(type) && n[prop] != null) return n[prop];
    }
    return null;
  };

  const title = meta('meta[property="og:title"]') || _txt(doc.querySelector("h1")) || _txt(doc.querySelector("title"));
  const description = meta('meta[name="description" i]') || meta('meta[property="og:description"]');
  const siteName = meta('meta[property="og:site_name"]');
  const lang = (doc.documentElement.getAttribute("lang") || "vi").split("-")[0];
  const image = _abs(url, meta('meta[property="og:image"]') || (doc.querySelector("article img, main img, img") ? doc.querySelector("article img, main img, img").getAttribute("src") : ""));
  const datePublished = meta('meta[property="article:published_time"]') || meta('meta[itemprop="datePublished"]') || String(ldPick("Article", "datePublished") || ldPick("NewsArticle", "datePublished") || "");
  const dateModified = meta('meta[property="article:modified_time"]') || meta('meta[itemprop="dateModified"]') || String(ldPick("Article", "dateModified") || "");
  let author = meta('meta[name="author" i]') || meta('meta[property="article:author"]');
  if (!author) { const a = ldPick("Article", "author") || ldPick("BlogPosting", "author"); if (a) author = typeof a === "string" ? a : (a.name || (Array.isArray(a) && a[0] && a[0].name) || ""); }
  const logo = _abs(url, meta('link[rel="apple-touch-icon"]', "href") || meta('meta[property="og:logo"]'));
  const u = new URL(url);
  const publisher = siteName || u.hostname.replace(/^www\./, "");

  // Breadcrumb: uu tien BreadcrumbList san co, else suy tu path URL
  let breadcrumb = [];
  const bcLd = existingLd.find((n) => (Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]]).includes("BreadcrumbList"));
  if (bcLd && Array.isArray(bcLd.itemListElement)) {
    breadcrumb = bcLd.itemListElement.map((it, i) => ({ name: it.name || (it.item && it.item.name) || "", url: (typeof it.item === "string" ? it.item : (it.item && it.item["@id"]) || it.item && it.item.url) || "" }));
  } else {
    const segs = u.pathname.split("/").filter(Boolean);
    breadcrumb.push({ name: "Trang chủ", url: u.origin });
    let acc = u.origin;
    segs.forEach((s) => { acc += "/" + s; breadcrumb.push({ name: decodeURIComponent(s).replace(/[-_]+/g, " ").replace(/\.(html?|php|aspx?)$/i, "").trim(), url: acc }); });
  }

  // Noi dung chinh + heading (de AI/ co hoc doc) + FAQ ung vien (heading dang cau hoi + doan sau)
  let contentText = "", headings = [], faqs = [];
  try {
    const reader = new Readability(dom.window.document.cloneNode(true));
    const art = reader.parse();
    contentText = (art && art.textContent ? art.textContent : "").replace(/\s+/g, " ").trim().slice(0, 12000);
  } catch {}
  const root = doc.querySelector("article, main, [role='main']") || doc.body;
  if (root) {
    root.querySelectorAll("h1,h2,h3,h4").forEach((h) => headings.push({ level: Number(h.tagName[1]), text: _txt(h) }));
    root.querySelectorAll("h2,h3,h4").forEach((h) => {
      const q = _txt(h);
      if (/\?$/.test(q) || /^(vì sao|tại sao|làm sao|làm thế nào|có nên|khi nào|bao lâu|bao nhiêu|là gì|như thế nào)/i.test(q)) {
        let a = ""; let sib = h.nextElementSibling;
        while (sib && !/^H[1-4]$/.test(sib.tagName) && a.length < 600) { const t = _txt(sib); if (t) a += (a ? " " : "") + t; sib = sib.nextElementSibling; }
        if (q && a) faqs.push({ question: q, answer: a.slice(0, 600) });
      }
    });
  }

  return {
    url, title, description, siteName, publisher, lang, image, logo,
    datePublished, dateModified, author, breadcrumb,
    headings: headings.slice(0, 40), faqs: faqs.slice(0, 12),
    contentText, existingLd, existingTypes: schemaTypesOf(existingLd),
  };
}

// ===== Tao schema CO HOC (khong AI) cho cac loai cau truc =====
export function buildMechanicalNode(type, d) {
  const id = (frag) => d.url.split("#")[0] + "#" + frag;
  switch (type) {
    case "Article": case "BlogPosting": case "NewsArticle": {
      const n = { "@type": type, headline: (d.title || "").slice(0, 110), mainEntityOfPage: { "@type": "WebPage", "@id": d.url } };
      if (d.image) n.image = [d.image];
      if (d.datePublished) n.datePublished = d.datePublished;
      if (d.dateModified) n.dateModified = d.dateModified;
      if (d.author) n.author = { "@type": "Person", name: d.author };
      n.publisher = { "@type": "Organization", name: d.publisher, ...(d.logo ? { logo: { "@type": "ImageObject", url: d.logo } } : {}) };
      if (d.description) n.description = d.description;
      return n;
    }
    case "BreadcrumbList":
      return { "@type": "BreadcrumbList", itemListElement: (d.breadcrumb || []).map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name, item: b.url })) };
    case "Organization":
      return { "@type": "Organization", name: d.publisher, url: new URL(d.url).origin, ...(d.logo ? { logo: { "@type": "ImageObject", url: d.logo } } : {}) };
    case "WebSite":
      return { "@type": "WebSite", name: d.siteName || d.publisher, url: new URL(d.url).origin, inLanguage: d.lang };
    case "WebPage":
      return { "@type": "WebPage", "@id": d.url, url: d.url, name: (d.title || "").slice(0, 110), ...(d.description ? { description: d.description } : {}), inLanguage: d.lang, ...(d.image ? { primaryImageOfPage: { "@type": "ImageObject", url: d.image } } : {}) };
    case "Person":
      return { "@type": "Person", name: d.author || d.publisher, ...(d.image ? { image: d.image } : {}) };
    case "LocalBusiness": case "Dentist":
      return { "@type": type, name: d.publisher, url: new URL(d.url).origin, ...(d.image ? { image: d.image } : {}), address: { "@type": "PostalAddress", addressCountry: "VN" } };
    case "Service":
      return { "@type": "Service", name: (d.title || "").slice(0, 110), provider: { "@type": "Organization", name: d.publisher }, ...(d.description ? { description: d.description } : {}) };
    case "FAQPage":
      return (d.faqs && d.faqs.length) ? { "@type": "FAQPage", mainEntity: d.faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) } : null;
    default:
      return null;
  }
}

// ===== VALIDATE theo yeu cau Google (required = loi, recommended = canh bao) =====
function _has(node, key) {
  if (!node || node[key] == null) return false;
  const v = node[key];
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}
export function validateNode(node) {
  const errors = [], warnings = [];
  const ty = node && node["@type"];
  const type = Array.isArray(ty) ? ty[0] : ty;
  const def = SCHEMA_DEFS[type];
  if (!type) { errors.push("Thiếu @type."); return { type: type || "?", errors, warnings }; }
  if (!def) { warnings.push(`Loại "${type}" không nằm trong danh sách hỗ trợ — vẫn hợp lệ nếu đúng schema.org.`); return { type, errors, warnings }; }
  def.req.forEach((f) => { if (!_has(node, f)) errors.push(`Thiếu trường BẮT BUỘC "${f}" cho ${type}.`); });
  def.rec.forEach((f) => { if (!_has(node, f)) warnings.push(`Nên có "${f}" để tối ưu rich result cho ${type}.`); });
  // Kiem tra sau vai loai
  if (type === "BreadcrumbList" && Array.isArray(node.itemListElement)) {
    node.itemListElement.forEach((it, i) => { if (it.position == null) errors.push(`ListItem #${i + 1} thiếu "position".`); if (!it.name) errors.push(`ListItem #${i + 1} thiếu "name".`); });
  }
  if (type === "FAQPage" && Array.isArray(node.mainEntity)) {
    node.mainEntity.forEach((q, i) => { if (!q.name) errors.push(`Question #${i + 1} thiếu "name".`); if (!(q.acceptedAnswer && q.acceptedAnswer.text)) errors.push(`Question #${i + 1} thiếu acceptedAnswer.text.`); });
  }
  if ((type === "Product") && node.offers && !((node.offers.price != null && node.offers.priceCurrency) || node.offers.priceSpecification)) warnings.push('offers nên có "price" + "priceCurrency" để đủ điều kiện rich result.');
  return { type, errors, warnings };
}
// Validate ca @graph
export function validateGraph(nodes) {
  const list = Array.isArray(nodes) ? nodes : [nodes];
  const results = list.map(validateNode);
  const errors = results.reduce((a, r) => a + r.errors.length, 0);
  const warnings = results.reduce((a, r) => a + r.warnings.length, 0);
  return { nodes: results, errorCount: errors, warningCount: warnings, valid: errors === 0 };
}

// Dong goi thanh 1 khoi JSON-LD @graph chuan
export function wrapGraph(nodes, url) {
  const list = (Array.isArray(nodes) ? nodes : [nodes]).filter(Boolean).map((n) => ({ ...n }));
  return { "@context": "https://schema.org", "@graph": list };
}

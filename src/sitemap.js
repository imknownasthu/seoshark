// src/sitemap.js
// Doc sitemap.xml (ho tro ca sitemap index long nhau) de lay danh sach URL dich.

import { XMLParser } from "fast-xml-parser";
import { fetchHtml } from "./extract.js";

const parser = new XMLParser({ ignoreAttributes: true });

// Suy ra mot "anchor goi y" dep tu slug cua URL
export function titleFromUrl(url) {
  try {
    const u = new URL(url);
    let slug = u.pathname.replace(/\/+$/, "").split("/").pop() || u.host;
    slug = slug.replace(/\.(html?|php|aspx)$/i, "");
    slug = decodeURIComponent(slug).replace(/[-_]+/g, " ").trim();
    if (!slug) return u.host;
    return slug.charAt(0).toUpperCase() + slug.slice(1);
  } catch {
    return url;
  }
}

function asArray(x) {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

async function parseOne(xmlUrl, depth, seen) {
  if (depth > 3 || seen.has(xmlUrl)) return [];
  seen.add(xmlUrl);

  let xml;
  try {
    xml = await fetchHtml(xmlUrl);
  } catch {
    return [];
  }

  const data = parser.parse(xml);
  const results = [];

  // Sitemap index -> de quy
  if (data.sitemapindex) {
    const maps = asArray(data.sitemapindex.sitemap);
    for (const m of maps) {
      if (m.loc) {
        const nested = await parseOne(String(m.loc).trim(), depth + 1, seen);
        results.push(...nested);
      }
    }
  }

  // Urlset thuong
  if (data.urlset) {
    const urls = asArray(data.urlset.url);
    for (const entry of urls) {
      if (entry.loc) {
        results.push({
          url: String(entry.loc).trim(),
          lastmod: entry.lastmod ? String(entry.lastmod) : null,
        });
      }
    }
  }

  return results;
}

// Tra ve danh sach { url, title } tu mot hoac nhieu sitemap.
// sitemapUrl co the rong -> tu doan tu domain.
export async function loadTargets({ sitemapUrl, domain }) {
  const candidates = [];
  if (sitemapUrl) {
    candidates.push(sitemapUrl);
  } else if (domain) {
    candidates.push(
      `${domain}/sitemap.xml`,
      `${domain}/sitemap_index.xml`,
      `${domain}/sitemap-index.xml`
    );
  }

  const seen = new Set();
  let entries = [];
  for (const c of candidates) {
    const found = await parseOne(c, 0, seen);
    if (found.length) {
      entries = found;
      break; // dung o sitemap dau tien co du lieu
    }
  }

  // Loai bo trung lap & cac URL khong phai trang noi dung
  const uniq = new Map();
  for (const e of entries) {
    if (uniq.has(e.url)) continue;
    if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|css|js|xml)(\?|$)/i.test(e.url)) continue;
    uniq.set(e.url, {
      url: e.url,
      title: titleFromUrl(e.url),
      lastmod: e.lastmod,
    });
  }

  return Array.from(uniq.values());
}

// Tinh diem lien quan tho giua bai viet va tung URL dich (token overlap)
// de loc bot pool truoc khi gui cho Claude.
export function rankTargets(targets, articleText, limit = 80, keepScore = false) {
  const norm = (s) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // bo dau tieng Viet de match rong hon
      .replace(/[^a-z0-9\s]/g, " ");

  const articleTokens = new Set(norm(articleText).split(/\s+/).filter((t) => t.length > 2));

  const scored = targets.map((t) => {
    const tokens = norm(`${t.title} ${t.url}`).split(/\s+/).filter((x) => x.length > 2);
    let score = 0;
    for (const tok of tokens) if (articleTokens.has(tok)) score++;
    return { ...t, score };
  });

  scored.sort((a, b) => b.score - a.score);
  // Giu cac url co diem > 0 truoc, neu thieu thi bu them tu dau danh sach
  const relevant = scored.filter((t) => t.score > 0);
  const pool = relevant.length >= limit ? relevant : scored;
  const sliced = pool.slice(0, limit);
  if (keepScore) return sliced;
  return sliced.map(({ score, ...rest }) => rest);
}

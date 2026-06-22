// src/sharekit.js
// Lay OG metadata (title, description, image/thumbnail) tu 1 URL de dung cho Share Link.

export async function fetchOgMeta(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let html = "";
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SeoSharkBot/1.0)" },
    });
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }
  const head = html.slice(0, 200000); // chi can phan <head>
  const pick = (re) => { const m = head.match(re); return m ? m[1].trim() : ""; };
  // Bat ca 2 thu tu thuoc tinh: property=...content=... va content=...property=...
  const meta = (prop) =>
    pick(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*?content=["']([^"']*)["']`, "i")) ||
    pick(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*?(?:property|name)=["']${prop}["']`, "i"));

  const title = meta("og:title") || meta("twitter:title") || pick(/<title[^>]*>([^<]*)<\/title>/i);
  const description = meta("og:description") || meta("twitter:description") || meta("description");
  let image = meta("og:image") || meta("og:image:url") || meta("twitter:image") || meta("twitter:image:src");
  try { if (image) image = new URL(image, url).href; } catch {}
  return {
    title: decodeEntities(title),
    description: decodeEntities(description),
    image: image || "",
  };
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ");
}

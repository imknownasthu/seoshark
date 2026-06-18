// src/serp.js
// Lay top doi thu tren SERP qua Google Custom Search JSON API (key free).
// Tao key: https://developers.google.com/custom-search/v1/overview
//   - GOOGLE_CSE_KEY: API key
//   - GOOGLE_CSE_CX : Search engine ID (cx), bat "Search the entire web"

export function serpConfigured() {
  return !!(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX);
}

export async function fetchSerp(keyword, { num = 6, excludeHost } = {}) {
  if (!serpConfigured()) {
    throw new Error(
      "Chưa cấu hình Google Custom Search (GOOGLE_CSE_KEY + GOOGLE_CSE_CX). Hãy dán URL đối thủ thủ công."
    );
  }
  const params = new URLSearchParams({
    key: process.env.GOOGLE_CSE_KEY,
    cx: process.env.GOOGLE_CSE_CX,
    q: keyword,
    num: String(Math.min(10, num + 2)),
    gl: "vn",
    hl: "vi",
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let data;
  try {
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`, { signal: ctrl.signal });
    data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `Google CSE HTTP ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
  const items = Array.isArray(data.items) ? data.items : [];
  const out = [];
  const seen = new Set();
  for (const it of items) {
    if (!it.link) continue;
    let host;
    try { host = new URL(it.link).host; } catch { continue; }
    if (excludeHost && host === excludeHost) continue; // bo URL cua chinh minh
    if (seen.has(it.link)) continue;
    seen.add(it.link);
    out.push({ url: it.link, title: it.title || it.link, host });
    if (out.length >= num) break;
  }
  return out;
}

// src/keywords.js
// Nghien cuu tu khoa MIEN PHI:
//  - googleAutocomplete: goi y that cua Google (khong can key)
//  - expandSeeds: mo rong tu 1+ seed (+ A-Z tuy chon)
//  - domainSeeds: rut tu khoa on-page cua 1 website (sitemap slug + heading/title)

const AZ = "abcdefghijklmnopqrstuvwxyz".split("");

async function suggest(q, gl, hl) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=${encodeURIComponent(hl || "vi")}&gl=${encodeURIComponent(gl || "vn")}&q=${encodeURIComponent(q)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    const data = await res.json().catch(() => []);
    return Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
  } catch { return []; }
  finally { clearTimeout(timer); }
}

// Chay theo lo nho de tranh bi chan
async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const r = await Promise.all(chunk.map(fn));
    out.push(...r);
  }
  return out;
}

export async function expandSeeds(seeds, { gl, hl, deep } = {}) {
  const set = new Set();
  const queries = [];
  seeds.slice(0, deep ? 4 : 12).forEach((s) => {
    const seed = String(s || "").trim();
    if (!seed) return;
    set.add(seed);
    queries.push(seed);
    if (deep) AZ.forEach((c) => queries.push(`${seed} ${c}`));
  });
  const lists = await inBatches(queries, 6, (q) => suggest(q, gl, hl));
  lists.forEach((list) => list.forEach((k) => { const t = String(k).trim().toLowerCase(); if (t) set.add(t); }));
  return Array.from(set).slice(0, 400);
}

function slugToPhrase(u) {
  try {
    const p = new URL(u).pathname.replace(/\/+$/, "");
    const seg = p.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(seg).replace(/[-_]+/g, " ").replace(/\.(html?|php|aspx?)$/i, "").trim();
  } catch { return ""; }
}

export async function domainSeeds(domain, { gl, hl, expand } = {}) {
  let origin;
  try { origin = new URL(/^https?:\/\//i.test(domain) ? domain : "https://" + domain).origin; }
  catch { throw new Error("Domain không hợp lệ."); }

  const set = new Set();
  const fetchLocs = async (u) => {
    try { const xml = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.text()); return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]); }
    catch { return []; }
  };
  // 1) Sitemap (xu ly ca sitemap INDEX -> doc cac sitemap con) -> slug thanh cum tu
  try {
    let locs = await fetchLocs(`${origin}/sitemap.xml`);
    if (!locs.length) locs = await fetchLocs(`${origin}/sitemap_index.xml`);
    const subXml = locs.filter((u) => /\.xml(\?|$)/i.test(u));
    if (subXml.length) { const subs = await inBatches(subXml.slice(0, 10), 4, fetchLocs); locs = subs.flat(); }
    locs = locs.filter((u) => !/\.xml(\?|$)/i.test(u)).slice(0, 200);
    locs.forEach((u) => { const ph = slugToPhrase(u); if (ph && ph.split(" ").length <= 8 && ph.length >= 3) set.add(ph.toLowerCase()); });
  } catch {}
  // 2) Trang chu -> title/h1/h2/h3/meta
  try {
    const html = await fetch(origin, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.text()).catch(() => "");
    const head = html.slice(0, 300000);
    const grab = (re) => [...head.matchAll(re)].map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    grab(/<title[^>]*>([^<]+)<\/title>/gi).forEach((t) => set.add(t.toLowerCase()));
    grab(/<h1[^>]*>([\s\S]*?)<\/h1>/gi).forEach((t) => t && set.add(t.toLowerCase()));
    grab(/<h2[^>]*>([\s\S]*?)<\/h2>/gi).forEach((t) => t && set.add(t.toLowerCase()));
  } catch {}

  let list = Array.from(set).filter((s) => s && s.length >= 3 && s.length <= 80).slice(0, 200);
  if (expand && list.length) list = await expandSeeds(list.slice(0, 8), { gl, hl, deep: false });
  return list.slice(0, 400);
}

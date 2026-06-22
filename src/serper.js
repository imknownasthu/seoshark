// src/serper.js
// Serper.dev - lay SERP Google THAT (free 2.500 luot). Lay key: https://serper.dev
// Dung cho: check index (q = "site:url") + check thu hang tu khoa.
// Het luot/credit -> nem loi co .quota = true (de UI dung lai, KHONG tu tra phi).

function getKey(key) {
  return (key || process.env.SERPER_API_KEY || "").trim();
}

export function serperConfigured(key) {
  return !!getKey(key);
}

function normHost(h) {
  return String(h || "").toLowerCase().replace(/^www\./, "");
}
function hostOf(u) {
  try { return normHost(new URL(u).host); } catch { return ""; }
}
function normUrl(u) {
  try {
    const x = new URL(String(u).trim());
    return (normHost(x.host) + x.pathname.replace(/\/+$/, "")).toLowerCase();
  } catch { return String(u || "").trim().toLowerCase().replace(/\/+$/, ""); }
}

// 1 truy van toi Serper. Nem loi {quota:true} neu het luot, {badKey:true} neu sai key.
async function serperSearch({ key, q, gl = "vn", hl = "vi", num = 10 }) {
  const apiKey = getKey(key);
  if (!apiKey) { const e = new Error("Chưa có Serper API key."); e.badKey = true; throw e; }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q, gl, hl, num }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || `Serper HTTP ${res.status}`;
      const e = new Error(msg);
      if (res.status === 429 || /credit|quota|insufficient|payment|not enough/i.test(msg)) e.quota = true;
      else if (res.status === 401 || res.status === 403 || /unauthor|api key|forbidden|invalid/i.test(msg)) e.badKey = true;
      throw e;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Check 1 URL da index chua: q = "site:url". Co ket qua organic => da index.
export async function serperIndex({ key, url, gl, hl }) {
  const clean = String(url || "").trim();
  const data = await serperSearch({ key, q: `site:${clean}`, gl, hl, num: 10 });
  const organic = Array.isArray(data.organic) ? data.organic : [];
  return { url: clean, indexed: organic.length > 0, found: organic[0]?.link || "" };
}

// Check thu hang 1 tu khoa cho domain (trong top `num`). Tra rank=null neu ngoai top.
export async function serperRank({ key, keyword, domain, gl, hl, num = 10 }) {
  const kw = String(keyword || "").trim();
  const dHost = hostOf(domain) || normHost(domain);
  const data = await serperSearch({ key, q: kw, gl, hl, num });
  const organic = Array.isArray(data.organic) ? data.organic : [];
  let hit = null;
  for (const o of organic) {
    const h = hostOf(o.link);
    if (h === dHost || h.endsWith("." + dHost)) { hit = o; break; }
  }
  if (!hit) return { keyword: kw, rank: null, url: "", title: "" };
  return { keyword: kw, rank: hit.position || null, url: hit.link, title: hit.title || "" };
}

// src/volume.js
// Lay "volume tim kiem" cho tu khoa tu 2 nguon:
//  - googleTrends(): MIEN PHI, khong can key -> diem "muc do quan tam" 0-100 (tuong doi, KHONG phai so luot/thang).
//    Dung ky thuat anchor (1 tu khoa neo xuat hien o moi lo) de chuan hoa diem giua cac lo.
//  - bingVolume(): can Bing Webmaster API key (free) -> SO luot tim kiem that theo thang (tuyet doi).
// Ca hai deu degrade graceful: loi/khong co du lieu -> tra null, KHONG lam hong /api/keywords/research.

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Google Trends tra JSON co prefix rac ")]}'," hoac ")]}'\n" -> cat bo truoc khi parse.
function stripXssi(text) {
  const i = text.indexOf("{");
  const j = text.indexOf("[");
  let start = -1;
  if (i === -1) start = j;
  else if (j === -1) start = i;
  else start = Math.min(i, j);
  return start >= 0 ? text.slice(start) : text;
}

async function fetchText(url, { cookie, timeout = 12000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "vi,en;q=0.9",
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    const setCookie = res.headers.get("set-cookie") || "";
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, setCookie };
  } finally { clearTimeout(timer); }
}

// Lay cookie tu trang chu Trends de giam nguy co 429.
async function getTrendsCookie() {
  try {
    const { setCookie } = await fetchText("https://trends.google.com/trends/?geo=VN", { timeout: 8000 });
    // Chi giu cap ten=gia tri dau tien cua moi cookie
    const parts = (setCookie || "").split(/,(?=[^;]+?=)/).map((c) => c.split(";")[0].trim()).filter(Boolean);
    return parts.join("; ");
  } catch { return ""; }
}

// Trung binh cac gia tri > 0 trong timelineData cho tung tu khoa (theo index).
function meansFromTimeline(timeline, nKw) {
  const sum = new Array(nKw).fill(0);
  const cnt = new Array(nKw).fill(0);
  for (const pt of timeline) {
    const vals = Array.isArray(pt.value) ? pt.value : [];
    for (let k = 0; k < nKw; k++) {
      const v = Number(vals[k]);
      if (Number.isFinite(v)) { sum[k] += v; cnt[k]++; }
    }
  }
  return sum.map((s, k) => (cnt[k] ? s / cnt[k] : 0));
}

// Lay diem interest 0-100 cho 1 lo <=5 tu khoa. Tra mang means theo dung thu tu keywords truyen vao.
async function trendsBatch(keywords, { geo, hl, cookie }) {
  const comparisonItem = keywords.map((kw) => ({ keyword: kw, geo, time: "today 12-m" }));
  const req = { comparisonItem, category: 0, property: "" };
  const exploreUrl =
    `https://trends.google.com/trends/api/explore?hl=${encodeURIComponent(hl)}&tz=-420` +
    `&req=${encodeURIComponent(JSON.stringify(req))}`;
  const ex = await fetchText(exploreUrl, { cookie });
  if (!ex.ok) { const e = new Error("Trends explore HTTP " + ex.status); e.status = ex.status; throw e; }
  let widgets;
  try { widgets = JSON.parse(stripXssi(ex.text)).widgets; } catch { throw new Error("Trends explore parse loi"); }
  const w = (widgets || []).find((x) => x.id === "TIMESERIES");
  if (!w || !w.token || !w.request) throw new Error("Trends thieu widget TIMESERIES");

  const dataUrl =
    `https://trends.google.com/trends/api/widgetdata/multiline?hl=${encodeURIComponent(hl)}&tz=-420` +
    `&req=${encodeURIComponent(JSON.stringify(w.request))}&token=${encodeURIComponent(w.token)}`;
  const dr = await fetchText(dataUrl, { cookie });
  if (!dr.ok) { const e = new Error("Trends data HTTP " + dr.status); e.status = dr.status; throw e; }
  let timeline;
  try { timeline = JSON.parse(stripXssi(dr.text)).default.timelineData; } catch { throw new Error("Trends data parse loi"); }
  return meansFromTimeline(timeline || [], keywords.length);
}

// keywords: mang tu khoa (da lowercase). Tra Map kw -> trend (0-100, so nguyen) hoac bo qua neu that bai.
// Chuan hoa giua cac lo bang 1 tu khoa "neo" (keywords[0]) co mat o MOI lo.
export async function googleTrends(keywords, { gl = "vn", hl = "vi", cap = 30 } = {}) {
  const out = new Map();
  const list = Array.from(new Set(keywords.map((k) => String(k || "").trim()).filter(Boolean))).slice(0, cap);
  if (list.length < 1) return out;
  const geo = String(gl || "vn").toUpperCase();
  const cookie = await getTrendsCookie();

  const anchor = list[0];
  const rest = list.slice(1);
  // Neu chi 1 tu khoa: so voi chinh no -> 100.
  if (!rest.length) { out.set(anchor.toLowerCase(), 100); return out; }

  // Chia lo: moi lo = [anchor, ...toi da 4 tu khac]
  const batches = [];
  for (let i = 0; i < rest.length; i += 4) batches.push([anchor, ...rest.slice(i, i + 4)]);

  const scaled = new Map(); // kw -> diem da chuan hoa (theo anchor)
  let refAnchor = 0; // gia tri anchor lam moc (lay tu lo dau co du lieu)

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    let means;
    try { means = await trendsBatch(batch, { geo, hl, cookie }); }
    catch (e) { if (e.status === 429) await sleep(1500); continue; }
    const anchorMean = means[0] || 0;
    if (refAnchor === 0 && anchorMean > 0) refAnchor = anchorMean;
    const factor = anchorMean > 0 && refAnchor > 0 ? refAnchor / anchorMean : 1;
    scaled.set(anchor.toLowerCase(), refAnchor || anchorMean);
    for (let k = 1; k < batch.length; k++) {
      const kw = batch[k].toLowerCase();
      scaled.set(kw, (means[k] || 0) * factor);
    }
    if (b < batches.length - 1) await sleep(1200); // ne rate-limit
  }

  // Rescale toan bo ve 0-100 theo max.
  let max = 0;
  scaled.forEach((v) => { if (v > max) max = v; });
  if (max <= 0) return out;
  scaled.forEach((v, kw) => out.set(kw, Math.max(1, Math.round((v / max) * 100))));
  return out;
}

// ---- Bing Webmaster Keyword Research (can API key free) ----
// Tra Map kw -> so luot tim kiem/thang (Impressions). Chay tuan tu theo lo nho.
export async function bingVolume(keywords, { key, gl = "vn", hl = "vi", cap = 120 } = {}) {
  const out = new Map();
  const apiKey = String(key || "").trim();
  if (!apiKey) return out;
  const list = Array.from(new Set(keywords.map((k) => String(k || "").trim().toLowerCase()).filter(Boolean))).slice(0, cap);
  const country = String(gl || "vn").toLowerCase();
  const language = `${String(hl || "vi").toLowerCase()}-${String(gl || "vn").toUpperCase()}`;

  const one = async (kw) => {
    const url =
      `https://ssl.bing.com/webmaster/api.svc/json/GetKeyword?apikey=${encodeURIComponent(apiKey)}` +
      `&q=${encodeURIComponent(kw)}&country=${encodeURIComponent(country)}&language=${encodeURIComponent(language)}`;
    try {
      const { ok, text } = await fetchText(url, { timeout: 12000 });
      if (!ok) return;
      const data = JSON.parse(text);
      const d = data && data.d;
      const imp = d && (d.Impressions ?? d.impressions);
      if (Number.isFinite(Number(imp))) out.set(kw, Number(imp));
    } catch { /* bo qua tu khoa loi */ }
  };

  for (let i = 0; i < list.length; i += 5) {
    await Promise.all(list.slice(i, i + 5).map(one));
  }
  return out;
}

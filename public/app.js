// SeoShark frontend logic
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

let session = { id: null, result: null };

// --- Cau hinh engine ---
const ENGINES = {
  local: {
    needKey: false,
    models: [],
    hint: "Local chạy ngay, không cần tài khoản/key. Phù hợp khi từ khóa đã có sẵn trong bài.",
  },
  gemini: {
    needKey: true,
    keyLabel: "Gemini API Key (miễn phí)",
    keyPlaceholder: "AIza... (lấy free tại aistudio.google.com)",
    keyHelp: 'Lấy key MIỄN PHÍ tại <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">aistudio.google.com/app/apikey</a> — không cần thẻ, không nạp tiền.',
    models: [
      ["gemini-3.5-flash", "Gemini 3.5 Flash (FREE — mới nhất, khuyên dùng)"],
      ["gemini-3.1-flash-lite", "Gemini 3.1 Flash-Lite (FREE — nhanh)"],
      ["gemini-2.5-flash", "Gemini 2.5 Flash (FREE — ổn định)"],
      ["gemini-2.5-flash-lite", "Gemini 2.5 Flash-Lite (FREE — rẻ nhất)"],
      ["gemini-3.1-pro-preview", "Gemini 3.1 Pro (⚠ cần bật billing)"],
      ["gemini-2.5-pro", "Gemini 2.5 Pro (⚠ cần bật billing)"],
    ],
    hint: "Dùng model FREE (Flash) là đủ. Nếu model chọn không khả dụng/hết quota, công cụ TỰ chuyển sang Flash free khác.",
  },
  claude: {
    needKey: true,
    keyLabel: "Anthropic API Key (trả phí)",
    keyPlaceholder: "sk-ant-...",
    keyHelp: 'Cần tài khoản có credit. Lấy tại <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>.',
    models: [
      ["claude-sonnet-4-6", "Claude Sonnet 4.6 (cân bằng)"],
      ["claude-opus-4-8", "Claude Opus 4.8 (cao nhất)"],
      ["claude-haiku-4-5-20251001", "Claude Haiku 4.5 (rẻ, nhanh)"],
    ],
    hint: "Chất lượng cao nhất nhưng tốn credit.",
  },
};

function applyEngine(engine) {
  const cfg = ENGINES[engine] || ENGINES.local;
  $("#engineHint").textContent = cfg.hint;

  // Key field
  if (cfg.needKey) {
    $("#keyWrap").classList.remove("hidden");
    $("#keyLabel").textContent = cfg.keyLabel;
    $("#apiKey").placeholder = cfg.keyPlaceholder;
    $("#keyHelp").innerHTML = cfg.keyHelp;
    $("#apiKey").value = localStorage.getItem("seoshark_key_" + engine) || "";
  } else {
    $("#keyWrap").classList.add("hidden");
  }

  // Model field
  const mw = $("#modelWrap");
  const sel = $("#model");
  if (cfg.models.length) {
    mw.classList.remove("hidden");
    sel.innerHTML = cfg.models.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
    const saved = localStorage.getItem("seoshark_model_" + engine);
    // Cho phep chon moi model (ke ca Pro neu user co tai khoan tra phi)
    if (saved && cfg.models.some(([v]) => v === saved)) sel.value = saved;
  } else {
    mw.classList.add("hidden");
  }

  // Engine pill o topbar
  const pill = {
    local: ["Local", "var(--green)"],
    gemini: ["Gemini", "var(--brand)"],
    claude: ["Claude", "var(--coral)"],
  }[engine] || ["Local", "var(--green)"];
  const pt = $("#enginePillText"), pd = $("#enginePillDot");
  if (pt) pt.textContent = pill[0];
  if (pd) pd.style.background = pill[1];
}

// --- MENU (chuyen muc) ---
function showSection(section, title) {
  $$(".section").forEach((s) => s.classList.remove("active"));
  const el = $(`.section[data-section="${section}"]`);
  if (el) el.classList.add("active");
  $("#sectionTitle").textContent = title;
}
const SECTION_TITLES = { "internal-link": "Tối ưu Internal link", "onpage": "Tối ưu Onpage", "serp": "Check Index & Thứ hạng", "share": "Tự động Share Link" };
$$("#menu .menu-item").forEach((mi) => {
  mi.addEventListener("click", () => {
    $$("#menu .menu-item").forEach((x) => x.classList.remove("active"));
    mi.classList.add("active");
    const sec = mi.dataset.section;
    if (sec === "soon") {
      const name = mi.dataset.name || "Tính năng sắp ra mắt";
      $("#soonName").textContent = name;
      showSection("soon", name);
    } else {
      showSection(sec, SECTION_TITLES[sec] || sec);
    }
  });
});

// --- Khoi phuc cau hinh da luu ---
$("#sitemapUrl").value = localStorage.getItem("seoshark_sitemap") || "";
$("#engine").value = localStorage.getItem("seoshark_engine") || "local";
applyEngine($("#engine").value);

// Bam engine pill -> mo bang cau hinh engine
document.querySelector(".engine-pill").addEventListener("click", () => {
  const d = $("#engineBox");
  d.open = true;
  d.scrollIntoView({ behavior: "smooth", block: "center" });
});

// --- TRANG THAI KET NOI ENGINE ---
let isAuthed = false;
let connTimer = null;
function setConn(state, text) {
  const s = $("#engineStatus");
  if (s) {
    s.textContent = text;
    s.style.color = state === "ok" ? "var(--green)" : state === "fail" ? "var(--red)" : "var(--muted)";
  }
  const dot = $("#enginePillDot");
  if (dot) dot.style.background = state === "ok" ? "var(--green)" : state === "fail" ? "var(--red)" : "var(--amber)";
}
async function checkEngineConn() {
  const engine = $("#engine").value;
  if (engine === "local") { setConn("ok", "● Sẵn sàng (offline, không cần key)"); return; }
  const key = $("#apiKey").value.trim();
  if (!key) { setConn("idle", "Chưa nhập API key"); return; }
  if (!isAuthed) { setConn("idle", "Đăng nhập để kiểm tra kết nối"); return; }
  setConn("checking", "⏳ Đang kiểm tra kết nối...");
  try {
    const res = await _fetch("/api/engine/check", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engine, apiKey: key, model: $("#model").value || undefined }),
    });
    const d = await res.json();
    if (d.ok) setConn("ok", "✓ " + d.label);
    else setConn("fail", "✗ " + (d.error || "Không kết nối được"));
  } catch (e) { setConn("fail", "✗ " + e.message); }
}
function checkConnDebounced() { clearTimeout(connTimer); connTimer = setTimeout(checkEngineConn, 700); }
$("#engineCheckBtn").addEventListener("click", checkEngineConn);
checkEngineConn();

$("#engine").addEventListener("change", (e) => {
  localStorage.setItem("seoshark_engine", e.target.value);
  applyEngine(e.target.value);
  checkEngineConn();
});
$("#model").addEventListener("change", (e) =>
  localStorage.setItem("seoshark_model_" + $("#engine").value, e.target.value)
);
$("#apiKey").addEventListener("change", (e) => {
  localStorage.setItem("seoshark_key_" + $("#engine").value, e.target.value.trim());
  checkEngineConn();
});
$("#apiKey").addEventListener("input", checkConnDebounced);
$("#sitemapUrl").addEventListener("change", (e) => localStorage.setItem("seoshark_sitemap", e.target.value.trim()));

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1800);
}
function alertHtml(type, msg) {
  return `<div class="alert ${type}">${msg}</div>`;
}
function esc(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function busy(btn, on, label) {
  if (on) {
    btn.dataset.label = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span>${label || "Đang xử lý..."}`;
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.label;
    btn.disabled = false;
  }
}

// --- PHAN TICH ---
$("#btnAnalyze").addEventListener("click", async () => {
  const url = $("#articleUrl").value.trim();
  const sitemapUrl = $("#sitemapUrl").value.trim();
  const msg = $("#analyzeMsg");
  msg.innerHTML = "";
  if (!url) { msg.innerHTML = alertHtml("err", "Hãy nhập URL bài viết."); return; }

  const btn = $("#btnAnalyze");
  busy(btn, true, "Đang đọc bài viết & sitemap...");
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, sitemapUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Lỗi không xác định");

    session.id = data.id;
    renderArticle(data);
    $("#articleCard").classList.remove("hidden");
    $("#optionsCard").classList.remove("hidden");
    $("#resultCard").classList.add("hidden");
    msg.innerHTML = "";
    $("#articleCard").scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    msg.innerHTML = alertHtml("err", "❌ " + e.message);
  } finally {
    busy(btn, false);
  }
});

function renderArticle(d) {
  $("#aTitle").textContent = d.title || "(không có tiêu đề)";
  $("#aTargetBadge").textContent = `${d.targetCount} URL trong sitemap`;
  $("#aStats").innerHTML = `
    <div class="stat"><b>${d.wordCount.toLocaleString("vi")}</b><span>Số từ</span></div>
    <div class="stat"><b>${d.blockCount}</b><span>Đoạn / khối</span></div>
    <div class="stat"><b>${d.pooledCount}</b><span>URL đích liên quan</span></div>
    <div class="stat"><b>${d.blocks.filter(b=>b.isSapo||b.isConclusion).length}</b><span>Khối bị khóa</span></div>`;

  $("#aBlocks").innerHTML = d.blocks.map((b) => {
    let badge = "";
    if (b.isSapo) badge = `<span class="badge sapo">SAPO</span> `;
    else if (b.isConclusion) badge = `<span class="badge ket">KẾT BÀI</span> `;
    const locked = b.isSapo || b.isConclusion ? " locked" : "";
    return `<div class="blk${locked}"><span class="tg">#${b.i} ${b.tag}</span>${badge}${esc(b.text).slice(0, 240)}</div>`;
  }).join("");
}

// --- TU KHOA ROWS ---
function addKwRow(keyword = "", url = "") {
  const div = document.createElement("div");
  div.className = "kw-row";
  div.innerHTML = `
    <input type="text" class="kw" placeholder="Từ khóa / anchor" value="${esc(keyword)}" />
    <input type="text" class="kwurl" placeholder="URL đích (tùy chọn)" value="${esc(url)}" />
    <button class="ghost small grow0" type="button" title="Xóa">✕</button>`;
  div.querySelector("button").addEventListener("click", () => div.remove());
  $("#kwRows").appendChild(div);
}
$("#btnAddKw").addEventListener("click", () => addKwRow());
addKwRow();

function commonPayload() {
  const engine = $("#engine").value;
  return {
    id: session.id,
    engine,
    apiKey: $("#apiKey").value.trim() || undefined,
    model: $("#model").value || undefined,
  };
}

// --- PHUONG AN 1: TU DONG ---
$("#btnAuto").addEventListener("click", async () => {
  const count = parseInt($("#autoCount").value, 10) || 3;
  await runOptimize({ ...commonPayload(), mode: "auto", count }, $("#btnAuto"));
});

// --- PHUONG AN 2: TU KHOA ---
$("#btnKw").addEventListener("click", async () => {
  const keywords = $$("#kwRows .kw-row").map((r) => ({
    keyword: r.querySelector(".kw").value.trim(),
    url: r.querySelector(".kwurl").value.trim(),
  })).filter((k) => k.keyword);
  if (!keywords.length) {
    $("#optMsg").innerHTML = alertHtml("err", "Hãy nhập ít nhất 1 từ khóa.");
    return;
  }
  // URL nguoi dung nhap tay -> bo sung vao pool
  const extraTargets = keywords.filter((k) => k.url).map((k) => ({ url: k.url, title: k.keyword }));
  await runOptimize({ ...commonPayload(), mode: "keywords", keywords, extraTargets }, $("#btnKw"));
});

async function runOptimize(payload, btn) {
  $("#optMsg").innerHTML = "";
  if (!session.id) { $("#optMsg").innerHTML = alertHtml("err", "Hãy phân tích bài viết trước."); return; }
  busy(btn, true, "Claude đang chèn link...");
  try {
    const res = await fetch("/api/optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Lỗi không xác định");
    session.result = data;
    renderResult(data);
    $("#resultCard").classList.remove("hidden");
    $("#resultCard").scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    $("#optMsg").innerHTML = alertHtml("err", "❌ " + e.message);
  } finally {
    busy(btn, false);
  }
}

function renderResult(d) {
  const meta = [`Chế độ: ${d.mode === "auto" ? "Tự động" : "Theo từ khóa"}`, `Engine: ${d.engine}`];
  if (d.usage) meta.push(`Tokens: ${d.usage.input_tokens || 0} in / ${d.usage.output_tokens || 0} out`);
  $("#resMeta").textContent = meta.join(" · ");

  let alerts = alertHtml("info", `✅ Đã chèn <b>${d.insertedCount}</b> internal link.`);
  if (d.notes) alerts += alertHtml("warn", "📌 Ghi chú: " + esc(d.notes));
  if (d.skipped && d.skipped.length) {
    alerts += alertHtml("warn", `⚠️ Bỏ qua ${d.skipped.length} đề xuất vi phạm: ` +
      d.skipped.map((s) => esc(s.why)).join("; "));
  }
  $("#resAlerts").innerHTML = alerts;

  // Bang doi chieu
  if (!d.table.length) {
    $("#tableWrap").innerHTML = alertHtml("warn", "Không có link nào được chèn. Thử tăng số lượng / đổi từ khóa / kiểm tra sitemap.");
  } else {
    $("#tableWrap").innerHTML = `<table class="cmp">
      <thead><tr>
        <th>#</th><th>Anchor</th><th>URL đích</th><th>Từ khóa</th>
        <th>Trước</th><th>Sau</th><th>Viết thêm?</th><th>Ngữ cảnh</th>
      </tr></thead><tbody>
      ${d.table.map((r, i) => `<tr>
        <td>${i + 1}</td>
        <td><b>${esc(r.anchor)}</b></td>
        <td><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url)}</a></td>
        <td>${esc(r.keyword) || "—"}</td>
        <td class="snip">${esc(r.beforeSnippet).slice(0, 180)}</td>
        <td class="snip-after">${highlightAnchor(r.afterSnippet, r.anchor)}</td>
        <td>${r.addedContent ? '<span class="badge sapo">Có</span>' : "—"}</td>
        <td>${esc(r.reason)}</td>
      </tr>`).join("")}
      </tbody></table>`;
  }

  // Render truoc/sau
  $("#renderBefore").innerHTML = d.beforeHtml;
  $("#renderAfter").innerHTML = d.afterHtml;
  $("#anchorChips").innerHTML = buildChips(d.table, "renderAfter");

  // Code
  $("#codeBeforeHtml").textContent = formatHtml(d.beforeHtml);
  $("#codeAfterHtml").textContent = formatHtml(d.afterHtml);
  $("#codeBeforeMd").textContent = d.beforeMarkdown;
  $("#codeAfterMd").textContent = d.afterMarkdown;
}

function highlightAnchor(text, anchor) {
  const t = esc(text).slice(0, 220);
  if (!anchor) return t;
  const a = esc(anchor);
  return t.replace(a, `<mark>${a}</mark>`);
}

// Xuong dong tho cho de doc khoi code HTML
function formatHtml(html) {
  return (html || "")
    .replace(/></g, ">\n<")
    .replace(/(<\/(p|h[1-6]|li|ul|ol|blockquote)>)/g, "$1\n");
}

// --- FEATURE TABS (Internal / Incoming) ---
$$("#featureTabs .tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$("#featureTabs .tab").forEach((t) => t.classList.remove("active"));
    $$(".featpane").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $(`.featpane[data-featpane="${tab.dataset.feat}"]`).classList.add("active");
  });
});

// --- RESULT TABS (internal) ---
$$("#resTabs .tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$("#resTabs .tab").forEach((t) => t.classList.remove("active"));
    $("#resultCard").querySelectorAll(".tabpane").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $(`#resultCard .tabpane[data-pane="${tab.dataset.tab}"]`).classList.add("active");
  });
});

// --- COPY (internal + incoming) ---
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-copy]");
  if (btn) {
    if (session.result) navigator.clipboard.writeText(session.result[btn.dataset.copy] || "").then(() => toast("Đã copy!"));
    return;
  }
  const ibtn = e.target.closest("[data-inccopy]");
  if (ibtn && incSession.results) {
    const [idx, field] = ibtn.dataset.inccopy.split("|");
    const r = incSession.results[+idx];
    if (r) navigator.clipboard.writeText(r[field] || "").then(() => toast("Đã copy!"));
  }
});

// --- CHIP NHẢY TỚI ANCHOR ---
function buildChips(rows, scopeId) {
  if (!rows || !rows.length) return "";
  const chips = rows.map((r, i) =>
    `<button class="chip-jump" data-jump-scope="${scopeId}" data-jump-anchor="${esc(r.anchor)}" data-jump-url="${esc(r.url)}">🔗 ${esc(r.anchor) || ("link " + (i + 1))}</button>`
  ).join("");
  return `<span class="lbl">Nhảy tới:</span>${chips}`;
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-jump-scope]");
  if (!b) return;
  const scope = document.getElementById(b.dataset.jumpScope);
  if (!scope) return;
  const anchor = (b.dataset.jumpAnchor || "").trim();
  const url = b.dataset.jumpUrl || "";
  const links = Array.from(scope.querySelectorAll("a"));
  const el =
    links.find((a) => a.textContent.trim() === anchor && a.getAttribute("href") === url) ||
    links.find((a) => a.textContent.trim() === anchor) ||
    links.find((a) => a.getAttribute("href") === url);
  if (el) {
    // mo cac <details> cha neu dang dong
    let p = el.parentElement;
    while (p) { if (p.tagName === "DETAILS") p.open = true; p = p.parentElement; }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("jumped");
    void el.offsetWidth;
    el.classList.add("jumped");
  } else {
    toast("Không tìm thấy anchor trong nội dung");
  }
});

// ==================== INCOMING LINK ====================
let incSession = { id: null, target: null, results: null, suggestions: [] };

$("#incSitemapUrl").value = localStorage.getItem("seoshark_sitemap") || "";

// Buoc 1: Phan tich URL dich
$("#btnIncAnalyze").addEventListener("click", async () => {
  const targetUrl = $("#incTargetUrl").value.trim();
  const sitemapUrl = $("#incSitemapUrl").value.trim();
  const msg = $("#incAnalyzeMsg");
  msg.innerHTML = "";
  if (!targetUrl) { msg.innerHTML = alertHtml("err", "Hãy nhập URL đích."); return; }

  const btn = $("#btnIncAnalyze");
  busy(btn, true, "Đang đọc bài viết & sitemap...");
  try {
    const res = await fetch("/api/incoming/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUrl, sitemapUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Lỗi không xác định");

    incSession.id = data.id;
    incSession.target = data.target;
    incSession.suggestions = data.suggestions || [];
    renderIncTarget(data);
    $("#incTargetCard").classList.remove("hidden");
    $("#incOptionsCard").classList.remove("hidden");
    $("#incResultCard").classList.add("hidden");
    $("#incTargetCard").scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    msg.innerHTML = alertHtml("err", "❌ " + e.message);
  } finally {
    busy(btn, false);
  }
});

function renderIncTarget(d) {
  $("#incTargetTitle").textContent = d.target.title || d.target.url;
  $("#incSitemapBadge").textContent = `${d.sitemapCount} bài trong sitemap`;
  $("#incStats").innerHTML = `
    <div class="stat"><b>${(d.target.wordCount || 0).toLocaleString("vi")}</b><span>Số từ</span></div>
    <div class="stat"><b>${d.suggestions.length}</b><span>Bài cùng chủ đề</span></div>
    <div class="stat"><b>${d.sitemapCount}</b><span>Tổng bài sitemap</span></div>`;
  $("#incDefaultAnchor").value = d.defaultAnchorSuggestion || "";

  // Goi y bai nguon (bam de them vao PA2)
  if (!d.suggestions.length) {
    $("#incSuggestions").innerHTML = alertHtml("warn", "Không đọc được sitemap. Hãy nhập URL bài nguồn thủ công.");
  } else {
    $("#incSuggestions").innerHTML = d.suggestions.map((s) => `
      <div class="sug-row">
        <button class="ghost small grow0" type="button" data-addsrc="${esc(s.url)}">+ Thêm</button>
        <div class="sug-main">
          <div><b>${esc(s.title)}</b> <span class="badge ${s.score > 0 ? "ok" : "ket"} score">điểm ${s.score}</span></div>
          <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>
        </div>
      </div>`).join("");
  }

  // reset rows PA2
  $("#incKwRows").innerHTML = "";
  addIncKwRow();
}

function addIncKwRow(url = "", anchor = "") {
  const div = document.createElement("div");
  div.className = "kw-row";
  div.innerHTML = `
    <input type="text" class="src-url" placeholder="URL bài nguồn (https://...)" style="flex:2" value="${esc(url)}" />
    <input type="text" class="src-anchor" placeholder="Anchor (trống = mặc định)" style="flex:1" value="${esc(anchor)}" />
    <button class="ghost small grow0" type="button" title="Xóa">✕</button>`;
  div.querySelector("button").addEventListener("click", () => div.remove());
  $("#incKwRows").appendChild(div);
}
$("#incAddKw").addEventListener("click", () => addIncKwRow());

// Bam "+ Thêm" o goi y -> them 1 dong vao PA2 (dien san URL)
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-addsrc]");
  if (!b) return;
  // tranh trung URL
  const exists = $$("#incKwRows .src-url").some((i) => i.value.trim() === b.dataset.addsrc);
  if (!exists) {
    const empty = $$("#incKwRows .kw-row").find((r) => !r.querySelector(".src-url").value.trim());
    if (empty) empty.querySelector(".src-url").value = b.dataset.addsrc;
    else addIncKwRow(b.dataset.addsrc);
  }
  toast("Đã thêm vào Phương án 2");
});

async function runIncInsert(sources, btn) {
  const msg = $("#incOptMsg");
  msg.innerHTML = "";
  if (!incSession.id) { msg.innerHTML = alertHtml("err", "Hãy phân tích bài viết trước."); return; }
  if (!sources.length) { msg.innerHTML = alertHtml("err", "Không có bài nguồn nào."); return; }

  const payload = {
    id: incSession.id,
    sources,
    defaultAnchor: $("#incDefaultAnchor").value.trim(),
    engine: $("#engine").value,
    apiKey: $("#apiKey").value.trim() || undefined,
    model: $("#model").value || undefined,
  };
  busy(btn, true, `Đang chèn vào ${Math.min(sources.length, 10)} bài...`);
  try {
    const res = await fetch("/api/incoming/insert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Lỗi không xác định");
    incSession.results = data.results;
    renderIncResults(data);
    $("#incResultCard").classList.remove("hidden");
    $("#incResultCard").scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    msg.innerHTML = alertHtml("err", "❌ " + e.message);
  } finally {
    busy(btn, false);
  }
}

// PA1: tu dong - lay top N bai goi y
$("#btnIncAuto").addEventListener("click", () => {
  const n = Math.max(1, Math.min(10, parseInt($("#incAutoCount").value, 10) || 5));
  if (!incSession.suggestions.length) {
    $("#incOptMsg").innerHTML = alertHtml("warn", "Không có bài gợi ý từ sitemap. Hãy dùng Phương án 2 (nhập URL thủ công).");
    return;
  }
  const sources = incSession.suggestions.slice(0, n).map((s) => ({ url: s.url, anchor: "" }));
  runIncInsert(sources, $("#btnIncAuto"));
});

// PA2: theo tu khoa - tu cac dong nhap
$("#btnIncKw").addEventListener("click", () => {
  const sources = $$("#incKwRows .kw-row")
    .map((r) => ({ url: r.querySelector(".src-url").value.trim(), anchor: r.querySelector(".src-anchor").value.trim() }))
    .filter((s) => /^https?:\/\//i.test(s.url));
  if (!sources.length) {
    $("#incOptMsg").innerHTML = alertHtml("err", "Hãy nhập ít nhất 1 URL bài nguồn (bấm gợi ý hoặc dán URL).");
    return;
  }
  runIncInsert(sources, $("#btnIncKw"));
});

function renderIncResults(d) {
  const okCount = d.results.filter((r) => r.ok).length;
  const totalLinks = d.results.reduce((s, r) => s + (r.insertedCount || 0), 0);
  $("#incResMeta").textContent = `${okCount}/${d.processed} bài thành công · ${totalLinks} link trỏ về URL đích`;

  let html = "";
  if (d.truncated) html += alertHtml("warn", "⚠️ Chỉ xử lý 10 bài đầu tiên mỗi lần (giới hạn để tránh chậm & rate limit).");

  html += d.results.map((r, idx) => {
    if (!r.ok) {
      return `<div class="src-card"><div class="src-head"><div class="surl">${esc(r.url)}</div></div>
        <div class="src-body">${alertHtml("err", "❌ " + esc(r.error))}</div></div>`;
    }
    const rows = (r.table || []).map((t, i) => `<tr>
        <td>${i + 1}</td>
        <td><b>${esc(t.anchor)}</b></td>
        <td>${esc(t.beforeSnippet).slice(0, 160)}</td>
        <td class="snip-after">${highlightAnchor(t.afterSnippet, t.anchor)}</td>
        <td>${t.addedContent ? '<span class="badge sapo">Có</span>' : "—"}</td>
      </tr>`).join("");
    const tableHtml = r.table && r.table.length
      ? `<table class="cmp"><thead><tr><th>#</th><th>Anchor</th><th>Đoạn TRƯỚC</th><th>Đoạn SAU (đã chèn)</th><th>Viết thêm?</th></tr></thead><tbody>${rows}</tbody></table>`
      : alertHtml("warn", "Không chèn được link vào bài này.");
    const noteHtml = r.notes ? alertHtml("warn", "📌 " + esc(r.notes)) : "";
    return `<div class="src-card">
      <div class="src-head">
        <div class="stitle">📄 ${esc(r.title || r.url)} <span class="badge ok">${r.insertedCount} link</span></div>
        <div class="surl">${esc(r.url)} &nbsp;·&nbsp; engine: ${esc(r.engine || "")}</div>
      </div>
      <div class="src-body">
        ${noteHtml}
        <p class="muted" style="margin:0 0 8px">Các đoạn đã chèn link trỏ về <b>${esc(d.target.title || d.target.url)}</b>:</p>
        ${tableHtml}
        <details style="margin-top:14px" open>
          <summary style="cursor:pointer;font-weight:700;font-size:13px;color:var(--brand-dark)">Xem bản gốc trước / sau khi chèn</summary>
          <div class="chips" style="margin-top:10px">${buildChips(r.table, "inc-after-" + idx)}</div>
          <div class="split">
            <div class="pane"><div class="ph">Bản gốc (TRƯỚC)</div><div class="render">${r.beforeHtml}</div></div>
            <div class="pane after"><div class="ph">Đã chèn link (SAU) <button class="ghost small" data-inccopy="${idx}|afterHtml">Copy HTML</button></div><div class="render" id="inc-after-${idx}">${r.afterHtml}</div></div>
          </div>
        </details>
        <details style="margin-top:10px">
          <summary style="cursor:pointer;font-weight:700;font-size:13px;color:var(--brand-dark)">Xem mã HTML / Markdown (trước &amp; sau)</summary>
          <div class="split" style="margin-top:10px">
            <div class="pane"><div class="ph">HTML — TRƯỚC <button class="ghost small" data-inccopy="${idx}|beforeHtml">Copy</button></div><pre class="code">${esc(formatHtml(r.beforeHtml))}</pre></div>
            <div class="pane after"><div class="ph">HTML — SAU <button class="ghost small" data-inccopy="${idx}|afterHtml">Copy</button></div><pre class="code">${esc(formatHtml(r.afterHtml))}</pre></div>
          </div>
          <div class="split" style="margin-top:10px">
            <div class="pane"><div class="ph">Markdown — TRƯỚC <button class="ghost small" data-inccopy="${idx}|beforeMarkdown">Copy</button></div><pre class="code">${esc(r.beforeMarkdown)}</pre></div>
            <div class="pane after"><div class="ph">Markdown — SAU <button class="ghost small" data-inccopy="${idx}|afterMarkdown">Copy</button></div><pre class="code">${esc(r.afterMarkdown)}</pre></div>
          </div>
        </details>
      </div>
    </div>`;
  }).join("");

  $("#incResults").innerHTML = html;
}

// ==================== AUTH (ĐĂNG NHẬP) ====================
let pendingRegEmail = "";

// Bat moi 401 -> hien lai man dang nhap
const _fetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const res = await _fetch(...args);
  try {
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    if (res.status === 401 && !url.includes("/api/auth/")) showAuth();
  } catch {}
  return res;
};

function showAuth() { $("#authOverlay").classList.add("show"); }
function hideAuth() { $("#authOverlay").classList.remove("show"); }
function setAuthMsg(type, msg) { $("#authMsg").innerHTML = msg ? alertHtml(type, msg) : ""; }

function switchAtab(name) {
  $$(".atab").forEach((t) => t.classList.toggle("active", t.dataset.atab === name));
  $$(".auth-form").forEach((f) => f.classList.toggle("active", f.dataset.aform === name));
  setAuthMsg();
}
function showAform(name) {
  $$(".auth-form").forEach((f) => f.classList.toggle("active", f.dataset.aform === name));
}

$$(".atab").forEach((t) => t.addEventListener("click", () => switchAtab(t.dataset.atab)));
$("#backToRegister").addEventListener("click", () => { switchAtab("register"); });

function applyUser(user) {
  $("#userChip").style.display = "inline-flex";
  $("#userEmail").textContent = user.email;
  $("#userAvatar").textContent = (user.name || user.email || "U").trim().charAt(0) || "U";
  isAuthed = true;
  checkEngineConn();
}

async function checkAuth() {
  try {
    const res = await _fetch("/api/auth/me");
    if (res.ok) {
      const d = await res.json();
      applyUser(d.user);
      hideAuth();
      return;
    }
  } catch {}
  showAuth();
}

// Đăng nhập
$('[data-aform="login"]').addEventListener("submit", async (e) => {
  e.preventDefault();
  setAuthMsg();
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;
  const btn = $("#btnLogin");
  busy(btn, true, "Đang đăng nhập...");
  try {
    const res = await _fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Đăng nhập thất bại");
    applyUser(d.user);
    hideAuth();
    toast("Xin chào " + (d.user.name || d.user.email) + "!");
  } catch (err) {
    setAuthMsg("err", "❌ " + err.message);
  } finally { busy(btn, false); }
});

// Đăng ký -> gửi mã
$('[data-aform="register"]').addEventListener("submit", async (e) => {
  e.preventDefault();
  setAuthMsg();
  const name = $("#regName").value.trim();
  const email = $("#regEmail").value.trim();
  const password = $("#regPassword").value;
  const btn = $("#btnRegister");
  busy(btn, true, "Đang gửi mã...");
  try {
    const res = await _fetch("/api/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Đăng ký thất bại");
    pendingRegEmail = email;
    $("#verifyEmailLabel").textContent = email;
    showAform("verify");
    setAuthMsg("info", "✉️ " + d.message);
  } catch (err) {
    setAuthMsg("err", "❌ " + err.message);
  } finally { busy(btn, false); }
});

// Xác nhận mã -> tạo tài khoản
$('[data-aform="verify"]').addEventListener("submit", async (e) => {
  e.preventDefault();
  setAuthMsg();
  const code = $("#verifyCode").value.trim();
  const btn = $("#btnVerify");
  busy(btn, true, "Đang xác nhận...");
  try {
    const res = await _fetch("/api/auth/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pendingRegEmail, code }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Xác nhận thất bại");
    applyUser(d.user);
    hideAuth();
    toast("Tạo tài khoản thành công!");
  } catch (err) {
    setAuthMsg("err", "❌ " + err.message);
  } finally { busy(btn, false); }
});

// Gửi lại mã
$("#btnResend").addEventListener("click", async () => {
  if (!pendingRegEmail) return;
  setAuthMsg();
  const btn = $("#btnResend");
  busy(btn, true, "Đang gửi...");
  try {
    const res = await _fetch("/api/auth/resend", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pendingRegEmail, name: $("#regName").value.trim() }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Lỗi");
    setAuthMsg("info", "✉️ Đã gửi lại mã xác nhận.");
  } catch (err) {
    setAuthMsg("err", "❌ " + err.message);
  } finally { busy(btn, false); }
});

// Đăng xuất
$("#btnLogout").addEventListener("click", async () => {
  await _fetch("/api/auth/logout", { method: "POST" });
  $("#userChip").style.display = "none";
  isAuthed = false;
  showAuth();
  switchAtab("login");
});

checkAuth();

// ==================== ON-PAGE ====================
let opSession = { id: null, data: null, optimize: null };

// Markdown -> HTML toi gian (de xem ban toi uu)
function mdToHtml(md, markFn) {
  if (!md) return "";
  const e2 = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) => e2(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const wrap = (txt, inner) => (markFn && markFn(txt)) ? `<span class="opnew">${inner}</span>` : inner;
  let html = "", inList = false;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { if (inList) { html += "</ul>"; inList = false; } continue; }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)/))) { if (inList) { html += "</ul>"; inList = false; } html += `<h${m[1].length}>${wrap(m[2], inline(m[2]))}</h${m[1].length}>`; }
    else if ((m = line.match(/^[-*]\s+(.*)/)) || (m = line.match(/^\d+\.\s+(.*)/))) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${wrap(m[1], inline(m[1]))}</li>`; }
    else { if (inList) { html += "</ul>"; inList = false; } html += `<p>${wrap(line, inline(line))}</p>`; }
  }
  if (inList) html += "</ul>";
  return html;
}

// Comp tabs (auto / manual)
$$("#opCompTabs .tab").forEach((t) => t.addEventListener("click", () => {
  $$("#opCompTabs .tab").forEach((x) => x.classList.toggle("active", x === t));
  const manual = t.dataset.comp === "manual";
  $("#opCompManual").classList.toggle("hidden", !manual);
  $("#opCompAuto").classList.toggle("hidden", manual);
}));

function addOpCompRow(url = "") {
  const div = document.createElement("div");
  div.className = "kw-row";
  div.innerHTML = `<input type="text" class="op-comp-url" placeholder="https://doi-thu.com/bai-viet" style="flex:1" value="${esc(url)}" /><button class="ghost small grow0" type="button" title="Xóa">✕</button>`;
  div.querySelector("button").addEventListener("click", () => div.remove());
  $("#opCompRows").appendChild(div);
}
$("#opAddComp").addEventListener("click", () => addOpCompRow());
addOpCompRow();

// Buoc 1: Audit
$("#btnOpAudit").addEventListener("click", async () => {
  const url = $("#opUrl").value.trim();
  const mainKeyword = $("#opMainKw").value.trim();
  const subKeywords = $("#opSubKw").value.trim();
  const msg = $("#opAuditMsg"); msg.innerHTML = "";
  if (!url) { msg.innerHTML = alertHtml("err", "Hãy nhập URL bài viết."); return; }
  if (!mainKeyword) { msg.innerHTML = alertHtml("err", "Hãy nhập từ khóa chính."); return; }

  const manualMode = $("#opCompTabs .tab.active").dataset.comp === "manual";
  const competitors = manualMode
    ? $$("#opCompRows .op-comp-url").map((i) => i.value.trim()).filter((v) => /^https?:\/\//i.test(v))
    : [];

  const btn = $("#btnOpAudit");
  busy(btn, true, "Đang đọc on-page của bạn & đối thủ (có thể mất 20-40s)...");
  try {
    const res = await fetch("/api/onpage/audit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url, mainKeyword, subKeywords, competitors,
        engine: $("#engine").value, apiKey: $("#apiKey").value.trim() || undefined, model: $("#model").value || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Lỗi không xác định");
    opSession.id = data.id; opSession.data = data;
    renderOpResult(data);
    $("#opResultCard").classList.remove("hidden");
    $("#opOptResultCard").classList.add("hidden");
    $("#opResultCard").scrollIntoView({ behavior: "smooth" });
  } catch (e) { msg.innerHTML = alertHtml("err", "❌ " + e.message); }
  finally { busy(btn, false); }
});

function opNorm(s) { return (s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d"); }
function opHasKw(text, kw) { return kw && opNorm(text).includes(opNorm(kw)); }

function renderOpResult(d) {
  const t = d.target;
  const comps = (d.competitors || []).filter((c) => c && c.ok);
  const failed = (d.competitors || []).length - comps.length;
  const kw = d.mainKeyword || "";
  $("#opResMeta").textContent = `Engine: ${d.engineUsed} · ${comps.length} đối thủ`;

  // Thong bao
  let alerts = "";
  if (d.serpMode === "no-serp") alerts += alertHtml("warn", "Chưa cấu hình Google CSE — chưa lấy đối thủ tự động. Hãy dán URL thủ công hoặc cấu hình CSE.");
  else if (String(d.serpMode).startsWith("serp-error")) alerts += alertHtml("warn", "Lấy SERP tự động lỗi: " + esc(d.serpMode.replace("serp-error:", "")) + " — hãy dán URL thủ công.");
  if (failed) alerts += alertHtml("warn", `${failed} URL đối thủ không đọc được (đã bỏ qua).`);
  if (d.summary) alerts += alertHtml("info", "📝 " + esc(d.summary));
  if (d.contentGap && d.contentGap.length) {
    alerts += alertHtml("warn", "🧩 <b>Content gap</b> (đối thủ có, bạn còn thiếu):<ul style='margin:6px 0 0 18px'>" +
      d.contentGap.map((g) => `<li>${esc(g)}</li>`).join("") + "</ul>");
  }
  $("#opSummary").innerHTML = alerts;

  // Trung binh doi thu (de xet "yeu")
  const avg = (f) => comps.length ? Math.round(comps.reduce((s, c) => s + (c[f] || 0), 0) / comps.length) : 0;
  const someComp = (fn) => comps.some(fn);

  const headingsDetail = (a) => a.headings && a.headings.length
    ? a.headings.slice(0, 25).map((h) => `H${h.level}: ${esc(h.text)}`).join("<br>")
    : "(không có heading)";

  // [label, summary(a)->chuoi, detail(a)->html, weak()->bool]
  const CRIT = [
    ["Title tag", (a) => `${a.titleLen} ký tự`, (a) => `"${esc(a.titleTag || "(trống)")}"`, () => !t.titleTag || t.titleLen < 30 || t.titleLen > 65 || !opHasKw(t.titleTag, kw)],
    ["Meta description", (a) => `${a.metaDescLen} ký tự`, (a) => `"${esc(a.metaDescription || "(trống)")}"`, () => !t.metaDescription || t.metaDescLen < 70 || t.metaDescLen > 165 || !opHasKw(t.metaDescription, kw)],
    ["Thẻ H1", (a) => `${a.h1Count}`, (a) => `${a.h1Count} thẻ H1 trên trang`, () => t.h1Count !== 1],
    ["Cấu trúc Heading", (a) => `${a.headingCount} heading`, headingsDetail, () => comps.length > 0 && t.headingCount < avg("headingCount") * 0.7],
    ["Độ dài nội dung", (a) => `${a.wordCount} từ`, (a) => `${a.wordCount} từ trong phần nội dung`, () => comps.length > 0 && t.wordCount < avg("wordCount") * 0.8],
    ["Mật độ từ khóa", (a) => (a.keywordDensity != null ? a.keywordDensity + "%" : "—"), (a) => `${a.keywordCount != null ? a.keywordCount : "?"} lần / ${a.wordCount} từ = ${a.keywordDensity != null ? a.keywordDensity + "%" : "?"} (lý tưởng 1-2%)`, () => t.keywordDensity != null && (t.keywordDensity < 0.5 || t.keywordDensity > 3)],
    ["Alt hình ảnh", (a) => `${a.imagesWithAlt}/${a.images}`, (a) => `${a.imagesWithAlt}/${a.images} ảnh có alt` + (a.altEnough ? " (đủ)" : " (thiếu)"), () => !t.altEnough],
    ["Internal link", (a) => `${a.internalLinks}`, (a) => `${a.internalLinks} liên kết nội bộ`, () => comps.length > 0 && t.internalLinks < avg("internalLinks") * 0.6],
    ["External link", (a) => `${a.externalLinks}`, (a) => `${a.externalLinks} liên kết ra ngoài`, () => t.externalLinks === 0 && someComp((c) => c.externalLinks > 0)],
    ["Schema", (a) => a.hasSchema ? a.schemaTypes.slice(0, 3).join(", ") : "❌", (a) => esc(a.schemaTypes.join(", ") || "không có schema"), () => !t.hasSchema && someComp((c) => c.hasSchema)],
    ["Breadcrumb", (a) => a.breadcrumb ? "✅" : "❌", (a) => a.breadcrumb ? "Có breadcrumb" : "Không có breadcrumb", () => !t.breadcrumb && someComp((c) => c.breadcrumb)],
    ["Canonical", (a) => a.canonicalSelf ? "✅ tự trỏ" : (a.canonical === "(không có)" ? "❌" : "khác"), (a) => esc(a.canonical), () => !t.canonicalSelf],
    ["Meta robots", (a) => (a.metaRobots || "").slice(0, 24), (a) => esc(a.metaRobots), () => /noindex/i.test(t.metaRobots)],
    ["Rich snippet", (a) => a.richSnippet.length ? a.richSnippet.slice(0, 2).join(", ") : "❌", (a) => esc(a.richSnippet.join(", ") || "không có"), () => !t.richSnippet.length && someComp((c) => c.richSnippet.length)],
    ["Video", (a) => a.hasVideo ? "✅ có" : "❌ không", (a) => a.hasVideo ? "Có video/iframe nhúng (YouTube/Vimeo...) hoặc schema VideoObject" : "Không có video", () => !t.hasVideo && someComp((c) => c.hasVideo)],
  ];

  // Bang so sanh: moi tieu chi 1 dong, co checkbox tick + nut mo/dong chi tiet tung doi thu
  const colspan = 3 + comps.length;
  const yourHdr = `<a href="${esc(t.url)}" target="_blank" rel="noopener" title="${esc(t.url)}">${esc(t.host)}</a><br><span class="muted">(trang của bạn)</span>`;
  const head = `<th style="width:32px"></th><th>Tiêu chí</th><th>${yourHdr}</th>` +
    comps.map((c) => `<th title="${esc(c.url)}"><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.host)}</a></th>`).join("");
  const body = CRIT.map(([label, summary, detail, weak], i) => {
    const w = weak();
    const main = `<tr class="op-row">
      <td><input type="checkbox" class="op-rec-check" data-criterion="${esc(label)}" ${w ? "checked" : ""} title="Tick để tối ưu tiêu chí này" /></td>
      <td class="op-critlabel" data-toggle="${i}"><span class="caret">▸</span> <b>${label}</b> ${w ? '<span class="badge sapo">Nên cải thiện</span>' : '<span class="badge ok">OK</span>'}</td>
      <td class="${w ? "op-weak" : ""}">${esc(String(summary(t)))}</td>
      ${comps.map((c) => `<td>${esc(String(summary(c)))}</td>`).join("")}
    </tr>`;
    const det = `<tr class="op-detail hidden" data-detail="${i}"><td colspan="${colspan}">
      <div class="opd"><b>📄 ${esc(t.host)} (bạn):</b> ${detail(t)}</div>
      ${comps.map((c) => `<div class="opd"><b><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.host)}</a>:</b> ${detail(c)}</div>`).join("")}
    </td></tr>`;
    return main + det;
  }).join("");
  $("#opCompareTable").innerHTML = `<table class="cmp op-cmp"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <p class="muted" style="margin-top:8px">Ô <span class="op-weak" style="padding:1px 5px">tô đỏ</span> = bạn đang yếu hơn chuẩn/đối thủ. Bấm tên tiêu chí để xem chi tiết.</p>`;

  // AI phan tich chi tiet (neu co) -> de rieng ben duoi
  if (d.recommendations && d.recommendations.length) {
    const pill = (p) => `<span class="badge ${p === "Cao" ? "sapo" : p === "Thap" ? "ket" : "ok"}">${esc(p || "TB")}</span>`;
    $("#opRecs").innerHTML = `<details><summary style="cursor:pointer;font-weight:700;font-size:13px;color:var(--brand-dark)">💡 Phân tích chi tiết từ AI (${d.recommendations.length} điểm)</summary>` +
      d.recommendations.map((r) => `<div class="rec-item" style="border-style:dashed;margin-top:8px"><div class="rec-body"><label><b>${esc(r.criterion)}</b> ${pill(r.priority)}</label><div class="rec-action">→ ${esc(r.action || "")}</div>${r.why ? `<div class="muted">💡 ${esc(r.why)}</div>` : ""}</div></div>`).join("") +
      `</details>`;
  } else {
    $("#opRecs").innerHTML = "";
  }
}

// Mo/dong chi tiet 1 tieu chi trong bang so sanh
document.addEventListener("click", (e) => {
  const lbl = e.target.closest(".op-critlabel");
  if (!lbl) return;
  const det = document.querySelector(`#opCompareTable [data-detail="${lbl.dataset.toggle}"]`);
  if (det) {
    det.classList.toggle("hidden");
    lbl.closest("tr").classList.toggle("open");
  }
});

$("#opSelectAll").addEventListener("change", (e) => {
  $$("#opCompareTable .op-rec-check").forEach((c) => { c.checked = e.target.checked; });
});

// Buoc 2: Toi uu (viet lai)
$("#btnOpOptimize").addEventListener("click", async () => {
  const msg = $("#opOptMsg"); msg.innerHTML = "";
  if (!opSession.id) { msg.innerHTML = alertHtml("err", "Hãy phân tích trước."); return; }
  const selected = $$("#opCompareTable .op-rec-check:checked").map((c) => c.dataset.criterion);

  const btn = $("#btnOpOptimize");
  busy(btn, true, "AI đang viết lại bài chuẩn SEO...");
  try {
    const res = await fetch("/api/onpage/optimize", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: opSession.id, selected, extra: $("#opExtra").value.trim() || undefined,
        optimizeMode: (document.querySelector('input[name="opMode"]:checked') || {}).value || "full",
        engine: $("#engine").value, apiKey: $("#apiKey").value.trim() || undefined, model: $("#model").value || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Lỗi không xác định");
    opSession.optimize = data;
    if (data.mode === "suggest") renderOpSuggest(data);
    else renderOpOptimize(data);
    $("#opOptResultCard").classList.remove("hidden");
    $("#opOptResultCard").scrollIntoView({ behavior: "smooth" });
  } catch (e) { msg.innerHTML = alertHtml("err", "❌ " + e.message); }
  finally { busy(btn, false); }
});

function opCountWords(md) {
  return (md || "").replace(/[#>*_`~\[\]()-]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
}
function opCountOccur(hay, needle) {
  const H = opNorm(hay), N = opNorm(needle).trim();
  if (!N) return 0;
  return H.split(N).length - 1;
}

function renderOpSuggest(d) {
  $("#opFullResult").classList.add("hidden");
  $("#opSuggestResult").classList.remove("hidden");
  $("#opOptMeta").textContent = `Engine: ${d.engineUsed}`;
  $("#opChanges").innerHTML = alertHtml("info", "💡 Mỗi tiêu chí đã tick có tối đa 3 phương án — chọn cái phù hợp rồi bấm <b>Copy</b> để dùng.");
  const html = (d.suggestions || []).map((s, si) => `
    <div class="src-card">
      <div class="src-head"><div class="stitle">${esc(s.criterion)}</div>${s.note ? `<div class="surl">${esc(s.note)}</div>` : ""}</div>
      <div class="src-body">${(s.options || []).map((o, oi) =>
        `<div class="opd"><b>Phương án ${oi + 1}</b> <button class="ghost small" data-sc="${si}|${oi}">Copy</button><div style="white-space:pre-wrap;margin-top:4px">${esc(o)}</div></div>`
      ).join("") || "(không có phương án)"}</div>
    </div>`).join("");
  $("#opSuggestResult").innerHTML = html || alertHtml("warn", "Không có đề xuất.");
}

function renderOpOptimize(d) {
  $("#opFullResult").classList.remove("hidden");
  $("#opSuggestResult").classList.add("hidden");
  $("#opOptMeta").textContent = `Engine: ${d.engineUsed}`;
  const legend = `<div style="margin-top:6px">🟢 <span class="opnew" style="padding:1px 5px">Phần tô xanh</span> ở bản SAU là nội dung mới / đã tối ưu so với bản gốc.</div>`;
  $("#opChanges").innerHTML = alertHtml("info",
    (d.changes && d.changes.length ? "✅ Đã tối ưu:<ul style='margin:6px 0 0 18px'>" + d.changes.map((c) => `<li>${esc(c)}</li>`).join("") + "</ul>" : "Đã tối ưu xong.") + legend);
  $("#opMeta2").innerHTML = `<table class="cmp">
    <thead><tr><th>Yếu tố</th><th>TRƯỚC</th><th>SAU</th></tr></thead>
    <tbody>
      <tr><td><b>Title</b></td><td>${esc(d.before.title || "(trống)")}</td><td class="snip-after">${esc(d.after.title || "")}</td></tr>
      <tr><td><b>Meta description</b></td><td>${esc(d.before.metaDescription || "(trống)")}</td><td class="snip-after">${esc(d.after.metaDescription || "")}</td></tr>
      ${d.after.slug ? `<tr><td><b>Slug gợi ý</b></td><td>—</td><td class="snip-after">${esc(d.after.slug)}</td></tr>` : ""}
    </tbody></table>`;

  // So lieu ban SAU: so tu + so lan xuat hien tu khoa chinh/phu
  const md = d.after.markdown || "";
  const mk = d.mainKeyword || "";
  const subs = d.subKeywords || [];
  let stats = `<div class="stat"><b>${opCountWords(md).toLocaleString("vi")}</b><span>Số từ (sau)</span></div>`;
  if (mk) stats += `<div class="stat"><b>${opCountOccur(md, mk)}</b><span>KW chính: "${esc(mk)}"</span></div>`;
  stats += subs.map((s) => `<div class="stat"><b>${opCountOccur(md, s)}</b><span>KW phụ: "${esc(s)}"</span></div>`).join("");
  $("#opAfterStats").innerHTML = stats;

  // To mau phan da toi uu/them moi (so voi ban truoc)
  const beforeNorm = opNorm(d.before.markdown || "");
  const markNew = (text) => {
    const n = opNorm(text).trim();
    return n.length > 8 && !beforeNorm.includes(n.slice(0, 40));
  };
  $("#opBefore").innerHTML = mdToHtml(d.before.markdown || "(không đọc được nội dung gốc)");
  $("#opAfter").innerHTML = mdToHtml(md, markNew);

  // FAQ / ảnh / internal link / schema JSON-LD
  let ex = "";
  if (d.faq && d.faq.length) {
    ex += `<h3 style="margin:6px 0">❓ FAQ (chuẩn AI Overview)</h3>` +
      d.faq.map((f) => `<div class="opd"><b>${esc(f.question)}</b><br>${esc(f.answer)}</div>`).join("");
  }
  if (d.internalLinks && d.internalLinks.length) {
    ex += `<h3 style="margin:14px 0 6px">🔗 Gợi ý Internal link</h3><ul style="margin:0 0 0 18px">` +
      d.internalLinks.map((l) => `<li><b>${esc(l.anchor)}</b> → ${esc(l.targetType)}</li>`).join("") + `</ul>`;
  }
  if (d.imageSuggestions && d.imageSuggestions.length) {
    ex += `<h3 style="margin:14px 0 6px">📷 Gợi ý hình ảnh</h3>` +
      d.imageSuggestions.map((im) => `<div class="opd">${im.position ? `<b>${esc(im.position)}</b> — ` : ""}Alt: <i>${esc(im.alt || "")}</i>${im.caption ? ` · Caption: ${esc(im.caption)}` : ""} · ${esc(im.idea || "")}</div>`).join("");
  }
  if (d.schemaJsonLd) {
    ex += `<h3 style="margin:14px 0 6px">🧩 Schema JSON-LD <button class="ghost small" id="opCopySchema">Copy</button></h3><pre class="code">${esc(d.schemaJsonLd)}</pre>`;
  }
  $("#opExtras").innerHTML = ex;
}

// Copy schema JSON-LD
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "opCopySchema" && opSession.optimize) {
    navigator.clipboard.writeText(opSession.optimize.schemaJsonLd || "").then(() => toast("Đã copy Schema JSON-LD!"));
  }
});

// Copy 1 phương án đề xuất (chế độ suggest)
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-sc]");
  if (!b || !opSession.optimize) return;
  const [i, j] = b.dataset.sc.split("|");
  const s = (opSession.optimize.suggestions || [])[+i];
  const o = s && (s.options || [])[+j];
  if (o != null) navigator.clipboard.writeText(o).then(() => toast("Đã copy phương án!"));
});

// --- Xuat file ---
function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function opAfterHtmlDoc(wordMode) {
  const o = opSession.optimize; if (!o) return "";
  const head = `<meta charset="utf-8"><title>${esc(o.after.title || "SeoShark")}</title>` +
    (o.after.metaDescription ? `<meta name="description" content="${esc(o.after.metaDescription)}">` : "");
  const body = mdToHtml(o.after.markdown || "");
  if (wordMode) {
    return `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head>${head}</head><body>${body}</body></html>`;
  }
  return `<!DOCTYPE html><html lang="vi"><head>${head}</head><body>${body}</body></html>`;
}
$("#opCopyMd").addEventListener("click", () => {
  if (opSession.optimize) navigator.clipboard.writeText(opSession.optimize.after.markdown || "").then(() => toast("Đã copy Markdown!"));
});
$("#opDownHtml").addEventListener("click", () => {
  if (opSession.optimize) downloadFile("seoshark-toi-uu.html", opAfterHtmlDoc(false), "text/html;charset=utf-8");
});
$("#opDownDoc").addEventListener("click", () => {
  if (opSession.optimize) downloadFile("seoshark-toi-uu.doc", opAfterHtmlDoc(true), "application/msword");
});

// --- Skill / thong tin bo sung: luu & khoi phuc ---
$("#opExtra").value = localStorage.getItem("seoshark_onpage_skill") || "";
$("#opSaveSkill").addEventListener("click", () => {
  localStorage.setItem("seoshark_onpage_skill", $("#opExtra").value);
  $("#opSkillMsg").textContent = "✓ Đã lưu, lần sau tự điền lại";
  setTimeout(() => ($("#opSkillMsg").textContent = ""), 2500);
});
$("#opClearSkill").addEventListener("click", () => {
  $("#opExtra").value = "";
  localStorage.removeItem("seoshark_onpage_skill");
  $("#opSkillMsg").textContent = "Đã xóa";
  setTimeout(() => ($("#opSkillMsg").textContent = ""), 2000);
});

/* ===================== CHECK INDEX & THỨ HẠNG (Serper.dev) ===================== */
(function () {
  const keyEl = $("#serperKey"), glEl = $("#serpGl"), hlEl = $("#serpHl"), domainEl = $("#rkDomain"), depthEl = $("#rkDepth");
  if (!keyEl) return;
  let lastDepth = 50;

  // Khôi phục & lưu cấu hình
  keyEl.value = localStorage.getItem("seoshark_serper_key") || "";
  glEl.value = localStorage.getItem("seoshark_serp_gl") || "vn";
  hlEl.value = localStorage.getItem("seoshark_serp_hl") || "vi";
  domainEl.value = localStorage.getItem("seoshark_serp_domain") || "";
  keyEl.addEventListener("change", () => localStorage.setItem("seoshark_serper_key", keyEl.value.trim()));
  glEl.addEventListener("change", () => localStorage.setItem("seoshark_serp_gl", glEl.value));
  hlEl.addEventListener("change", () => localStorage.setItem("seoshark_serp_hl", hlEl.value));
  domainEl.addEventListener("change", () => localStorage.setItem("seoshark_serp_domain", domainEl.value.trim()));
  if (depthEl) {
    depthEl.value = localStorage.getItem("seoshark_serp_depth") || "50";
    depthEl.addEventListener("change", () => localStorage.setItem("seoshark_serp_depth", depthEl.value));
  }

  // Chuyển tab Index / Thứ hạng
  $$("#serpTabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$("#serpTabs .tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      $$("[data-serppane]").forEach((p) => p.classList.toggle("active", p.dataset.serppane === tab.dataset.serp));
    });
  });

  const parseLines = (text) =>
    Array.from(new Set(String(text || "").split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean)));

  function updateCounts() {
    $("#idxCount").textContent = parseLines($("#idxInput").value).length + " URL";
    $("#rkCount").textContent = parseLines($("#rkInput").value).length + " từ khóa";
  }
  $("#idxInput").addEventListener("input", updateCounts);
  $("#rkInput").addEventListener("input", updateCounts);
  $("#idxClear").addEventListener("click", () => { $("#idxInput").value = ""; updateCounts(); });
  $("#rkClear").addEventListener("click", () => { $("#rkInput").value = ""; updateCounts(); });
  updateCounts();

  // Đọc cột đầu của Excel/CSV
  function readSheet(file, cb) {
    if (typeof XLSX === "undefined") return toast("Thư viện Excel chưa tải xong, đợi vài giây rồi thử lại.");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const vals = [];
        rows.forEach((r) => { if (r && r[0] != null && String(r[0]).trim()) vals.push(String(r[0]).trim()); });
        cb(vals);
      } catch (err) { toast("Lỗi đọc file: " + (err.message || err)); }
    };
    reader.readAsArrayBuffer(file);
  }
  function wireUpload(btnId, fileId, areaId) {
    $(btnId).addEventListener("click", () => $(fileId).click());
    $(fileId).addEventListener("change", (e) => {
      const f = e.target.files[0]; if (!f) return;
      readSheet(f, (vals) => {
        const cur = parseLines($(areaId).value);
        $(areaId).value = Array.from(new Set(cur.concat(vals))).join("\n");
        updateCounts();
        toast(`Đã nạp ${vals.length} dòng từ file`);
      });
      e.target.value = "";
    });
  }
  wireUpload("#idxUploadBtn", "#idxFile", "#idxInput");
  wireUpload("#rkUploadBtn", "#rkFile", "#rkInput");

  function exportXlsx(aoa, filename, sheet) {
    if (typeof XLSX === "undefined") return toast("Thư viện Excel chưa tải xong.");
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheet || "Sheet1");
    XLSX.writeFile(wb, filename);
  }

  // Chạy theo lô: items -> doChunk(chunk) trả {results, stop, reason}
  async function runChunks(items, size, doChunk, onProgress) {
    const out = [];
    for (let i = 0; i < items.length; i += size) {
      const chunk = items.slice(i, i + size);
      const r = await doChunk(chunk);
      out.push(...(r.results || []));
      if (r.stop) return { results: out, stopped: r.reason };
      onProgress(Math.min(i + size, items.length), items.length);
    }
    return { results: out };
  }

  function requireKey(msgId) {
    const key = keyEl.value.trim();
    if (!key) {
      $(msgId).innerHTML = `<div class="alert err">Chưa có Serper API key. Lấy FREE tại <a href="https://serper.dev" target="_blank" rel="noopener">serper.dev</a> rồi dán vào mục <b>⚙️ Kết nối Serper.dev</b> ở trên.</div>`;
      return null;
    }
    $(msgId).innerHTML = "";
    return key;
  }

  // ---------- CHECK INDEX ----------
  let idxResults = [];
  $("#idxRun").addEventListener("click", async () => {
    const urls = parseLines($("#idxInput").value);
    if (!urls.length) return toast("Hãy nhập ít nhất 1 URL.");
    const key = requireKey("#idxMsg"); if (!key) return;
    const gl = glEl.value, hl = hlEl.value;
    const btn = $("#idxRun"); btn.disabled = true;
    $("#idxResultCard").classList.add("hidden");
    const prog = $("#idxProgress");
    const setProg = (d, t) => (prog.innerHTML = `<div class="alert info"><span class="spinner" style="border-color:var(--brand);border-top-color:transparent"></span>Đang kiểm tra index... ${d}/${t}</div>`);
    setProg(0, urls.length);
    const res = await runChunks(urls, 5, async (chunk) => {
      try {
        const r = await fetch("/api/serp/index", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls: chunk, key, gl, hl }) });
        const d = await r.json();
        if (d.needAuth) return { stop: true, reason: "Phiên đăng nhập hết hạn, hãy tải lại trang.", results: [] };
        if (d.badKey) return { stop: true, reason: d.error, results: [] };
        if (d.quota) return { stop: true, reason: d.error, results: d.results || [] };
        if (!r.ok) return { stop: true, reason: d.error || "Lỗi server", results: [] };
        return { results: d.results || [] };
      } catch (e) { return { stop: true, reason: e.message || "Lỗi mạng", results: [] }; }
    }, setProg);
    idxResults = res.results || [];
    prog.innerHTML = "";
    btn.disabled = false;
    $("#idxMsg").innerHTML = res.stopped
      ? `<div class="alert warn">⚠ Đã dừng: ${esc(res.stopped)} — đã có ${idxResults.length} kết quả bên dưới.</div>`
      : `<div class="alert info">✓ Hoàn tất ${idxResults.length} URL.</div>`;
    renderIdx();
  });

  function renderIdx() {
    if (!idxResults.length) { $("#idxResultCard").classList.add("hidden"); return; }
    const indexed = idxResults.filter((r) => r.indexed && !r.error).length;
    const not = idxResults.filter((r) => !r.indexed && !r.error).length;
    const errs = idxResults.filter((r) => r.error).length;
    $("#idxStats").innerHTML =
      `<div class="stat"><b>${idxResults.length}</b><span>Tổng URL</span></div>` +
      `<div class="stat"><b>${indexed}</b><span>Đã index</span></div>` +
      `<div class="stat"><b>${not}</b><span>Chưa index</span></div>` +
      `<div class="stat"><b>${errs}</b><span>Lỗi</span></div>`;
    $("#idxTable").innerHTML = `<table class="cmp"><thead><tr><th>#</th><th>URL</th><th>Trạng thái</th></tr></thead><tbody>${
      idxResults.map((r, i) => `<tr><td>${i + 1}</td><td><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url)}</a></td><td>${
        r.error ? `<span class="badge" style="background:var(--red-light);color:#9c3049">⚠ Lỗi</span>`
        : r.indexed ? `<span class="badge ok">✅ Đã index</span>`
        : `<span class="badge" style="background:var(--amber-light);color:#8a6310">❌ Chưa index</span>`
      }</td></tr>`).join("")
    }</tbody></table>`;
    $("#idxResultCard").classList.remove("hidden");
  }
  $("#idxExport").addEventListener("click", () => {
    if (!idxResults.length) return toast("Chưa có kết quả.");
    const aoa = [["URL", "Trạng thái", "Kết quả tìm thấy"]].concat(
      idxResults.map((r) => [r.url, r.error ? "Lỗi: " + r.error : r.indexed ? "Đã index" : "Chưa index", r.found || ""])
    );
    exportXlsx(aoa, "seoshark-check-index.xlsx", "Index");
  });

  // ---------- CHECK THỨ HẠNG ----------
  let rkResults = [];
  $("#rkRun").addEventListener("click", async () => {
    const kws = parseLines($("#rkInput").value);
    const domain = domainEl.value.trim();
    if (!domain) return toast("Hãy nhập domain website (vd: https://nhakhoashark.vn/).");
    if (!kws.length) return toast("Hãy nhập ít nhất 1 từ khóa.");
    const key = requireKey("#rkMsg"); if (!key) return;
    localStorage.setItem("seoshark_serp_domain", domain);
    const depth = Number(depthEl && depthEl.value) || 50;
    lastDepth = depth;
    const gl = glEl.value, hl = hlEl.value;
    const btn = $("#rkRun"); btn.disabled = true;
    $("#rkResultCard").classList.add("hidden");
    const prog = $("#rkProgress");
    const setProg = (d, t) => (prog.innerHTML = `<div class="alert info"><span class="spinner" style="border-color:var(--brand);border-top-color:transparent"></span>Đang kiểm tra thứ hạng... ${d}/${t}</div>`);
    setProg(0, kws.length);
    const res = await runChunks(kws, 5, async (chunk) => {
      try {
        const r = await fetch("/api/serp/rank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keywords: chunk, domain, key, gl, hl, depth }) });
        const d = await r.json();
        if (d.needAuth) return { stop: true, reason: "Phiên đăng nhập hết hạn, hãy tải lại trang.", results: [] };
        if (d.badKey) return { stop: true, reason: d.error, results: [] };
        if (d.quota) return { stop: true, reason: d.error, results: d.results || [] };
        if (!r.ok) return { stop: true, reason: d.error || "Lỗi server", results: [] };
        return { results: d.results || [] };
      } catch (e) { return { stop: true, reason: e.message || "Lỗi mạng", results: [] }; }
    }, setProg);
    rkResults = res.results || [];
    prog.innerHTML = "";
    btn.disabled = false;
    $("#rkMsg").innerHTML = res.stopped
      ? `<div class="alert warn">⚠ Đã dừng: ${esc(res.stopped)} — đã có ${rkResults.length} kết quả bên dưới.</div>`
      : `<div class="alert info">✓ Hoàn tất ${rkResults.length} từ khóa.</div>`;
    renderRk();
  });

  function renderRk() {
    if (!rkResults.length) { $("#rkResultCard").classList.add("hidden"); return; }
    const ranked = rkResults.filter((r) => r.rank).length;
    const out = rkResults.filter((r) => !r.rank && !r.error).length;
    const errs = rkResults.filter((r) => r.error).length;
    $("#rkStats").innerHTML =
      `<div class="stat"><b>${rkResults.length}</b><span>Tổng từ khóa</span></div>` +
      `<div class="stat"><b>${ranked}</b><span>Có thứ hạng (top ${lastDepth})</span></div>` +
      `<div class="stat"><b>${out}</b><span>Ngoài top ${lastDepth}</span></div>` +
      `<div class="stat"><b>${errs}</b><span>Lỗi</span></div>`;
    $("#rkTable").innerHTML = `<table class="cmp"><thead><tr><th>#</th><th>Từ khóa</th><th>Thứ hạng</th><th>URL tìm thấy</th></tr></thead><tbody>${
      rkResults.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.keyword)}</b></td><td>${
        r.error ? `<span class="badge" style="background:var(--red-light);color:#9c3049">⚠ Lỗi</span>`
        : r.rank ? `<span class="badge ok">#${r.rank}</span>`
        : `<span class="badge" style="background:var(--amber-light);color:#8a6310">Ngoài top ${lastDepth}</span>`
      }</td><td>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title || r.url)}</a>` : '<span class="muted">—</span>'}</td></tr>`).join("")
    }</tbody></table>`;
    $("#rkResultCard").classList.remove("hidden");
  }
  $("#rkExport").addEventListener("click", () => {
    if (!rkResults.length) return toast("Chưa có kết quả.");
    const aoa = [["Từ khóa", "Thứ hạng", "URL tìm thấy", "Tiêu đề"]].concat(
      rkResults.map((r) => [r.keyword, r.error ? "Lỗi" : r.rank ? r.rank : ("Ngoài top " + lastDepth), r.url || "", r.title || ""])
    );
    exportXlsx(aoa, "seoshark-check-thu-hang.xlsx", "ThuHang");
  });
})();

/* ===================== TỰ ĐỘNG SHARE LINK (1-click, caption riêng từng nền) ===================== */
(function () {
  const urlEl = $("#shUrl");
  if (!urlEl) return;
  urlEl.value = localStorage.getItem("seoshark_share_url") || "";
  let share = null;          // { url, title, image }
  let uploadedImage = "";    // /uploads/xxx (ghi đè thumbnail OG nếu có)
  let captionMap = {};       // id -> caption (do AI tạo)

  const E = (s) => encodeURIComponent(String(s == null ? "" : s));
  const firstLine = (s) => String(s || "").split("\n")[0];
  const absImg = (img) => (img ? (img.startsWith("/") ? location.origin + img : img) : "");
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch {} ta.remove(); return true; }
  }

  // Nền dựng sẵn: prefill=true -> mở sẵn nội dung; false -> copy caption rồi mở để dán.
  const PLAT = {
    facebook:  { name: "Facebook", prefill: false, style: "thân thiện, có emoji, 2-3 câu, CTA mời đọc", build: (s) => `https://www.facebook.com/sharer/sharer.php?u=${E(s.url)}` },
    x:         { name: "X (Twitter)", prefill: true, style: "ngắn gọn dưới 240 ký tự, súc tích, 1-2 hashtag", build: (s, c) => `https://twitter.com/intent/tweet?text=${E(c)}&url=${E(s.url)}` },
    telegram:  { name: "Telegram", prefill: true, style: "ngắn gọn, có emoji", build: (s, c) => `https://t.me/share/url?url=${E(s.url)}&text=${E(c)}` },
    linkedin:  { name: "LinkedIn", prefill: false, style: "trang trọng, chuyên nghiệp, nhấn giá trị chuyên môn", build: (s) => `https://www.linkedin.com/sharing/share-offsite/?url=${E(s.url)}` },
    pinterest: { name: "Pinterest", prefill: true, style: "mô tả hấp dẫn cho ghim ảnh, giàu từ khóa", build: (s, c) => `https://pinterest.com/pin/create/button/?url=${E(s.url)}&media=${E(s.image)}&description=${E(c)}` },
    reddit:    { name: "Reddit", prefill: true, style: "tiêu đề kiểu thảo luận tự nhiên, không quảng cáo lộ liễu", build: (s, c) => `https://www.reddit.com/submit?url=${E(s.url)}&title=${E(firstLine(c))}` },
    tumblr:    { name: "Tumblr", prefill: true, style: "trẻ trung, sáng tạo", build: (s, c) => `https://www.tumblr.com/widgets/share/tool?canonicalUrl=${E(s.url)}&title=${E(s.title || "")}&caption=${E(c)}` },
    whatsapp:  { name: "WhatsApp", prefill: true, style: "ngắn gọn, thân mật", build: (s, c) => `https://wa.me/?text=${E(c + "\n" + s.url)}` },
    email:     { name: "Email", prefill: true, style: "lịch sự", build: (s, c) => `mailto:?subject=${E(s.title || "Chia sẻ bài viết")}&body=${E(c + "\n" + s.url)}` },
    zalo:      { name: "Zalo", prefill: false, style: "thân thiện, ngắn", build: null },
  };

  // Site bookmark tùy chỉnh do user thêm
  let customSites = [];
  try { customSites = JSON.parse(localStorage.getItem("seoshark_share_custom") || "[]") || []; } catch {}
  const saveCustom = () => localStorage.setItem("seoshark_share_custom", JSON.stringify(customSites));

  function renderChecks() {
    const wrap = $("#shPlatforms");
    wrap.innerHTML = "";
    const defOn = new Set(["facebook", "x", "telegram", "linkedin", "pinterest"]);
    const add = (id, label, on) => {
      const l = document.createElement("label");
      l.style.cssText = "display:flex;align-items:center;gap:6px;font-weight:600;font-size:13px;background:var(--card-soft);border:1px solid var(--line);padding:7px 12px;border-radius:999px;cursor:pointer";
      l.innerHTML = `<input type="checkbox" data-plat="${id}" ${on ? "checked" : ""} style="width:16px;height:16px;accent-color:var(--brand)"> ${esc(label)}`;
      wrap.appendChild(l);
    };
    Object.keys(PLAT).forEach((id) => add(id, PLAT[id].name, defOn.has(id)));
    customSites.forEach((c) => {
      const box = document.createElement("span");
      box.style.cssText = "display:inline-flex;align-items:center;gap:4px";
      const l = document.createElement("label");
      l.style.cssText = "display:flex;align-items:center;gap:6px;font-weight:600;font-size:13px;background:var(--brand-light);border:1px solid var(--line);padding:7px 10px;border-radius:999px;cursor:pointer";
      l.innerHTML = `<input type="checkbox" data-plat="${c.id}" checked style="width:16px;height:16px;accent-color:var(--brand)"> ${esc(c.name)} <span data-del="${c.id}" title="Xóa" style="color:var(--red);cursor:pointer;font-weight:700">✕</span>`;
      box.appendChild(l);
      wrap.appendChild(box);
    });
    $$('#shPlatforms [data-del]').forEach((x) => x.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      customSites = customSites.filter((c) => c.id !== x.dataset.del); saveCustom(); renderChecks();
    }));
  }
  renderChecks();

  $("#shCustAdd").addEventListener("click", () => {
    const name = $("#shCustName").value.trim(), url = $("#shCustUrl").value.trim();
    if (!name || !url) return toast("Nhập cả tên và URL trang đăng.");
    customSites.push({ id: "custom_" + Math.abs(Date.now()), name, url });
    saveCustom(); renderChecks();
    $("#shCustName").value = ""; $("#shCustUrl").value = "";
    toast("Đã thêm site: " + name);
  });

  function selectedPlatforms() {
    return $$('#shPlatforms input[data-plat]:checked').map((cb) => {
      const id = cb.dataset.plat;
      if (PLAT[id]) return { id, name: PLAT[id].name, style: PLAT[id].style };
      const c = customSites.find((x) => x.id === id);
      return c ? { id, name: c.name, style: "tổng quát, thân thiện, có CTA" } : null;
    }).filter(Boolean);
  }

  // ----- Upload ảnh (nén client-side rồi gửi base64) -----
  function downscale(file, max, cb) {
    const img = new Image(); const u = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(u); cb(cv.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(u); toast("Không đọc được ảnh."); };
    img.src = u;
  }
  $("#shImgUploadBtn").addEventListener("click", () => $("#shImgFile").click());
  $("#shImgFile").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    $("#shImgStatus").textContent = "Đang xử lý ảnh...";
    downscale(f, 1280, async (dataUrl) => {
      try {
        const r = await fetch("/api/share/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl }) });
        const d = await r.json();
        if (d.needAuth) { $("#shImgStatus").textContent = "Phiên hết hạn, tải lại trang."; return; }
        if (!r.ok || !d.url) { $("#shImgStatus").textContent = "Lỗi: " + (d.error || "upload thất bại"); return; }
        uploadedImage = d.url;
        $("#shImgStatus").textContent = "✓ Đã upload ảnh dùng chung.";
        const img = $("#shThumb"), none = $("#shThumbNone");
        img.src = absImg(uploadedImage); img.style.display = "block"; none.style.display = "none";
      } catch (err) { $("#shImgStatus").textContent = "Lỗi: " + (err.message || err); }
    });
    e.target.value = "";
  });

  // ----- Render cards (mỗi nền 1 caption + nút) -----
  function curImage() { return absImg(uploadedImage || (share && share.image) || ""); }
  function renderCards(plats) {
    $("#shCards").innerHTML = plats.map((p) => {
      const prefill = PLAT[p.id] ? PLAT[p.id].prefill : false;
      const cap = captionMap[p.id] || "";
      return `<div style="border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px;background:var(--card-soft)">
        <div class="flexbar" style="margin-bottom:8px"><b>${esc(p.name)}</b>
          <button class="${prefill ? "small" : "ghost small"}" data-share="${p.id}">${prefill ? "🔓" : "📋"} Đăng lên ${esc(p.name)}</button></div>
        <textarea data-caption="${p.id}" rows="3">${esc(cap)}</textarea>
      </div>`;
    }).join("");
    $$('#shCards [data-share]').forEach((b) => b.addEventListener("click", () => doShare(b.dataset.share)));
  }

  async function doShare(id) {
    if (!share) return;
    const ta = $(`#shCards [data-caption="${id}"]`);
    const cap = ta ? ta.value : "";
    const s = { url: share.url, title: share.title, image: curImage() };
    if (PLAT[id]) {
      const p = PLAT[id];
      if (!p.prefill) { await copyText(cap + "\n" + s.url); toast("Đã copy caption — dán vào " + p.name); }
      if (p.build) window.open(p.build(s, cap), "_blank", "noopener");
      else window.open("https://zalo.me/", "_blank", "noopener");
    } else {
      const c = customSites.find((x) => x.id === id);
      await copyText(cap + "\n" + s.url);
      toast("Đã copy caption — dán vào " + (c ? c.name : "site"));
      if (c && c.url) window.open(c.url, "_blank", "noopener");
    }
  }

  $("#shRun").addEventListener("click", async () => {
    const url = urlEl.value.trim();
    if (!url) return toast("Hãy nhập URL bài viết.");
    const plats = selectedPlatforms();
    if (!plats.length) return toast("Hãy tick ít nhất 1 nơi muốn đăng.");
    localStorage.setItem("seoshark_share_url", url);
    const keyword = $("#shKeyword").value.trim();
    const engine = $("#engine").value, model = $("#model").value, apiKey = $("#apiKey").value.trim();
    const btn = $("#shRun"); btn.disabled = true;
    $("#shMsg").innerHTML = `<div class="alert info"><span class="spinner" style="border-color:var(--brand);border-top-color:transparent"></span>Đang lấy thumbnail & viết caption riêng cho ${plats.length} nền...</div>`;
    $("#shResultCard").classList.add("hidden");
    try {
      const r = await fetch("/api/share/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, keyword, platforms: plats, engine, model, apiKey }) });
      const d = await r.json();
      if (d.needAuth) { $("#shMsg").innerHTML = `<div class="alert err">Phiên hết hạn, hãy tải lại trang.</div>`; return; }
      if (!r.ok) { $("#shMsg").innerHTML = `<div class="alert err">${esc(d.error || "Lỗi server")}</div>`; return; }
      share = { url: d.url, title: d.title || "", image: d.image || "" };
      captionMap = {};
      (d.captions || []).forEach((c) => { if (c && c.id) captionMap[c.id] = c.caption || ""; });
      $("#shTitle").textContent = d.title ? "📄 " + d.title : "";
      $("#shEngine").textContent = "Caption bởi: " + (d.engineUsed || "Local");
      const img = $("#shThumb"), none = $("#shThumbNone"), cur = curImage();
      if (cur) { img.src = cur; img.style.display = "block"; none.style.display = "none"; }
      else { img.style.display = "none"; none.style.display = "block"; none.textContent = "Không có thumbnail (bài chưa có ảnh OG — bạn có thể Upload ảnh ở trên)."; }
      $("#shMsg").innerHTML = "";
      $("#shResultCard").classList.remove("hidden");
      renderCards(plats);
    } catch (e) {
      $("#shMsg").innerHTML = `<div class="alert err">Lỗi: ${esc(e.message || e)}</div>`;
    } finally {
      btn.disabled = false;
    }
  });
})();

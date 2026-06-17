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
      ["gemini-3.5-flash", "Gemini 3.5 Flash (mới nhất, thông minh nhất)"],
      ["gemini-3.1-flash-lite", "Gemini 3.1 Flash-Lite (nhanh, tiết kiệm)"],
      ["gemini-2.5-flash", "Gemini 2.5 Flash (ổn định, cân bằng)"],
      ["gemini-2.5-pro", "Gemini 2.5 Pro (suy luận sâu)"],
      ["gemini-3.1-pro-preview", "Gemini 3.1 Pro (preview, mạnh nhất)"],
    ],
    hint: "Chất lượng cao, chèn link tự nhiên & tự viết thêm câu khi cần. Key free.",
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
    if (saved) sel.value = saved;
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
$$("#menu .menu-item").forEach((mi) => {
  mi.addEventListener("click", () => {
    $$("#menu .menu-item").forEach((x) => x.classList.remove("active"));
    mi.classList.add("active");
    if (mi.dataset.section === "soon") {
      const name = mi.dataset.name || "Tính năng sắp ra mắt";
      $("#soonName").textContent = name;
      showSection("soon", name);
    } else {
      showSection("internal-link", "Tối ưu Internal link");
    }
  });
});

// --- Khoi phuc cau hinh da luu ---
$("#sitemapUrl").value = localStorage.getItem("seoshark_sitemap") || "";
$("#engine").value = localStorage.getItem("seoshark_engine") || "local";
applyEngine($("#engine").value);

$("#engine").addEventListener("change", (e) => {
  localStorage.setItem("seoshark_engine", e.target.value);
  applyEngine(e.target.value);
});
$("#model").addEventListener("change", (e) =>
  localStorage.setItem("seoshark_model_" + $("#engine").value, e.target.value)
);
$("#apiKey").addEventListener("change", (e) =>
  localStorage.setItem("seoshark_key_" + $("#engine").value, e.target.value.trim())
);
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
  const keywords = $$(".kw-row").map((r) => ({
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
  showAuth();
  switchAtab("login");
});

checkAuth();

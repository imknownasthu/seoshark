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
      ["gemini-3.5-flash", "Gemini Flash (FREE — tự chọn cao nhất)"],
    ],
    hint: "Tự động dùng model Gemini Flash CAO NHẤT & miễn phí theo API key của bạn (khi Google ra bản mới sẽ tự cập nhật). Nếu model đó hết lượt miễn phí, tool tự chuyển xuống model kế tiếp, báo cho bạn và hiện model đang dùng trên header — hết thời gian chờ sẽ tự quay lại model cao nhất.",
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
    if (saved && cfg.models.some(([v]) => v === saved)) sel.value = saved;
    // Gemini: khôi phục ngay model đã tự phát hiện lần trước (vd 3.6-flash) trong khi chờ check lại
    if (engine === "gemini" && saved && /^gemini-\d.*flash/i.test(saved)) applyGeminiModel(saved);
  } else {
    mw.classList.add("hidden");
  }

  // Pill AI trên header do setConn() cập nhật (xanh nếu kết nối, vàng nếu chưa)
}
function setAiPill(connected, label) {
  const pill = $("#aiPill");
  if (pill) { pill.classList.toggle("good", connected); pill.classList.toggle("warn", !connected); }
  const pt = $("#enginePillText"); if (pt) pt.textContent = label;
  const ec = $("#ecAiState"); if (ec) { ec.textContent = connected ? "Đã kết nối" : "Chưa kết nối"; ec.classList.toggle("on", connected); }
}

// --- MENU (chuyen muc) ---
function showSection(section, title) {
  $$(".section").forEach((s) => s.classList.remove("active"));
  const el = $(`.section[data-section="${section}"]`);
  if (el) el.classList.add("active");
  $("#sectionTitle").textContent = title;
}
const SECTION_TITLES = { "dashboard": "Bảng điều khiển", "internal-link": "Tối ưu Internal link", "onpage": "Tối ưu Onpage", "serp": "Check Index & Thứ hạng", "share": "Tự động Share Link", "blog2": "Tự động đăng Blog 2.0", "keywords": "Nghiên cứu từ khóa", "outline": "Lên outline chuẩn SEO", "schema": "Schema Markup", "gbp": "Tối ưu GBP" };
// Cac section co the mo bang URL hash (moi menu-item la 1 link #section) -> Ctrl+Click mo tab moi,
// moi tab dung doc lap (phien la cookie stateless nen tab moi van dang nhap).
const VALID_SECTIONS = new Set(["dashboard", "outline", "internal-link", "keywords", "onpage", "serp", "schema", "gbp"]);
function setActiveMenu(sec) { $$("#menu .menu-item").forEach((x) => x.classList.toggle("active", x.dataset.section === sec)); }
let _opKnowLoadedForOnpage = false;
function routeToSection(sec) {
  if (!VALID_SECTIONS.has(sec)) sec = "dashboard";
  setActiveMenu(sec);
  showSection(sec, SECTION_TITLES[sec] || sec);
  const c = document.querySelector(".content"); if (c) c.scrollTop = 0;
  // Nap tai lieu kien thuc cho buoc "Toi uu heading" khi vao Onpage
  if (sec === "onpage" && !_opKnowLoadedForOnpage && typeof opLoadKnow === "function") { _opKnowLoadedForOnpage = true; opLoadKnow(); }
}
function sectionFromHash() {
  const h = (location.hash || "").replace(/^#/, "").trim();
  return VALID_SECTIONS.has(h) ? h : "dashboard";
}
window.addEventListener("hashchange", () => routeToSection(sectionFromHash()));

// Dieu huong nhanh tu the Dashboard -> doi hash (de dong bo tab/nut back)
function gotoSection(sec) { location.hash = sec; }
document.querySelectorAll("#quickTools .tool-card[data-goto]").forEach((c) => c.addEventListener("click", () => gotoSection(c.dataset.goto)));
{ const sn = document.getElementById("soonNotify"); if (sn) sn.addEventListener("click", () => toast("Đã ghi nhận! Chúng tôi sẽ báo bạn khi tính năng ra mắt.")); }

// Cac muc "Sap ra mat" (placeholder) — bam hien panel, KHONG doi hash/mo tab
$$('#menu .menu-item[data-section="soon"]').forEach((mi) => {
  mi.addEventListener("click", (e) => {
    e.preventDefault();
    setActiveMenu(null); mi.classList.add("active");
    const name = mi.dataset.name || "Tính năng sắp ra mắt";
    $("#soonName").textContent = name;
    showSection("soon", name);
  });
});

// Khoi tao section theo hash luc tai trang (moi tab tu doc hash cua no)
routeToSection(sectionFromHash());

// --- Khoi phuc cau hinh da luu ---
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
// Tên model đẹp để hiện trên header (VD gemini-3.5-flash -> "Gemini 3.5 Flash")
function prettyModel(engine, model) {
  if (engine === "gemini") {
    const m = (model || "gemini-3.5-flash");
    const nice = { "gemini-3.5-flash": "Gemini 3.5 Flash" };
    return nice[m] || ("Gemini " + m.replace(/^gemini-/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
  }
  if (engine === "claude") {
    const m = (model || "");
    if (/opus/i.test(m)) return "Claude Opus";
    if (/haiku/i.test(m)) return "Claude Haiku";
    return "Claude Sonnet";
  }
  return "Local";
}
// Áp model Gemini tự phát hiện (cao nhất & free) làm lựa chọn duy nhất
function applyGeminiModel(model) {
  const sel = $("#model"); if (!sel || !model) return;
  sel.innerHTML = `<option value="${model}">${prettyModel("gemini", model)} (FREE — tự chọn cao nhất)</option>`;
  sel.value = model;
  localStorage.setItem("seoshark_model_gemini", model);
}
function setConn(state, text) {
  const s = $("#engineStatus");
  if (s) {
    s.textContent = text;
    s.style.color = state === "ok" ? "var(--green)" : state === "fail" ? "var(--red)" : "var(--muted)";
  }
  const engine = $("#engine").value;
  const connected = state === "ok";
  const label = engine === "local" ? "Local · Sẵn sàng" : `${prettyModel(engine, ($("#model") || {}).value)} · ${connected ? "đã kết nối" : "chưa kết nối"}`;
  setAiPill(connected, label);
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
    if (d.ok) {
      // Gemini: tự áp model CAO NHẤT & FREE do server phát hiện (vd 3.6-flash khi Google ra mắt)
      if (engine === "gemini" && d.model) applyGeminiModel(d.model);
      setConn("ok", "✓ " + d.label);
    }
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

/* ---------- SERPER.DEV (trong Engine + pill header) ---------- */
function serperConnected() { return !!(localStorage.getItem("seoshark_serper_key") || "").trim(); }
window.serperConnected = serperConnected;
function updateSerperPill(ok) {
  const conn = ok !== undefined ? ok : serperConnected();
  const pill = $("#serperPill"), dot = $("#serperPillDot"), txt = $("#serperPillText"), ec = $("#ecSerperState");
  if (txt) txt.textContent = conn ? "Serper: đã kết nối" : "Serper: chưa kết nối";
  if (pill) { pill.classList.toggle("good", conn); pill.classList.toggle("warn", !conn); }
  if (dot) dot.style.background = conn ? "var(--green)" : "var(--amber)";
  if (ec) { ec.textContent = conn ? "Đã kết nối" : "Chưa kết nối"; ec.classList.toggle("on", conn); }
}
window.updateSerperPill = updateSerperPill;
(function initSerper() {
  const key = $("#serperKey"); if (!key) return;
  key.value = localStorage.getItem("seoshark_serper_key") || "";
  updateSerperPill();
  key.addEventListener("change", () => { localStorage.setItem("seoshark_serper_key", key.value.trim()); updateSerperPill(); if ($("#serperStatus")) $("#serperStatus").textContent = ""; });
  key.addEventListener("input", () => updateSerperPill(!!key.value.trim()));
  const st = $("#serperStatus"), btn = $("#serperCheckBtn");
  if (btn) btn.addEventListener("click", async () => {
    const k = key.value.trim();
    if (!k) { if (st) { st.textContent = "Chưa nhập key"; st.style.color = "var(--amber)"; } updateSerperPill(false); return; }
    localStorage.setItem("seoshark_serper_key", k);
    if (st) { st.textContent = "⏳ Đang kiểm tra..."; st.style.color = "var(--muted)"; }
    try {
      const res = await _fetch("/api/serper/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serperKey: k }) });
      const d = await res.json();
      if (d.ok) { if (st) { st.textContent = "✓ Đã kết nối" + (d.credits != null ? ` · còn ${d.credits} lượt` : ""); st.style.color = "var(--green)"; } updateSerperPill(true); }
      else { if (st) { st.textContent = "✗ " + (d.error || "Key không hợp lệ"); st.style.color = "var(--red)"; } updateSerperPill(false); }
    } catch (e) { if (st) { st.textContent = "✗ " + e.message; st.style.color = "var(--red)"; } }
  });
  const p = $("#serperPill"); if (p) p.addEventListener("click", () => { const b = $("#engineBox"); if (b) { b.open = true; b.scrollIntoView({ behavior: "smooth", block: "center" }); } });
})();

/* ---------- Google Search Console — Service Account (mặc định) + Đăng nhập Google (fallback) ---------- */
window.GSC = { mode: "", token: "", exp: 0, siteUrl: localStorage.getItem("gsc_site") || "", sites: [], clientId: "", saEmail: "", tokenClient: null };
window.gscConnected = () => (GSC.mode === "sa" ? (GSC.sites || []).length > 0 : !!(GSC.token && Date.now() < GSC.exp - 60000));
(function initGsc() {
  const state = $("#gscState");
  if (!state) return;
  const gmsg = (type, m) => { const el = $("#gscMsg"); if (el) el.innerHTML = m ? `<span style="color:${type === "err" ? "#c0392b" : type === "info" ? "var(--green,#2e9e6b)" : "var(--muted)"}">${m}</span>` : ""; };
  const signBtn = $("#gscSignInBtn"), sel = $("#gscSiteSelect"), disc = $("#gscDisconnectBtn");
  const guideOauth = $("#gscSetupGuide"), guideSa = $("#gscSetupGuideSa"), saBox = $("#gscSaConnect");
  const originHint = $("#gscOriginHint"); if (originHint) originHint.textContent = location.origin;
  // Chip GSC trên header: hiện đã kết nối chưa + property nào
  function updateGscPill() {
    const dot = $("#gscPillDot"), txt = $("#gscPillText"), pill = $("#gscPill"), ec = $("#ecGscState");
    if (!txt) return;
    const conn = !!(window.gscConnected && window.gscConnected());
    const waiting = GSC.mode === "sa" && GSC.saConfigured !== false;
    if (conn) {
      const site = (GSC.siteUrl || "").replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "");
      txt.textContent = "GSC: " + (site || "đã kết nối");
    } else if (waiting) {
      txt.textContent = "GSC: chờ thêm email";
    } else {
      txt.textContent = "GSC: chưa kết nối";
    }
    if (pill) { pill.classList.toggle("good", conn); pill.classList.toggle("warn", !conn); }
    if (dot) dot.style.background = conn ? "var(--green)" : "var(--amber)";
    if (ec) { ec.textContent = conn ? "Đã kết nối" : (waiting ? "Chờ thêm email" : "Chưa kết nối"); ec.classList.toggle("on", conn); }
    if (window.opGscApplyState) window.opGscApplyState(); // đồng bộ box GSC trong Onpage khi trạng thái đổi
  }
  window.updateGscPill = updateGscPill;
  const gscPillEl = $("#gscPill");
  if (gscPillEl) gscPillEl.addEventListener("click", () => { const b = $("#engineBox"); if (b) { b.open = true; b.scrollIntoView({ behavior: "smooth", block: "center" }); } });
  const setState = (t, c) => { state.textContent = t; state.style.color = c; updateGscPill(); };

  // Nạp thư viện Google Identity Services (chỉ dùng cho chế độ OAuth fallback)
  let gisReady = null;
  function loadGis() {
    if (gisReady) return gisReady;
    gisReady = new Promise((resolve, reject) => {
      if (window.google && google.accounts && google.accounts.oauth2) return resolve();
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.defer = true;
      s.onload = resolve; s.onerror = () => reject(new Error("Không tải được Google Identity Services"));
      document.head.appendChild(s);
    });
    return gisReady;
  }
  // Tải danh sách property. SA: server tự dùng token; OAuth: gửi access_token client.
  async function loadSites(silent) {
    try {
      const body = GSC.mode === "sa" ? {} : { accessToken: GSC.token };
      const rs = await fetch("/api/gsc/sites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const ds = await rs.json();
      if (!rs.ok) { GSC.sites = []; if (!silent) gmsg("err", esc(ds.error || "Không lấy được property.")); return false; }
      GSC.sites = ds.sites || [];
      sel.innerHTML = `<option value="">— Chọn property —</option>` + GSC.sites.map((s) => `<option value="${esc(s.siteUrl)}">${esc(s.siteUrl)}</option>`).join("");
      if (GSC.siteUrl && GSC.sites.some((s) => s.siteUrl === GSC.siteUrl)) sel.value = GSC.siteUrl;
      else if (GSC.sites.length) { GSC.siteUrl = GSC.sites[0].siteUrl; sel.value = GSC.siteUrl; localStorage.setItem("gsc_site", GSC.siteUrl); }
      sel.classList.toggle("hidden", !GSC.sites.length);
      if (!GSC.sites.length) { if (!silent) gmsg("err", GSC.mode === "sa" ? "Chưa thấy property nào — kiểm tra đã Thêm email Service Account vào GSC (Cài đặt → Người dùng và quyền) chưa." : "Tài khoản này chưa có property nào trong Search Console."); return false; }
      setState("● Đã kết nối", "var(--green,#2e9e6b)");
      if (!silent) gmsg("info", `✓ Đã kết nối — ${GSC.sites.length} property. Chọn property để xem số liệu.`);
      return true;
    } catch { return false; }
  }
  // OAuth token client (fallback)
  function onToken(resp) {
    if (resp && resp.access_token) {
      GSC.token = resp.access_token; GSC.exp = Date.now() + (Number(resp.expires_in || 3600) * 1000);
      signBtn.textContent = "Đăng nhập lại"; disc.classList.remove("hidden");
      loadSites(false);
    } else gmsg("err", "Không lấy được quyền truy cập.");
  }
  async function signIn() {
    try {
      gmsg("", ""); await loadGis();
      if (!GSC.tokenClient) GSC.tokenClient = google.accounts.oauth2.initTokenClient({ client_id: GSC.clientId, scope: "https://www.googleapis.com/auth/webmasters.readonly", callback: onToken });
      GSC.tokenClient.requestAccessToken({ prompt: (GSC.token && Date.now() < GSC.exp - 60000) ? "" : "consent" });
    } catch (e) { gmsg("err", esc(e.message || "Lỗi đăng nhập")); }
  }
  signBtn.addEventListener("click", signIn);
  sel.addEventListener("change", (e) => { GSC.siteUrl = e.target.value; localStorage.setItem("gsc_site", GSC.siteUrl); gmsg("info", "✓ Đã chọn property."); updateGscPill(); });
  disc.addEventListener("click", () => {
    try { if (GSC.token && window.google) google.accounts.oauth2.revoke(GSC.token, () => {}); } catch {}
    GSC.token = ""; GSC.exp = 0; GSC.sites = []; setState("● Chưa đăng nhập", "var(--muted)");
    signBtn.textContent = "Đăng nhập bằng Google"; disc.classList.add("hidden"); sel.classList.add("hidden");
    gmsg("info", "Đã đăng xuất.");
  });
  // Service Account handlers
  const saCopy = $("#gscSaCopy"), saCheck = $("#gscSaCheck");
  if (saCopy) saCopy.addEventListener("click", () => { navigator.clipboard.writeText(GSC.saEmail || "").then(() => toast("Đã copy email!")).catch(() => toast("Không copy được.")); });
  if (saCheck) saCheck.addEventListener("click", async () => { gmsg("info", "Đang kiểm tra kết nối..."); await loadSites(false); });

  // Kiểm tra cấu hình
  (async function () {
    try {
      const r = await fetch("/api/gsc/config"); const d = await r.json();
      GSC.mode = d.mode || "none"; GSC.clientId = String(d.clientId || "").trim(); GSC.saEmail = String(d.saEmail || "").trim();
      guideSa.classList.add("hidden"); guideOauth.classList.add("hidden"); saBox.classList.add("hidden"); signBtn.classList.add("hidden"); disc.classList.add("hidden");
      if (GSC.mode === "sa") {
        saBox.classList.remove("hidden");
        $("#gscSaEmail").textContent = GSC.saEmail || "(không đọc được email)";
        setState("● Service Account đã cấu hình — thêm email vào GSC", "var(--muted)");
        await loadSites(true); // nếu đã thêm email vào GSC thì tự kết nối
      } else if (GSC.mode === "oauth" && GSC.clientId) {
        signBtn.classList.remove("hidden");
        setState("● Chưa đăng nhập", "var(--muted)");
      } else {
        // Chưa cấu hình gì: ưu tiên hướng dẫn OAuth "Đăng nhập bằng Google" (không bị chặn key như SA)
        guideOauth.classList.remove("hidden");
        guideSa.classList.remove("hidden");
        setState("● Chưa cấu hình — xem hướng dẫn kết nối bên dưới", "var(--muted)");
      }
    } catch { setState("● Không kiểm tra được", "var(--muted)"); }
  })();
})();

let _toastTimer = null;
function toast(msg, ms) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove("show"), ms || 1800);
}
function alertHtml(type, msg) {
  return `<div class="alert ${type}">${msg}</div>`;
}
function esc(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ===== KHO KIẾN THỨC DÙNG CHUNG (mọi tính năng) =====
// Nhập/lưu 1 lần ở bất kỳ tính năng nào -> dùng được ở TẤT CẢ. Mọi dropdown tự đồng bộ.
window.KB = {
  items: [],
  _selects: [],
  _defLabel(k) { return (k.website ? k.website + " · " : "") + (k.title || "Kiến thức"); },
  registerSelect(el, labeler) {
    if (!el || this._selects.some((s) => s.el === el)) return;
    const s = { el, labeler: labeler || this._defLabel };
    this._selects.push(s); this._fill(s);
  },
  _fill(s) {
    const cur = s.el.value;
    s.el.innerHTML = `<option value="">— Không dùng —</option>` + this.items.map((k) => `<option value="${esc(k.id)}">${esc(s.labeler(k))}</option>`).join("");
    if (cur && this.items.some((k) => k.id === cur)) s.el.value = cur;
  },
  fillAll() { this._selects = this._selects.filter((s) => s.el && s.el.isConnected); this._selects.forEach((s) => this._fill(s)); },
  get(id) { return this.items.find((k) => k.id === id); },
  async load() {
    try { const r = await fetch("/api/knowledge/list"); const d = await r.json(); this.items = Array.isArray(d.items) ? d.items : []; this.fillAll(); }
    catch { /* giữ danh sách cũ nếu lỗi mạng */ }
    return this.items;
  },
};
// Badge ưu tiên: Cao = đỏ nhạt (sapo), Trung bình = xanh (ok), Thấp = xám (ket). Chịu có/không dấu.
function priorityBadge(p) {
  const s = String(p || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const cls = s.startsWith("cao") ? "sapo" : s.startsWith("thap") ? "ket" : "ok";
  return `<span class="badge ${cls}">${esc(p || "TB")}</span>`;
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
  const msg = $("#analyzeMsg");
  msg.innerHTML = "";
  if (!url) { msg.innerHTML = alertHtml("err", "Hãy nhập URL bài viết."); return; }

  const btn = $("#btnAnalyze");
  busy(btn, true, "Đang đọc bài viết...");
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
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
  const badge = $("#aTargetBadge"); if (badge) badge.style.display = "none";
  $("#aStats").innerHTML = `
    <div class="stat"><b>${d.wordCount.toLocaleString("vi")}</b><span>Số từ</span></div>
    <div class="stat"><b>${d.blockCount}</b><span>Đoạn / khối</span></div>
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
    <input type="text" class="kw" placeholder="Từ khóa / anchor *" value="${esc(keyword)}" />
    <input type="text" class="kwurl" placeholder="URL đích * (https://...)" value="${esc(url)}" />
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

// --- CHEN THEO TU KHOA (URL dich BAT BUOC) ---
$("#btnKw").addEventListener("click", async () => {
  const keywords = $$("#kwRows .kw-row").map((r) => ({
    keyword: r.querySelector(".kw").value.trim(),
    url: r.querySelector(".kwurl").value.trim(),
  })).filter((k) => k.keyword);
  if (!keywords.length) {
    $("#optMsg").innerHTML = alertHtml("err", "Hãy nhập ít nhất 1 từ khóa.");
    return;
  }
  const missing = keywords.filter((k) => !/^https?:\/\//i.test(k.url));
  if (missing.length) {
    $("#optMsg").innerHTML = alertHtml("err", `Mỗi từ khóa cần 1 URL đích hợp lệ (http/https). Còn thiếu: ${missing.map((m) => esc(m.keyword)).join(", ")}`);
    return;
  }
  const extraTargets = keywords.map((k) => ({ url: k.url, title: k.keyword }));
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

  // Markdown (con giu tab Markdown)
  const cbm = $("#codeBeforeMd"); if (cbm) cbm.textContent = d.beforeMarkdown;
  const cam = $("#codeAfterMd"); if (cam) cam.textContent = d.afterMarkdown;
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
    $$("[data-featpane]").forEach((p) => p.classList.remove("active"));
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

// Buoc 1: Phan tich URL dich
$("#btnIncAnalyze").addEventListener("click", async () => {
  const targetUrl = $("#incTargetUrl").value.trim();
  const msg = $("#incAnalyzeMsg");
  msg.innerHTML = "";
  if (!targetUrl) { msg.innerHTML = alertHtml("err", "Hãy nhập URL đích."); return; }

  const btn = $("#btnIncAnalyze");
  busy(btn, true, "Đang đọc bài viết...");
  try {
    const res = await fetch("/api/incoming/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUrl }),
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
  const badge = $("#incSitemapBadge"); if (badge) badge.style.display = "none";
  $("#incStats").innerHTML = `
    <div class="stat"><b>${(d.target.wordCount || 0).toLocaleString("vi")}</b><span>Số từ</span></div>`;
  $("#incDefaultAnchor").value = d.defaultAnchorSuggestion || "";
  // reset cac dong nhap bai nguon
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

// Chen theo bai nguon nhap tay
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

// Trich ~n tu dau (giu du ngu canh doan chua anchor), an toan HTML, tu bao anchor bang <mark>.
function excerptWithAnchor(text, anchor, markId, wordLimit = 200) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const cut = words.length > wordLimit;
  let t = esc(cut ? words.slice(0, wordLimit).join(" ") + " …" : words.join(" "));
  const a = esc((anchor || "").trim());
  if (a) {
    const idx = t.toLowerCase().indexOf(a.toLowerCase());
    if (idx >= 0) t = t.slice(0, idx) + `<mark class="inc-mark" id="${markId}">${t.slice(idx, idx + a.length)}</mark>` + t.slice(idx + a.length);
  }
  return t || "<span class='muted'>(trống)</span>";
}

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
    const tbl = r.table || [];
    // Chips nhay toi tung anchor (highlight khi bam)
    const chips = tbl.length
      ? `<div class="inc-jumps"><span class="lbl">Nhảy tới anchor:</span>${tbl.map((t, i) =>
          `<button class="chip-jump" type="button" data-jump-mark="inc-mk-${idx}-${i}">🔗 ${esc(t.anchor) || ("link " + (i + 1))}</button>`).join("")}</div>`
      : "";
    const rows = tbl.map((t, i) => `<tr>
        <td class="c-anchor"><b>${esc(t.anchor)}</b>${t.url ? `<div class="c-url"><a href="${esc(t.url)}" target="_blank" rel="noopener">→ ${esc(t.url)}</a></div>` : ""}</td>
        <td class="c-before">${excerptWithAnchor(t.beforeSnippet, "", "", 200)}</td>
        <td class="c-after">${excerptWithAnchor(t.afterSnippet, t.anchor, "inc-mk-" + idx + "-" + i, 200)}</td>
        <td class="c-extra">${t.addedContent
          ? `<span class="badge sapo">Có</span>${t.reason ? `<div class="c-reason">${esc(t.reason)}</div>` : ""}`
          : `<span class="badge ket">Không</span>${t.reason ? `<div class="c-reason">${esc(t.reason)}</div>` : ""}`}</td>
      </tr>`).join("");
    const body = tbl.length
      ? `${chips}<div class="inc-tbl-wrap"><table class="inc-tbl"><thead><tr>
          <th style="width:18%">Anchor</th><th style="width:33%">Đoạn trước</th><th style="width:37%">Đoạn sau khi chèn</th><th style="width:12%">Viết thêm</th>
        </tr></thead><tbody>${rows}</tbody></table></div>`
      : alertHtml("warn", "Không chèn được link vào bài này.");
    const noteHtml = r.notes ? alertHtml("warn", "📌 " + esc(r.notes)) : "";
    return `<div class="src-card">
      <div class="src-head">
        <div class="stitle">📄 ${esc(r.title || r.url)} <span class="badge ok">${r.insertedCount} link</span></div>
        <a class="surl" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url)}</a>
      </div>
      <div class="src-body">
        ${noteHtml}
        ${body}
      </div>
    </div>`;
  }).join("");

  $("#incResults").innerHTML = html;
}

// Nhay toi anchor trong bang incoming + hieu ung flash
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-jump-mark]");
  if (!b) return;
  const el = document.getElementById(b.dataset.jumpMark);
  if (!el) { toast("Không tìm thấy anchor"); return; }
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
});

// ==================== AUTH (ĐĂNG NHẬP) ====================
let pendingRegEmail = "";

// Bat moi 401 -> hien lai man dang nhap
const _fetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const res = await _fetch(...args);
  try {
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    if (res.status === 401 && !url.includes("/api/auth/")) showAuth();
    // Server bao model AI THUC SU vua dung (co the da tut xuong vi het luot free) -> cap nhat header
    const m = res.headers.get("X-Ai-Model");
    const n = res.headers.get("X-Ai-Notice");
    if (m || n) noteServerModel(m || "", n ? decodeURIComponent(n) : "");
  } catch {}
  return res;
};

// Cap nhat model dang dung tren header + bao 1 lan khi phai tut model vi het luot mien phi
let _lastAiNotice = "", _lastAiNoticeAt = 0;
function noteServerModel(model, notice) {
  const engine = ($("#engine") || {}).value || "local";
  if (model && engine === "gemini") {
    const sel = $("#model");
    if (!sel || sel.value !== model) applyGeminiModel(model);
    setAiPill(true, `${prettyModel("gemini", model)} · đang dùng`);
  }
  if (notice) {
    const now = Date.now();
    if (notice !== _lastAiNotice || now - _lastAiNoticeAt > 60000) {
      _lastAiNotice = notice; _lastAiNoticeAt = now;
      toast(notice, 7000);
    }
    const s = $("#engineStatus");
    if (s) { s.textContent = "⚠ " + notice; s.style.color = "var(--amber)"; }
  }
}
window.noteServerModel = noteServerModel;

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
  $("#userAvatar").textContent = (user.name || user.email || "U").trim().charAt(0).toUpperCase() || "U";
  // Lời chào cá nhân hoá ở Dashboard: ưu tiên tên, else phần trước @ của email
  const greet = $("#heroGreet");
  if (greet) {
    const who = (user.name && user.name.trim()) || (user.email || "").split("@")[0] || "bạn";
    greet.textContent = `Xin chào, ${who}!`;
  }
  isAuthed = true;
  checkEngineConn();
  if (window.KB) KB.load(); // nạp kho kiến thức chung -> mọi dropdown ở mọi tính năng tự đồng bộ
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

// ===== Quên mật khẩu =====
let pendingForgotEmail = "";
$("#linkForgot").addEventListener("click", () => { setAuthMsg(); $("#forgotEmail").value = $("#loginEmail").value.trim(); showAform("forgot"); });
$("#forgotBackLogin").addEventListener("click", () => { switchAtab("login"); });
$("#forgotBackLogin2").addEventListener("click", () => { switchAtab("login"); });

// Bước 1: gửi mã khôi phục
$('[data-aform="forgot"]').addEventListener("submit", async (e) => {
  e.preventDefault();
  setAuthMsg();
  const email = $("#forgotEmail").value.trim();
  if (!email) return setAuthMsg("err", "❌ Nhập email đã đăng ký.");
  const btn = $("#btnForgot");
  busy(btn, true, "Đang gửi mã...");
  try {
    const res = await _fetch("/api/auth/forgot", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Không gửi được mã");
    pendingForgotEmail = email;
    $("#forgotEmailLabel").textContent = email;
    showAform("forgotVerify");
    setAuthMsg("info", "✉️ " + d.message);
  } catch (err) {
    setAuthMsg("err", "❌ " + err.message);
  } finally { busy(btn, false); }
});

// Bước 2: xác nhận mã -> lấy lại mật khẩu
$('[data-aform="forgotVerify"]').addEventListener("submit", async (e) => {
  e.preventDefault();
  setAuthMsg();
  const code = $("#forgotCode").value.trim();
  const btn = $("#btnForgotVerify");
  busy(btn, true, "Đang xác nhận...");
  try {
    const res = await _fetch("/api/auth/forgot/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pendingForgotEmail, code }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Xác nhận thất bại");
    // Điền sẵn form đăng nhập + hiện mật khẩu để người dùng lưu lại
    $("#loginEmail").value = pendingForgotEmail;
    $("#loginPassword").value = d.password || "";
    switchAtab("login");
    setAuthMsg("info", `✅ ${d.message} Mật khẩu của bạn: <b style="font-size:1.05em">${esc(d.password || "")}</b> — đã điền sẵn, bấm Đăng nhập.`);
  } catch (err) {
    setAuthMsg("err", "❌ " + err.message);
  } finally { busy(btn, false); }
});

// Gửi lại mã khôi phục
$("#btnForgotResend").addEventListener("click", async () => {
  if (!pendingForgotEmail) return;
  setAuthMsg();
  const btn = $("#btnForgotResend");
  busy(btn, true, "Đang gửi...");
  try {
    const res = await _fetch("/api/auth/forgot", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pendingForgotEmail }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Lỗi");
    setAuthMsg("info", "✉️ Đã gửi lại mã khôi phục.");
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

  // MỖI bài/từ khóa là ĐỘC LẬP: xóa sạch kết quả phân tích trước (outline heading, GSC, tối ưu)
  // để không dính "lịch sử" của bài/từ khóa khác — phân tích lại từ đầu.
  opSession = { id: null, data: null, optimize: null };
  opHeadOutline = [];
  _opGscQueries = [];
  ["opHeadResult", "opHeadMsg", "opGscResult", "opGscEvalResult", "opRecs", "opOptMsg", "opSummary", "opCompareTable"].forEach((id) => { const el = $("#" + id); if (el) el.innerHTML = ""; });
  $("#opOptResultCard").classList.add("hidden");
  $("#opResultCard").classList.add("hidden");

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
    opGscReveal(url);
    $("#opResultCard").scrollIntoView({ behavior: "smooth" });
  } catch (e) { msg.innerHTML = alertHtml("err", "❌ " + e.message); }
  finally { busy(btn, false); }
});

// ===== ONPAGE SUB-TABS: Tối ưu bài viết / Check dữ liệu =====
$$("#onpageTabs .tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$("#onpageTabs .tab").forEach((t) => t.classList.remove("active"));
    $$(".onpane").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    const pane = $(`.onpane[data-onpane="${tab.dataset.onpane}"]`);
    if (pane) pane.classList.add("active");
  });
});

// ===== CHECK DỮ LIỆU — BỔ SUNG NGUỒN UY TÍN =====
(function () {
  const fcState = { wordContent: "", wordName: "" };
  let fcItems = [];

  // Tab nguồn: URL / Word
  $$("#fcInputTabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$("#fcInputTabs .tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const m = tab.dataset.fcin;
      $("#fcInUrl").classList.toggle("hidden", m !== "url");
      $("#fcInWord").classList.toggle("hidden", m !== "word");
    });
  });

  // Đọc file Word (mammoth, client-side)
  const fcFile = $("#fcFile");
  if (fcFile) fcFile.addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const msg = $("#fcFileMsg"); msg.textContent = "Đang đọc file...";
    try {
      const buf = await f.arrayBuffer();
      const res = await window.mammoth.extractRawText({ arrayBuffer: buf });
      fcState.wordContent = (res.value || "").trim();
      fcState.wordName = f.name;
      msg.textContent = `${f.name} — ${fcState.wordContent.length.toLocaleString("vi")} ký tự`;
    } catch (err) { msg.textContent = "Lỗi đọc file: " + err.message; fcState.wordContent = ""; }
  });

  function markHl(s) { return esc(s).replace(/\[\[(.+?)\]\]/g, '<mark>$1</mark>'); }
  function stripHl(s) { return String(s || "").replace(/\[\[(.+?)\]\]/g, "$1"); }

  const RISK = { high: ["Rủi ro cao", "sapo"], medium: ["Rủi ro TB", "ket"], low: ["Rủi ro thấp", "ok"] };
  const STATUS = {
    accurate: ["Đã đúng — có nguồn", "ok"],
    corrected: ["Đã sửa số liệu", "sapo"],
    outdated: ["Lỗi thời — cần cập nhật", "sapo"],
    added: ["Chèn thêm số liệu", "ok"],
    unsupported: ["Chưa có nguồn xác nhận", "ket"],
    no_source: ["Không tìm được nguồn", "ket"],
  };
  function badge(label, kind) { return `<span class="badge ${kind}" style="font-size:.72rem">${esc(label)}</span>`; }

  function renderFc(data) {
    fcItems = data.items || [];
    const wrap = $("#fcResult");
    $("#fcResMeta").textContent = `${data.claimCount || 0} mục · ${data.engineUsed || ""}`;
    if (!fcItems.length) {
      wrap.innerHTML = alertHtml("ok", data.note || "Không phát hiện số liệu nào cần kiểm chứng.");
      $("#fcResultCard").classList.remove("hidden");
      return;
    }
    let html = "";
    if (data.quota) html += alertHtml("warn", "⚠ Hết lượt Serper free cho một số truy vấn — vài số liệu có thể thiếu nguồn.");
    fcItems.forEach((it, i) => {
      const st = STATUS[it.status] || ["", "ket"];
      const rk = RISK[it.risk] || RISK.medium;
      let src = "";
      if (it.sourceUrl) {
        src = `<div style="margin-top:8px;padding:9px 11px;background:#f2f7ff;border:1px solid #d8e6ff;border-radius:9px;font-size:.86rem">
            <div style="font-weight:700;color:#1f5fd0">Nguồn: <a href="${esc(it.sourceUrl)}" target="_blank" rel="noopener">${esc(it.sourceTitle || it.sourceUrl)}</a></div>
            <div class="muted" style="word-break:break-all;font-size:.8rem">${esc(it.sourceUrl)}</div>
            ${it.sourceNote ? `<div style="margin-top:4px;font-style:italic">“${esc(it.sourceNote)}”</div>` : ""}
          </div>`;
      } else {
        src = alertHtml("warn", "⚠ <b>Chưa tìm thấy số liệu này trong các nguồn uy tín</b> (Bộ Y tế, Viện/Hội/BV RHM, WHO, ADA, PubMed…). Không nên khẳng định con số nếu chưa có nguồn chính thống; hãy tự kiểm tra thêm.");
        if (it.candidates && it.candidates.length) {
          src += `<details style="margin-top:4px"><summary class="muted" style="cursor:pointer;font-size:.82rem">Xem ${it.candidates.length} kết quả tìm kiếm để tự đối chiếu</summary>
            <ul style="margin:6px 0;padding-left:18px;font-size:.82rem">${it.candidates.map((c) => `<li><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a> <span class="muted">(${esc(c.host)})</span>${c.auth ? ` <span class="badge ok" style="font-size:.62rem;padding:1px 6px">Uy tín</span>` : ""}</li>`).join("")}</ul></details>`;
        }
      }
      const modeBadge = it.mode === "add" ? badge("＋ Chèn thêm", "ok") : badge("Kiểm chứng", "ket");
      html += `<div class="card" style="padding:14px;margin-bottom:12px">
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
            ${modeBadge} ${badge(st[0], st[1])} ${badge(rk[0], rk[1])}
            ${it.confidence ? `<span class="muted" style="font-size:.78rem">độ tin cậy: ${esc(it.confidence)}</span>` : ""}
          </div>
          <div style="font-size:.83rem;color:var(--muted);margin-bottom:2px">${it.mode === "add" ? "Vị trí trong bài:" : "Câu gốc:"}</div>
          <div style="padding:7px 10px;background:#fafbfc;border:1px solid var(--line);border-radius:8px;font-size:.9rem">${esc(it.oldSentence)}</div>
          <div style="font-size:.83rem;color:var(--muted);margin:8px 0 2px">${it.mode === "add" ? "Câu sau khi chèn số liệu (tô vàng):" : "Đề xuất chèn/chỉnh (số liệu tô vàng):"}</div>
          <div style="padding:7px 10px;background:#f6fff6;border:1px solid #cdeccd;border-radius:8px;font-size:.9rem">${markHl(it.newSentence)}</div>
          ${it.advice ? `<div class="muted" style="margin-top:6px;font-size:.83rem">💡 ${esc(it.advice)}</div>` : ""}
          ${src}
          <div style="margin-top:8px"><button class="ghost small" type="button" onclick="window.__fcCopy(${i})">Copy đoạn này (kèm nguồn)</button></div>
        </div>`;
    });
    wrap.innerHTML = html;
    $("#fcResultCard").classList.remove("hidden");
    $("#fcResultCard").scrollIntoView({ behavior: "smooth" });
  }

  function itemText(it) {
    let t = stripHl(it.newSentence);
    if (it.sourceUrl) t += `\nNguồn: ${it.sourceTitle || ""} — ${it.sourceUrl}`;
    else t += `\n(Chưa có nguồn xác nhận)`;
    return t;
  }
  window.__fcCopy = (i) => {
    const it = fcItems[i]; if (!it) return;
    navigator.clipboard.writeText(itemText(it)).then(() => toast("Đã copy đoạn nội dung + nguồn"));
  };
  $("#fcCopyAll").addEventListener("click", () => {
    if (!fcItems.length) return;
    const all = fcItems.map((it, i) => `${i + 1}. ${itemText(it)}`).join("\n\n");
    navigator.clipboard.writeText(all).then(() => toast("Đã copy tất cả"));
  });

  $("#btnFcCheck").addEventListener("click", async () => {
    const msg = $("#fcMsg"); msg.textContent = "";
    const engine = $("#engine").value;
    if (engine !== "gemini" && engine !== "claude") { msg.innerHTML = alertHtml("err", "Cần bật engine Gemini/Claude ở ⚙️."); return; }
    const serperKey = localStorage.getItem("seoshark_serper_key") || "";
    if (!serperKey) { msg.innerHTML = alertHtml("err", "Cần Serper API key — mở ⚙️ Kết nối & Engine → cột Serper.dev (free 2.500 lượt) để tìm nguồn thật."); return; }

    const payload = {
      engine, apiKey: $("#apiKey").value.trim() || undefined, model: $("#model").value || undefined,
      mainKeyword: $("#fcKw").value.trim(), serperKey,
      gl: localStorage.getItem("seoshark_serp_gl") || "vn", hl: localStorage.getItem("seoshark_serp_hl") || "vi",
    };
    const mode = $("#fcInputTabs .tab.active").dataset.fcin;
    if (mode === "word") {
      if (!fcState.wordContent) { msg.innerHTML = alertHtml("err", "Hãy chọn file Word (.docx)."); return; }
      payload.content = fcState.wordContent; payload.title = fcState.wordName;
    } else {
      const url = $("#fcUrl").value.trim();
      if (!/^https?:\/\//i.test(url)) { msg.innerHTML = alertHtml("err", "Nhập URL hợp lệ."); return; }
      payload.url = url;
    }

    const btn = $("#btnFcCheck");
    busy(btn, true, "Đang rà soát số liệu & tìm nguồn thật (20-60s)...");
    try {
      const res = await fetch("/api/onpage/factcheck", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi không xác định");
      renderFc(data);
    } catch (e) { msg.innerHTML = alertHtml("err", "❌ " + e.message); }
    finally { busy(btn, false); }
  });
})();

// GSC trong Onpage: hiện box nếu đã kết nối; nút xem số liệu thật cho URL vừa audit
let _opGscUrl = "";
// Đổi controls/hint theo trạng thái GSC (chạy được cả khi GSC kết nối SAU khi audit)
function opGscApplyState() {
  const box = $("#opGscBox"); if (!box || box.classList.contains("hidden")) return;
  const conn = !!(window.gscConnected && window.gscConnected());
  const ctrls = $("#opGscControls"), hint = $("#opGscHint");
  if (ctrls) ctrls.classList.toggle("hidden", !conn);
  if (hint) hint.classList.toggle("hidden", conn);
}
window.opGscApplyState = opGscApplyState;
function opGscReveal(url) {
  _opGscUrl = url || "";
  const box = $("#opGscBox"); if (!box) return;
  $("#opGscResult").innerHTML = ""; $("#opGscMsg").textContent = "";
  box.classList.remove("hidden"); // LUÔN hiện box sau khi audit (kết nối hay chưa)
  opGscApplyState();
}
// Link trong hint -> mở hộp Engine để kết nối GSC
document.addEventListener("click", (e) => {
  const a = e.target.closest("#opGscOpenSettings"); if (!a) return;
  e.preventDefault(); const b = $("#engineBox"); if (b) { b.open = true; b.scrollIntoView({ behavior: "smooth", block: "center" }); }
});
// Khoảng thời gian GSC: đổi 'range' -> số ngày (raw view) / {range,start,end} (evaluate)
const OP_GSC_DAYS = { "24h": 1, "7d": 7, "28d": 28, "3m": 90, "6m": 180, "12m": 365 };
function opGscRangeInfo() {
  const range = ($("#opGscRange") && $("#opGscRange").value) || "28d";
  const start = ($("#opGscStart") && $("#opGscStart").value) || "";
  const end = ($("#opGscEnd") && $("#opGscEnd").value) || "";
  let days = OP_GSC_DAYS[range] || 28;
  if (range === "custom" && start && end) { days = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000)); }
  return { range, start, end, days };
}
if ($("#opGscRange")) $("#opGscRange").addEventListener("change", (e) => { $("#opGscCustom").classList.toggle("hidden", e.target.value !== "custom"); });

// Bảng truy vấn GSC có SẮP XẾP theo cột (bấm tiêu đề cột để sort tăng/giảm)
function mountGscTable(container, queries) {
  if (!container) return;
  const state = { key: "clicks", dir: -1, data: (queries || []).slice() };
  const cols = [
    { k: "query", label: "Truy vấn", num: false },
    { k: "clicks", label: "Clicks", num: true },
    { k: "impressions", label: "Impr.", num: true },
    { k: "ctr", label: "CTR", num: true, fmt: (v) => (v == null ? "—" : (v * 100).toFixed(1) + "%") },
    { k: "position", label: "Vị trí", num: true, fmt: (v) => (v == null ? "—" : Number(v).toFixed(1)) },
  ];
  function render() {
    const arr = state.data.slice().sort((a, b) => {
      if (state.key === "query") return state.dir * String(a.query || "").localeCompare(String(b.query || ""), "vi");
      const av = a[state.key] == null ? -1 : a[state.key], bv = b[state.key] == null ? -1 : b[state.key];
      return state.dir * (av - bv);
    });
    const arw = (k) => (state.key === k ? (state.dir < 0 ? " ▼" : " ▲") : ' <span style="opacity:.35">⇅</span>');
    const th = cols.map((c) => `<th data-sortk="${c.k}" title="Bấm để sắp xếp" style="cursor:pointer;user-select:none;white-space:nowrap;text-align:${c.num ? "right" : "left"};padding:6px 8px;border-bottom:2px solid var(--line)">${c.label}${arw(c.k)}</th>`).join("");
    const body = arr.map((q) => `<tr>${cols.map((c) => `<td style="padding:5px 8px;border-bottom:1px solid var(--line);text-align:${c.num ? "right" : "left"}">${c.num ? (c.fmt ? c.fmt(q[c.k]) : (q[c.k] == null ? "—" : q[c.k])) : esc(q[c.k] || "")}</td>`).join("")}</tr>`).join("");
    container.innerHTML = arr.length
      ? `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:.85rem"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`
      : `<div class="muted">Chưa có dữ liệu truy vấn cho URL này trong khoảng thời gian đã chọn.</div>`;
    container.querySelectorAll("[data-sortk]").forEach((el) => el.addEventListener("click", () => {
      const k = el.dataset.sortk;
      if (state.key === k) state.dir *= -1; else { state.key = k; state.dir = k === "query" ? 1 : -1; }
      render();
    }));
  }
  render();
}
if ($("#opGscBtn")) $("#opGscBtn").addEventListener("click", async () => {
  const url = _opGscUrl || $("#opUrl").value.trim();
  if (!url) return;
  const { days } = opGscRangeInfo();
  if (!(window.gscConnected && window.gscConnected())) { $("#opGscMsg").innerHTML = `<span style="color:#c0392b">Chưa đăng nhập Google. Vào ⚙️ → Google Search Console → Đăng nhập bằng Google.</span>`; return; }
  const btn = $("#opGscBtn"); busy(btn, true, "Đang lấy số liệu...");
  $("#opGscMsg").textContent = "";
  try {
    const r = await fetch("/api/gsc/metrics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, days, accessToken: (window.GSC || {}).token, siteUrl: (window.GSC || {}).siteUrl }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Lỗi GSC");
    const t = d.totals || {};
    const pct = (x) => (x == null ? "—" : (x * 100).toFixed(1) + "%");
    const pos = (x) => (x == null ? "—" : x.toFixed(1));
    const stat = (label, val) => `<div style="flex:1;min-width:120px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff"><div class="muted" style="font-size:.72rem;text-transform:uppercase;letter-spacing:.04em">${label}</div><div style="font-size:1.3rem;font-weight:700;color:var(--ink)">${val}</div></div>`;
    $("#opGscResult").innerHTML =
      `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">${stat("Clicks", t.clicks || 0)}${stat("Impressions", t.impressions || 0)}${stat("CTR", pct(t.ctr))}${stat("Vị trí TB", pos(t.position))}</div>` +
      `<div class="muted" style="font-size:.8rem;margin-bottom:4px">Property: ${esc(d.siteUrl || "")} · ${d.days} ngày · Top truy vấn (bấm tiêu đề cột để sắp xếp):</div>` +
      `<div id="opGscTbl"></div>`;
    mountGscTable($("#opGscTbl"), d.queries);
    _opGscQueries = d.queries || [];
  } catch (e) { $("#opGscMsg").innerHTML = `<span style="color:#c0392b">❌ ${esc(e.message)}</span>`; }
  finally { busy(btn, false); }
});

// AI đánh giá Onpage tổng hợp (GSC thật + đối thủ + tiêu chí)
if ($("#opGscEval")) $("#opGscEval").addEventListener("click", async () => {
  const url = _opGscUrl || $("#opUrl").value.trim();
  if (!url) return;
  if (!opSession.id) { $("#opGscMsg").innerHTML = `<span style="color:#c0392b">Hãy phân tích On-page trước.</span>`; return; }
  if (!(window.gscConnected && window.gscConnected())) { $("#opGscMsg").innerHTML = `<span style="color:#c0392b">Chưa đăng nhập Google (⚙️ → Đăng nhập bằng Google).</span>`; return; }
  const engine = $("#engine").value;
  if (engine !== "gemini" && engine !== "claude") { $("#opGscMsg").innerHTML = `<span style="color:#c0392b">Cần bật Gemini/Claude ở ⚙️ để AI đánh giá.</span>`; return; }
  const { range, start, end } = opGscRangeInfo();
  if (range === "custom" && (!start || !end)) { $("#opGscMsg").innerHTML = `<span style="color:#c0392b">Chọn ngày bắt đầu & kết thúc.</span>`; return; }
  const btn = $("#opGscEval"); busy(btn, true, "AI đang đánh giá theo số liệu GSC...");
  $("#opGscMsg").textContent = ""; $("#opGscEvalResult").innerHTML = "";
  try {
    const r = await fetch("/api/onpage/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: opSession.id, range, start, end, accessToken: (window.GSC || {}).token, siteUrl: (window.GSC || {}).siteUrl, engine, model: $("#model").value || undefined, apiKey: $("#apiKey").value.trim() || undefined }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Lỗi đánh giá");
    renderOpEvaluate(d);
    $("#opGscEvalResult").scrollIntoView({ block: "nearest", behavior: "smooth" });
  } catch (e) { $("#opGscMsg").innerHTML = `<span style="color:#c0392b">❌ ${esc(e.message)}</span>`; }
  finally { busy(btn, false); }
});
function renderOpEvaluate(d) {
  const pct = (x) => (x == null ? "—" : (x * 100).toFixed(1) + "%");
  const pos = (x) => (x == null ? "—" : Number(x).toFixed(1));
  const g = d.gsc || {}; const t = g.totals || {}; const pv = g.prevTotals;
  const arrow = (cur, prev) => { if (prev == null) return ""; const dv = cur - prev; const good = dv >= 0; return ` <span style="color:${good ? "#2e9e6b" : "#c0392b"};font-size:.8rem">(${dv >= 0 ? "+" : ""}${dv} vs kỳ trước)</span>`; };
  const stat = (label, val, extra) => `<div style="flex:1;min-width:120px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff"><div class="muted" style="font-size:.72rem;text-transform:uppercase">${label}</div><div style="font-size:1.2rem;font-weight:700;color:var(--ink)">${val}${extra || ""}</div></div>`;
  const pill = priorityBadge;
  let html = `<div class="alert info" style="margin-bottom:10px"><b>Báo cáo AI đánh giá Onpage</b> — Engine: ${esc(d.engineUsed || "")} · GSC: ${esc(g.rangeLabel || "")} · Property: ${esc(g.siteUrl || "")}</div>`;
  html += `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">${stat("Clicks", t.clicks || 0, arrow(t.clicks || 0, pv && pv.clicks))}${stat("Impressions", t.impressions || 0, arrow(t.impressions || 0, pv && pv.impressions))}${stat("CTR", pct(t.ctr))}${stat("Vị trí TB", pos(t.position))}</div>`;
  if (d.overview) html += `<h3 style="margin:6px 0">Tổng quan</h3><p>${esc(d.overview)}</p>`;
  if (d.performance) html += `<h3 style="margin:12px 0 6px">Hiệu suất tìm kiếm (GSC)</h3><p>${esc(d.performance)}</p>`;
  if (d.opportunities && d.opportunities.length) html += `<h3 style="margin:12px 0 6px">🎯 Cơ hội từ GSC (impression cao / sắp lên trang 1)</h3>` + d.opportunities.map((o) => `<div class="opd"><b>${esc(o.query || "")}</b>${o.insight ? `<div class="muted">${esc(o.insight)}</div>` : ""}<div>→ ${esc(o.action || "")}</div></div>`).join("");
  if (d.onpageGaps && d.onpageGaps.length) html += `<h3 style="margin:12px 0 6px">Khoảng cách Onpage vs đối thủ</h3><ul style="margin:0 0 0 18px">${d.onpageGaps.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  if (d.actions && d.actions.length) html += `<h3 style="margin:12px 0 6px">✅ Việc cần làm (ưu tiên)</h3>` + d.actions.map((a) => `<div class="rec-item"><div class="rec-body"><label>${pill(a.priority)} <b>${esc(a.action)}</b></label>${a.why ? `<div class="muted">💡 ${esc(a.why)}</div>` : ""}</div></div>`).join("");
  if (g.queries && g.queries.length) html += `<h3 style="margin:12px 0 6px">Bảng truy vấn GSC <span class="muted" style="font-weight:400;font-size:.85rem">(bấm tiêu đề cột để sắp xếp)</span></h3><div id="opGscEvalTbl"></div>`;
  $("#opGscEvalResult").innerHTML = html;
  if (g.queries && g.queries.length) { mountGscTable($("#opGscEvalTbl"), g.queries); _opGscQueries = g.queries; }
}

/* ---------- Tối ưu cấu trúc Heading: GIỮ / SỬA / XÓA / THÊM ---------- */
let _opGscQueries = [];   // truy vấn GSC gần nhất (nếu có) → AI biết nhu cầu thật
let opHeadOutline = [];   // outline cuối sau tối ưu
if ($("#btnOpHeadings")) $("#btnOpHeadings").addEventListener("click", async () => {
  const msg = $("#opHeadMsg"); msg.innerHTML = "";
  if (!opSession.id) { msg.innerHTML = alertHtml("err", "Hãy phân tích On-page trước."); return; }
  const engine = $("#engine").value;
  if (engine !== "gemini" && engine !== "claude") { msg.innerHTML = alertHtml("err", "Cần bật engine Gemini/Claude ở ⚙️."); return; }
  const btn = $("#btnOpHeadings"); busy(btn, true, "AI đang soi từng heading...");
  $("#opHeadResult").innerHTML = "";
  try {
    const r = await fetch("/api/onpage/headings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: opSession.id, engine, model: $("#model").value || undefined, apiKey: $("#apiKey").value.trim() || undefined,
        knowledge: opHeadResolveKnowledge() || undefined, skill: opResolveSkill() || undefined,
        gscQueries: (_opGscQueries || []).slice(0, 20),
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Lỗi tối ưu heading");
    renderOpHeadings(d);
  } catch (e) { msg.innerHTML = alertHtml("err", "❌ " + e.message); }
  finally { busy(btn, false); }
});
function renderOpHeadings(d) {
  opHeadOutline = d.finalOutline || [];
  const items = d.items || [];
  const by = (a) => items.filter((x) => x.action === a);
  const card = (it) => {
    let body;
    if (it.action === "add") body = `<b class="oph-new">+ H${it.level}: ${esc(it.suggested || "")}</b>${it.position ? `<div class="muted oph-pos">chèn ${esc(it.position)}</div>` : ""}`;
    else if (it.action === "rewrite") body = `<div class="oph-old"><s>H${it.level}: ${esc(it.current)}</s></div><b class="oph-fix">→ H${it.level}: ${esc(it.suggested || "")}</b>`;
    else if (it.action === "remove") body = `<s class="oph-del">H${it.level}: ${esc(it.current)}</s>`;
    else body = `<b>H${it.level}: ${esc(it.current)}</b>`;
    return `<div class="oph-card">${body}${it.reason ? `<div class="oph-reason">💡 ${esc(it.reason)}</div>` : ""}</div>`;
  };
  const col = (title, arr, cls) => `<div class="oph-col ${cls}"><div class="oph-colhead">${title}<span class="oph-count">${arr.length}</span></div><div class="oph-list">${arr.map(card).join("") || '<div class="muted oph-empty">— không có —</div>'}</div></div>`;

  let html = "";
  if (d.summary) html += alertHtml("info", esc(d.summary));
  if (d.intent) html += `<div class="opd" style="margin-bottom:10px"><b>Search intent:</b> ${esc(d.intent)}</div>`;
  html += `<div class="ophead-cols">
    ${col("🗑️ Nên xóa / gộp", by("remove"), "c-del")}
    ${col("✏️ Nên sửa lại", by("rewrite"), "c-fix")}
    ${col("➕ Nên thêm", by("add"), "c-add")}
    ${col("✅ Giữ nguyên", by("keep"), "c-keep")}
  </div>`;

  if (opHeadOutline.length) {
    const rows = opHeadOutline.map((o) => {
      const tag = { add: '<span class="badge ok" style="font-size:.6rem">mới</span>', rewrite: '<span class="badge sapo" style="font-size:.6rem">sửa</span>' }[o.status] || "";
      const indent = Math.max(0, o.level - 2) * 18;
      return `<div class="oph-oline" style="padding-left:${indent}px"><b>H${o.level}:</b> ${esc(o.text)} ${tag}</div>`;
    }).join("");
    html += `<div class="flexbar" style="margin:16px 0 6px"><h4 style="margin:0">📄 Outline cuối sau tối ưu</h4><button class="ghost small" id="opHeadCopy" type="button">Copy outline</button></div>
      <div class="oph-final">${rows}</div>
      <label style="display:flex;gap:6px;align-items:center;font-weight:600;font-size:13px;cursor:pointer;margin-top:8px"><input type="checkbox" id="opHeadUse" checked style="width:16px;height:16px;accent-color:var(--c-blue)"> Dùng outline này khi "Tối ưu toàn bộ bài"</label>`;
  }
  $("#opHeadResult").innerHTML = html;
  const cp = $("#opHeadCopy");
  if (cp) cp.addEventListener("click", () => {
    // Dinh dang de copy: "H2: noi dung" moi dong (theo yeu cau nguoi dung)
    const txt = opHeadOutline.map((o) => `H${o.level}: ${o.text}`).join("\n");
    navigator.clipboard.writeText(txt).then(() => toast("Đã copy outline!")).catch(() => toast("Không copy được."));
  });
}

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
    const pill = priorityBadge;
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

/* ---------- Onpage: Kiến thức website + Skill (chỉ dùng khi 'Tối ưu toàn bộ bài') ---------- */
let opSkillList = [], opExtrasLoaded = false;
function opSetWsMsg(m, t) { const el = $("#opWsMsg"); if (el) el.innerHTML = m ? `<span style="color:${t === "err" ? "#c0392b" : "var(--green,#2e9e6b)"}">${esc(m)}</span>` : ""; }
// 2 select kiến thức của Onpage lấy từ KHO CHUNG (đồng bộ với Lên outline/GBP)
KB.registerSelect($("#opKnowSelect"));
KB.registerSelect($("#opHeadKnowSelect"));
async function opLoadKnow() { await KB.load(); }
// Chuyen kien thuc HTML (rich text) -> text de doc de cho AI. Chiu duoc ca text thuong (khong the).
function htmlToReadable(s) {
  s = String(s || "");
  if (!/<[a-z!/]/i.test(s)) return s.trim(); // khong co the HTML -> text thuong
  const box = document.createElement("div");
  box.innerHTML = s;
  const lines = [];
  const walk = (el) => {
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) { const t = n.textContent.replace(/\s+/g, " "); if (t.trim()) lines.push(t); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) { lines.push("\n" + "#".repeat(+tag[1]) + " " + n.textContent.trim()); return; }
      if (tag === "li") { lines.push("- " + n.textContent.replace(/\s+/g, " ").trim()); return; }
      if (["p", "div", "br", "ul", "ol", "tr"].includes(tag)) { walk(n); lines.push("\n"); return; }
      walk(n);
    });
  };
  walk(box);
  return lines.join(" ").replace(/\n\s+/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}
function opHeadResolveKnowledge() {
  const k = KB.get((($("#opHeadKnowSelect") || {}).value || ""));
  return k ? htmlToReadable(k.content || "") : "";
}
// Bien 1 <textarea> thanh trinh soan RICH TEXT (giu textarea an lam noi luu .value = HTML).
// Nho vay MOI code doc/ghi .value cu van hoat dong (nhan/tra ve HTML), khong phai sua rai rac.
function makeRichEditor(ta) {
  if (!ta || ta._rte) return;
  const wrap = document.createElement("div"); wrap.className = "rte";
  const bar = document.createElement("div"); bar.className = "rte-bar";
  const ed = document.createElement("div"); ed.className = "rte-ed"; ed.contentEditable = "true";
  ed.setAttribute("data-ph", ta.getAttribute("placeholder") || "");

  // Định dạng bằng thao tác DOM (KHÔNG dùng execCommand — đã deprecated & hay bị chặn).
  const selRange = () => { const s = window.getSelection(); return s && s.rangeCount ? s.getRangeAt(0) : null; };
  const inEd = (node) => { while (node) { if (node === ed) return true; node = node.parentNode; } return false; };
  const blockOf = (node) => { while (node && node !== ed) { if (node.nodeType === 1 && /^(P|DIV|H[1-6]|LI|PRE|BLOCKQUOTE)$/.test(node.tagName)) return node; node = node.parentNode; } return null; };
  // Lưu range cuối cùng NẰM TRONG editor — vì khi bấm nút, focus rời khỏi editor làm mất selection.
  let saved = null;
  document.addEventListener("selectionchange", () => { const r = selRange(); if (r && inEd(r.commonAncestorContainer)) saved = r.cloneRange(); });
  // Lấy range làm việc (ưu tiên selection hiện tại trong editor, else range đã lưu) + gắn lại vào selection.
  function useRange() {
    let r = selRange();
    if (!(r && inEd(r.commonAncestorContainer))) r = saved;
    if (!r) return null;
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    return window.getSelection().getRangeAt(0);
  }
  const selectNode = (el, collapseEnd) => { const s = window.getSelection(); s.removeAllRanges(); const r = document.createRange(); r.selectNodeContents(el); if (collapseEnd) r.collapse(false); s.addRange(r); };
  function wrapInline(tag) {
    const r = useRange(); if (!r || r.collapsed) return;
    const el = document.createElement(tag);
    try { el.appendChild(r.extractContents()); r.insertNode(el); selectNode(el); } catch {}
  }
  function setBlock(tag) {
    const r = useRange(); if (!r) return;
    let b = blockOf(r.startContainer);
    if (!b) { const el = document.createElement(tag); try { el.appendChild(r.extractContents()); r.insertNode(el); } catch { el.textContent = ed.textContent; ed.innerHTML = ""; ed.appendChild(el); } b = el; }
    else { const nb = document.createElement(tag); nb.innerHTML = b.innerHTML; b.replaceWith(nb); b = nb; }
    selectNode(b, true);
  }
  function makeList(ordered) {
    const r = useRange(); if (!r) return;
    const b = blockOf(r.startContainer);
    const list = document.createElement(ordered ? "ol" : "ul"); const li = document.createElement("li");
    if (b) { li.innerHTML = b.innerHTML || b.textContent; list.appendChild(li); b.replaceWith(list); }
    else { try { li.appendChild(r.extractContents()); } catch {} list.appendChild(li); r.insertNode(list); }
    selectNode(li, true);
  }
  function clearFmt() {
    const r = useRange(); if (!r || r.collapsed) return;
    const txt = r.toString(); r.deleteContents(); r.insertNode(document.createTextNode(txt));
  }
  const ACT = { bold: () => wrapInline("b"), italic: () => wrapInline("i"), h2: () => setBlock("H2"), h3: () => setBlock("H3"), p: () => setBlock("P"), ul: () => makeList(false), ol: () => makeList(true), clear: clearFmt };
  const run = (name) => { if (ACT[name]) ACT[name](); ed.focus(); ta.dispatchEvent(new Event("input", { bubbles: true })); };
  const BTNS = [["<b>B</b>", "In đậm", "bold"], ["<i>I</i>", "In nghiêng", "italic"], ["H2", "Tiêu đề H2", "h2"], ["H3", "Tiêu đề H3", "h3"], ["¶", "Đoạn văn", "p"], ["• List", "Danh sách chấm", "ul"], ["1. List", "Danh sách số", "ol"], ["⌫ Xoá ĐD", "Xoá định dạng", "clear"]];
  BTNS.forEach(([label, title, name]) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "rte-b"; b.title = title; b.innerHTML = label;
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => run(name));
    bar.appendChild(b);
  });

  ta.style.display = "none";
  ta.parentNode.insertBefore(wrap, ta);
  wrap.appendChild(bar); wrap.appendChild(ed); wrap.appendChild(ta);
  ed.innerHTML = ta.getAttribute("value") || ta.textContent || "";
  Object.defineProperty(ta, "value", {
    configurable: true,
    get() { return ed.textContent.trim() ? ed.innerHTML : ""; },
    set(v) { ed.innerHTML = v == null ? "" : String(v); },
  });
  ed.addEventListener("input", () => ta.dispatchEvent(new Event("input", { bubbles: true })));
  ta._rte = ed;
}
if ($("#opKnowContent")) makeRichEditor($("#opKnowContent"));
if ($("#opHeadKnowReload")) $("#opHeadKnowReload").addEventListener("click", () => { opLoadKnow(); toast("Đã nạp lại danh sách kiến thức."); });
async function opLoadSkills() {
  try {
    const r = await fetch("/api/skills/list"); const d = await r.json(); opSkillList = d.items || [];
    const sel = $("#opWsSelect"); const cur = sel.value;
    sel.innerHTML = `<option value="">— Không dùng —</option>` + opSkillList.map((k) => `<option value="${esc(k.id)}">${esc(k.title || "Skill")}</option>`).join("");
    if (cur && opSkillList.some((k) => k.id === cur)) sel.value = cur;
  } catch {}
}
function opToggleFullExtras() {
  const full = ((document.querySelector('input[name="opMode"]:checked') || {}).value) === "full";
  $("#opFullExtras").classList.toggle("hidden", !full);
  if (full && !opExtrasLoaded) { opExtrasLoaded = true; opLoadKnow(); opLoadSkills(); }
}
$$('input[name="opMode"]').forEach((r) => r.addEventListener("change", opToggleFullExtras));
opToggleFullExtras();
function opResolveKnowledge() {
  const typed = ($("#opKnowContent").value || "").trim();
  if (typed && !$("#opKnowEditor").classList.contains("hidden")) return typed;
  const k = KB.get($("#opKnowSelect").value);
  return k ? htmlToReadable(k.content || "") : "";
}
function opResolveSkill() {
  const typed = ($("#opWsContent").value || "").trim();
  if (typed && !$("#opWsEditor").classList.contains("hidden")) return typed;
  const s = opSkillList.find((x) => x.id === $("#opWsSelect").value);
  return s ? (s.content || "") : "";
}
// Đọc file docx/xlsx/txt. asHtml=true -> giữ cấu trúc (heading/list/đậm) cho rich editor.
async function opReadDocFile(f, allowXlsx, asHtml) {
  const buf = await f.arrayBuffer();
  if (/\.docx$/i.test(f.name)) {
    if (asHtml) { const res = await window.mammoth.convertToHtml({ arrayBuffer: buf }); return res.value || ""; }
    const res = await window.mammoth.extractRawText({ arrayBuffer: buf }); return res.value || "";
  }
  if (/\.txt$/i.test(f.name)) { const t = new TextDecoder("utf-8").decode(buf); return asHtml ? esc(t).replace(/\n/g, "<br>") : t; }
  if (allowXlsx && /\.xlsx?$/i.test(f.name)) { const wb = XLSX.read(buf, { type: "array" }); const csv = wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join("\n"); return asHtml ? "<pre>" + esc(csv) + "</pre>" : csv; }
  throw new Error(allowXlsx ? "Chỉ .docx/.xlsx" : "Chỉ .docx/.txt");
}
// Knowledge editor
$("#opKnowNew").addEventListener("click", () => { const ed = $("#opKnowEditor"); ed.classList.toggle("hidden"); const k = KB.get($("#opKnowSelect").value); if (!ed.classList.contains("hidden") && k) { $("#opKnowTitle").value = k.title || ""; $("#opKnowContent").value = k.content || ""; } });
$("#opKnowFile").addEventListener("change", async (e) => { const f = e.target.files[0]; if (!f) return; $("#opKnowFileMsg").textContent = "Đang đọc..."; try { const html = await opReadDocFile(f, true, true); const box = $("#opKnowContent"); const cur = box.value; box.value = (cur ? cur : "") + html; if (!$("#opKnowTitle").value.trim()) $("#opKnowTitle").value = f.name.replace(/\.(docx|xlsx?)$/i, ""); $("#opKnowFileMsg").textContent = `✓ Đã nạp nội dung từ ${esc(f.name)} (giữ định dạng)`; } catch (err) { $("#opKnowFileMsg").textContent = "Lỗi: " + (err.message || err); } finally { e.target.value = ""; } });
$("#opKnowSave").addEventListener("click", async () => { const content = $("#opKnowContent").value.trim(); if (!content) return toast("Nội dung kiến thức trống."); const editingId = KB.get($("#opKnowSelect").value) ? $("#opKnowSelect").value : ""; const btn = $("#opKnowSave"); busy(btn, true, "Đang lưu..."); try { const r = await fetch("/api/knowledge/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingId, website: "", title: $("#opKnowTitle").value.trim(), content }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Lưu lỗi"); await opLoadKnow(); $("#opKnowSelect").value = d.id; $("#opKnowEditor").classList.add("hidden"); toast("Đã lưu kiến thức."); } catch (e) { toast("❌ " + e.message); } finally { busy(btn, false); } });
// Skill editor
$("#opWsNew").addEventListener("click", () => { const ed = $("#opWsEditor"); ed.classList.toggle("hidden"); const k = opSkillList.find((x) => x.id === $("#opWsSelect").value); if (!ed.classList.contains("hidden") && k) { $("#opWsTitle").value = k.title || ""; $("#opWsContent").value = k.content || ""; } });
$("#opWsFile").addEventListener("change", async (e) => { const f = e.target.files[0]; if (!f) return; $("#opWsFileMsg").textContent = "Đang đọc..."; try { const text = await opReadDocFile(f, false); const box = $("#opWsContent"); box.value = (box.value.trim() ? box.value.trim() + "\n\n" : "") + text.trim(); if (!$("#opWsTitle").value.trim()) $("#opWsTitle").value = f.name.replace(/\.(docx|txt)$/i, ""); $("#opWsFileMsg").textContent = `✓ Đã nạp ${text.trim().length.toLocaleString("vi")} ký tự`; } catch (err) { $("#opWsFileMsg").textContent = "Lỗi: " + (err.message || err); } finally { e.target.value = ""; } });
$("#opWsSave").addEventListener("click", async () => { const content = $("#opWsContent").value.trim(); if (!content) return opSetWsMsg("Nội dung skill trống.", "err"); const editingId = opSkillList.find((x) => x.id === $("#opWsSelect").value) ? $("#opWsSelect").value : ""; const btn = $("#opWsSave"); busy(btn, true, "Đang lưu..."); try { const r = await fetch("/api/skills/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingId, title: $("#opWsTitle").value.trim(), content }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Lưu lỗi"); await opLoadSkills(); $("#opWsSelect").value = d.id; $("#opWsEditor").classList.add("hidden"); opSetWsMsg("✓ Đã lưu skill.", "info"); } catch (e) { opSetWsMsg("❌ " + e.message, "err"); } finally { busy(btn, false); } });
$("#opWsDelete").addEventListener("click", async () => { const id = $("#opWsSelect").value; if (!id) return opSetWsMsg("Chọn skill để xóa.", "err"); if (!confirm("Xóa skill này?")) return; try { const r = await fetch("/api/skills/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); const d = await r.json(); if (d.ok) { await opLoadSkills(); opSetWsMsg("Đã xóa.", "info"); } else opSetWsMsg("Không xóa được.", "err"); } catch { opSetWsMsg("Lỗi xóa.", "err"); } });

// Buoc 2: Toi uu (viet lai)
$("#btnOpOptimize").addEventListener("click", async () => {
  const msg = $("#opOptMsg"); msg.innerHTML = "";
  if (!opSession.id) { msg.innerHTML = alertHtml("err", "Hãy phân tích trước."); return; }
  const selected = $$("#opCompareTable .op-rec-check:checked").map((c) => c.dataset.criterion);

  const mode = (document.querySelector('input[name="opMode"]:checked') || {}).value || "criteria";
  const payload = {
    id: opSession.id, selected, extra: $("#opExtra").value.trim() || undefined,
    optimizeMode: mode,
    engine: $("#engine").value, apiKey: $("#apiKey").value.trim() || undefined, model: $("#model").value || undefined,
  };
  if (mode === "full") {
    payload.knowledge = opResolveKnowledge() || undefined;
    payload.skill = opResolveSkill() || undefined;
    // Nếu đã tối ưu heading và người dùng chọn dùng outline đó -> bắt bài viết lại bám đúng
    const useOutline = $("#opHeadUse") && $("#opHeadUse").checked;
    if (useOutline && opHeadOutline && opHeadOutline.length) payload.outline = opHeadOutline;
  }

  const btn = $("#btnOpOptimize");
  busy(btn, true, mode === "criteria" ? "AI đang tối ưu các tiêu chí đã tick..." : "AI đang viết lại bài chuẩn SEO...");
  try {
    const res = await fetch("/api/onpage/optimize", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Lỗi không xác định");
    opSession.optimize = data;
    if (data.mode === "criteria") renderOpCriteria(data);
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

// Chế độ CRITERIA: chỉ hiển thị TRƯỚC/SAU của đúng các tiêu chí đã tick
function renderOpCriteria(d) {
  $("#opFullResult").classList.add("hidden");
  $("#opSuggestResult").classList.remove("hidden");
  $("#opOptMeta").textContent = `Engine: ${d.engineUsed} · Chỉ tiêu chí đã tick`;
  $("#opChanges").innerHTML = alertHtml("info", "Chỉ hiển thị bản <b>TRƯỚC/SAU</b> của đúng các tiêu chí bạn đã tick — không đụng phần khác.");
  const items = d.items || [];
  $("#opSuggestResult").innerHTML = items.length ? items.map((it, i) => `
    <div class="src-card">
      <div class="src-head"><div class="stitle">${esc(it.criterion)}</div>${it.note ? `<div class="surl">${esc(it.note)}</div>` : ""}</div>
      <div class="src-body">
        <div class="opd"><b>TRƯỚC:</b><div style="white-space:pre-wrap;margin-top:4px">${esc(it.before || "(trống)")}</div></div>
        <div class="opd" style="margin-top:8px"><b>SAU:</b> <button class="ghost small" data-copycrit="${i}">Copy</button><div class="opnew" style="white-space:pre-wrap;margin-top:4px;padding:6px;border-radius:6px">${esc(it.after || "")}</div></div>
      </div>
    </div>`).join("") : alertHtml("warn", "Không có kết quả cho tiêu chí đã tick.");
}
// Copy bản SAU của 1 tiêu chí (chế độ criteria)
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-copycrit]");
  if (!b || !opSession.optimize) return;
  const it = (opSession.optimize.items || [])[+b.dataset.copycrit];
  if (it && it.after != null) navigator.clipboard.writeText(it.after).then(() => toast("Đã copy bản tối ưu!"));
});

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

  // So lieu TRUOC -> SAU: so tu + so lan xuat hien tu khoa chinh/phu (uu tien so lieu server)
  const md = d.after.markdown || "";
  const mk = d.mainKeyword || "";
  const subs = d.subKeywords || [];
  const bMd = d.before.markdown || "";
  const bStats = d.before.stats || { words: opCountWords(bMd), mainKw: mk ? opCountOccur(bMd, mk) : 0, subKw: subs.reduce((a, s) => a + opCountOccur(bMd, s), 0) };
  const aStats = d.after.stats || { words: opCountWords(md), mainKw: mk ? opCountOccur(md, mk) : 0, subKw: subs.reduce((a, s) => a + opCountOccur(md, s), 0) };
  const nf = (x) => Number(x || 0).toLocaleString("vi");
  const statCell = (label, b, a) => `<div class="stat"><b>${nf(a)}</b><span>${label}<br><small class="muted">trước: ${nf(b)}</small></span></div>`;
  let stats = statCell("Số từ", bStats.words, aStats.words);
  if (mk) stats += statCell(`KW chính: "${esc(mk)}"`, bStats.mainKw, aStats.mainKw);
  stats += statCell("KW phụ (tổng)", bStats.subKw, aStats.subKw);
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
  if (d.externalLinks && d.externalLinks.length) {
    ex += `<h3 style="margin:14px 0 6px">🌐 Gợi ý External link (E-E-A-T)</h3><ul style="margin:0 0 0 18px">` +
      d.externalLinks.map((l) => `<li><b>${esc(l.anchor)}</b> → ${esc(l.source)}</li>`).join("") + `</ul>`;
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
  const head = `<meta charset="utf-8"><title>${esc(o.after.title || "SwiftMate SEO")}</title>` +
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

/* ===================== TỰ ĐỘNG SHARE LINK (1 danh sách A→Z + lọc, tiêu đề+nội dung riêng) ===================== */
(function () {
  const urlEl = $("#shUrl");
  if (!urlEl) return;
  urlEl.value = localStorage.getItem("seoshark_share_url") || "";
  let share = null;          // { url, title, image }
  let uploadedImage = "";
  let contentMap = {};       // id -> { title, caption }
  let curSel = [];

  const E = (s) => encodeURIComponent(String(s == null ? "" : s));
  const firstLine = (s) => String(s || "").split("\n")[0];
  const absImg = (img) => (img ? (img.startsWith("/") ? location.origin + img : img) : "");
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch {} ta.remove(); return true; }
  }

  // === MỘT danh sách hợp nhất: social + bookmark. s = {url, image, title, caption} ===
  // prefill=true -> mở sẵn nội dung; false -> copy (tiêu đề+nội dung+link) rồi mở trang để dán.
  const ITEMS = {
    facebook:  { name: "Facebook", prefill: false, style: "thân thiện, có emoji, 2-3 câu, CTA mời đọc", build: (s) => `https://www.facebook.com/sharer/sharer.php?u=${E(s.url)}` },
    x:         { name: "X (Twitter)", prefill: true, style: "ngắn gọn dưới 240 ký tự, súc tích, 1-2 hashtag", build: (s) => `https://twitter.com/intent/tweet?text=${E(s.caption)}&url=${E(s.url)}` },
    telegram:  { name: "Telegram (share)", prefill: true, style: "ngắn gọn, có emoji", build: (s) => `https://t.me/share/url?url=${E(s.url)}&text=${E(s.caption)}` },
    linkedin:  { name: "LinkedIn", prefill: false, style: "trang trọng, chuyên nghiệp, nhấn giá trị chuyên môn", build: (s) => `https://www.linkedin.com/sharing/share-offsite/?url=${E(s.url)}` },
    pinterest: { name: "Pinterest", prefill: true, style: "mô tả hấp dẫn cho ghim ảnh, giàu từ khóa", build: (s) => `https://pinterest.com/pin/create/button/?url=${E(s.url)}&media=${E(s.image)}&description=${E(s.caption)}` },
    reddit:    { name: "Reddit", prefill: true, style: "tiêu đề kiểu thảo luận tự nhiên, không quảng cáo lộ liễu", build: (s) => `https://www.reddit.com/submit?url=${E(s.url)}&title=${E(s.title)}` },
    tumblr:    { name: "Tumblr", prefill: true, style: "trẻ trung, sáng tạo", build: (s) => `https://www.tumblr.com/widgets/share/tool?canonicalUrl=${E(s.url)}&title=${E(s.title)}&caption=${E(s.caption)}` },
    whatsapp:  { name: "WhatsApp", prefill: true, style: "ngắn gọn, thân mật", build: (s) => `https://wa.me/?text=${E(s.caption + "\n" + s.url)}` },
    email:     { name: "Email", prefill: true, style: "lịch sự", build: (s) => `mailto:?subject=${E(s.title)}&body=${E(s.caption + "\n" + s.url)}` },
    zalo:      { name: "Zalo", prefill: false, style: "thân thiện, ngắn", build: null },
    getpocket: { name: "Pocket", prefill: true, style: "súc tích", build: (s) => `https://getpocket.com/save?url=${E(s.url)}&title=${E(s.title)}` },
    okru:      { name: "OK.ru", prefill: true, style: "thân thiện", build: (s) => `https://connect.ok.ru/offer?url=${E(s.url)}&title=${E(s.caption)}` },
    vivaldi:   { name: "Vivaldi Social", prefill: true, style: "ngắn gọn (Mastodon)", build: (s) => `https://social.vivaldi.net/share?text=${E(s.caption + " " + s.url)}` },
    // TỰ ĐĂNG THẬT qua API (cần kết nối tài khoản ở mục 🔌):
    diigo:        { name: "Diigo (tự đăng)", auto: "diigo", style: "mô tả bookmark ngắn gọn" },
    telegramauto: { name: "Telegram kênh (tự đăng)", auto: "telegramauto", style: "ngắn gọn, có emoji" },
    flickr: { name: "Flickr", url: "https://www.flickr.com/" }, taplink: { name: "Taplink", url: "https://taplink.at/" },
    hipolink: { name: "Hipolink", url: "https://hipolink.net/" }, officiallink: { name: "Official.link", url: "https://official.link/" },
    hubblink: { name: "Hubb.link", url: "https://hubb.link/" },
    // Bookmark/social submit thủ công (copy + mở):
    trello: { name: "Trello", url: "https://trello.com/" }, scoopit: { name: "Scoop.it", url: "https://www.scoop.it/" },
    wakelet: { name: "Wakelet", url: "https://wakelet.com/" }, flipboard: { name: "Flipboard", url: "https://flipboard.com/" },
    instapaper: { name: "Instapaper (tự đăng)", auto: "instapaper", style: "ngắn gọn" }, startme: { name: "Start.me", url: "https://start.me/" },
    telegraph: { name: "Telegra.ph", url: "https://telegra.ph/" }, videobookmark: { name: "Video-Bookmark", url: "https://www.video-bookmark.com/" },
    listly: { name: "List.ly", url: "https://list.ly/" }, patreon: { name: "Patreon", url: "https://www.patreon.com/" },
    abookmarking: { name: "ABookmarking", url: "https://www.abookmarking.com/" }, guidesco: { name: "Guides.co", url: "https://guides.co/" },
    soctrip: { name: "Soctrip", url: "https://soctrip.com/" }, crokes: { name: "Crokes", url: "https://www.crokes.com/" },
    academia: { name: "Academia.edu", url: "https://www.academia.edu/" }, metooo: { name: "Metooo", url: "https://metooo.io/" },
    askmap: { name: "Askmap", url: "https://www.askmap.net/" }, pastelink: { name: "Pastelink", url: "https://pastelink.net/" },
    behance: { name: "Behance", url: "https://www.behance.net/" }, hashnode: { name: "Hashnode", url: "https://hashnode.com/" },
    safechat: { name: "Safechat", url: "https://safechat.com/" }, linktree: { name: "Linktr.ee", url: "https://linktr.ee/" },
    bandlab: { name: "BandLab", url: "https://www.bandlab.com/" }, glose: { name: "Glose", url: "https://glose.com/" },
    learningapps: { name: "LearningApps", url: "https://learningapps.org/" }, dentaldiaries: { name: "DentalDiaries", url: "https://dentaldiaries.8b.io/" },
    padlet: { name: "Padlet", url: "https://padlet.com/" }, pharmahub: { name: "PharmaHub", url: "https://pharmahub.org/" },
    apsense: { name: "APSense", url: "https://www.apsense.com/" }, bondhuplus: { name: "BondhuPlus", url: "https://bondhuplus.com/" },
    pittsburghtribune: { name: "PittsburghTribune", url: "https://pittsburghtribune.org/" }, px500: { name: "500px", url: "https://500px.com/" },
    myspace: { name: "Myspace", url: "https://myspace.com/" }, buzzbii: { name: "Buzzbii", url: "https://www.buzzbii.com/" },
    wongcw: { name: "WongCW", url: "https://community.wongcw.com/" }, addonface: { name: "Addonface", url: "https://www.addonface.com/" },
    wowonder: { name: "WoWonder", url: "https://demo.wowonder.com/" }, snipesocial: { name: "SnipeSocial", url: "https://snipesocial.co.uk/" },
    blacksocially: { name: "BlackSocially", url: "https://blacksocially.com/" },
  };
  const defOn = new Set(["facebook", "x", "telegram", "linkedin", "pinterest", "reddit", "tumblr"]);

  // Site tùy chỉnh do user thêm
  let customSites = [];
  try { customSites = JSON.parse(localStorage.getItem("seoshark_share_custom") || "[]") || []; } catch {}
  const saveCustom = () => localStorage.setItem("seoshark_share_custom", JSON.stringify(customSites));

  // Lưu lựa chọn cho lần sau
  let savedSel = null;
  try { savedSel = JSON.parse(localStorage.getItem("seoshark_share_sel") || "null"); } catch {}
  const isOn = (id, dflt) => (Array.isArray(savedSel) ? savedSel.includes(id) : dflt);
  function saveSel() {
    savedSel = $$('#shCurated input[data-plat]:checked').map((cb) => cb.dataset.plat);
    localStorage.setItem("seoshark_share_sel", JSON.stringify(savedSel));
    updateSelCount();
  }
  function updateSelCount() {
    const n = $$('#shCurated input[data-plat]:checked').length;
    $("#shSelCount").textContent = `Đã chọn: ${n}`;
  }

  // Toàn bộ mục (built-in + custom) sắp xếp A→Z
  function allEntries() {
    const out = Object.keys(ITEMS).map((id) => ({ id, name: ITEMS[id].name, custom: false }));
    customSites.forEach((c) => out.push({ id: c.id, name: c.name, custom: true }));
    out.sort((a, b) => a.name.localeCompare(b.name, "vi", { sensitivity: "base" }));
    return out;
  }

  function renderChecks() {
    const box = $("#shCurated");
    box.innerHTML = "";
    allEntries().forEach((e) => {
      const l = document.createElement("label");
      l.dataset.name = e.name.toLowerCase();
      l.style.cssText = `display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:13px;background:${e.custom ? "var(--brand-light)" : "var(--card-soft)"};border:1px solid var(--line);padding:7px 12px;border-radius:999px;cursor:pointer`;
      l.innerHTML = `<input type="checkbox" data-plat="${e.id}" ${isOn(e.id, defOn.has(e.id)) ? "checked" : ""} style="width:16px;height:16px;accent-color:var(--brand-bright)"> ${esc(e.name)}` +
        (e.custom ? ` <span data-del="${e.id}" title="Xóa" style="color:var(--red);cursor:pointer;font-weight:700">✕</span>` : "");
      box.appendChild(l);
    });
    $$('#shCurated [data-del]').forEach((x) => x.addEventListener("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      customSites = customSites.filter((c) => c.id !== x.dataset.del); saveCustom(); renderChecks(); applyFilter();
    }));
    updateSelCount();
  }

  function applyFilter() {
    const q = ($("#shFilter").value || "").trim().toLowerCase();
    $$("#shCurated label").forEach((l) => { l.style.display = !q || l.dataset.name.includes(q) ? "" : "none"; });
  }

  renderChecks();
  $("#shFilter").addEventListener("input", applyFilter);
  $("#shCurated").addEventListener("change", (e) => { if (e.target && e.target.matches("input[data-plat]")) saveSel(); });

  $("#shCuratedAll").addEventListener("click", () => {
    const visible = $$('#shCurated label').filter((l) => l.style.display !== "none").map((l) => l.querySelector("input"));
    const allOn = visible.every((b) => b.checked);
    visible.forEach((b) => (b.checked = !allOn));
    saveSel();
  });
  if ($("#shSelSave")) $("#shSelSave").addEventListener("click", () => { saveSel(); toast("✓ Đã lưu lựa chọn social/bookmark cho lần sau"); });

  // Chỉ lấy tên DOMAIN (bỏ http, www, đường dẫn) cho gọn
  const domainName = (s) => { try { return new URL(/^https?:\/\//i.test(s) ? s : "https://" + s).hostname.replace(/^www\./, ""); } catch { return String(s || "").trim(); } };

  $("#shCustAdd").addEventListener("click", () => {
    const rawName = $("#shCustName").value.trim(), url = $("#shCustUrl").value.trim();
    if (!rawName || !url) return toast("Nhập cả tên và URL trang đăng.");
    const name = domainName(rawName) || domainName(url);
    const id = "custom_" + Math.abs(Date.now());
    customSites.push({ id, name, url });
    saveCustom();
    if (Array.isArray(savedSel)) { savedSel.push(id); localStorage.setItem("seoshark_share_sel", JSON.stringify(savedSel)); }
    renderChecks(); applyFilter();
    $("#shCustName").value = ""; $("#shCustUrl").value = "";
    toast("Đã thêm: " + name);
  });

  function selectedAll() {
    return $$('#shCurated input[data-plat]:checked').map((cb) => {
      const id = cb.dataset.plat;
      if (ITEMS[id]) return { id, name: ITEMS[id].name, style: ITEMS[id].style || "tổng quát, cuốn hút, có CTA", prefill: !!ITEMS[id].prefill, build: ITEMS[id].build || null, url: ITEMS[id].url || "", auto: ITEMS[id].auto || null };
      const c = customSites.find((x) => x.id === id);
      return c ? { id, name: c.name, style: "tổng quát, cuốn hút, có CTA", prefill: false, build: null, url: c.url, auto: null } : null;
    }).filter(Boolean);
  }

  // ----- Kết nối tài khoản tự đăng (Diigo/Instapaper/Telegram) -----
  let conn = {};
  try { conn = JSON.parse(localStorage.getItem("seoshark_social_conn") || "{}") || {}; } catch {}
  function loadConnFields() {
    const g = (k) => (conn[k] || {});
    if ($("#connDiigoUser")) { $("#connDiigoUser").value = g("diigo").user || ""; $("#connDiigoPass").value = g("diigo").password || ""; $("#connDiigoKey").value = g("diigo").apiKey || ""; }
    if ($("#connInstaUser")) { $("#connInstaUser").value = g("instapaper").user || ""; $("#connInstaPass").value = g("instapaper").password || ""; }
    if ($("#connTgToken")) { $("#connTgToken").value = g("telegramauto").token || ""; $("#connTgChat").value = g("telegramauto").chatId || ""; }
  }
  loadConnFields();
  if ($("#connSave")) $("#connSave").addEventListener("click", () => {
    conn = {
      diigo: { user: $("#connDiigoUser").value.trim(), password: $("#connDiigoPass").value.trim(), apiKey: $("#connDiigoKey").value.trim() },
      instapaper: { user: $("#connInstaUser").value.trim(), password: $("#connInstaPass").value.trim() },
      telegramauto: { token: $("#connTgToken").value.trim(), chatId: $("#connTgChat").value.trim() },
    };
    localStorage.setItem("seoshark_social_conn", JSON.stringify(conn));
    toast("Đã lưu kết nối tự đăng");
  });
  const hasCreds = (key, c) => key === "diigo" ? !!(c && c.user && c.password && c.apiKey) : key === "instapaper" ? !!(c && c.user && c.password) : key === "telegramauto" ? !!(c && c.token && c.chatId) : false;

  // ----- Upload ảnh -----
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

  // ----- Render cards (mỗi nền: tiêu đề + nội dung riêng + nút) -----
  function curImage() { return absImg(uploadedImage || (share && share.image) || ""); }
  function renderCards(plats) {
    $("#shCards").innerHTML = plats.map((p) => {
      const c = contentMap[p.id] || { title: "", caption: "" };
      const icon = p.auto ? "🚀" : (p.prefill ? "🔓" : "📋");
      const label = p.auto ? "Tự đăng (ra link)" : "Đăng lên " + p.name;
      return `<div style="border:1px solid var(--glass-border);border-radius:12px;padding:14px;margin-bottom:12px;background:var(--glass-strong)">
        <div class="flexbar" style="margin-bottom:8px"><b>${esc(p.name)}</b>
          <button class="${p.auto || p.prefill ? "small" : "ghost small"}" data-share="${p.id}">${icon} ${esc(label)}</button></div>
        <input data-title="${p.id}" type="text" value="${esc(c.title)}" placeholder="Tiêu đề" style="margin-bottom:6px" />
        <textarea data-caption="${p.id}" rows="3" placeholder="Nội dung">${esc(c.caption)}</textarea>
        ${p.auto ? `<div data-result="${p.id}" style="margin-top:8px"></div>` : ""}
      </div>`;
    }).join("");
    $$('#shCards [data-share]').forEach((b) => b.addEventListener("click", () => doShare(b.dataset.share)));
  }

  async function doAutoPost(item, title, caption) {
    const key = item.auto;
    const box = $(`#shCards [data-result="${item.id}"]`);
    if (!hasCreds(key, conn[key])) { if (box) box.innerHTML = `<div class="alert warn">Chưa kết nối <b>${esc(item.name)}</b> — mở mục <b>🔌 Kết nối tài khoản tự đăng</b> ở phần 1 để cấu hình.</div>`; return; }
    if (box) box.innerHTML = `<div class="alert info"><span class="spinner" style="border-color:var(--orange);border-top-color:transparent"></span>Đang tự đăng...</div>`;
    try {
      const r = await fetch("/api/social/autopost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: key, creds: conn[key], url: share.url, title, caption }) });
      const d = await r.json();
      if (d.needAuth) { if (box) box.innerHTML = `<div class="alert err">Phiên hết hạn, tải lại trang.</div>`; return; }
      if (!r.ok) { if (box) box.innerHTML = `<div class="alert err">❌ ${esc(d.error || "lỗi")}</div>`; return; }
      if (box) box.innerHTML = `<div class="alert" style="background:var(--green-light);color:var(--green)">✅ Đã đăng/lưu thành công${d.link ? `: <a href="${esc(d.link)}" target="_blank" rel="noopener">${esc(d.link)}</a>` : ""}.</div>`;
    } catch (e) { if (box) box.innerHTML = `<div class="alert err">❌ ${esc(e.message || e)}</div>`; }
  }

  async function doShare(id) {
    if (!share) return;
    const item = curSel.find((x) => x.id === id); if (!item) return;
    const title = ($(`#shCards [data-title="${id}"]`) || {}).value || "";
    const caption = ($(`#shCards [data-caption="${id}"]`) || {}).value || "";
    if (item.auto) return doAutoPost(item, title, caption);
    const s = { url: share.url, image: curImage(), title, caption };
    if (item.prefill && item.build) { window.open(item.build(s), "_blank", "noopener"); return; }
    await copyText(`${title}\n\n${caption}\n\n${s.url}`);
    toast("Đã copy (tiêu đề + nội dung + link) — dán vào " + item.name);
    const openUrl = item.build ? item.build(s) : (item.url || (item.id === "zalo" ? "https://zalo.me/" : ""));
    if (openUrl) window.open(openUrl, "_blank", "noopener");
  }

  $("#shRun").addEventListener("click", async () => {
    const url = urlEl.value.trim();
    if (!url) return toast("Hãy nhập URL bài viết.");
    const selAll = selectedAll();
    if (!selAll.length) return toast("Hãy tick ít nhất 1 nơi muốn đi link.");
    curSel = selAll;
    localStorage.setItem("seoshark_share_url", url);
    const keyword = $("#shKeyword").value.trim();
    const lang = ($("#shLang") && $("#shLang").value) || "auto";
    const engine = $("#engine").value, model = $("#model").value, apiKey = $("#apiKey").value.trim();
    const platforms = selAll.map((p) => ({ id: p.id, name: p.name, style: p.style }));
    const btn = $("#shRun"); btn.disabled = true;
    $("#shMsg").innerHTML = `<div class="alert info"><span class="spinner" style="border-top-color:transparent"></span>Đang lấy thumbnail & viết tiêu đề + nội dung riêng cho ${selAll.length} nơi...</div>`;
    $("#shResultCard").classList.add("hidden");
    try {
      const r = await fetch("/api/share/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, keyword, lang, platforms, engine, model, apiKey }) });
      const d = await r.json();
      if (d.needAuth) { $("#shMsg").innerHTML = `<div class="alert err">Phiên hết hạn, hãy tải lại trang.</div>`; return; }
      if (!r.ok) { $("#shMsg").innerHTML = `<div class="alert err">${esc(d.error || "Lỗi server")}</div>`; return; }
      share = { url: d.url, title: d.title || "", image: d.image || "" };
      const base = d.base || { title: d.title || "", caption: "" };
      contentMap = {};
      (d.items || []).forEach((c) => { if (c && c.id) contentMap[c.id] = { title: c.title || base.title, caption: c.caption || base.caption }; });
      selAll.forEach((p) => { if (!(p.id in contentMap)) contentMap[p.id] = { title: base.title, caption: base.caption }; });
      $("#shAutoCaption").value = (contentMap["telegram"] || base).caption || base.caption;
      $("#shAutoResult").innerHTML = "";
      $("#shTitle").textContent = d.title ? "📄 " + d.title : "";
      $("#shEngine").textContent = "Nội dung bởi: " + (d.engineUsed || "Local");
      const img = $("#shThumb"), none = $("#shThumbNone"), cur = curImage();
      if (cur) { img.src = cur; img.style.display = "block"; none.style.display = "none"; }
      else { img.style.display = "none"; none.style.display = "block"; none.textContent = "Không có thumbnail (bài chưa có ảnh OG — có thể Upload ảnh ở phần 1)."; }
      $("#shMsg").innerHTML = "";
      $("#shResultCard").classList.remove("hidden");
      renderCards(selAll);
    } catch (e) {
      $("#shMsg").innerHTML = `<div class="alert err">Lỗi: ${esc(e.message || e)}</div>`;
    } finally {
      btn.disabled = false;
    }
  });

  // ----- TỰ ĐỘNG ĐĂNG THẬT: Telegra.ph (không cần cấu hình) -----
  $("#shAutoTelegraph").addEventListener("click", async () => {
    if (!share) return toast("Hãy bấm 'Tạo nội dung share' trước.");
    const cap = $("#shAutoCaption").value.trim();
    const btn = $("#shAutoTelegraph"); btn.disabled = true; toast("Đang đăng Telegra.ph...");
    try {
      const r = await fetch("/api/autopost/telegraph", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: share.title, caption: cap, url: share.url, image: curImage() }) });
      const d = await r.json();
      const box = $("#shAutoResult");
      if (d.needAuth) { box.innerHTML = `<div class="alert err">Phiên hết hạn, tải lại trang.</div>`; return; }
      if (!r.ok || !d.url) { box.innerHTML = `<div class="alert err">❌ Telegra.ph: ${esc(d.error || "thất bại")}</div>`; return; }
      box.innerHTML = "";
      const row = document.createElement("div");
      row.className = "alert"; row.style.cssText = "background:var(--green-light);color:var(--green);display:flex;gap:8px;align-items:center;flex-wrap:wrap";
      row.innerHTML = `✅ Đã đăng: <a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.url)}</a>`;
      const cp = document.createElement("button"); cp.className = "ghost small"; cp.textContent = "Copy link";
      cp.addEventListener("click", () => { copyText(d.url); toast("Đã copy link"); });
      row.appendChild(cp); box.appendChild(row);
    } catch (e) { $("#shAutoResult").innerHTML = `<div class="alert err">❌ ${esc(e.message || e)}</div>`; } finally { btn.disabled = false; }
  });
})();

/* ===================== TỰ ĐỘNG ĐĂNG BLOG 2.0 ===================== */
(function () {
  const typeEl = $("#blogType");
  if (!typeEl) return;
  async function copyText(t) { try { await navigator.clipboard.writeText(t); } catch { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch {} ta.remove(); } }

  const FIELDS = {
    wordpress: [["site", "URL site (vd https://blog.com)", "text"], ["user", "Username", "text"], ["appPassword", "Application Password", "password"]],
    devto: [["apiKey", "Dev.to API key", "password"]],
    hashnode: [["token", "Hashnode token", "password"], ["publicationId", "Publication ID", "text"]],
    other: [["url", "URL trang đăng (tùy chọn)", "text"]],
  };
  function renderFields() {
    const t = typeEl.value;
    $("#blogFields").innerHTML = (FIELDS[t] || []).map(([k, label, type]) => `<div><label>${esc(label)}</label><input data-bf="${k}" type="${type}" /></div>`).join("");
  }
  typeEl.addEventListener("change", renderFields);
  renderFields();

  let blogs = [];
  try { blogs = JSON.parse(localStorage.getItem("seoshark_blogs") || "[]") || []; } catch {}
  const saveBlogs = () => localStorage.setItem("seoshark_blogs", JSON.stringify(blogs));

  function renderBlogList() {
    const wrap = $("#blogList");
    if (!blogs.length) { wrap.innerHTML = `<span class="muted">Chưa có blog nào — thêm ở trên.</span>`; return; }
    wrap.innerHTML = "";
    blogs.forEach((b) => {
      const l = document.createElement("label");
      l.style.cssText = "display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:13px;background:var(--card-soft);border:1px solid var(--line);padding:7px 12px;border-radius:999px;cursor:pointer";
      l.innerHTML = `<input type="checkbox" data-blog="${b.id}" checked style="width:16px;height:16px;accent-color:var(--brand-bright)"> ${esc(b.name)} <span class="muted">(${esc(b.type)})</span> <span data-delblog="${b.id}" title="Xóa" style="color:var(--red);cursor:pointer;font-weight:700">✕</span>`;
      wrap.appendChild(l);
    });
    $$('#blogList [data-delblog]').forEach((x) => x.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); blogs = blogs.filter((b) => b.id !== x.dataset.delblog); saveBlogs(); renderBlogList(); }));
  }
  renderBlogList();

  $("#blogAdd").addEventListener("click", () => {
    const type = typeEl.value, name = $("#blogName").value.trim();
    if (!name) return toast("Nhập tên gợi nhớ.");
    const creds = {};
    (FIELDS[type] || []).forEach(([k]) => { const el = $(`#blogFields [data-bf="${k}"]`); creds[k] = el ? el.value.trim() : ""; });
    if (type === "wordpress" && (!creds.site || !creds.user || !creds.appPassword)) return toast("WordPress cần đủ site / user / App Password.");
    if (type === "devto" && !creds.apiKey) return toast("Dev.to cần API key.");
    if (type === "hashnode" && (!creds.token || !creds.publicationId)) return toast("Hashnode cần token + publicationId.");
    blogs.push({ id: "blog_" + Math.abs(Date.now()), type, name, creds });
    saveBlogs(); renderBlogList();
    $("#blogName").value = ""; renderFields();
    toast("Đã lưu blog: " + name);
  });

  function addKwRow(kw, url) {
    const row = document.createElement("div"); row.className = "kw-row";
    row.innerHTML = `<input type="text" placeholder="Từ khóa (anchor) — bỏ trống nếu dùng link trần" value="${esc(kw || "")}" data-bk="kw" /><input type="text" placeholder="https://nhakhoashark.vn/..." value="${esc(url || "")}" data-bk="url" /><button class="ghost small grow0" type="button" data-bkdel>✕</button>`;
    $("#blogKwRows").appendChild(row);
    row.querySelector("[data-bkdel]").addEventListener("click", () => row.remove());
  }
  $("#blogAddKw").addEventListener("click", () => addKwRow());
  addKwRow();

  const collectItems = () => $$("#blogKwRows .kw-row").map((r) => ({ keyword: r.querySelector('[data-bk="kw"]').value.trim(), url: r.querySelector('[data-bk="url"]').value.trim() })).filter((it) => it.url);

  $("#blogGen").addEventListener("click", async () => {
    const items = collectItems();
    if (!items.length) return toast("Nhập ít nhất 1 URL.");
    const ticked = $$('#blogList input[data-blog]:checked').map((cb) => blogs.find((b) => b.id === cb.dataset.blog)).filter(Boolean);
    if (!ticked.length) return toast("Tick ít nhất 1 blog.");
    const engine = $("#engine").value, model = $("#model").value, apiKey = $("#apiKey").value.trim();
    if (engine !== "gemini" && engine !== "claude") { $("#blogMsg").innerHTML = `<div class="alert err">Viết bài cần engine <b>Gemini</b> (free) hoặc Claude. Mở ⚙️ Engine ở trên, chọn Gemini + nhập key.</div>`; return; }
    const words = Number($("#blogWords").value) || 1000;
    const btn = $("#blogGen"); btn.disabled = true;
    $("#blogResults").innerHTML = ""; $("#blogResultCard").classList.remove("hidden");
    $("#blogMsg").innerHTML = `<div class="alert info"><span class="spinner" style="border-color:var(--brand-bright);border-top-color:transparent"></span>Đang viết ${ticked.length} bài (mỗi blog 1 bài riêng)...</div>`;
    for (const b of ticked) {
      const card = document.createElement("section"); card.className = "card";
      card.innerHTML = `<div class="flexbar"><h3 style="margin:0">${esc(b.name)} <span class="muted">(${esc(b.type)})</span></h3><span class="muted">⏳ Đang viết...</span></div>`;
      $("#blogResults").appendChild(card);
      try {
        const r = await fetch("/api/blog/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, blogName: b.name, engine, model, apiKey, words }) });
        const d = await r.json();
        if (d.needAuth) { card.innerHTML = `<div class="alert err">Phiên hết hạn, tải lại trang.</div>`; break; }
        if (!r.ok) { card.innerHTML = `<div class="flexbar"><h3 style="margin:0">${esc(b.name)}</h3></div><div class="alert err">❌ ${esc(d.error || "lỗi")}</div>`; continue; }
        renderArticleCard(card, b, d);
      } catch (e) { card.innerHTML = `<div class="flexbar"><h3 style="margin:0">${esc(b.name)}</h3></div><div class="alert err">❌ ${esc(e.message || e)}</div>`; }
    }
    btn.disabled = false; $("#blogMsg").innerHTML = "";
  });

  function renderArticleCard(card, blog, d) {
    const art = { title: d.title, slug: d.slug, markdown: d.markdown, html: d.html, imageUrl: d.imageUrl };
    const canPost = blog.type !== "other";
    card.innerHTML = `
      <div class="flexbar"><h3 style="margin:0">${esc(blog.name)} <span class="muted">(${esc(blog.type)})</span></h3>
        <span style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="ghost small" data-act="copyrich">📋 Copy (giữ định dạng)</button>
          <button class="ghost small" data-act="copyhtml">&lt;/&gt; HTML</button>
          ${canPost ? `<button class="small" data-act="post">🚀 Đăng</button>` : ""}
        </span></div>
      <div style="margin:8px 0"><b>Tiêu đề:</b> ${esc(art.title)} &nbsp; <span class="muted">slug: /${esc(art.slug)}</span></div>
      <div class="render" style="max-height:360px">${art.html}</div>
      <div data-postresult style="margin-top:10px"></div>`;
    card.querySelector('[data-act="copyrich"]').addEventListener("click", async () => {
      const richHtml = `<h1>${esc(art.title)}</h1>` + art.html;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([richHtml], { type: "text/html" }), "text/plain": new Blob([`${art.title}\n\n${art.markdown}`], { type: "text/plain" }) })]);
        toast("Đã copy GIỮ ĐỊNH DẠNG — dán thẳng vào trình soạn blog (tiêu đề/link/ảnh giữ nguyên)");
      } catch { await copyText(`${art.title}\n\n${art.markdown}`); toast("Đã copy (văn bản)"); }
    });
    card.querySelector('[data-act="copyhtml"]').addEventListener("click", () => { copyText(`<h1>${esc(art.title)}</h1>\n` + art.html); toast("Đã copy mã HTML (dán vào ô HTML/embed của blog)"); });
    const pb = card.querySelector('[data-act="post"]');
    if (pb) pb.addEventListener("click", () => postArticle(card, blog, art, pb));
  }

  async function postArticle(card, blog, art, pb) {
    const box = card.querySelector("[data-postresult]");
    pb.disabled = true;
    box.innerHTML = `<div class="alert info"><span class="spinner" style="border-color:var(--brand-bright);border-top-color:transparent"></span>Đang đăng lên ${esc(blog.name)}...</div>`;
    try {
      const r = await fetch("/api/blog/post", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: blog.type, creds: blog.creds, title: art.title, slug: art.slug, markdown: art.markdown, html: art.html, imageUrl: art.imageUrl }) });
      const d = await r.json();
      if (d.needAuth) { box.innerHTML = `<div class="alert err">Phiên hết hạn, tải lại trang.</div>`; pb.disabled = false; return; }
      if (!r.ok || !d.link) { box.innerHTML = `<div class="alert err">❌ ${esc(d.error || "đăng thất bại")}</div>`; pb.disabled = false; return; }
      box.innerHTML = `<div class="alert" style="background:var(--green-light);color:var(--green)">✅ Đã đăng: <a href="${esc(d.link)}" target="_blank" rel="noopener">${esc(d.link)}</a></div>`;
    } catch (e) { box.innerHTML = `<div class="alert err">❌ ${esc(e.message || e)}</div>`; pb.disabled = false; }
  }
})();

/* ===================== NGHIÊN CỨU TỪ KHÓA ===================== */
(function () {
  const runBtn = $("#kwRun");
  if (!runBtn) return;
  let rows = [];
  let mode = "seed";

  $$("#kwTabs .tab").forEach((t) => t.addEventListener("click", () => {
    $$("#kwTabs .tab").forEach((x) => x.classList.toggle("active", x === t));
    mode = t.dataset.kwmode;
    $$("[data-kwpane]").forEach((p) => p.classList.toggle("active", p.dataset.kwpane === mode));
  }));

  runBtn.addEventListener("click", async () => {
    const input = mode === "domain" ? $("#kwDomainInput").value.trim() : $("#kwSeedInput").value.trim();
    if (!input) return toast(mode === "domain" ? "Nhập domain website." : "Nhập ít nhất 1 từ khóa.");
    const gl = $("#kwGl").value, hl = $("#kwHl").value;
    const boost = $("#kwBoost").checked;
    const deep = boost, expand = $("#kwExpand").checked, aiEnrich = boost;
    const wantVolume = $("#kwVolume").checked, bingKey = $("#kwBingKey").value.trim();
    const engine = $("#engine").value, model = $("#model").value, apiKey = $("#apiKey").value.trim();
    runBtn.disabled = true;
    $("#kwResultCard").classList.add("hidden");
    const waits = [];
    if (aiEnrich) waits.push("AI làm giàu");
    if (wantVolume) waits.push("lấy volume (Google Trends ~15-25s)");
    $("#kwMsg").innerHTML = `<div class="alert info"><span class="spinner" style="border-top-color:transparent"></span>Đang lấy gợi ý & phân tích...${waits.length ? " (" + waits.join(" + ") + ")" : ""}</div>`;
    try {
      const r = await fetch("/api/keywords/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, input, gl, hl, deep, expand, aiEnrich, wantVolume, bingKey, engine, model, apiKey }) });
      const d = await r.json();
      if (d.needAuth) { $("#kwMsg").innerHTML = `<div class="alert err">Phiên hết hạn, tải lại trang.</div>`; return; }
      if (!r.ok) { $("#kwMsg").innerHTML = `<div class="alert err">${esc(d.error || "Lỗi")}</div>`; return; }
      rows = d.keywords || [];
      const notes = [];
      if (d.enriched) notes.push("đã AI làm giàu");
      else if (aiEnrich) notes.push("AI chưa chạy (cần bật engine Gemini + key ở ⚙️)");
      if (wantVolume) {
        if (d.bingUsed) notes.push("có số lượt/tháng (Bing)");
        if (d.trendUsed) notes.push("có mức quan tâm (Google Trends, top ~30)");
        if (!d.bingUsed && !d.trendUsed) notes.push("volume chưa lấy được (Trends bị giới hạn/không có dữ liệu)");
      }
      $("#kwMsg").innerHTML = rows.length ? `<div class="alert info">✓ Tìm được ${rows.length} từ khóa${notes.length ? " — " + notes.join("; ") : ""}.</div>` : `<div class="alert warn">Không tìm được từ khóa nào.</div>`;
      if (rows.length) { $("#kwResultCard").classList.remove("hidden"); render(); }
    } catch (e) { $("#kwMsg").innerHTML = `<div class="alert err">Lỗi: ${esc(e.message || e)}</div>`; }
    finally { runBtn.disabled = false; }
  });

  function filtered() {
    const q = ($("#kwFilter").value || "").trim().toLowerCase();
    const intent = $("#kwFilterIntent").value;
    let list = rows.filter((r) => (!q || r.keyword.includes(q)) && (!intent || (r.intent || "") === intent));
    const sort = $("#kwSort").value;
    const num = (x) => (Number.isFinite(x) ? x : -1);
    if (sort === "az") list.sort((a, b) => a.keyword.localeCompare(b.keyword, "vi"));
    else if (sort === "za") list.sort((a, b) => b.keyword.localeCompare(a.keyword, "vi"));
    else if (sort === "len") list.sort((a, b) => a.keyword.length - b.keyword.length);
    else if (sort === "lend") list.sort((a, b) => b.keyword.length - a.keyword.length);
    else if (sort === "vol") list.sort((a, b) => num(b.volume) - num(a.volume) || num(b.trend) - num(a.trend));
    else if (sort === "trend") list.sort((a, b) => num(b.trend) - num(a.trend) || num(b.volume) - num(a.volume));
    return list;
  }
  // Thanh do truc quan cho diem quan tam 0-100
  function trendBar(t) {
    if (!Number.isFinite(t)) return '<span class="muted">—</span>';
    const c = t >= 66 ? "var(--green)" : t >= 33 ? "var(--orange)" : "#9aa0a6";
    return `<div style="display:flex;align-items:center;gap:6px"><div style="flex:1;min-width:52px;height:7px;background:#e6e6e6;border-radius:4px;overflow:hidden"><div style="width:${t}%;height:100%;background:${c}"></div></div><span style="font-size:.82rem;min-width:24px;text-align:right">${t}</span></div>`;
  }
  const fmtVol = (v) => (Number.isFinite(v) ? v.toLocaleString("vi-VN") : '<span class="muted">—</span>');
  function render() {
    const list = filtered();
    $("#kwCount").textContent = rows.length;
    $("#kwShown").textContent = `Hiển thị: ${list.length}`;
    const enriched = rows.some((r) => r.intent || r.cluster);
    const hasVol = rows.some((r) => Number.isFinite(r.volume));
    const hasTrend = rows.some((r) => Number.isFinite(r.trend));
    $("#kwTable").innerHTML = `<table class="cmp"><thead><tr><th>#</th><th>Từ khóa</th>${hasVol ? "<th>Volume/tháng<br><small class='muted'>Bing</small></th>" : ""}${hasTrend ? "<th style='min-width:110px'>Mức quan tâm<br><small class='muted'>Google Trends</small></th>" : ""}${enriched ? "<th>Ý định</th><th>Nhóm chủ đề</th><th>Độ khó</th>" : ""}</tr></thead><tbody>${
      list.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.keyword)}</td>${hasVol ? `<td style="text-align:right">${fmtVol(r.volume)}</td>` : ""}${hasTrend ? `<td>${trendBar(r.trend)}</td>` : ""}${enriched ? `<td>${esc(r.intent || "")}</td><td>${esc(r.cluster || "")}</td><td>${esc(r.difficulty || "")}</td>` : ""}</tr>`).join("")
    }</tbody></table>`;
  }
  $("#kwFilter").addEventListener("input", render);
  $("#kwFilterIntent").addEventListener("change", render);
  $("#kwSort").addEventListener("change", render);

  $("#kwExport").addEventListener("click", () => {
    if (!rows.length) return toast("Chưa có kết quả.");
    if (typeof XLSX === "undefined") return toast("Thư viện Excel chưa tải xong.");
    const enriched = rows.some((r) => r.intent || r.cluster);
    const hasVol = rows.some((r) => Number.isFinite(r.volume));
    const hasTrend = rows.some((r) => Number.isFinite(r.trend));
    const list = filtered();
    const head = ["Từ khóa"];
    if (hasVol) head.push("Volume/tháng (Bing)");
    if (hasTrend) head.push("Mức quan tâm (Trends 0-100)");
    if (enriched) head.push("Ý định", "Nhóm chủ đề", "Độ khó");
    const aoa = [head].concat(list.map((r) => {
      const row = [r.keyword];
      if (hasVol) row.push(Number.isFinite(r.volume) ? r.volume : "");
      if (hasTrend) row.push(Number.isFinite(r.trend) ? r.trend : "");
      if (enriched) row.push(r.intent || "", r.cluster || "", r.difficulty || "");
      return row;
    }));
    const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "TuKhoa"); XLSX.writeFile(wb, "swiftmate-tu-khoa.xlsx");
  });
})();

/* ===================== LÊN OUTLINE CHUẨN SEO ===================== */
(function () {
  const analyzeBtn = $("#olAnalyze");
  if (!analyzeBtn) return;
  if ($("#olKnowContent")) makeRichEditor($("#olKnowContent"));
  let mode = "auto";
  let competitors = [];   // outline đối thủ (đã bóc tách)
  let lastOutline = [];   // kết quả outline cuối
  let lastTitle = "", lastMeta = ""; // Title SEO + Meta description
  let knowledge = [];     // thư viện kiến thức của tài khoản
  let analyzedKw = "";    // từ khóa đã phân tích đối thủ (để phát hiện đổi từ khóa)

  const setMsg = (el, type, msg) => { $(el).innerHTML = msg ? alertHtml(type, msg) : ""; };
  const splitList = (v) => String(v || "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

  // --- Tabs auto / manual ---
  $$("#olCompTabs .tab").forEach((t) => t.addEventListener("click", () => {
    $$("#olCompTabs .tab").forEach((x) => x.classList.toggle("active", x === t));
    mode = t.dataset.olmode;
    $$("[data-olpane]").forEach((p) => p.classList.toggle("active", p.dataset.olpane === mode));
  }));

  // --- Kho kiến thức ---
  // Kiến thức dùng KHO CHUNG KB (đồng bộ với Onpage/GBP)
  KB.registerSelect($("#olKnowSelect"));
  async function loadKnowledge() { await KB.load(); }
  // Nạp thư viện lần đầu khi mở tab
  let knowLoaded = false;
  $$('#menu .menu-item').forEach((mi) => mi.addEventListener("click", () => {
    if (mi.dataset.section === "outline" && !knowLoaded) { knowLoaded = true; loadKnowledge(); }
  }));

  $("#olKnowNew").addEventListener("click", () => {
    const ed = $("#olKnowEditor");
    ed.classList.toggle("hidden");
    // Nếu đang chọn 1 mục -> nạp để sửa
    const k = KB.get($("#olKnowSelect").value);
    if (!ed.classList.contains("hidden") && k) {
      $("#olKnowTitle").value = k.title || "";
      $("#olKnowContent").value = k.content || "";
    }
  });

  $("#olKnowDelete").addEventListener("click", async () => {
    const id = $("#olKnowSelect").value;
    if (!id) return toast("Chọn tài liệu cần xóa.");
    if (!confirm("Xóa tài liệu kiến thức này?")) return;
    try {
      const r = await _fetch("/api/knowledge/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const d = await r.json();
      if (d.ok) { toast("Đã xóa."); await loadKnowledge(); }
      else toast("Không xóa được.");
    } catch { toast("Lỗi xóa."); }
  });

  // Upload Word/Excel -> trích text vào ô nội dung
  $("#olKnowFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $("#olKnowFileMsg").textContent = "Đang đọc file...";
    try {
      const buf = await file.arrayBuffer();
      let html = "";
      if (/\.docx$/i.test(file.name)) {
        const res = await window.mammoth.convertToHtml({ arrayBuffer: buf }); // giữ heading/list/đậm
        html = res.value || "";
      } else if (/\.xlsx?$/i.test(file.name)) {
        const wb = XLSX.read(buf, { type: "array" });
        html = "<pre>" + esc(wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join("\n")) + "</pre>";
      } else { $("#olKnowFileMsg").textContent = "Chỉ hỗ trợ .docx/.xlsx"; return; }
      const box = $("#olKnowContent");
      const cur = box.value;
      box.value = (cur ? cur : "") + html;
      if (!$("#olKnowTitle").value.trim()) $("#olKnowTitle").value = file.name.replace(/\.(docx|xlsx?|)$/i, "");
      $("#olKnowFileMsg").textContent = `✓ Đã nạp nội dung từ ${esc(file.name)} (giữ định dạng)`;
    } catch (err) {
      $("#olKnowFileMsg").textContent = "Lỗi đọc file: " + (err.message || err);
    } finally { e.target.value = ""; }
  });

  $("#olKnowSave").addEventListener("click", async () => {
    const content = $("#olKnowContent").value.trim();
    if (!content) return setMsg("#olKnowMsg", "err", "❌ Nội dung kiến thức đang trống.");
    const editingId = KB.get($("#olKnowSelect").value) ? $("#olKnowSelect").value : "";
    const payload = { id: editingId, website: (KB.get(editingId) || {}).website || "", title: $("#olKnowTitle").value.trim(), content };
    const btn = $("#olKnowSave"); busy(btn, true, "Đang lưu...");
    try {
      const r = await _fetch("/api/knowledge/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Lưu thất bại");
      setMsg("#olKnowMsg", "info", "✓ Đã lưu vào thư viện.");
      await loadKnowledge();
      $("#olKnowSelect").value = d.id;
      $("#olKnowEditor").classList.add("hidden");
    } catch (err) { setMsg("#olKnowMsg", "err", "❌ " + err.message); }
    finally { busy(btn, false); }
  });

  // --- Phân tích đối thủ ---
  function renderCompetitors() {
    $("#olCompCount").textContent = competitors.length;
    $("#olCompList").innerHTML = competitors.map((c, i) => {
      const hs = (c.headings || []);
      const inner = c.error
        ? `<div class="alert warn" style="margin:8px 0">⚠️ ${esc(c.error)}</div>`
        : (hs.length
            ? `<div style="padding:6px 0">${hs.map((h) => `<div style="padding:2px 0;padding-left:${(h.level - 2) * 18}px"><span class="muted" style="font-size:.75rem">H${h.level}</span> ${esc(h.text)}</div>`).join("")}</div>`
            : `<div class="alert warn" style="margin:8px 0">⚠️ ${esc(c.reason || "Không lấy được heading từ trang này.")}</div>`);
      return `<details style="border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin-bottom:8px">
        <summary style="cursor:pointer;font-weight:600">#${c.position || i + 1} · ${esc(c.host || c.url)} <span class="muted" style="font-weight:400;font-size:.8rem">— ${hs.length} heading</span></summary>
        <div style="font-size:.85rem;color:var(--muted);margin:4px 0">${esc(c.title || "")}<br><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.url)}</a></div>
        ${inner}
      </details>`;
    }).join("");
  }

  analyzeBtn.addEventListener("click", async () => {
    const keyword = $("#olMainKw").value.trim();
    const gl = $("#olGl").value, hl = $("#olHl").value;
    const urls = mode === "manual" ? splitList($("#olManualUrls").value) : [];
    if (mode === "auto" && !keyword) return setMsg("#olCompMsg", "err", "❌ Nhập từ khóa chính để tìm đối thủ.");
    if (mode === "manual" && !urls.length) return setMsg("#olCompMsg", "err", "❌ Dán ít nhất 1 URL đối thủ.");
    const serperKey = $("#olSerperKey").value.trim();
    busy(analyzeBtn, true, "Đang phân tích...");
    setMsg("#olCompMsg", "info", '<span class="spinner" style="border-top-color:transparent"></span>Đang lấy & bóc tách outline đối thủ (có thể mất ~20s)...');
    $("#olCompCard").classList.add("hidden");
    try {
      const r = await _fetch("/api/outline/competitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyword, gl, hl, serperKey, urls }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Lỗi phân tích");
      competitors = d.competitors || [];
      analyzedKw = keyword;
      const ok = competitors.filter((c) => (c.headings || []).length).length;
      setMsg("#olCompMsg", ok ? "info" : "warn", `${ok ? "✓" : "⚠️"} Đã bóc tách ${competitors.length} đối thủ (${ok} có outline). Nguồn: ${d.source}.`);
      renderCompetitors();
      $("#olCompCard").classList.remove("hidden");
    } catch (err) { setMsg("#olCompMsg", "err", "❌ " + err.message); }
    finally { busy(analyzeBtn, false); }
  });

  // --- Tạo outline cuối ---
  // Tô màu ĐÚNG phần từ khóa trong heading (không tô cả heading). Chính = xanh, phụ = cam.
  const _kwNorm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d");
  function highlightKw(text, mainKw, subKws) {
    const raw = String(text || "");
    const nraw = _kwNorm(raw);
    const marks = [];
    const add = (kw, cls) => {
      const nk = _kwNorm(kw).trim(); if (!nk) return;
      let i = 0; while ((i = nraw.indexOf(nk, i)) !== -1) { marks.push({ s: i, e: i + nk.length, cls }); i += nk.length; }
    };
    add(mainKw, "kw-main");
    (subKws || []).forEach((sk) => add(sk, "kw-sub"));
    if (!marks.length) return esc(raw);
    // Ưu tiên vùng dài hơn (từ khóa chính thường dài); bỏ vùng chồng lấn
    marks.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s));
    const keep = []; let last = -1;
    for (const m of marks) { if (m.s >= last) { keep.push(m); last = m.e; } }
    let out = "", pos = 0;
    for (const m of keep) { out += esc(raw.slice(pos, m.s)) + `<mark class="${m.cls}">${esc(raw.slice(m.s, m.e))}</mark>`; pos = m.e; }
    return out + esc(raw.slice(pos));
  }
  function renderTree() {
    const mk = $("#olMainKw").value.trim();
    const sk = splitList($("#olSubKws").value);
    $("#olTree").innerHTML = lastOutline.map((it) => {
      const pad = (it.level - 2) * 18;
      const weight = it.level === 2 ? "600" : it.level === 3 ? "500" : "400";
      return `<div class="ol-oline" style="padding-left:${pad}px;font-weight:${weight}"><b>H${it.level}:</b> ${highlightKw(it.text, mk, sk)}</div>`;
    }).join("");
  }
  // Title SEO + Meta description với đếm ký tự (xanh nếu trong khoảng chuẩn) + nút copy
  function renderTitleMeta() {
    const box = $("#olTitleMeta");
    if (!lastTitle && !lastMeta) { box.innerHTML = ""; return; }
    const badge = (len, min, max) => {
      const ok = len >= min && len <= max;
      const c = ok ? "var(--green)" : "var(--orange)";
      return `<span style="font-size:.75rem;color:${c};font-weight:600">${len} ký tự${ok ? " ✓" : ` (chuẩn ${min}–${max})`}</span>`;
    };
    const field = (label, val, min, max, id) => `
      <div style="border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px">
          <b style="font-size:.82rem">${label}</b>
          <div style="display:flex;gap:10px;align-items:center">${badge((val || "").length, min, max)}<a class="muted" data-copy="${id}" style="cursor:pointer;font-size:.8rem">📋 Copy</a></div>
        </div>
        <div id="${id}" style="line-height:1.5">${esc(val || "")}</div>
      </div>`;
    box.innerHTML = field("🔖 Title SEO", lastTitle, 50, 60, "olTitleVal") + field("📝 Meta description", lastMeta, 140, 160, "olMetaVal");
    box.querySelectorAll("[data-copy]").forEach((a) => a.addEventListener("click", async () => {
      const t = $("#" + a.dataset.copy).textContent;
      try { await navigator.clipboard.writeText(t); toast("Đã copy!"); } catch { toast("Không copy được."); }
    }));
  }
  function outlineToMarkdown() {
    const head = [];
    if (lastTitle) head.push(`Title: ${lastTitle}`);
    if (lastMeta) head.push(`Meta description: ${lastMeta}`);
    const body = lastOutline.map((it) => `H${it.level}: ${it.text}`).join("\n");
    return (head.length ? head.join("\n") + "\n\n" : "") + body;
  }

  $("#olGenerate").addEventListener("click", async () => {
    const mainKw = $("#olMainKw").value.trim();
    if (!mainKw) return setMsg("#olGenMsg", "err", "❌ Thiếu từ khóa chính.");
    if (!competitors.some((c) => (c.headings || []).length)) return setMsg("#olGenMsg", "err", "❌ Chưa có outline đối thủ hợp lệ.");
    const subKws = splitList($("#olSubKws").value);
    const refOutline = $("#olRefOutline").value.trim();
    const know = KB.get($("#olKnowSelect").value);
    const websiteName = (know && know.website) || ""; // lấy từ tài liệu kiến thức, không cần nhập riêng
    const knowledgeText = know ? htmlToReadable(know.content || "") : "";
    const engine = $("#engine").value, model = $("#model").value, apiKey = $("#apiKey").value.trim();
    const btn = $("#olGenerate"); busy(btn, true, "Đang tạo outline...");
    setMsg("#olGenMsg", "info", `<span class="spinner" style="border-top-color:transparent"></span>Đang tổng hợp outline${engine !== "local" ? " (AI ~15s)" : ""}...`);
    $("#olResultCard").classList.add("hidden");
    try {
      const r = await _fetch("/api/outline/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mainKw, subKws, refOutline, knowledge: knowledgeText, websiteName, competitors, engine, model, apiKey }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Lỗi tạo outline");
      lastOutline = d.outline || [];
      if (!lastOutline.length) { setMsg("#olGenMsg", "warn", "Không tạo được outline."); return; }
      lastTitle = d.title || ""; lastMeta = d.metaDescription || "";
      // reset gợi ý unique cũ
      $("#olUniqueList").innerHTML = ""; $("#olUniqueMsg").innerHTML = "";
      $("#olEngineUsed").textContent = "— " + (d.engineUsed || "");
      renderTitleMeta();
      renderTree();
      if (d.aiError) setMsg("#olGenMsg", "warn", `⚠️ AI (Gemini/Claude) không chạy được nên đã dùng Local. Lý do: <b>${esc(d.aiError)}</b>. Kiểm tra lại API key & model ở ⚙️ (nút "Kiểm tra kết nối").`);
      else setMsg("#olGenMsg", "info", `✓ Đã tạo outline ${lastOutline.length} heading.`);
      $("#olResultCard").classList.remove("hidden");
      $("#olResultCard").scrollIntoView({ block: "start", behavior: "smooth" });
    } catch (err) { setMsg("#olGenMsg", "err", "❌ " + err.message); }
    finally { busy(btn, false); }
  });

  $("#olCopyMd").addEventListener("click", async () => {
    if (!lastOutline.length) return toast("Chưa có outline.");
    try { await navigator.clipboard.writeText(outlineToMarkdown()); toast("Đã copy Markdown!"); }
    catch { toast("Không copy được."); }
  });

  $("#olExport").addEventListener("click", () => {
    if (!lastOutline.length) return toast("Chưa có outline.");
    if (typeof XLSX === "undefined") return toast("Thư viện Excel chưa tải xong.");
    const head = ["Cấp", "Heading", "Chứa KW chính", "Chứa KW phụ"];
    const aoa = [];
    if (lastTitle) aoa.push(["Title SEO", lastTitle, `${lastTitle.length} ký tự`, ""]);
    if (lastMeta) aoa.push(["Meta description", lastMeta, `${lastMeta.length} ký tự`, ""]);
    if (aoa.length) aoa.push(["", "", "", ""]);
    aoa.push(head);
    lastOutline.forEach((it) => aoa.push([`H${it.level}`, it.text, it.hasMain ? "★" : "", (it.hitSubs || []).join(", ")]));
    const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Outline"); XLSX.writeFile(wb, "swiftmate-outline.xlsx");
  });

  // --- Đổi từ khóa chính sau khi đã phân tích -> buộc phân tích lại (tránh trộn đối thủ cũ) ---
  $("#olMainKw").addEventListener("input", () => {
    const kw = $("#olMainKw").value.trim();
    if (analyzedKw && kw && kw !== analyzedKw && competitors.length) {
      competitors = [];
      analyzedKw = "";
      $("#olCompCard").classList.add("hidden");
      $("#olResultCard").classList.add("hidden");
      $("#olCompList").innerHTML = "";
      setMsg("#olCompMsg", "warn", "⚠️ Từ khóa đã đổi — hãy bấm <b>Phân tích đối thủ</b> lại cho từ khóa mới.");
    }
  });

  // --- Gợi ý nội dung unique (non-commodity) từ tài liệu kiến thức ---
  $("#olUniqueTick").addEventListener("change", () => {
    $("#olUniqueBox").classList.toggle("hidden", !$("#olUniqueTick").checked);
  });

  $("#olUniqueRun").addEventListener("click", async () => {
    if (!lastOutline.length) return setMsg("#olUniqueMsg", "err", "❌ Chưa có outline.");
    const know = KB.get($("#olKnowSelect").value);
    if (!know || !(know.content || "").trim()) return setMsg("#olUniqueMsg", "err", "❌ Hãy chọn một tài liệu kiến thức (ở mục 2) trước.");
    const engine = $("#engine").value, model = $("#model").value, apiKey = $("#apiKey").value.trim();
    if (engine !== "gemini" && engine !== "claude") return setMsg("#olUniqueMsg", "err", "❌ Cần bật engine Gemini/Claude ở ⚙️ cho gợi ý unique.");
    const mainKw = $("#olMainKw").value.trim();
    const subKws = splitList($("#olSubKws").value);
    const websiteName = (know && know.website) || "";
    const btn = $("#olUniqueRun"); busy(btn, true, "Đang gợi ý...");
    setMsg("#olUniqueMsg", "info", '<span class="spinner" style="border-top-color:transparent"></span>AI đang chắt lọc kiến thức & gợi ý (~15s)...');
    $("#olUniqueList").innerHTML = "";
    try {
      const r = await _fetch("/api/outline/unique", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mainKw, subKws, websiteName, knowledge: htmlToReadable(know.content || ""), outline: lastOutline, engine, model, apiKey }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Lỗi gợi ý");
      const list = d.suggestions || [];
      if (!list.length) { setMsg("#olUniqueMsg", "warn", "Tài liệu kiến thức chưa đủ dữ liệu độc quyền để tạo gợi ý unique phù hợp."); return; }
      setMsg("#olUniqueMsg", "info", `✓ ${list.length} gợi ý nội dung unique.`);
      $("#olUniqueList").innerHTML = list.map((s) => `
        <div style="border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:8px">
          <div style="font-weight:600">💎 Ở heading: <span style="color:var(--orange)">${esc(s.heading)}</span></div>
          <div style="margin-top:4px"><b>Thêm gì:</b> ${esc(s.what)}</div>
          <div style="margin-top:2px"><b>Cách thêm:</b> ${esc(s.how)}</div>
        </div>`).join("");
    } catch (err) { setMsg("#olUniqueMsg", "err", "❌ " + err.message); }
    finally { busy(btn, false); }
  });
})();

/* ===================== NGHIÊN CỨU PILLAR TOPIC ===================== */
(function () {
  const analyzeBtn = $("#plAnalyze");
  if (!analyzeBtn) return;
  let plMode = "manual";
  let excelRows = null;   // [{keyword,topic}] từ Excel
  let statsRows = [];     // [{keyword, topic, vi}]
  let suggestData = [];   // [{topic, keywords:[{keyword, vi, trend, volume}]}]
  let isEnglish = false;

  const setMsg = (el, type, msg) => { $(el).innerHTML = msg ? alertHtml(type, msg) : ""; };
  const fmtVol = (v) => (Number.isFinite(v) ? v.toLocaleString("vi-VN") : '<span class="muted">—</span>');
  function trendBar(t) {
    if (!Number.isFinite(t)) return '<span class="muted">—</span>';
    const c = t >= 66 ? "var(--green)" : t >= 33 ? "var(--c-teal)" : "#9aa0a6";
    return `<div style="display:flex;align-items:center;gap:6px"><div style="flex:1;min-width:44px;height:7px;background:#e6e6e6;border-radius:4px;overflow:hidden"><div style="width:${t}%;height:100%;background:${c}"></div></div><span style="font-size:.8rem;min-width:22px;text-align:right">${t}</span></div>`;
  }
  const num = (x) => (Number.isFinite(x) ? x : -1);
  const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

  // Tab chính research / pillar
  $$("#kwMainTabs .tab").forEach((t) => t.addEventListener("click", () => {
    $$("#kwMainTabs .tab").forEach((x) => x.classList.toggle("active", x === t));
    const m = t.dataset.kwmain;
    $$("[data-kwmainpane]").forEach((p) => p.classList.toggle("active", p.dataset.kwmainpane === m));
  }));
  $$("#plTabs .tab").forEach((t) => t.addEventListener("click", () => {
    $$("#plTabs .tab").forEach((x) => x.classList.toggle("active", x === t));
    plMode = t.dataset.plmode;
    $$("[data-plpane]").forEach((p) => p.classList.toggle("active", p.dataset.plpane === plMode));
  }));

  // Đọc Excel/CSV
  $("#plFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    $("#plFileMsg").textContent = "Đang đọc...";
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      let rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })
        .map((r) => ({ keyword: String(r[0] || "").trim(), topic: String(r[1] || "").trim() })).filter((r) => r.keyword);
      if (rows.length && /^(từ khóa|tu khoa|keyword|kw)$/i.test(rows[0].keyword)) rows = rows.slice(1);
      excelRows = rows;
      $("#plFileMsg").textContent = `✓ Đã đọc ${rows.length} từ khóa${rows.some((r) => r.topic) ? " (có sẵn topic)" : ""} từ ${f.name}`;
    } catch (err) { $("#plFileMsg").textContent = "Lỗi đọc file: " + (err.message || err); }
    finally { e.target.value = ""; }
  });

  function parseManual(text) {
    return String(text || "").split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      let kw = l, topic = "";
      if (l.includes("|")) { const p = l.split("|"); kw = p[0].trim(); topic = p.slice(1).join("|").trim(); }
      else if (l.includes("\t")) { const p = l.split("\t"); kw = p[0].trim(); topic = p.slice(1).join(" ").trim(); }
      return { keyword: kw, topic };
    }).filter((r) => r.keyword);
  }
  const collectInput = () => (plMode === "excel" ? (excelRows || []) : parseManual($("#plManualInput").value));
  function populateTopicFilter(sel, topics) {
    $(sel).innerHTML = `<option value="">Mọi topic</option>` + topics.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
  }
  const normKw = (s) => String(s || "").toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
  function dedupInput(list) {
    const seen = new Map(); let dups = 0; const samples = [];
    for (const k of list) {
      const kw = String(k.keyword || "").trim(); if (!kw) continue;
      const key = normKw(kw);
      if (!seen.has(key)) seen.set(key, { keyword: kw, topic: String(k.topic || "").trim() });
      else { dups++; if (samples.length < 6) samples.push(kw); const e = seen.get(key); if (!e.topic && k.topic) e.topic = String(k.topic).trim(); }
    }
    return { uniq: Array.from(seen.values()), dups, samples };
  }

  /* ---------- Bộ từ khóa đã lưu (nghiên cứu tiếp không cần upload lại) ---------- */
  let plSets = [], plSetsLoaded = false, plLoadedSetId = "", plLoadedSetName = "";
  async function loadPlSets() {
    try {
      const r = await _fetch("/api/keywords/sets");
      if (!r.ok) return;
      const d = await r.json();
      plSets = d.sets || [];
      const sel = $("#plSetSelect"); if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = `<option value="">— Chọn bộ đã lưu —</option>` +
        plSets.map((s) => `<option value="${esc(s.id)}">${esc(s.name)} (${s.count})</option>`).join("");
      if (cur && plSets.some((s) => s.id === cur)) sel.value = cur;
    } catch {}
  }
  function ensurePlSets() { if (!plSetsLoaded) { plSetsLoaded = true; loadPlSets(); } }
  $$("#kwMainTabs .tab").forEach((t) => t.addEventListener("click", () => { if (t.dataset.kwmain === "pillar") ensurePlSets(); }));
  $$('#menu .menu-item').forEach((mi) => mi.addEventListener("click", () => { if (mi.dataset.section === "keywords") ensurePlSets(); }));
  ensurePlSets();

  $("#plSetLoad").addEventListener("click", () => {
    const id = $("#plSetSelect").value;
    if (!id) return setMsg("#plSetMsg", "err", "Chọn một bộ để nạp.");
    const s = plSets.find((x) => x.id === id);
    if (!s) return;
    excelRows = (s.keywords || []).map((k) => ({ keyword: k.keyword, topic: k.topic || "" }));
    plMode = "excel";
    $$("#plTabs .tab").forEach((x) => x.classList.toggle("active", x.dataset.plmode === "excel"));
    $$("[data-plpane]").forEach((p) => p.classList.toggle("active", p.dataset.plpane === "excel"));
    $("#plFileMsg").textContent = `✓ Đã nạp ${excelRows.length} từ khóa từ bộ "${s.name}"`;
    plLoadedSetId = s.id; plLoadedSetName = s.name;
    setMsg("#plSetMsg", "info", `✓ Đã nạp bộ "${esc(s.name)}" (${excelRows.length} từ). Bấm "Phân tích &amp; phân nhóm topic" để tiếp tục.`);
  });

  $("#plSetSave").addEventListener("click", async () => {
    // Ưu tiên lưu kết quả đã phân nhóm (có topic) nếu có; else input thô hiện tại
    const rows = (statsRows && statsRows.length)
      ? statsRows.map((r) => ({ keyword: r.keyword, topic: r.topic, vi: r.vi || "" }))
      : dedupInput(collectInput()).uniq;
    if (!rows.length) return setMsg("#plSetMsg", "err", "Chưa có từ khóa để lưu (dán/tải danh sách hoặc phân nhóm trước).");
    const defName = plLoadedSetName || ("Bộ từ khóa " + new Date().toLocaleDateString("vi-VN"));
    const name = prompt("Tên bộ từ khóa:", defName);
    if (name === null) return;
    const btn = $("#plSetSave"); busy(btn, true, "Đang lưu...");
    try {
      const r = await _fetch("/api/keywords/sets/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: plLoadedSetId || "", name: (name || "").trim(), keywords: rows }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Lưu thất bại");
      plLoadedSetId = d.id; plLoadedSetName = d.name;
      await loadPlSets(); $("#plSetSelect").value = d.id;
      setMsg("#plSetMsg", "info", `✓ Đã lưu bộ "${esc(d.name)}" (${d.count} từ khóa).`);
    } catch (e) { setMsg("#plSetMsg", "err", "❌ " + e.message); }
    finally { busy(btn, false); }
  });

  $("#plSetDelete").addEventListener("click", async () => {
    const id = $("#plSetSelect").value;
    if (!id) return setMsg("#plSetMsg", "err", "Chọn một bộ để xóa.");
    if (!confirm("Xóa bộ từ khóa này?")) return;
    try {
      const r = await _fetch("/api/keywords/sets/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const d = await r.json();
      if (d.ok) { if (plLoadedSetId === id) { plLoadedSetId = ""; plLoadedSetName = ""; } await loadPlSets(); setMsg("#plSetMsg", "info", "Đã xóa."); }
      else setMsg("#plSetMsg", "err", "Không xóa được.");
    } catch { setMsg("#plSetMsg", "err", "Lỗi xóa."); }
  });

  // Bước 3: thêm từ khóa gợi ý vào bộ đã nạp — CHỌN TỪNG TỪ (nút Lưu mỗi dòng) hoặc lưu tất cả đang hiển thị.
  const plSavedKeys = new Set(); // các từ đã lưu trong phiên (để đánh dấu ✓)
  // Xác định bộ đích: ưu tiên bộ đang chọn/đã nạp; nếu chưa có thì hỏi tạo bộ mới (1 lần).
  async function plResolveTarget(msgSel) {
    let targetId = $("#plSetSelect").value || plLoadedSetId || "";
    let name = "";
    if (!targetId) {
      name = prompt("Chưa có bộ từ khóa đích. Nhập tên bộ MỚI để lưu vào:", plLoadedSetName || ("Bộ từ khóa " + new Date().toLocaleDateString("vi-VN")));
      if (name === null) return null;
    }
    return { targetId, name: (name || "").trim() };
  }
  async function plAppendRows(rows, target) {
    const r = await _fetch("/api/keywords/sets/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: target.targetId, name: target.name, keywords: rows, append: true }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Lưu thất bại");
    plLoadedSetId = d.id; plLoadedSetName = d.name;
    await loadPlSets(); $("#plSetSelect").value = d.id;
    rows.forEach((x) => plSavedKeys.add(normKw(x.keyword)));
    return d;
  }
  // Lưu 1 từ khóa (nút ＋ Lưu ở từng dòng)
  async function plSaveOneKw(btn) {
    const row = { keyword: btn.dataset.kw, topic: btn.dataset.topic || "", vi: btn.dataset.vi || "" };
    const target = await plResolveTarget("#plSuggestMsg");
    if (!target) return;
    btn.disabled = true; btn.textContent = "...";
    try {
      const d = await plAppendRows([row], target);
      renderSuggest(); // cập nhật đánh dấu ✓
      setMsg("#plSuggestMsg", "info", `✓ Đã thêm "${esc(row.keyword)}" vào bộ "${esc(d.name)}" (tổng ${d.count}).`);
    } catch (e) { btn.disabled = false; btn.textContent = "＋ Lưu"; setMsg("#plSuggestMsg", "err", "❌ " + e.message); }
  }
  // Lưu TẤT CẢ từ khóa đang hiển thị (theo bộ lọc hiện tại)
  $("#plSuggestSave").addEventListener("click", async () => {
    const rows = suggestFiltered().map((r) => ({ keyword: r.keyword, topic: r.topic, vi: r.vi || "" }));
    if (!rows.length) return setMsg("#plSuggestMsg", "err", "❌ Chưa có từ khóa để lưu.");
    const target = await plResolveTarget("#plSuggestMsg");
    if (!target) return;
    const btn = $("#plSuggestSave"); busy(btn, true, "Đang lưu...");
    try {
      const d = await plAppendRows(rows, target);
      renderSuggest();
      setMsg("#plSuggestMsg", "info", `✓ Đã thêm ${rows.length} từ khóa đang hiển thị vào bộ "${esc(d.name)}" — tổng ${d.count}.`);
    } catch (e) { setMsg("#plSuggestMsg", "err", "❌ " + e.message); }
    finally { busy(btn, false); }
  });

  /* ---------- BƯỚC 1+2: phân tích theo LÔ ---------- */
  analyzeBtn.addEventListener("click", async () => {
    const raw = collectInput();
    if (!raw.length) return setMsg("#plMsg", "err", "❌ Chưa có từ khóa. Dán danh sách hoặc tải Excel lên.");
    const { uniq, dups, samples } = dedupInput(raw);
    isEnglish = ($("#plHl").value === "en");
    const engine = $("#engine").value, model = $("#model").value, apiKey = $("#apiKey").value.trim();
    // Chỉ BẮT BUỘC AI khi có từ khóa CHƯA có topic (cần AI gom nhóm). Dịch VI là tùy chọn (AI lỗi vẫn chạy, bỏ qua dịch).
    const needAI = uniq.some((k) => !k.topic);
    if (needAI && engine !== "gemini" && engine !== "claude")
      return setMsg("#plMsg", "err", "❌ Có từ khóa chưa gán topic — cần bật Gemini/Claude ở ⚙️ để AI phân nhóm (hoặc tự nhập cột topic cho mọi từ khóa).");
    const dupNote = dups > 0 ? ` (đã loại ${dups} từ trùng: ${samples.map(esc).join(", ")}${dups > samples.length ? "..." : ""})` : "";

    busy(analyzeBtn, true, "Đang phân nhóm...");
    $("#plStatsCard").classList.add("hidden"); $("#plSuggestCard").classList.add("hidden");
    // Lô nhỏ hơn khi phải dịch VI (output dài gấp đôi, dễ bị cắt) — an toàn & nhanh hơn mỗi call
    const batches = chunk(uniq, isEnglish ? 70 : 120);
    statsRows = []; const knownTopics = new Set(); let aiErr = "";
    try {
      let done = 0;
      const setProg = () => setMsg("#plMsg", "info", `<span class="spinner" style="border-top-color:transparent"></span>Đang phân nhóm ${batches.length > 1 ? `(${done}/${batches.length} lô)` : ""} (${uniq.length} từ khóa)${dupNote}...`);
      const runBatch = async (i) => {
        const r = await _fetch("/api/keywords/pillar/classify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keywords: batches[i], knownTopics: [...knownTopics], needTranslate: isEnglish, engine, model, apiKey }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Lỗi phân nhóm");
        if (d.aiError && !aiErr) aiErr = d.aiError;
        (d.items || []).forEach((it) => { const topic = it.topic || "Khác"; statsRows.push({ keyword: it.keyword, topic, vi: it.vi || "" }); knownTopics.add(topic); });
        done++; setProg();
      };
      setProg();
      // Lô đầu chạy trước để lập bộ topic gốc; các lô sau chạy song song (tối đa 3) cho nhanh
      if (batches.length) await runBatch(0);
      const CONC = 3, rest = batches.map((_, i) => i).slice(1);
      for (let i = 0; i < rest.length; i += CONC) {
        await Promise.all(rest.slice(i, i + CONC).map((idx) => runBatch(idx)));
      }
      // BÙ DỊCH VI cho những từ AI phân nhóm bỏ sót (đảm bảo 100% có bản dịch khi chọn tiếng Anh)
      if (isEnglish && (engine === "gemini" || engine === "claude")) {
        const missing = statsRows.filter((r) => !r.vi || !r.vi.trim()).map((r) => r.keyword);
        if (missing.length) {
          setMsg("#plMsg", "info", `<span class="spinner" style="border-top-color:transparent"></span>Đang bù bản dịch cho ${missing.length} từ khóa...`);
          const viMap = {};
          const tb = chunk(missing, 100);
          try {
            for (let i = 0; i < tb.length; i++) {
              const rt = await _fetch("/api/keywords/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keywords: tb[i], engine, model, apiKey }) });
              const dt = await rt.json();
              if (rt.ok) (dt.items || []).forEach((it) => { if (it.keyword) viMap[normKw(it.keyword)] = it.vi || ""; });
            }
            statsRows.forEach((r) => { if ((!r.vi || !r.vi.trim()) && viMap[normKw(r.keyword)]) r.vi = viMap[normKw(r.keyword)]; });
          } catch {}
        }
      }
      const tMap = {}; statsRows.forEach((r) => { tMap[r.topic] = (tMap[r.topic] || 0) + 1; });
      const topics = Object.entries(tMap).map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count);
      $("#plKwCount").textContent = statsRows.length; $("#plTopicCount").textContent = topics.length;
      $("#plTopicChips").innerHTML = topics.map((t) => `<span class="chip">${esc(t.topic)} <b style="color:var(--c-blue)">${t.count}</b></span>`).join("");
      populateTopicFilter("#plStatsTopicFilter", topics.map((t) => t.topic));
      renderStats();
      $("#plStatsCard").classList.remove("hidden");
      const viNote = isEnglish ? (aiErr ? "" : " (kèm bản dịch VI)") : "";
      setMsg("#plMsg", aiErr ? "warn" : "info", `✓ Đã phân ${statsRows.length} từ khóa thành ${topics.length} topic${viNote}${dupNote}.${aiErr ? " ⚠️ " + esc(aiErr) : ""}`);
    } catch (err) { setMsg("#plMsg", "err", "❌ " + err.message); }
    finally { busy(analyzeBtn, false); }
  });

  function statsFiltered() {
    const q = ($("#plStatsFilter").value || "").trim().toLowerCase();
    const tp = $("#plStatsTopicFilter").value;
    let list = statsRows.filter((r) => (!q || r.keyword.toLowerCase().includes(q) || (r.vi || "").toLowerCase().includes(q)) && (!tp || r.topic === tp));
    const s = $("#plStatsSort").value;
    if (s === "az") list = list.slice().sort((a, b) => a.keyword.localeCompare(b.keyword, "vi"));
    else if (s === "za") list = list.slice().sort((a, b) => b.keyword.localeCompare(a.keyword, "vi"));
    else list = list.slice().sort((a, b) => a.topic.localeCompare(b.topic, "vi") || a.keyword.localeCompare(b.keyword, "vi"));
    return list;
  }
  function renderStats() {
    const list = statsFiltered();
    $("#plStatsShown").textContent = `Hiển thị: ${list.length}`;
    const viCol = isEnglish;
    const head = `<tr><th>#</th><th>Từ khóa</th>${viCol ? "<th>Bản dịch (VI)</th>" : ""}<th>Topic</th></tr>`;
    const body = list.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.keyword)}</td>${viCol ? `<td>${esc(r.vi || "")}</td>` : ""}<td><span class="chip" style="padding:2px 9px">${esc(r.topic)}</span></td></tr>`).join("");
    const scroll = list.length > 20 ? ' style="max-height:560px;overflow:auto"' : ' style="overflow:auto"';
    $("#plStatsTable").innerHTML = `<div${scroll}><table class="cmp"><thead>${head}</thead><tbody>${body}</tbody></table></div>` + (list.length > 20 ? `<p class="muted" style="font-size:.8rem;margin:6px 0 0">Hiển thị 20 dòng đầu, cuộn trong bảng để xem tất cả ${list.length} dòng.</p>` : "");
  }
  $("#plStatsFilter").addEventListener("input", renderStats);
  $("#plStatsTopicFilter").addEventListener("change", renderStats);
  $("#plStatsSort").addEventListener("change", renderStats);

  $("#plStatsCopy").addEventListener("click", async () => {
    if (!statsRows.length) return toast("Chưa có dữ liệu.");
    const h = isEnglish ? "Từ khóa\tBản dịch (VI)\tTopic" : "Từ khóa\tTopic";
    const txt = h + "\n" + statsFiltered().map((r) => isEnglish ? `${r.keyword}\t${r.vi || ""}\t${r.topic}` : `${r.keyword}\t${r.topic}`).join("\n");
    try { await navigator.clipboard.writeText(txt); toast("Đã copy!"); } catch { toast("Không copy được."); }
  });
  $("#plStatsExport").addEventListener("click", () => {
    if (!statsRows.length) return toast("Chưa có dữ liệu.");
    if (typeof XLSX === "undefined") return toast("Thư viện Excel chưa tải xong.");
    const head = isEnglish ? ["Từ khóa", "Bản dịch (VI)", "Topic"] : ["Từ khóa", "Topic"];
    const aoa = [head].concat(statsFiltered().map((r) => isEnglish ? [r.keyword, r.vi || "", r.topic] : [r.keyword, r.topic]));
    const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "PillarTopic"); XLSX.writeFile(wb, "seoshark-pillar-topic.xlsx");
  });

  /* ---------- BƯỚC 3: gợi ý từ khóa bổ sung (theo LÔ topic) ---------- */
  $("#plSuggest").addEventListener("click", async () => {
    if (!statsRows.length) return setMsg("#plSuggestMsg", "err", "❌ Chưa có bảng phân nhóm.");
    const engine = $("#engine").value, model = $("#model").value, apiKey = $("#apiKey").value.trim();
    const gl = $("#plGl").value, hl = $("#plHl").value, bingKey = $("#plBingKey").value.trim();
    const allHave = statsRows.map((r) => r.keyword);
    const byTopic = {}; statsRows.forEach((r) => { (byTopic[r.topic] = byTopic[r.topic] || []).push(r.keyword); });
    const topicList = Object.entries(byTopic).map(([topic, have]) => ({ topic, have }));
    const batches = chunk(topicList, 4);

    const btn = $("#plSuggest"); busy(btn, true, "Đang gợi ý...");
    $("#plSuggestCard").classList.add("hidden"); $("#plOutlinePanel").classList.add("hidden");
    suggestData = []; const usedGlobal = new Set(); let anyTrend = false, anyBing = false, sugAiErr = "";
    try {
      for (let i = 0; i < batches.length; i++) {
        setMsg("#plSuggestMsg", "info", `<span class="spinner" style="border-top-color:transparent"></span>Đang gợi ý từ Google Autocomplete ${batches.length > 1 ? `(lô ${i + 1}/${batches.length})` : ""}...`);
        const r = await _fetch("/api/keywords/pillar/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topics: batches[i], allHave, gl, hl, engine, model, apiKey, bingKey, minPerTopic: 30, needTranslate: isEnglish }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Lỗi gợi ý");
        anyTrend = anyTrend || d.trendUsed; anyBing = anyBing || d.bingUsed;
        if (d.aiError && !sugAiErr) sugAiErr = d.aiError;
        (d.topics || []).forEach((t) => {
          const kws = (t.keywords || []).filter((k) => { const key = normKw(k.keyword); if (usedGlobal.has(key)) return false; usedGlobal.add(key); return true; });
          if (kws.length) suggestData.push({ topic: t.topic, keywords: kws });
        });
      }
      const total = suggestData.reduce((s, t) => s + t.keywords.length, 0);
      $("#plSugCount").textContent = total;
      populateTopicFilter("#plSugTopicFilter", suggestData.map((t) => t.topic));
      renderSuggest();
      $("#plSuggestCard").classList.remove("hidden");
      const notes = [];
      if (anyBing) notes.push("có số lượt/tháng (Bing)");
      if (anyTrend) notes.push("có mức quan tâm (Trends)");
      setMsg("#plSuggestMsg", sugAiErr ? "warn" : "info", `✓ Gợi ý ${total} từ khóa (từ Google Autocomplete thật) cho ${suggestData.length} topic${notes.length ? " — " + notes.join("; ") : ""}.${sugAiErr ? " ⚠️ AI không dùng được (" + esc(sugAiErr) + ") → dùng trực tiếp gợi ý Google." : ""}`);
      $("#plSuggestCard").scrollIntoView({ block: "start", behavior: "smooth" });
    } catch (err) { setMsg("#plSuggestMsg", "err", "❌ " + err.message); }
    finally { busy(btn, false); }
  });

  const suggestFlat = () => suggestData.flatMap((t) => t.keywords.map((k) => ({ ...k, topic: t.topic })));
  function suggestFiltered() {
    const q = ($("#plSugFilter").value || "").trim().toLowerCase();
    const tp = $("#plSugTopicFilter").value;
    let list = suggestFlat().filter((r) => (!q || r.keyword.toLowerCase().includes(q) || (r.vi || "").toLowerCase().includes(q)) && (!tp || r.topic === tp));
    const s = $("#plSugSort").value;
    if (s === "vol") list.sort((a, b) => num(b.volume) - num(a.volume) || num(b.trend) - num(a.trend));
    else if (s === "trend") list.sort((a, b) => num(b.trend) - num(a.trend) || num(b.volume) - num(a.volume));
    else if (s === "az") list.sort((a, b) => a.keyword.localeCompare(b.keyword, "vi"));
    else list.sort((a, b) => a.topic.localeCompare(b.topic, "vi") || num(b.volume) - num(a.volume));
    return list;
  }
  function renderSuggest() {
    const list = suggestFiltered();
    const hasVol = list.some((r) => Number.isFinite(r.volume));
    const viCol = isEnglish || list.some((r) => r.vi);
    $("#plSugShown").textContent = `Hiển thị: ${list.length}`;
    const head = `<tr><th>#</th><th>Topic</th><th>Từ khóa gợi ý</th>${viCol ? "<th>Bản dịch (VI)</th>" : ""}${hasVol ? "<th>Volume/tháng<br><small class='muted'>Bing</small></th>" : ""}<th style="min-width:100px">Quan tâm<br><small class='muted'>Trends</small></th><th>Lưu</th><th>Outline</th></tr>`;
    const body = list.map((r, i) => {
      const saved = plSavedKeys.has(normKw(r.keyword));
      const saveBtn = saved
        ? `<span class="muted" style="font-size:.8rem">✓ Đã lưu</span>`
        : `<button class="ghost small pl-save-btn" data-kw="${esc(r.keyword)}" data-topic="${esc(r.topic)}" data-vi="${esc(r.vi || "")}">＋ Lưu</button>`;
      return `<tr><td>${i + 1}</td><td><span class="chip" style="padding:2px 9px">${esc(r.topic)}</span></td><td>${esc(r.keyword)}</td>${viCol ? `<td>${esc(r.vi || "")}</td>` : ""}${hasVol ? `<td style="text-align:right">${fmtVol(r.volume)}</td>` : ""}<td>${trendBar(r.trend)}</td><td>${saveBtn}</td><td><button class="ghost small pl-ol-btn" data-kw="${esc(r.keyword)}">Lên outline</button></td></tr>`;
    }).join("");
    const scroll = list.length > 20 ? ' style="max-height:640px;overflow:auto"' : ' style="overflow:auto"';
    $("#plSuggestList").innerHTML = `<div${scroll}><table class="cmp"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    $$("#plSuggestList .pl-ol-btn").forEach((b) => b.addEventListener("click", () => openOutline(b.dataset.kw)));
    $$("#plSuggestList .pl-save-btn").forEach((b) => b.addEventListener("click", () => plSaveOneKw(b)));
  }
  $("#plSugFilter").addEventListener("input", renderSuggest);
  $("#plSugTopicFilter").addEventListener("change", renderSuggest);
  $("#plSugSort").addEventListener("change", renderSuggest);

  $("#plSuggestCopy").addEventListener("click", async () => {
    if (!suggestData.length) return toast("Chưa có dữ liệu.");
    const h = isEnglish ? "Topic\tTừ khóa\tBản dịch (VI)\tVolume/tháng\tQuan tâm" : "Topic\tTừ khóa\tVolume/tháng\tQuan tâm";
    const txt = h + "\n" + suggestFiltered().map((r) => (isEnglish ? `${r.topic}\t${r.keyword}\t${r.vi || ""}` : `${r.topic}\t${r.keyword}`) + `\t${Number.isFinite(r.volume) ? r.volume : ""}\t${Number.isFinite(r.trend) ? r.trend : ""}`).join("\n");
    try { await navigator.clipboard.writeText(txt); toast("Đã copy!"); } catch { toast("Không copy được."); }
  });
  $("#plSuggestExport").addEventListener("click", () => {
    if (!suggestData.length) return toast("Chưa có dữ liệu.");
    if (typeof XLSX === "undefined") return toast("Thư viện Excel chưa tải xong.");
    const head = isEnglish ? ["Topic", "Từ khóa gợi ý", "Bản dịch (VI)", "Volume/tháng (Bing)", "Mức quan tâm (Trends)"] : ["Topic", "Từ khóa gợi ý", "Volume/tháng (Bing)", "Mức quan tâm (Trends)"];
    const aoa = [head].concat(suggestFiltered().map((r) => (isEnglish ? [r.topic, r.keyword, r.vi || ""] : [r.topic, r.keyword]).concat([Number.isFinite(r.volume) ? r.volume : "", Number.isFinite(r.trend) ? r.trend : ""])));
    const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "GoiYBoSung"); XLSX.writeFile(wb, "seoshark-pillar-goi-y.xlsx");
  });

  /* ---------- Outline nội tuyến cho 1 từ khóa gợi ý ---------- */
  let olKw = "", olOutline = [];
  // Kiến thức website (dùng chung thư viện /api/knowledge với tab Lên outline)
  let plKnowLoaded = false;
  if ($("#plOlKnow")) KB.registerSelect($("#plOlKnow"));
  async function loadPlKnow() { await KB.load(); }
  function openOutline(kw) {
    olKw = kw; olOutline = [];
    $("#plOlKw").textContent = kw;
    $("#plOlResult").classList.add("hidden"); $("#plOlMsg").innerHTML = ""; $("#plOlTree").innerHTML = "";
    if (!plKnowLoaded) { plKnowLoaded = true; loadPlKnow(); }
    $("#plOutlinePanel").classList.remove("hidden");
    $("#plOutlinePanel").scrollIntoView({ block: "center", behavior: "smooth" });
  }
  $("#plOlClose").addEventListener("click", () => $("#plOutlinePanel").classList.add("hidden"));
  $("#plOlKnowNew").addEventListener("click", () => {
    const ed = $("#plOlKnowEditor"); ed.classList.toggle("hidden");
    const k = KB.get($("#plOlKnow").value);
    if (!ed.classList.contains("hidden") && k) { $("#plOlKnowTitle").value = k.title || ""; $("#plOlKnowContent").value = htmlToReadable(k.content || ""); }
  });

  $("#plOlRun").addEventListener("click", async () => {
    const kw = ($("#plOlKw").textContent || olKw || "").trim();
    if (!kw) return setMsg("#plOlMsg", "err", "❌ Thiếu từ khóa.");
    const urls = String($("#plOlUrls").value || "").split(/\n/).map((s) => s.trim()).filter(Boolean).slice(0, 10);
    if (!urls.length) return setMsg("#plOlMsg", "err", "❌ Dán ít nhất 1 URL đối thủ.");
    const engine = $("#engine").value, model = $("#model").value, apiKey = $("#apiKey").value.trim();
    const gl = $("#plGl").value, hl = $("#plHl").value;
    const btn = $("#plOlRun"); busy(btn, true, "Đang xử lý...");
    $("#plOlResult").classList.add("hidden");
    setMsg("#plOlMsg", "info", '<span class="spinner" style="border-top-color:transparent"></span>Đang bóc tách đối thủ & tạo outline...');
    try {
      const rc = await _fetch("/api/outline/competitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls, gl, hl }) });
      const dc = await rc.json();
      if (!rc.ok) throw new Error(dc.error || "Lỗi phân tích đối thủ");
      const comps = (dc.competitors || []).filter((c) => (c.headings || []).length);
      if (!comps.length) throw new Error("Không bóc tách được heading từ URL đã dán (có thể trang dựng JS). Thử URL bài viết khác.");
      // Kiến thức website: ưu tiên nội dung vừa nhập (editor đang mở), else tài liệu đã chọn
      let knowledge = "", websiteName = "";
      const typed = ($("#plOlKnowContent").value || "").trim();
      if (typed && !$("#plOlKnowEditor").classList.contains("hidden")) {
        knowledge = typed;
        if ($("#plOlKnowSaveLib").checked) {
          try {
            const rs = await _fetch("/api/knowledge/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "", website: "", title: $("#plOlKnowTitle").value.trim() || kw, content: typed }) });
            const ds = await rs.json(); if (rs.ok) { await loadPlKnow(); $("#plOlKnow").value = ds.id; $("#plOlKnowSaveLib").checked = false; }
          } catch {}
        }
      } else {
        const k = KB.get($("#plOlKnow").value);
        if (k) { knowledge = htmlToReadable(k.content || ""); websiteName = k.website || ""; }
      }
      const rg = await _fetch("/api/outline/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mainKw: kw, subKws: [], competitors: comps, knowledge, websiteName, engine, model, apiKey }) });
      const dg = await rg.json();
      if (!rg.ok) throw new Error(dg.error || "Lỗi tạo outline");
      olOutline = dg.outline || [];
      $("#plOlEngine").textContent = "— " + (dg.engineUsed || "");
      $("#plOlTree").innerHTML = olOutline.map((it) => {
        const pad = (it.level - 2) * 22;
        const tag = `<span class="muted" style="font-size:.72rem;border:1px solid var(--line);border-radius:4px;padding:0 4px;margin-right:6px">H${it.level}</span>`;
        const star = it.hasMain ? ` <span style="color:var(--green)">★</span>` : "";
        return `<div style="padding:4px 0;padding-left:${pad}px;font-weight:${it.level === 2 ? 600 : 400}">${tag}${esc(it.text)}${star}</div>`;
      }).join("");
      $("#plOlResult").classList.remove("hidden");
      setMsg("#plOlMsg", dg.aiError ? "warn" : "info", dg.aiError ? `⚠️ AI lỗi (${esc(dg.aiError)}) → dùng Local.` : `✓ Đã tạo outline ${olOutline.length} heading.`);
    } catch (err) { setMsg("#plOlMsg", "err", "❌ " + err.message); }
    finally { busy(btn, false); }
  });
  $("#plOlCopy").addEventListener("click", async () => {
    if (!olOutline.length) return toast("Chưa có outline.");
    const md = olOutline.map((it) => `${"#".repeat(it.level)} ${it.text}`).join("\n");
    try { await navigator.clipboard.writeText(md); toast("Đã copy Markdown!"); } catch { toast("Không copy được."); }
  });
})();

/* ===================== XÂY DỰNG PILLAR CONTENT (Internal Link) ===================== */
(function () {
  const analyzeBtn = $("#pcAnalyze");
  if (!analyzeBtn) return;
  let pcMode = "manual";
  let excelRows = null;      // [{keyword,url,category}]
  let classifyRows = [];     // [{keyword,url,category,conv,phanLoai,topic,ghiChu,vi}]
  let resultRows = [];       // classify + {tier,vaiTro,nhomThuocTinh,tuKhoaCha}
  let isEng = false;

  const setMsg = (el, type, msg) => { $(el).innerHTML = msg ? alertHtml(type, msg) : ""; };
  const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
  const normKw = (s) => String(s || "").toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
  const normUrl = (u) => String(u || "").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[?#]/)[0].replace(/\/+$/, "");
  const TIER_COLOR = { 1: "#6C8CFF", 2: "#57D9A3", 3: "#3FC8D6", 4: "#FFC46B", 5: "#FFAD8A" };

  // subtabs
  $$("#pcTabs .tab").forEach((t) => t.addEventListener("click", () => {
    $$("#pcTabs .tab").forEach((x) => x.classList.toggle("active", x === t));
    pcMode = t.dataset.pcmode;
    $$("[data-pcpane]").forEach((p) => p.classList.toggle("active", p.dataset.pcpane === pcMode));
  }));

  $("#pcFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    $("#pcFileMsg").textContent = "Đang đọc...";
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      let rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false })
        .map((r) => ({ keyword: String(r[0] || "").trim(), url: String(r[1] || "").trim(), category: String(r[2] || "").trim() })).filter((r) => r.keyword);
      if (rows.length && /^(từ khóa|tu khoa|keyword|kw)$/i.test(rows[0].keyword)) rows = rows.slice(1);
      excelRows = rows;
      $("#pcFileMsg").textContent = `✓ Đã đọc ${rows.length} từ khóa từ ${f.name}`;
    } catch (err) { $("#pcFileMsg").textContent = "Lỗi đọc file: " + (err.message || err); }
    finally { e.target.value = ""; }
  });

  function parseManual(text) {
    return String(text || "").split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const p = l.split("|").map((x) => x.trim());
      return { keyword: p[0] || "", url: p[1] || "", category: p[2] || "" };
    }).filter((r) => r.keyword);
  }
  const collect = () => (pcMode === "excel" ? (excelRows || []) : parseManual($("#pcManualInput").value));
  function populate(sel, arr) { $(sel).innerHTML = `<option value="">Mọi ${sel.includes("Cat") ? "chuyên mục" : "topic"}</option>` + arr.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join(""); }

  /* ---------- BƯỚC 1: phân loại + topic (theo lô) ---------- */
  analyzeBtn.addEventListener("click", async () => {
    const raw = collect();
    if (!raw.length) return setMsg("#pcMsg", "err", "❌ Chưa có từ khóa. Dán danh sách hoặc tải Excel.");
    // dedup theo keyword
    const seen = new Map(); let dups = 0;
    raw.forEach((r) => { const k = normKw(r.keyword); if (!seen.has(k)) seen.set(k, { ...r, category: r.category || "(Chưa phân mục)" }); else dups++; });
    const rows = Array.from(seen.values());
    // conversion set
    const convLines = String($("#pcConvInput").value || "").split(/\n/).map((s) => s.trim()).filter(Boolean);
    const convUrl = new Set(), convKw = new Set();
    convLines.forEach((c) => { if (/^https?:\/\//i.test(c) || c.includes("/")) convUrl.add(normUrl(c)); else convKw.add(normKw(c)); });
    rows.forEach((r) => { r.conv = (r.url && convUrl.has(normUrl(r.url))) || convKw.has(normKw(r.keyword)); });
    const convCount = rows.filter((r) => r.conv).length;

    isEng = ($("#pcHl").value === "en");
    const engine = $("#engine").value, model = $("#model").value, apiKey = $("#apiKey").value.trim();
    if (engine !== "gemini" && engine !== "claude") return setMsg("#pcMsg", "err", "❌ Cần bật engine Gemini/Claude ở ⚙️.");

    busy(analyzeBtn, true, "Đang phân loại...");
    $("#pcClassifyCard").classList.add("hidden"); $("#pcResultCard").classList.add("hidden");
    classifyRows = []; const knownTopics = new Set();
    const batches = chunk(rows, isEng ? 70 : 120);
    try {
      let done = 0;
      const setProg = () => setMsg("#pcMsg", "info", `<span class="spinner" style="border-top-color:transparent"></span>Đang phân loại ${batches.length > 1 ? `(${done}/${batches.length} lô)` : ""} (${rows.length} từ, ${convCount} chuyển đổi${dups ? `, đã loại ${dups} trùng` : ""})...`);
      const runBatch = async (i) => {
        const r = await _fetch("/api/internal/pillar/classify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: batches[i], knownTopics: [...knownTopics], needTranslate: isEng, engine, model, apiKey }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Lỗi phân loại");
        (d.items || []).forEach((it) => { classifyRows.push(it); knownTopics.add(it.topic); });
        done++; setProg();
      };
      setProg();
      if (batches.length) await runBatch(0);
      const CONC = 3, rest = batches.map((_, i) => i).slice(1);
      for (let i = 0; i < rest.length; i += CONC) {
        await Promise.all(rest.slice(i, i + CONC).map((idx) => runBatch(idx)));
      }
      populate("#pcCatFilter", [...new Set(classifyRows.map((r) => r.category))]);
      $("#pcKwCount").textContent = classifyRows.length;
      renderClassify();
      $("#pcClassifyCard").classList.remove("hidden");
      const cd = classifyRows.filter((r) => r.phanLoai === "Chuyển đổi").length;
      setMsg("#pcMsg", "info", `✓ Đã phân loại ${classifyRows.length} từ khóa (${cd} Chuyển đổi · ${classifyRows.length - cd} Tin tức)${dups ? `, đã loại ${dups} từ trùng` : ""}. Tick lại cột CĐ nếu cần rồi bấm Phân bậc.`);
      $("#pcClassifyCard").scrollIntoView({ block: "start", behavior: "smooth" });
    } catch (err) { setMsg("#pcMsg", "err", "❌ " + err.message); }
    finally { busy(analyzeBtn, false); }
  });

  function classifyFiltered() {
    const q = ($("#pcFilter").value || "").trim().toLowerCase();
    const cat = $("#pcCatFilter").value, cls = $("#pcClassFilter").value;
    return classifyRows.map((r, idx) => ({ r, idx })).filter(({ r }) => (!q || r.keyword.toLowerCase().includes(q)) && (!cat || r.category === cat) && (!cls || r.phanLoai === cls));
  }
  function renderClassify() {
    const list = classifyFiltered();
    $("#pcShown").textContent = `Hiển thị: ${list.length}`;
    const head = `<tr><th>CĐ</th><th>#</th><th>Từ khóa</th>${isEng ? "<th>VI</th>" : ""}<th>Chuyên mục</th><th>Phân loại</th><th>Topic Content</th></tr>`;
    const body = list.map(({ r, idx }, i) => `<tr><td style="text-align:center"><input type="checkbox" class="pc-conv" data-idx="${idx}" ${r.phanLoai === "Chuyển đổi" ? "checked" : ""} style="width:16px;height:16px;accent-color:var(--c-mint)"></td><td>${i + 1}</td><td>${esc(r.keyword)}</td>${isEng ? `<td>${esc(r.vi || "")}</td>` : ""}<td><span class="chip" style="padding:2px 8px">${esc(r.category)}</span></td><td data-pl="${idx}"><span class="badge ${r.phanLoai === "Chuyển đổi" ? "ok" : ""}">${esc(r.phanLoai)}</span></td><td>${esc(r.topic)}</td></tr>`).join("");
    const sc = list.length > 20 ? ' style="max-height:600px;overflow:auto"' : ' style="overflow:auto"';
    $("#pcClassifyTable").innerHTML = `<div${sc}><table class="cmp"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    $$("#pcClassifyTable .pc-conv").forEach((cb) => cb.addEventListener("change", () => {
      const idx = +cb.dataset.idx; classifyRows[idx].phanLoai = cb.checked ? "Chuyển đổi" : "Tin tức"; classifyRows[idx].conv = cb.checked;
      const cell = $(`#pcClassifyTable td[data-pl="${idx}"]`);
      if (cell) cell.innerHTML = `<span class="badge ${cb.checked ? "ok" : ""}">${classifyRows[idx].phanLoai}</span>`;
    }));
  }
  $("#pcFilter").addEventListener("input", renderClassify);
  $("#pcCatFilter").addEventListener("change", renderClassify);
  $("#pcClassFilter").addEventListener("change", renderClassify);

  /* ---------- BƯỚC 2: phân bậc theo từng chuyên mục ---------- */
  $("#pcTier").addEventListener("click", async () => {
    if (!classifyRows.length) return setMsg("#pcTierMsg", "err", "❌ Chưa có dữ liệu phân loại.");
    const engine = $("#engine").value, model = $("#model").value, apiKey = $("#apiKey").value.trim();
    if (engine !== "gemini" && engine !== "claude") return setMsg("#pcTierMsg", "err", "❌ Cần bật engine Gemini/Claude.");
    const byCat = {}; classifyRows.forEach((r) => { (byCat[r.category] = byCat[r.category] || []).push(r); });
    const cats = Object.keys(byCat);
    const btn = $("#pcTier"); busy(btn, true, "Đang phân bậc...");
    $("#pcResultCard").classList.add("hidden");
    resultRows = [];
    try {
      for (let i = 0; i < cats.length; i++) {
        const cat = cats[i]; const catRows = byCat[cat].slice(0, 200);
        setMsg("#pcTierMsg", "info", `<span class="spinner" style="border-top-color:transparent"></span>Đang phân bậc & dựng cây chuyên mục "${esc(cat)}" (${i + 1}/${cats.length})...`);
        const r = await _fetch("/api/internal/pillar/tier", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: catRows, category: cat, engine, model, apiKey }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Lỗi phân bậc");
        const tMap = {}; (d.items || []).forEach((it) => { tMap[normKw(it.keyword)] = it; });
        byCat[cat].forEach((row) => { const t = tMap[normKw(row.keyword)] || {}; resultRows.push({ ...row, tier: t.tier || (row.phanLoai === "Chuyển đổi" ? 2 : 4), vaiTro: t.vaiTro || "", nhomThuocTinh: t.nhomThuocTinh || "", tuKhoaCha: t.tuKhoaCha || "" }); });
      }
      $("#pcResCount").textContent = resultRows.length;
      populate("#pcResCatFilter", cats);
      const tierCount = {}; resultRows.forEach((r) => { tierCount[r.tier] = (tierCount[r.tier] || 0) + 1; });
      $("#pcTierChips").innerHTML = [1, 2, 3, 4, 5].filter((t) => tierCount[t]).map((t) => `<span class="chip">Bậc ${t} <b style="color:${TIER_COLOR[t]}">${tierCount[t]}</b></span>`).join("");
      renderResult();
      $("#pcResultCard").classList.remove("hidden");
      setMsg("#pcTierMsg", "info", `✓ Đã phân bậc ${resultRows.length} từ khóa trong ${cats.length} chuyên mục.`);
      $("#pcResultCard").scrollIntoView({ block: "start", behavior: "smooth" });
    } catch (err) { setMsg("#pcTierMsg", "err", "❌ " + err.message); }
    finally { busy(btn, false); }
  });

  function resultFiltered() {
    const q = ($("#pcResFilter").value || "").trim().toLowerCase();
    const cat = $("#pcResCatFilter").value, tier = $("#pcResTierFilter").value;
    let list = resultRows.filter((r) => (!q || r.keyword.toLowerCase().includes(q)) && (!cat || r.category === cat) && (!tier || String(r.tier) === tier));
    const s = $("#pcResSort").value;
    if (s === "cat") list = list.slice().sort((a, b) => a.category.localeCompare(b.category, "vi") || a.tier - b.tier);
    else if (s === "topic") list = list.slice().sort((a, b) => a.topic.localeCompare(b.topic, "vi"));
    else if (s === "az") list = list.slice().sort((a, b) => a.keyword.localeCompare(b.keyword, "vi"));
    else list = list.slice().sort((a, b) => a.category.localeCompare(b.category, "vi") || a.tier - b.tier || a.topic.localeCompare(b.topic, "vi"));
    return list;
  }
  function renderResult() {
    const list = resultFiltered();
    $("#pcResShown").textContent = `Hiển thị: ${list.length}`;
    const head = `<tr><th>#</th><th>Từ khóa</th>${isEng ? "<th>VI</th>" : ""}<th>Chuyên mục</th><th>Phân loại</th><th>Topic</th><th>Bậc</th><th>Vai trò</th><th>Nhóm thuộc tính</th><th>Từ khóa cha</th></tr>`;
    const body = list.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.keyword)}</td>${isEng ? `<td>${esc(r.vi || "")}</td>` : ""}<td>${esc(r.category)}</td><td><span class="badge ${r.phanLoai === "Chuyển đổi" ? "ok" : ""}">${esc(r.phanLoai)}</span></td><td>${esc(r.topic)}</td><td><b style="color:${TIER_COLOR[r.tier] || "var(--ink)"}">${r.tier}</b></td><td>${esc(r.vaiTro)}</td><td>${esc(r.nhomThuocTinh || "")}</td><td>${esc(r.tuKhoaCha || "")}</td></tr>`).join("");
    const sc = list.length > 20 ? ' style="max-height:640px;overflow:auto"' : ' style="overflow:auto"';
    $("#pcResultTable").innerHTML = `<div${sc}><table class="cmp"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }
  $("#pcResFilter").addEventListener("input", renderResult);
  $("#pcResCatFilter").addEventListener("change", renderResult);
  $("#pcResTierFilter").addEventListener("change", renderResult);
  $("#pcResSort").addEventListener("change", renderResult);

  function resultAoa() {
    const head = ["STT", "Từ khóa"].concat(isEng ? ["Bản dịch (VI)"] : []).concat(["URL", "Chuyên mục", "Phân loại", "Topic Content", "Bậc", "Vai trò bậc", "Nhóm thuộc tính", "Từ khóa cha", "Ghi chú"]);
    const rows = resultFiltered().map((r, i) => [i + 1, r.keyword].concat(isEng ? [r.vi || ""] : []).concat([r.url || "", r.category, r.phanLoai, r.topic, r.tier, r.vaiTro, r.nhomThuocTinh || "", r.tuKhoaCha || "", r.ghiChu || ""]));
    return [head].concat(rows);
  }
  $("#pcCopy").addEventListener("click", async () => {
    if (!resultRows.length) return toast("Chưa có dữ liệu.");
    const txt = resultAoa().map((r) => r.join("\t")).join("\n");
    try { await navigator.clipboard.writeText(txt); toast("Đã copy!"); } catch { toast("Không copy được."); }
  });
  $("#pcExport").addEventListener("click", () => {
    if (!resultRows.length) return toast("Chưa có dữ liệu.");
    if (typeof XLSX === "undefined") return toast("Thư viện Excel chưa tải xong.");
    const wb = XLSX.utils.book_new();
    // Sheet 1: bảng chính
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resultAoa()), "Phân loại");
    // Sheet 2: tổng hợp topic + bậc
    const topicMap = {}, tierMap = {};
    resultRows.forEach((r) => { topicMap[r.topic] = topicMap[r.topic] || { total: 0, cd: 0 }; topicMap[r.topic].total++; if (r.phanLoai === "Chuyển đổi") topicMap[r.topic].cd++; tierMap[r.tier] = (tierMap[r.tier] || 0) + 1; });
    const sum = [["TỔNG HỢP THEO TOPIC", "", ""], ["Topic Content", "Số bài", "Số Chuyển đổi"]]
      .concat(Object.entries(topicMap).sort((a, b) => b[1].total - a[1].total).map(([t, v]) => [t, v.total, v.cd]))
      .concat([["", "", ""], ["TỔNG HỢP THEO BẬC", "", ""], ["Bậc", "Số bài", ""]])
      .concat([1, 2, 3, 4, 5].filter((t) => tierMap[t]).map((t) => [`Bậc ${t}`, tierMap[t], ""]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), "Tổng hợp");
    // Sheet 3: pillar ngang (mỗi bậc 1 cột, cây thụt lề), theo chuyên mục
    const cats = [...new Set(resultRows.map((r) => r.category))];
    const aoa = [["Bậc 1 · Dịch vụ", "Bậc 2 · Chuyển đổi", "Bậc 3 · SEO", "Bậc 4 · Tin tức", "Bậc 5 · Bổ trợ"]];
    cats.forEach((cat) => {
      aoa.push([`▣ CHUYÊN MỤC: ${cat}`, "", "", "", ""]);
      const catRows = resultRows.filter((r) => r.category === cat);
      const roots = catRows.filter((r) => !r.tuKhoaCha);
      const childrenOf = (kw) => catRows.filter((r) => normKw(r.tuKhoaCha) === normKw(kw));
      const emit = (r, depth) => {
        const row = ["", "", "", "", ""];
        row[Math.min(4, Math.max(0, (r.tier || 4) - 1))] = (depth ? "— ".repeat(depth) : "") + r.keyword;
        aoa.push(row);
        childrenOf(r.keyword).forEach((c) => emit(c, depth + 1));
      };
      roots.sort((a, b) => a.tier - b.tier).forEach((r) => emit(r, 0));
      aoa.push(["", "", "", "", ""]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Pillar ngang");
    XLSX.writeFile(wb, "seoshark-pillar-content.xlsx");
  });
})();

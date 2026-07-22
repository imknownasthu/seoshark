// public/gbp.js — Tối ưu GBP (Google Business Profile). Dùng chung $/$$/esc/toast/alertHtml/busy/htmlToReadable từ app.js.
(function () {
  const sec = document.querySelector('.section[data-section="gbp"]');
  if (!sec) return;
  let lastByKind = {};      // chống trùng: nội dung lần trước theo từng loại
  let imgData = null;       // {mimeType, data} base64 cho Vision
  let gbpMapCoords = "";

  // ---- Sub-tabs ----
  $$("#gbpTabs .tab").forEach((t) => t.addEventListener("click", () => {
    $$("#gbpTabs .tab").forEach((x) => x.classList.toggle("active", x === t));
    $$(".gbppane").forEach((p) => p.classList.toggle("active", p.dataset.gbppane === t.dataset.gbp));
    $("#gbpResult").innerHTML = ""; $("#gbpMsg").innerHTML = "";
  }));

  // ---- Tài liệu kiến thức (KHO CHUNG KB — đồng bộ với Outline/Onpage) ----
  window.KB.registerSelect($("#gbpKnowSelect"));
  async function loadKnow() { await window.KB.load(); }
  let knowLoaded = false;
  function maybeLoadKnow() { if (location.hash.replace(/^#/, "") === "gbp" && !knowLoaded) { knowLoaded = true; loadKnow(); } }
  window.addEventListener("hashchange", maybeLoadKnow);
  maybeLoadKnow();
  $("#gbpKnowReload").addEventListener("click", () => { loadKnow(); toast("Đã nạp lại kiến thức."); });

  // ---- Đọc link map ----
  $("#gbpMapRead").addEventListener("click", async () => {
    const url = $("#gbpMapUrl").value.trim(); const msg = $("#gbpMapMsg");
    if (!/^https?:\/\//i.test(url)) { msg.innerHTML = `<span style="color:#c0392b">Nhập link Google Maps hợp lệ.</span>`; return; }
    const btn = $("#gbpMapRead"); busy(btn, true, "Đang đọc...");
    try {
      const r = await fetch("/api/gbp/maps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Lỗi");
      const i = d.info || {};
      $("#gbpMname").value = i.name || ""; $("#gbpAddr").value = i.address || ""; $("#gbpArea").value = i.area || ""; $("#gbpCat").value = i.category || "";
      gbpMapCoords = i.coords || "";
      $("#gbpMapInfo").classList.remove("hidden");
      msg.innerHTML = `<span style="color:var(--green,#2e9e6b)">✓ Đã đọc${i.coords ? ` (toạ độ ${esc(i.coords)})` : ""}. Bổ sung địa chỉ/danh mục nếu còn thiếu.</span>`;
    } catch (e) { msg.innerHTML = `<span style="color:#c0392b">❌ ${esc(e.message)}</span>`; }
    finally { busy(btn, false); }
  });

  // ---- Ảnh -> thu nhỏ -> base64 ----
  $("#gbpImgFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return; const msg = $("#gbpImgMsg"); msg.textContent = "Đang xử lý ảnh...";
    try {
      const url = URL.createObjectURL(f);
      const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
      const max = 1024; let w = img.naturalWidth, h = img.naturalHeight;
      if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
      const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h);
      const durl = c.toDataURL("image/jpeg", 0.85);
      imgData = { mimeType: "image/jpeg", data: durl.split(",")[1] };
      $("#gbpImgPrev").src = durl; $("#gbpImgPrev").classList.remove("hidden");
      msg.textContent = `✓ Đã tải ảnh: ${f.name}`;
    } catch (err) { msg.textContent = "Lỗi ảnh: " + (err.message || err); imgData = null; }
  });

  function ctxPayload() {
    const mapInfo = { name: $("#gbpMname").value.trim(), address: $("#gbpAddr").value.trim(), area: $("#gbpArea").value.trim(), category: $("#gbpCat").value.trim(), coords: gbpMapCoords };
    const hasMap = mapInfo.name || mapInfo.address || mapInfo.area || mapInfo.category;
    const k = window.KB.get($("#gbpKnowSelect").value);
    return {
      brand: $("#gbpBrand").value.trim(), branch: $("#gbpBranch").value.trim(),
      mapInfo: hasMap ? mapInfo : null,
      knowledge: k ? htmlToReadable(k.content || "") : "",
      engine: $("#engine").value, apiKey: $("#apiKey").value.trim() || undefined, model: $("#model").value || undefined,
    };
  }

  // ---- Tạo nội dung (delegate cho mọi nút [data-gbpgen]) ----
  sec.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-gbpgen]"); if (!btn) return;
    const kind = btn.dataset.gbpgen; const msg = $("#gbpMsg"); msg.innerHTML = "";
    const engine = $("#engine").value;
    if (engine !== "gemini" && engine !== "claude") { msg.innerHTML = alertHtml("err", "Cần bật engine Gemini/Claude ở ⚙️."); return; }
    if (!$("#gbpBrand").value.trim() && kind !== "review") { msg.innerHTML = alertHtml("err", "Nhập Thương hiệu ở mục 1 trước."); return; }

    const payload = { kind, ...ctxPayload(), avoid: lastByKind[kind] || "" };
    if (kind === "name") { const n = $("#gbpDesiredName").value.trim(); if (!n) { msg.innerHTML = alertHtml("err", "Nhập tên doanh nghiệp mong muốn."); return; } payload.desiredName = n; }
    if (kind === "post") { const kw = $("#gbpPostKw").value.trim(); if (!kw) { msg.innerHTML = alertHtml("err", "Nhập từ khóa/chủ đề."); return; } payload.keyword = kw; payload.postType = $("#gbpPostType").value; payload.url = $("#gbpPostUrl").value.trim(); }
    if (kind === "service") { const kw = $("#gbpSvcKw").value.trim(); if (!kw) { msg.innerHTML = alertHtml("err", "Nhập dịch vụ/từ khóa."); return; } payload.keyword = kw; payload.url = $("#gbpSvcUrl").value.trim(); }
    if (kind === "image") { payload.context = $("#gbpImgCtx").value.trim(); payload.keyword = $("#gbpImgKw").value.trim(); if (imgData && engine === "gemini") payload.image = imgData; if (!payload.context && !payload.image) { msg.innerHTML = alertHtml("err", "Nhập ngữ cảnh hoặc tải ảnh lên."); return; } }
    if (kind === "review") { const rv = $("#gbpRevText").value.trim(); if (!rv) { msg.innerHTML = alertHtml("err", "Dán nội dung đánh giá của khách."); return; } payload.review = rv; payload.reviewer = $("#gbpRevName").value.trim(); payload.rating = $("#gbpRevRating").value || undefined; }

    busy(btn, true, "AI đang viết...");
    try {
      const r = await fetch("/api/gbp/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Lỗi");
      renderGbp(kind, d);
    } catch (err) { msg.innerHTML = alertHtml("err", "❌ " + err.message); }
    finally { busy(btn, false); }
  });

  function counter(n, min, max) {
    let cls = "ok", note = `${n} ký tự`;
    if (max && n > max) { cls = "sapo"; note = `${n}/${max} — VƯỢT giới hạn`; }
    else if (min && n < min) { cls = "ket"; note = `${n} ký tự (dưới ${min}, nên bổ sung)`; }
    else if (max) { note = `${n}/${max} ký tự ✓`; }
    return `<span class="badge ${cls}" style="font-size:.7rem">${note}</span>`;
  }
  function copyBtn(text) {
    const id = "gc" + Math.random().toString(36).slice(2);
    setTimeout(() => { const b = document.getElementById(id); if (b) b.addEventListener("click", () => navigator.clipboard.writeText(text).then(() => toast("Đã copy!"))); }, 0);
    return `<button class="ghost small" id="${id}" type="button">Copy</button>`;
  }
  function block(title, text, meta) {
    return `<div class="gbp-out"><div class="flexbar"><b>${esc(title)}</b><span style="display:flex;gap:8px;align-items:center">${meta || ""}${copyBtn(text)}</span></div><div class="gbp-text">${esc(text)}</div></div>`;
  }

  function renderGbp(kind, d) {
    lastByKind[kind] = d.text || d.content || d.reply || "";
    const wrap = $("#gbpResult"); let html = "";
    const eu = d.engineUsed ? `<div class="muted" style="font-size:.78rem;text-align:right;margin-top:6px">${esc(d.engineUsed)}</div>` : "";
    const cc = (s) => [...String(s || "")].length;
    if (kind === "name") {
      if (d.warning) html += alertHtml("warn", "⚠ " + esc(d.warning));
      html += block("Tên khuyến nghị", d.recommended || "", d.compliant ? '<span class="badge ok" style="font-size:.7rem">Hợp lệ GBP</span>' : "");
      if (d.suggestions && d.suggestions.length) html += `<div class="gbp-out"><b>Gợi ý biến thể hợp lệ</b><ul style="margin:8px 0 0;padding-left:18px;line-height:1.7">${d.suggestions.map((s) => `<li><b>${esc(s.name)}</b> <span class="muted">— ${esc(s.why)}</span></li>`).join("")}</ul></div>`;
    } else if (kind === "business") {
      html += block("Mô tả doanh nghiệp", d.text || "", counter(d.meta ? d.meta.chars : cc(d.text), 600, 750));
    } else if (kind === "post") {
      if (d.title) html += block("Tiêu đề", d.title);
      html += block("Nội dung bài đăng", d.content || "", counter(d.meta ? d.meta.chars : cc(d.content), 0, 1500));
      if (d.cta) html += `<div class="muted" style="margin-top:6px;font-size:.85rem">💡 Nút CTA đề xuất: <b>${esc(d.cta)}</b></div>`;
      if (d.note) html += alertHtml("info", esc(d.note));
    } else if (kind === "service") {
      html += block("Mô tả dịch vụ", d.text || "", counter(d.meta ? d.meta.chars : cc(d.text), 0, 300));
    } else if (kind === "image") {
      html += block("Caption", d.caption || "");
      if (d.altText) html += block("Alt text", d.altText);
      if (d.fileName) html += block("Tên file SEO", d.fileName);
    } else if (kind === "review") {
      const sm = { positive: ["Tích cực", "ok"], negative: ["Tiêu cực", "sapo"], neutral: ["Trung lập", "ket"], mixed: ["Vừa khen vừa chê", "ket"] }[d.sentiment] || ["", "ket"];
      html += `<div style="margin-bottom:8px"><span class="badge ${sm[1]}">${sm[0]}</span></div>`;
      html += block("Phản hồi đề xuất", d.reply || "");
      if (d.tips) html += `<div class="muted" style="margin-top:6px;font-size:.85rem">💡 ${esc(d.tips)}</div>`;
    }
    wrap.innerHTML = html + eu;
    wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
})();

/* Schema Markup (JSON-LD) — dùng chung helper toàn cục từ app.js ($, esc, _fetch, toast, busy, alertHtml) */
(function () {
  const gen = $("#scGenerate");
  if (!gen) return;
  const smsg = (el, type, m) => { const e = $(el); if (e) e.innerHTML = m ? alertHtml(type, m) : ""; };
  let scTypesLoaded = false, scSelected = new Set(), scData = null;

  async function loadScTypes() {
    if (scTypesLoaded) return; scTypesLoaded = true;
    try {
      const r = await _fetch("/api/schema/types"); const d = await r.json();
      const box = $("#scTypeBtns");
      box.innerHTML = (d.types || []).map((t) =>
        `<button type="button" class="ghost small sc-type" data-key="${esc(t.key)}" title="${t.mechanical ? "Tạo được cả khi không có AI" : "Cần AI đọc nội dung"}">${esc(t.label)}${t.mechanical ? "" : " ✦"}</button>`
      ).join("");
      box.querySelectorAll(".sc-type").forEach((b) => b.addEventListener("click", () => {
        const k = b.dataset.key;
        if (scSelected.has(k)) { scSelected.delete(k); b.style.background = ""; b.style.color = ""; b.style.borderColor = ""; }
        else { scSelected.add(k); b.style.background = "var(--brand-light)"; b.style.color = "var(--brand-dark)"; b.style.borderColor = "var(--c-blue)"; }
      }));
    } catch (e) { /* ignore */ }
  }
  $$('#menu .menu-item').forEach((mi) => mi.addEventListener("click", () => { if (mi.dataset.section === "schema") loadScTypes(); }));
  loadScTypes();

  /* ---- Trình sửa JSON đệ quy (sửa từng vị trí) ---- */
  const scGet = (root, p) => { let o = root; for (const k of p) { if (o == null) return undefined; o = o[k]; } return o; };
  const scSet = (root, p, v) => { let o = root; for (let i = 0; i < p.length - 1; i++) o = o[p[i]]; o[p[p.length - 1]] = v; };
  const scDel = (root, p) => { let o = root; for (let i = 0; i < p.length - 1; i++) o = o[p[i]]; const last = p[p.length - 1]; if (Array.isArray(o)) o.splice(last, 1); else delete o[last]; };
  function scFields(val, path) {
    const pj = esc(JSON.stringify(path));
    if (Array.isArray(val)) {
      const items = val.map((v, i) => `<div style="border-left:2px solid var(--line);padding-left:8px;margin:5px 0">`
        + `<div style="display:flex;justify-content:space-between;align-items:center"><span class="muted" style="font-size:.72rem">[${i}]</span>`
        + `<button type="button" class="ghost small sc-del" data-p='${esc(JSON.stringify(path.concat(i)))}' style="padding:1px 7px">Xóa</button></div>`
        + scFields(v, path.concat(i)) + `</div>`).join("");
      return `<div>${items}<button type="button" class="ghost small sc-add" data-p='${pj}' style="margin-top:4px">+ Thêm mục</button></div>`;
    }
    if (val && typeof val === "object") {
      const rows = Object.keys(val).map((k) => {
        const cp = path.concat(k);
        const del = k === "@type" ? "" : `<a class="sc-delk" data-p='${esc(JSON.stringify(cp))}' style="cursor:pointer;color:#c0392b;font-size:.7rem;margin-left:6px">✕</a>`;
        return `<label style="display:block;font-size:11px;color:var(--muted);margin-top:7px;text-transform:none">${esc(k)}${del}</label>${scFields(val[k], cp)}`;
      }).join("");
      return `<div style="padding-left:6px">${rows}<div style="margin-top:5px"><button type="button" class="ghost small sc-addk" data-p='${pj}' style="padding:1px 7px">+ Thêm trường</button></div></div>`;
    }
    const v = val == null ? "" : String(val);
    return v.length > 55
      ? `<textarea class="sc-inp" data-p='${pj}' rows="2" style="width:100%;font-size:12px">${esc(v)}</textarea>`
      : `<input class="sc-inp" data-p='${pj}' value="${esc(v)}" style="width:100%;font-size:12px" />`;
  }
  function scRenderEditor() {
    const graph = (scData && scData["@graph"]) || [];
    $("#scEditor").innerHTML = graph.map((n, i) => {
      const ty = n["@type"] || "?";
      return `<div class="src-card" style="margin-bottom:10px"><div class="src-head"><div class="stitle">${esc(Array.isArray(ty) ? ty.join("/") : ty)} <span class="muted" style="font-size:.7rem">#${i + 1}</span></div></div><div class="src-body">${scFields(n, ["@graph", i])}</div></div>`;
    }).join("");
  }
  function scSyncCode() { $("#scCode").textContent = JSON.stringify(scData, null, 2); }
  async function scValidate() {
    try {
      const r = await _fetch("/api/schema/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nodes: (scData && scData["@graph"]) || [] }) });
      renderScValidation(await r.json());
    } catch (e) { /* ignore */ }
  }
  function renderScValidation(v) {
    if (!v || v.errorCount == null) { $("#scValidation").innerHTML = ""; return; }
    let h = v.valid ? alertHtml("info", `✓ Hợp lệ — 0 lỗi${v.warningCount ? `, ${v.warningCount} khuyến nghị` : ""}. Sẵn sàng copy vào website.`) : alertHtml("err", `❌ ${v.errorCount} lỗi cần sửa${v.warningCount ? `, ${v.warningCount} khuyến nghị` : ""}.`);
    const lines = [];
    (v.nodes || []).forEach((n) => { (n.errors || []).forEach((e) => lines.push(`<li style="color:#c0392b">${esc(n.type)}: ${esc(e)}</li>`)); (n.warnings || []).forEach((w) => lines.push(`<li class="muted">${esc(n.type)}: ${esc(w)}</li>`)); });
    if (lines.length) h += `<details style="margin-top:4px"><summary style="cursor:pointer;font-size:.85rem;color:var(--brand-dark)">Chi tiết ${lines.length} mục</summary><ul style="margin:6px 0 0 18px">${lines.join("")}</ul></details>`;
    $("#scValidation").innerHTML = h;
  }
  let scValT = null;
  $("#scEditor").addEventListener("input", (e) => {
    const inp = e.target.closest(".sc-inp"); if (!inp) return;
    try { scSet(scData, JSON.parse(inp.dataset.p), inp.value); } catch (x) { /* ignore */ }
    scSyncCode(); clearTimeout(scValT); scValT = setTimeout(scValidate, 700);
  });
  $("#scEditor").addEventListener("click", (e) => {
    const t = e.target;
    const doRe = () => { scRenderEditor(); scSyncCode(); scValidate(); };
    if (t.closest(".sc-del")) { scDel(scData, JSON.parse(t.closest(".sc-del").dataset.p)); doRe(); }
    else if (t.closest(".sc-delk")) { scDel(scData, JSON.parse(t.closest(".sc-delk").dataset.p)); doRe(); }
    else if (t.closest(".sc-add")) { const p = JSON.parse(t.closest(".sc-add").dataset.p); const arr = scGet(scData, p); arr.push(typeof arr[0] === "object" && arr[0] ? JSON.parse(JSON.stringify(arr[0])) : ""); doRe(); }
    else if (t.closest(".sc-addk")) { const p = JSON.parse(t.closest(".sc-addk").dataset.p); const key = prompt("Tên trường mới (VD: description, sameAs):"); if (key) { const o = scGet(scData, p); if (!(key in o)) { o[key] = ""; doRe(); } } }
  });

  /* ---- Tạo schema ---- */
  gen.addEventListener("click", async () => {
    const url = $("#scUrl").value.trim();
    if (!/^https?:\/\//i.test(url)) return smsg("#scMsg", "err", "❌ Nhập URL bài viết hợp lệ (http/https).");
    const autoDetect = $("#scAuto").checked;
    if (!autoDetect && !scSelected.size) return smsg("#scMsg", "err", "❌ Chọn ít nhất 1 loại schema, hoặc bật 'AI tự nhận diện'.");
    const engine = $("#engine").value, model = $("#model").value, apiKey = $("#apiKey").value.trim();
    busy(gen, true, "Đang đọc bài & tạo schema...");
    smsg("#scMsg", "info", '<span class="spinner" style="border-top-color:transparent"></span>Đang đọc nội dung URL & tạo JSON-LD...');
    try {
      const r = await _fetch("/api/schema/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, types: [...scSelected], autoDetect, engine, model, apiKey }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Lỗi tạo schema");
      scData = d.jsonld;
      scRenderEditor(); scSyncCode(); renderScValidation(d.validation);
      $("#scResMeta").textContent = `${(d.nodes || []).length} loại · ${d.aiUsed ? "AI tạo" : "tạo cơ học"}`;
      $("#scTest").href = "https://search.google.com/test/rich-results?url=" + encodeURIComponent(url);
      $("#scResultCard").classList.remove("hidden"); $("#scCompCard").classList.remove("hidden");
      smsg("#scMsg", d.aiError && !d.aiUsed ? "warn" : "info", (d.aiError ? "⚠️ " + esc(d.aiError) : "✓ Đã tạo schema.") + " Sửa từng trường bên dưới, code cập nhật realtime.");
      $("#scResultCard").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) { smsg("#scMsg", "err", "❌ " + e.message); }
    finally { busy(gen, false); }
  });
  $("#scRevalidate").addEventListener("click", scValidate);
  $("#scCopy").addEventListener("click", () => {
    const code = '<script type="application/ld+json">\n' + JSON.stringify(scData) + '\n<' + '/script>';
    navigator.clipboard.writeText(code).then(() => toast("Đã copy (kèm thẻ script)!")).catch(() => toast("Không copy được."));
  });

  /* ---- So sánh đối thủ + gap + tối ưu tiêu chí đã tick ---- */
  let scCompetitors = [], scGapCriteria = [];
  $("#scCompRun").addEventListener("click", async () => {
    const urls = String($("#scCompUrls").value || "").split(/\n/).map((s) => s.trim()).filter(Boolean).slice(0, 6);
    if (!urls.length) return smsg("#scCompMsg", "err", "❌ Dán ít nhất 1 URL đối thủ.");
    const engine = $("#engine").value, model = $("#model").value, apiKey = $("#apiKey").value.trim();
    const btn = $("#scCompRun"); busy(btn, true, "Đang đọc schema đối thủ...");
    smsg("#scCompMsg", "info", '<span class="spinner" style="border-top-color:transparent"></span>Đang đọc schema trong source của đối thủ...');
    $("#scGapResult").innerHTML = "";
    try {
      const r = await _fetch("/api/schema/competitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Lỗi đọc đối thủ");
      scCompetitors = d.competitors || [];
      $("#scCompResult").innerHTML = scCompetitors.map((c) => `<div class="opd" style="margin-bottom:6px"><b>${esc(c.host)}</b>${c.error ? ` <span style="color:#c0392b">— ${esc(c.error)}</span>` : ""}<div class="muted" style="font-size:.85rem;margin-top:2px">Schema: ${(c.types || []).join(", ") || "(không có)"}</div></div>`).join("");
      if (engine !== "gemini" && engine !== "claude") { smsg("#scCompMsg", "warn", "Đã đọc schema đối thủ. Bật Gemini/Claude ở ⚙️ để AI so sánh gap & đề xuất tiêu chí."); return; }
      smsg("#scCompMsg", "info", '<span class="spinner" style="border-top-color:transparent"></span>AI đang so sánh schema gap...');
      const graph = (scData && scData["@graph"]) || [];
      const mine = { types: graph.map((n) => (Array.isArray(n["@type"]) ? n["@type"][0] : n["@type"])), nodes: graph.map((n) => ({ type: Array.isArray(n["@type"]) ? n["@type"][0] : n["@type"], props: Object.keys(n).filter((k) => k !== "@type") })) };
      const rg = await _fetch("/api/schema/gap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: $("#scUrl").value.trim(), mine, competitors: scCompetitors, engine, model, apiKey }) });
      const dg = await rg.json();
      if (!rg.ok) throw new Error(dg.error || "Lỗi so sánh gap");
      scGapCriteria = dg.criteria || [];
      renderScGap(dg);
      smsg("#scCompMsg", "info", "✓ Đã so sánh. Tick tiêu chí muốn cải thiện rồi bấm 'Tối ưu tiêu chí đã tick'.");
    } catch (e) { smsg("#scCompMsg", "err", "❌ " + e.message); }
    finally { busy(btn, false); }
  });
  function renderScGap(dg) {
    const pill = (p) => `<span class="badge ${p === "Cao" ? "sapo" : (p === "Thấp") ? "ket" : "ok"}">${esc(p || "TB")}</span>`;
    let h = dg.summary ? alertHtml("info", esc(dg.summary)) : "";
    h += `<h3 style="margin:10px 0 6px">Tiêu chí cải thiện (tick để tối ưu)</h3>`;
    h += (scGapCriteria || []).map((c, i) => `<label class="opd" style="display:block;margin-bottom:6px;cursor:pointer"><input type="checkbox" class="sc-crit" data-i="${i}" style="width:15px;height:15px;accent-color:var(--c-blue);vertical-align:middle"> ${pill(c.priority)} <b>${esc(c.title)}</b>${c.detail ? `<div class="muted" style="margin-top:2px">${esc(c.detail)}</div>` : ""}</label>`).join("");
    h += `<div style="margin-top:10px"><button id="scOptimize" type="button">Tối ưu tiêu chí đã tick</button><span class="muted" id="scOptMsg" style="margin-left:10px;font-size:.85rem"></span></div>`;
    $("#scGapResult").innerHTML = h;
    $("#scOptimize").addEventListener("click", scOptimize);
  }
  async function scOptimize() {
    const picked = $$("#scGapResult .sc-crit:checked").map((c) => scGapCriteria[+c.dataset.i]).filter(Boolean);
    if (!picked.length) { $("#scOptMsg").textContent = "Chưa tick tiêu chí nào."; return; }
    const engine = $("#engine").value, model = $("#model").value, apiKey = $("#apiKey").value.trim();
    const btn = $("#scOptimize"); busy(btn, true, "AI đang tối ưu...");
    $("#scOptMsg").textContent = "";
    try {
      const r = await _fetch("/api/schema/optimize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: $("#scUrl").value.trim(), current: scData, criteria: picked, engine, model, apiKey }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Lỗi tối ưu");
      scData = d.jsonld;
      scRenderEditor(); scSyncCode(); renderScValidation(d.validation);
      $("#scResMeta").textContent = `${(d.nodes || []).length} loại · đã tối ưu ${picked.length} tiêu chí`;
      $("#scOptMsg").innerHTML = `<span style="color:var(--green,#2e9e6b)">✓ Đã tối ưu — xem kết quả ở khung trên.</span>`;
      $("#scResultCard").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) { $("#scOptMsg").innerHTML = `<span style="color:#c0392b">❌ ${esc(e.message)}</span>`; }
    finally { busy(btn, false); }
  }
})();

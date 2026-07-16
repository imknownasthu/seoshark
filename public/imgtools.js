// public/imgtools.js — Bộ công cụ ảnh (client-side, miễn phí, offline)
// Dùng chung $/$$/esc/toast từ app.js. Thư viện: window.JSZip, window.piexif.
(function () {
  const modal = document.getElementById("imgtoolModal");
  const bodyEl = document.getElementById("imgtoolBody");
  const titleEl = document.getElementById("imgtoolTitle");
  if (!modal) return;

  let files = [];     // {id,file,name,base,ext,mime,url,img,w,h}
  let logoImg = null; // ảnh logo cho công cụ Chèn logo
  let current = null;

  // ---------- helpers ----------
  const EXT_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", bmp: "image/bmp" };
  const extOf = (n) => { const m = /\.([a-z0-9]+)$/i.exec(n || ""); return m ? m[1].toLowerCase() : "png"; };
  const baseOf = (n) => String(n || "image").replace(/\.[^.]+$/, "");
  const loadImage = (url) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
  function slugify(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "image"; }
  // Trường EXIF kiểu ASCII chỉ nhận ký tự Latin1 in được (piexif dùng btoa -> ký tự >255 là lỗi).
  // Bỏ dấu tiếng Việt + quy đổi dấu câu Unicode (— · “ ” …) rồi loại sạch ký tự ngoài ASCII.
  function asciiFold(s) {
    return String(s || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d").replace(/Đ/g, "D")
      .replace(/[—–−]/g, "-").replace(/[·•]/g, "-").replace(/[“”„]/g, '"').replace(/[‘’‚]/g, "'").replace(/…/g, "...")
      .replace(/©/g, "(c)").replace(/®/g, "(R)").replace(/™/g, "(TM)").replace(/°/g, " do")
      .replace(/\s+/g, " ")
      .replace(/[^\x20-\x7E]/g, "").trim();
  }
  function drawCanvas(img, w, h) { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return c; }
  const toBlob = (canvas, mime, q) => new Promise((res) => canvas.toBlob((b) => res(b), mime, q));
  function download(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  function dataURLtoBlob(u) { const [h, b] = u.split(","); const mime = (/:(.*?);/.exec(h) || [])[1] || "image/jpeg"; const bin = atob(b); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], { type: mime }); }
  const fileToDataUrl = (file) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });

  async function addFiles(list) {
    for (const f of Array.from(list || [])) {
      if (!/^image\//.test(f.type) && !EXT_MIME[extOf(f.name)]) continue;
      const url = URL.createObjectURL(f);
      let img; try { img = await loadImage(url); } catch { continue; }
      files.push({ id: Math.random().toString(36).slice(2), file: f, name: f.name, base: baseOf(f.name), ext: extOf(f.name), mime: f.type || EXT_MIME[extOf(f.name)], url, img, w: img.naturalWidth, h: img.naturalHeight });
    }
    renderThumbs();
  }
  function renderThumbs() {
    const w = document.getElementById("itThumbs"); if (!w) return;
    w.innerHTML = files.map((f) => `<div class="it-thumb"><img src="${f.url}"><span class="it-nm">${esc(f.name)} · ${f.w}×${f.h}</span><button class="it-del" data-id="${f.id}" type="button">✕</button></div>`).join("");
    w.querySelectorAll(".it-del").forEach((b) => b.addEventListener("click", () => { files = files.filter((x) => x.id !== b.dataset.id); renderThumbs(); }));
  }

  // ================= CÁC CÔNG CỤ =================
  const opts = () => document.getElementById("itOpts");
  const val = (id) => { const e = document.getElementById(id); return e ? e.value : ""; };

  // --- Đổi kích thước ---
  function resizeOpts(el) {
    el.innerHTML = `<div class="it-row"><div><label>Chiều rộng (px)</label><input id="itW" type="number" min="1" placeholder="tự động theo tỉ lệ"></div><div><label>Chiều cao (px)</label><input id="itH" type="number" min="1" placeholder="tự động theo tỉ lệ"></div></div>
      <label style="display:flex;gap:7px;align-items:center;font-weight:600"><input type="checkbox" id="itKeep" checked style="width:16px;height:16px;accent-color:var(--brand)"> Giữ tỉ lệ khung hình</label>`;
  }
  async function resizeProc(it) {
    const wIn = parseInt(val("itW")) || 0, hIn = parseInt(val("itH")) || 0, keep = document.getElementById("itKeep").checked;
    let w = it.w, h = it.h;
    if (wIn && hIn) { if (keep) { const r = Math.min(wIn / it.w, hIn / it.h); w = it.w * r; h = it.h * r; } else { w = wIn; h = hIn; } }
    else if (wIn) { w = wIn; h = keep ? it.h * (wIn / it.w) : it.h; }
    else if (hIn) { h = hIn; w = keep ? it.w * (hIn / it.h) : it.w; }
    const mime = ["image/jpeg", "image/webp", "image/png"].includes(it.mime) ? it.mime : "image/png";
    const blob = await toBlob(drawCanvas(it.img, w, h), mime, 0.92);
    const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
    return { name: `${it.base}-${Math.round(w)}x${Math.round(h)}.${ext}`, blob };
  }

  // --- Đổi định dạng ---
  function formatOpts(el) {
    el.innerHTML = `<div class="it-row"><div><label>Định dạng đích</label><select id="itFmt"><option value="image/jpeg">JPEG (.jpg)</option><option value="image/png">PNG (.png)</option><option value="image/webp">WEBP (.webp)</option></select></div>
      <div id="itQWrap"><label>Chất lượng (<span id="itQV">92</span>%)</label><input id="itQ" type="range" min="40" max="100" value="92"></div></div>
      <p class="it-note">PNG dùng nén không mất dữ liệu (bỏ qua mức chất lượng).</p>`;
    el.querySelector("#itQ").addEventListener("input", (e) => el.querySelector("#itQV").textContent = e.target.value);
    el.querySelector("#itFmt").addEventListener("change", (e) => el.querySelector("#itQWrap").style.display = e.target.value === "image/png" ? "none" : "");
  }
  async function formatProc(it) {
    const mime = val("itFmt"); const q = (parseInt(val("itQ")) || 92) / 100;
    const blob = await toBlob(drawCanvas(it.img, it.w, it.h), mime, q);
    const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
    return { name: `${it.base}.${ext}`, blob };
  }

  // --- Chèn logo ---
  function logoOpts(el) {
    el.innerHTML = `<div class="it-row" style="align-items:center">
        <div style="flex:0 0 auto"><label>Logo (nên dùng PNG nền trong suốt)</label><br>
          <label class="ghost small" style="cursor:pointer;display:inline-flex;gap:6px;margin:0">Chọn logo<input id="itLogoFile" type="file" accept="image/*" style="display:none"></label></div>
        <div id="itLogoPrev" class="it-note">Chưa chọn logo</div>
      </div>
      <div class="it-row">
        <div style="flex:0 0 auto"><label>Vị trí</label><div class="it-grid9" id="itPos"></div></div>
        <div>
          <label>Kích thước logo (<span id="itLsV">22</span>% chiều rộng ảnh)</label><input id="itLs" type="range" min="5" max="60" value="22">
          <label style="margin-top:8px">Độ mờ (<span id="itLoV">100</span>%)</label><input id="itLo" type="range" min="20" max="100" value="100">
          <label style="margin-top:8px">Lề (<span id="itLmV">3</span>%)</label><input id="itLm" type="range" min="0" max="15" value="3">
        </div>
      </div>`;
    const positions = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];
    const grid = el.querySelector("#itPos");
    grid.innerHTML = positions.map((p) => `<button type="button" data-pos="${p}"></button>`).join("");
    let sel = "br";
    const setSel = (p) => { sel = p; grid.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.pos === p)); };
    grid.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => setSel(b.dataset.pos)));
    setSel("br");
    el._getPos = () => sel;
    ["itLs:itLsV", "itLo:itLoV", "itLm:itLmV"].forEach((pair) => { const [a, b] = pair.split(":"); el.querySelector("#" + a).addEventListener("input", (e) => el.querySelector("#" + b).textContent = e.target.value); });
    el.querySelector("#itLogoFile").addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const url = URL.createObjectURL(f);
      try { logoImg = await loadImage(url); el.querySelector("#itLogoPrev").innerHTML = `<img src="${url}" style="height:34px;border-radius:6px;vertical-align:middle"> ${esc(f.name)}`; }
      catch { el.querySelector("#itLogoPrev").textContent = "Lỗi đọc logo"; }
    });
  }
  async function logoProc(it) {
    if (!logoImg) throw new Error("Chưa chọn logo");
    const el = opts(); const pos = el._getPos ? el._getPos() : "br";
    const sizePct = (parseInt(val("itLs")) || 22) / 100, opacity = (parseInt(val("itLo")) || 100) / 100, marginPct = (parseInt(val("itLm")) || 3) / 100;
    const c = drawCanvas(it.img, it.w, it.h); const ctx = c.getContext("2d");
    const lw = c.width * sizePct, lh = lw * (logoImg.naturalHeight / logoImg.naturalWidth), mg = c.width * marginPct;
    const x = pos.endsWith("l") ? mg : pos.endsWith("c") ? (c.width - lw) / 2 : c.width - lw - mg;
    const y = pos.startsWith("t") ? mg : pos.startsWith("m") ? (c.height - lh) / 2 : c.height - lh - mg;
    ctx.globalAlpha = opacity; ctx.drawImage(logoImg, x, y, lw, lh); ctx.globalAlpha = 1;
    const mime = ["image/jpeg", "image/webp"].includes(it.mime) ? it.mime : "image/png";
    const blob = await toBlob(c, mime, 0.95);
    const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
    return { name: `${it.base}-logo.${ext}`, blob };
  }

  // --- Đổi tên hàng loạt ---
  function renameOpts(el) {
    el.innerHTML = `<div class="it-row"><div><label>Tên chuẩn SEO (dạng abc-xyz-rty)</label><input id="itBase" type="text" placeholder="nieng-rang-trong-suot"></div>
      <div style="flex:0 0 120px"><label>Bắt đầu từ số</label><input id="itStart" type="number" min="0" value="1"></div></div>
      <p class="it-note">Xuất: <b>ten-1.ext, ten-2.ext…</b> giữ nguyên định dạng &amp; chất lượng gốc. Nếu chỉ 1 ảnh sẽ không thêm số.</p>`;
  }
  async function renameProc(it, i, total) {
    const base = slugify(val("itBase")); const s = parseInt(val("itStart")); const start = isNaN(s) ? 1 : s;
    const name = total > 1 ? `${base}-${start + i}.${it.ext}` : `${base}.${it.ext}`;
    return { name, blob: it.file };
  }

  // --- Thêm Geotag (EXIF GPS) ---
  function geotagOpts(el) {
    el.innerHTML = `
      <div class="it-sec">Vị trí (GPS)</div>
      <div class="it-row"><div><label>Vĩ độ (Latitude) *</label><input id="itLat" type="text" placeholder="21.028511"></div>
        <div><label>Kinh độ (Longitude) *</label><input id="itLng" type="text" placeholder="105.804817"></div>
        <div style="flex:0 0 120px"><label>Độ cao (m)</label><input id="itAlt" type="number" placeholder="0"></div></div>
      <p class="it-note">Lấy toạ độ trên Google Maps: bấm chuột phải vào vị trí → toạ độ ở đầu menu. <b>Nên trùng khớp địa chỉ Google Maps của doanh nghiệp.</b></p>

      <div class="it-sec">Thông tin ảnh <span class="it-note" style="font-weight:400">— đúng thuộc tính Windows / EXIF</span></div>
      <div class="it-row"><div><label>Tiêu đề <span class="it-tag">Title</span></label><input id="itTitle" type="text" placeholder="Niềng răng trong suốt tại Nha khoa Shark"></div>
        <div><label>Chủ đề <span class="it-tag">Subject</span></label><input id="itSubject" type="text" placeholder="Niềng răng trong suốt"></div></div>
      <div class="it-row"><div><label>Thẻ / Từ khóa <span class="it-tag">Tags</span></label><input id="itTags" type="text" placeholder="niềng răng, invisalign, hà nội"></div></div>
      <div class="it-row"><div><label>Mô tả <span class="it-tag">Image Description</span></label><input id="itDesc" type="text" placeholder="Ảnh chụp ca niềng răng trong suốt"></div></div>
      <div class="it-row"><div><label>Ghi chú <span class="it-tag">Comments</span></label><input id="itComments" type="text" placeholder="Ghi chú thêm (tuỳ chọn)"></div></div>
      <div class="it-row"><div><label>Tác giả <span class="it-tag">Authors</span></label><input id="itAuthors" type="text" placeholder="Nha khoa Shark"></div>
        <div><label>Bản quyền <span class="it-tag">Copyright</span></label><input id="itCopy" type="text" placeholder="© Nha khoa Shark"></div>
        <div style="flex:0 0 140px"><label>Đánh giá <span class="it-tag">Rating</span></label><input id="itRating" type="number" min="0" max="5" step="0.1" placeholder="4.8"></div></div>

      <div class="it-sec">Doanh nghiệp / Local SEO</div>
      <div class="it-row"><div><label>Địa điểm / Địa chỉ</label><input id="itLoc" type="text" placeholder="Nha khoa Shark, 361 Nguyễn Trãi"></div></div>
      <div class="it-row"><div><label>Thành phố</label><input id="itCity" type="text" placeholder="Hà Nội"></div>
        <div><label>Tỉnh / Vùng</label><input id="itProv" type="text" placeholder="Hà Nội"></div>
        <div><label>Quốc gia</label><input id="itCtry" type="text" value="Việt Nam"></div></div>
      <div class="it-row"><div><label>Số điện thoại</label><input id="itPhone" type="text" placeholder="0938 267 574"></div>
        <div><label>Email</label><input id="itEmail" type="text" placeholder="info@nhakhoashark.vn"></div>
        <div><label>Website (URL)</label><input id="itUrl" type="text" placeholder="https://nhakhoashark.vn"></div></div>
      <p class="it-note">Chuẩn EXIF <b>không có trường riêng cho URL/điện thoại/địa chỉ</b>. Nhóm này được ghi gộp vào <b>Ghi chú (Comments)</b> — nơi duy nhất đọc được rõ ràng. Các trường ở khối trên được ghi <b>đúng 1-1</b>, không trộn lẫn.</p>`;
  }
  function xpBytes(s) { const out = []; for (let i = 0; i < s.length; i++) { const cc = s.charCodeAt(i); out.push(cc & 0xff, (cc >> 8) & 0xff); } out.push(0, 0); return out; }
  async function geotagProc(it) {
    const piexif = window.piexif; if (!piexif) throw new Error("Thiếu thư viện EXIF (piexif)");
    const lat = parseFloat(val("itLat")), lng = parseFloat(val("itLng"));
    // EXIF chỉ nhúng được vào JPEG. Ảnh JPEG gốc -> giữ NGUYÊN bytes (không re-encode,
    // không mất chất lượng, giữ đúng tên file). Ảnh khác -> chuyển sang JPEG.
    const isJpeg = it.mime === "image/jpeg" || /^jpe?g$/i.test(it.ext);
    const dataUrl = isJpeg ? await fileToDataUrl(it.file) : drawCanvas(it.img, it.w, it.h).toDataURL("image/jpeg", 0.95);

    const zeroth = {}, exif = {}, gps = {};
    const title = val("itTitle").trim(), subject = val("itSubject").trim(), tags = val("itTags").trim();
    const desc = val("itDesc").trim(), comments = val("itComments").trim();
    const authors = val("itAuthors").trim(), copyr = val("itCopy").trim(), rating = val("itRating").trim();
    const loc = val("itLoc").trim(), city = val("itCity").trim(), prov = val("itProv").trim(), ctry = val("itCtry").trim();
    const phone = val("itPhone").trim(), email = val("itEmail").trim(), url = val("itUrl").trim();

    // Nhóm doanh nghiệp (địa chỉ/ĐT/email/website) -> gộp vào Ghi chú (Comments).
    // EXIF không có tag riêng cho URL — TUYỆT ĐỐI không nhét vào Software (= "Program name").
    const locFull = [loc, city, prov, ctry].filter(Boolean).join(", ");
    const biz = [locFull, phone && `ĐT: ${phone}`, email && `Email: ${email}`, url && `Website: ${url}`].filter(Boolean).join(" · ");
    const commentFull = [comments, biz].filter(Boolean).join(" — ");

    // --- Trường ASCII (EXIF chuẩn) ---
    if (desc) zeroth[piexif.ImageIFD.ImageDescription] = asciiFold(desc);
    if (authors) zeroth[piexif.ImageIFD.Artist] = asciiFold(authors);
    if (copyr) zeroth[piexif.ImageIFD.Copyright] = asciiFold(copyr);
    // --- Trường XP (UCS-2, Windows đọc đúng tiếng Việt có dấu) — map 1-1, không trộn ---
    const XP_SUBJECT = piexif.ImageIFD.XPSubject || 40095;
    if (title) zeroth[piexif.ImageIFD.XPTitle] = xpBytes(title);
    if (subject) zeroth[XP_SUBJECT] = xpBytes(subject);
    if (tags) zeroth[piexif.ImageIFD.XPKeywords] = xpBytes(tags);
    if (commentFull) zeroth[piexif.ImageIFD.XPComment] = xpBytes(commentFull);
    if (authors) zeroth[piexif.ImageIFD.XPAuthor] = xpBytes(authors);
    // --- Đánh giá sao -> Rating (0-5) + RatingPercent ---
    const rv = parseFloat(rating);
    if (!isNaN(rv) && piexif.ImageIFD.Rating) {
      zeroth[piexif.ImageIFD.Rating] = Math.max(0, Math.min(5, Math.round(rv)));
      if (piexif.ImageIFD.RatingPercent) zeroth[piexif.ImageIFD.RatingPercent] = Math.round(Math.max(0, Math.min(5, rv)) / 5 * 100);
    }
    // --- UserComment: để công cụ EXIF khác cũng đọc được ghi chú/liên hệ ---
    if (commentFull) exif[piexif.ExifIFD.UserComment] = "ASCII\0\0\0" + asciiFold(commentFull);
    // --- GPS ---
    if (!isNaN(lat) && !isNaN(lng)) {
      gps[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? "N" : "S";
      gps[piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(Math.abs(lat));
      gps[piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? "E" : "W";
      gps[piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(Math.abs(lng));
      const alt = parseFloat(val("itAlt"));
      if (!isNaN(alt)) { gps[piexif.GPSIFD.GPSAltitudeRef] = alt < 0 ? 1 : 0; gps[piexif.GPSIFD.GPSAltitude] = [Math.round(Math.abs(alt) * 100), 100]; }
    }
    const exifStr = piexif.dump({ "0th": zeroth, Exif: exif, GPS: gps });
    const blob = dataURLtoBlob(piexif.insert(exifStr, dataUrl));
    // Giữ ĐÚNG tên ảnh gốc, không thêm hậu tố. (Ảnh không phải JPEG buộc đổi đuôi .jpg vì EXIF cần JPEG.)
    return { name: isJpeg ? it.name : `${it.base}.jpg`, blob };
  }

  // --- Xóa nền (làm trong suốt) ---
  function bgOpts(el) {
    el.innerHTML = `<div class="it-row"><div><label>Độ nhạy màu nền (<span id="itTolV">30</span>)</label><input id="itTol" type="range" min="5" max="140" value="30"></div>
        <div style="flex:0 0 auto"><label>Màu nền cần xoá</label><div style="display:flex;gap:8px;align-items:center"><input type="color" id="itBgColor" value="#ffffff" style="width:46px;height:34px;padding:2px;border-radius:8px"><button class="ghost small" id="itAutoBg" type="button">Tự lấy từ 4 góc</button></div></div></div>
      <p class="it-note">Chọn màu nền cần xoá (hoặc "Tự lấy từ 4 góc" của ảnh đầu). Tăng độ nhạy nếu còn sót nền, giảm nếu ăn vào chủ thể. Hợp với nền đồng màu (sản phẩm, logo); ảnh nền phức tạp nên dùng công cụ tách nền chuyên dụng. Xuất PNG trong suốt.</p>`;
    el.querySelector("#itTol").addEventListener("input", (e) => el.querySelector("#itTolV").textContent = e.target.value);
    el.querySelector("#itAutoBg").addEventListener("click", () => {
      if (!files.length) { toast("Chưa có ảnh"); return; }
      const it = files[0]; const c = drawCanvas(it.img, it.w, it.h); const ctx = c.getContext("2d");
      const pts = [[0, 0], [c.width - 1, 0], [0, c.height - 1], [c.width - 1, c.height - 1]];
      let r = 0, g = 0, b = 0; pts.forEach(([x, y]) => { const d = ctx.getImageData(x, y, 1, 1).data; r += d[0]; g += d[1]; b += d[2]; });
      r = Math.round(r / 4); g = Math.round(g / 4); b = Math.round(b / 4);
      el.querySelector("#itBgColor").value = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
      toast("Đã lấy màu nền từ 4 góc");
    });
  }
  async function bgProc(it) {
    const tol = parseInt(val("itTol")) || 30;
    const hex = val("itBgColor"); const R = parseInt(hex.slice(1, 3), 16), G = parseInt(hex.slice(3, 5), 16), B = parseInt(hex.slice(5, 7), 16);
    const c = drawCanvas(it.img, it.w, it.h); const ctx = c.getContext("2d");
    const im = ctx.getImageData(0, 0, c.width, c.height); const d = im.data;
    const feather = tol * 0.5;
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - R, dg = d[i + 1] - G, db = d[i + 2] - B;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist <= tol) d[i + 3] = 0;
      else if (dist <= tol + feather) d[i + 3] = Math.round(d[i + 3] * (dist - tol) / feather);
    }
    ctx.putImageData(im, 0, 0);
    const blob = await toBlob(c, "image/png", 1);
    return { name: `${it.base}-nobg.png`, blob };
  }

  const TOOLS = {
    resize: { title: "Đổi kích thước ảnh", opts: resizeOpts, proc: resizeProc, note: "Giữ nguyên định dạng gốc. Bỏ trống 1 ô để tự tính theo tỉ lệ." },
    format: { title: "Đổi định dạng ảnh", opts: formatOpts, proc: formatProc },
    logo: { title: "Chèn logo / đóng dấu vào ảnh", opts: logoOpts, proc: logoProc, validate: () => (logoImg ? "" : "Hãy chọn logo trước.") },
    rename: { title: "Đổi tên ảnh hàng loạt (chuẩn SEO)", opts: renameOpts, proc: renameProc, validate: () => (slugify(val("itBase")) && val("itBase").trim() ? "" : "Nhập tên gốc (dạng abc-xyz-rty).") },
    geotag: { title: "Thêm Geotag (EXIF GPS) cho ảnh", opts: geotagOpts, proc: geotagProc, note: "Giữ NGUYÊN tên ảnh gốc (không thêm hậu tố). Ảnh JPEG được giữ nguyên chất lượng (chỉ nhúng EXIF, không nén lại); ảnh PNG/WEBP buộc chuyển .jpg vì EXIF chỉ nhúng được vào JPEG.", validate: () => (isNaN(parseFloat(val("itLat"))) || isNaN(parseFloat(val("itLng"))) ? "Nhập vĩ độ & kinh độ (lấy từ Google Maps)." : "") },
    bg: { title: "Xóa nền — làm trong suốt", opts: bgOpts, proc: bgProc },
  };

  // ================= MỞ / CHẠY / ĐÓNG =================
  function openTool(key) {
    current = TOOLS[key]; if (!current) return;
    titleEl.textContent = current.title;
    files = []; logoImg = null;
    bodyEl.innerHTML = `
      <div class="it-drop" id="itDrop">
        <input type="file" id="itFiles" accept="image/*" multiple style="display:none">
        <div style="font-weight:600">Kéo thả hoặc bấm để chọn ảnh</div>
        <div class="it-note" style="margin-top:4px">1 hoặc nhiều ảnh (không giới hạn) · JPG, PNG, WEBP…</div>
      </div>
      <div class="it-thumbs" id="itThumbs"></div>
      <div class="it-opts" id="itOpts"></div>
      <div class="it-foot">
        <button id="itRun" type="button">Xuất ảnh</button>
        <button class="ghost small" id="itClear" type="button">Xoá hết ảnh</button>
        <span class="it-note" id="itStatus"></span>
      </div>
      ${current.note ? `<p class="it-note" style="margin-top:10px">${esc(current.note)}</p>` : ""}`;
    current.opts(document.getElementById("itOpts"));
    const drop = document.getElementById("itDrop"), input = document.getElementById("itFiles");
    drop.addEventListener("click", (e) => { if (e.target === input) return; input.click(); });
    input.addEventListener("change", (e) => addFiles(e.target.files));
    ["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
    drop.addEventListener("drop", (e) => { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
    document.getElementById("itClear").addEventListener("click", () => { files = []; renderThumbs(); });
    document.getElementById("itRun").addEventListener("click", run);
    modal.classList.remove("hidden");
  }

  async function run() {
    if (!files.length) { toast("Chưa có ảnh nào"); return; }
    if (current.validate) { const err = current.validate(); if (err) { toast(err); return; } }
    const btn = document.getElementById("itRun"), st = document.getElementById("itStatus");
    btn.disabled = true;
    try {
      const outs = [];
      for (let i = 0; i < files.length; i++) { st.textContent = `Đang xử lý ${i + 1}/${files.length}…`; const o = await current.proc(files[i], i, files.length); if (o && o.blob) outs.push(o); }
      if (!outs.length) { toast("Không xuất được ảnh"); return; }
      if (outs.length === 1) { download(outs[0].blob, outs[0].name); }
      else {
        st.textContent = "Đang nén ZIP…";
        const zip = new window.JSZip(); const used = {};
        outs.forEach((o) => { let n = o.name; if (used[n]) { const k = ++used[n]; n = n.replace(/(\.[^.]+)$/, `-${k}$1`); } else used[n] = 1; zip.file(n, o.blob); });
        const blob = await zip.generateAsync({ type: "blob" });
        download(blob, `swiftmate-images-${outs.length}.zip`);
      }
      st.textContent = `Xong! Đã xuất ${outs.length} ảnh.`; toast("Đã xuất ảnh");
    } catch (e) { toast("Lỗi: " + (e.message || e)); st.textContent = "Lỗi: " + (e.message || e); }
    finally { btn.disabled = false; }
  }

  function close() { modal.classList.add("hidden"); files = []; logoImg = null; }
  document.getElementById("imgtoolClose").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.classList.contains("hidden")) close(); });
  document.querySelectorAll(".imgtool-btn").forEach((b) => b.addEventListener("click", () => openTool(b.dataset.imgtool)));
})();

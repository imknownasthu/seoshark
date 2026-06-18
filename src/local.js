// src/local.js
// Engine LOCAL (offline, khong can API key / tai khoan).
// Chen internal link bang thuat toan so khop tu khoa (khong dau, theo ngu canh).

// --- Chuan hoa giu nguyen do dai (de chi so khop voi chuoi goc) ---
function baseChar(c) {
  let lo = c.toLowerCase();
  if (lo.length !== 1) lo = lo[0] || c;
  if (lo === "đ") return "d";
  const stripped = lo.normalize("NFD").replace(/\p{M}/gu, "");
  return stripped[0] || lo;
}
function normalizeKeepLen(str) {
  let out = "";
  for (const ch of str) out += baseChar(ch);
  return out;
}
const STOPWORDS = new Set(
  ("va la cac cho khi thi co cua de nen gi an duoc bao lau hay voi tai trong mot nhung nhu hon hoac cung tu o " +
    "truoc sau tren duoi giua ngoai khac moi qua lai con nua deu ca neu khi cang theo den tu vao ra").split(" ")
);
function isWordChar(ch) {
  return /[a-z0-9]/i.test(ch);
}

// Tim phrase trong html nhung BO QUA phan nam trong the <...>, co kiem tra bien tu.
function findOutsideTags(html, phrase) {
  const H = normalizeKeepLen(html);
  const P = normalizeKeepLen(phrase).trim();
  if (!P) return null;

  const ranges = [];
  const re = /<[^>]+>/g;
  let m;
  while ((m = re.exec(html))) ranges.push([m.index, m.index + m[0].length]);

  let from = 0;
  while (true) {
    const idx = H.indexOf(P, from);
    if (idx < 0) return null;
    const end = idx + P.length;

    let overlap = false;
    for (const [s, e] of ranges) {
      if (idx < e && s < end) { overlap = true; break; }
    }
    // bien tu: ky tu lien truoc/sau khong phai chu-so
    const before = idx > 0 ? H[idx - 1] : " ";
    const after = end < H.length ? H[end] : " ";
    const boundaryOk = !isWordChar(before) && !isWordChar(after);

    if (!overlap && boundaryOk) return { start: idx, end };
    from = idx + 1;
  }
}

function linkifyHtml(html, phrase, url) {
  const hit = findOutsideTags(html, phrase);
  if (!hit) return null;
  const anchorText = html.slice(hit.start, hit.end);
  const newHtml =
    html.slice(0, hit.start) +
    `<a href="${url}">${anchorText}</a>` +
    html.slice(hit.end);
  return { newHtml, anchorText };
}

function tokens(str) {
  return normalizeKeepLen(str)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

// Sinh cac cum tu (n-gram) co nghia tu tieu de URL dich, dai & cu the -> ngan.
function ngramsFromTitle(title) {
  const words = title
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const grams = [];
  const maxN = Math.min(5, words.length);
  // Cum nhieu tu: yeu cau co it nhat 2 tu co nghia (tranh anchor kieu "sau khi")
  for (let n = maxN; n >= 2; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const phrase = words.slice(i, i + n).join(" ");
      if (tokens(phrase).length >= 2) grams.push(phrase);
    }
  }
  return grams;
}

function scoreTargetForKeyword(target, keyword) {
  const kw = new Set(tokens(keyword));
  const tt = tokens(`${target.title} ${target.url}`);
  let s = 0;
  for (const t of tt) if (kw.has(t)) s++;
  return s;
}

function eligibleBlocks(article) {
  return article.blocks.filter(
    (b) =>
      !b.isSapo &&
      !b.isConclusion &&
      (b.tag === "p" || b.tag === "li") &&
      ((b.html || "").match(/<a\s/gi) || []).length < 2 // bo qua block da co >=2 link cu
  );
}

export function optimizeLocally({ article, mode, count, keywords, targets, allTargets }) {
  const urlPool = allTargets && allTargets.length ? allTargets : targets;
  const edits = [];
  const usedBlock = new Set();
  const usedUrl = new Set();
  const selfUrl = (article.url || "").replace(/\/$/, "");
  const eligibles = eligibleBlocks(article);
  const noteParts = [];

  const tryPlace = (phrase, url, keyword) => {
    if (usedUrl.has(url)) return false;
    for (const b of eligibles) {
      if (usedBlock.has(b.i)) continue;
      const res = linkifyHtml(b.html, phrase, url);
      if (res) {
        edits.push({
          blockIndex: b.i,
          newHtml: res.newHtml,
          anchor: res.anchorText.replace(/<[^>]+>/g, ""),
          targetUrl: url,
          keyword: keyword || "",
          addedContent: false,
          reason: "So khop cum tu xuat hien tu nhien trong doan van (Local).",
        });
        usedBlock.add(b.i);
        usedUrl.add(url);
        return true;
      }
    }
    return false;
  };

  // Them mot cau bo sung khi khong tim duoc cho phu hop
  const appendSentence = (anchor, url, keyword) => {
    if (usedUrl.has(url)) return false;
    const kw = tokens(keyword || anchor);
    let best = null,
      bestScore = -1;
    for (const b of eligibles) {
      if (usedBlock.has(b.i)) continue;
      const bt = new Set(tokens(b.text));
      let s = 0;
      for (const t of kw) if (bt.has(t)) s++;
      if (s > bestScore) { bestScore = s; best = b; }
    }
    if (!best) return false;
    const sentence = ` Xem thêm: <a href="${url}">${anchor}</a>.`;
    edits.push({
      blockIndex: best.i,
      newHtml: best.html + sentence,
      anchor,
      targetUrl: url,
      keyword: keyword || "",
      addedContent: true,
      reason: "Khong co cum tu san trong bai -> viet them 1 cau de trien khai link (Local).",
    });
    usedBlock.add(best.i);
    usedUrl.add(url);
    return true;
  };

  if (mode === "auto") {
    const n = Math.max(1, Math.min(20, parseInt(count, 10) || 3));
    for (const t of targets) {
      if (edits.length >= n) break;
      if (t.url.replace(/\/$/, "") === selfUrl) continue;
      const grams = ngramsFromTitle(t.title);
      let placed = false;
      for (const g of grams) {
        if (tryPlace(g, t.url, "")) { placed = true; break; }
      }
      // neu khong khop tu nhien thi bo qua (auto mode khong guong ep them cau)
      void placed;
    }
    if (edits.length < n) {
      noteParts.push(
        `Local chi tim duoc ${edits.length}/${n} vi tri khop tu nhien. De dat du so luong & chen muot hon, hay bat engine Gemini (free) o phan Cau hinh.`
      );
    }
  } else {
    for (const k of keywords) {
      const keyword = (k.keyword || "").trim();
      if (!keyword) continue;
      let url = (k.url || "").trim();
      if (!url) {
        // chon URL phu hop nhat tu pool
        let best = null,
          bestScore = 0;
        for (const t of urlPool) {
          if (t.url.replace(/\/$/, "") === selfUrl) continue;
          if (usedUrl.has(t.url)) continue;
          const s = scoreTargetForKeyword(t, keyword);
          if (s > bestScore) { bestScore = s; best = t; }
        }
        if (best) url = best.url;
      }
      if (!url) {
        noteParts.push(`Tu khoa "${keyword}": khong tim duoc URL dich phu hop trong sitemap (hay nhap URL thu cong).`);
        continue;
      }
      const ok = tryPlace(keyword, url, keyword);
      if (!ok) {
        const added = appendSentence(keyword, url, keyword);
        if (!added)
          noteParts.push(`Tu khoa "${keyword}": khong con doan trong de chen.`);
      }
    }
  }

  return { edits, notes: noteParts.join(" "), usage: null };
}

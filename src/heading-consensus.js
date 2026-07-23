// src/heading-consensus.js
// "DIEM CHUNG" cua outline doi thu TOP SERP = tin hieu MANH NHAT ve SEARCH INTENT cua Google.
//
// Truoc day AI tu doc 6 outline doi thu roi tu gom trong dau -> hay bo sot, va khi co Kien thuc
// website thi AI nghieng ve ca nhan hoa, quen mat cac muc MA AI CUNG CO (intent cot loi).
// Module nay gom nhom BANG CODE (khong phu thuoc AI): cac heading dong nghia cua nhieu doi thu
// duoc gop thanh 1 "cum", dem duoc BAO NHIEU DOI THU cung co -> cum nao >= nua so doi thu la
// BAT BUOC phai co trong outline cuoi. AI nhan bang nay va phai tuan thu; server con kiem tra lai.

// ====== Chuan hoa tieng Viet ======
export const normVi = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d");

const stripLeadNum = (s) =>
  String(s || "")
    .replace(/^\s*\d+([.)]\d+)*[.)]?\s+/, "")
    .replace(/^\s*[IVXLCDM]+[.)]\s+/i, "")
    .replace(/^\s*(b[uư][oơ]c|m[uụ]c|ph[aâ]n|step|part)\s+\d+\s*[:.)-]?\s+/i, "")
    .trim();

// Heading rac/boilerplate (menu, footer, muc luc...) -> khong tinh vao diem chung
const JUNK_RE = /^(n[ộo]i dung|m[ụu]c l[ụu]c|contents?|tham kh[ảa]o|references?|li[êe]n k[ếe]t ngo[àa]i|external links?|xem th[êe]m|see also|ch[úu] th[íi]ch|ghi ch[úu]|notes?|h[ìi]nh [ảa]nh|gallery|th[ưu] m[ụu]c|b[ìi]nh lu[ậa]n|comments?|chia s[ẻe]|share|danh m[ụu]c|menu|trang ch[ủu]|b[àa]i vi[ếe]t li[êe]n quan|tin li[êe]n quan|c[óo] th[ểe] b[ạa]n quan t[âa]m)$/i;

// Tu chuc nang / tu hoi / tu to diem - khong mang y nghia phan biet chu de
const STOP = new Set(
  ("la gi cua va voi cho khi nao nhu the con co khong duoc se bi da dang cac mot nhung nay do o tai tu den " +
    "ban ai nguoi ta the thi ma ra vao len xuong hay hoac neu vi boi nen can phai rat qua hon nhat sao vay " +
    "trong ngoai tren duoi truoc sau giua ve theo so nhieu it " +
    // tu to diem trong tieu de SEO ("moi nhat", "pho bien", "hien nay", "chi tiet", "chuan"...)
    "hien nay moi pho bien chuan chi tiet day du tot uy tin thuc su that su").split(/\s+/)
);

// Gop cac cach noi KHAC NHAU nhung CUNG Y (da linh vuc) ve 1 tu dai dien.
// Nho vay "Chi phi X bao nhieu tien?" va "Gia X" duoc coi la CUNG mot muc.
const SYNONYMS = [
  [/\b(bao nhieu tien|het bao nhieu|gia bao nhieu|bang gia|muc gia|chi phi|gia ca|gia thanh|gia|cost|price)\b/g, " ~gia "],
  [/\b(quy trinh|cac buoc|tung buoc|tien trinh|thuc hien nhu the nao|cach thuc hien|huong dan thuc hien|process)\b/g, " ~quytrinh "],
  [/\b(luu y|can luu y|chu y|can biet|dieu can biet|kinh nghiem)\b/g, " ~luuy "],
  [/\b(uu diem|loi ich|tac dung|cong dung|diem manh|vi sao nen|tai sao nen|benefits?)\b/g, " ~uudiem "],
  [/\b(nhuoc diem|han che|rui ro|tac hai|bien chung|nguy hiem|hau qua|diem yeu|co hai)\b/g, " ~nhuocdiem "],
  [/\b(la gi|khai niem|dinh nghia|tong quan|hieu the nao|nghia la|what is)\b/g, " ~khainiem "],
  [/\b(so sanh|khac nhau|khac biet|nen chon|vs|hay hon|tot hon)\b/g, " ~sosanh "],
  [/\b(o dau|tai dau|dia chi|dia diem|noi nao|don vi nao|cho nao)\b/g, " ~diachi "],
  [/\b(cau hoi thuong gap|thuong gap|giai dap|hoi dap|faq|thac mac)\b/g, " ~faq "],
  [/\b(danh gia|review|co tot khong|co nen|nhan xet|phan hoi|feedback|y kien)\b/g, " ~danhgia "],
  [/\b(bao lau|mat bao lau|thoi gian|thoi han|keo dai|duy tri duoc)\b/g, " ~thoigian "],
  [/\b(doi tuong|ai nen|ai khong nen|truong hop nao|chi dinh|phu hop voi)\b/g, " ~doituong "],
  [/\b(phan loai|cac loai|cac kieu|cac dang|cac phuong phap|cac cach|cac hinh thuc|nhung loai)\b/g, " ~phanloai "],
  [/\b(cham soc|bao quan|ve sinh|sau khi|hau phau|phuc hoi)\b/g, " ~chamsoc "],
  [/\b(nguyen nhan|do dau|vi sao bi|tai sao bi|yeu to)\b/g, " ~nguyennhan "],
  [/\b(dau hieu|trieu chung|bieu hien|nhan biet|cach nhan biet)\b/g, " ~dauhieu "],
  [/\b(ket luan|tong ket|loi ket|tom lai)\b/g, " ~ketluan "],
];

// Ap dung dong nghia THEO RANH GIOI TU (\b). Neu khong co \b thi "co dau khong" bi khop nham
// cum "o dau" (dia chi) do trung chuoi con -> gom sai hoan toan.
function applySynonyms(s) {
  let out = " " + s + " ";
  for (const [re, rep] of SYNONYMS) out = out.replace(re, rep);
  return out;
}

/**
 * Bo tu khoa chinh khoi token so sanh: neu khong bo thi MOI heading deu chua tu khoa
 * -> cai gi cung "giong nhau", gom nham. Bo roi thi con dung PHAN PHAN BIET y.
 */
export function contentTokens(text, mainKeyword = "") {
  const raw = applySynonyms(normVi(stripLeadNum(text)))
    .replace(/[^\p{L}\p{N}~\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const kwTok = new Set(normVi(mainKeyword).split(/\s+/).filter(Boolean));
  const out = new Set();
  for (const t of raw.split(" ")) {
    if (!t || t.length < 2) continue;
    if (t.startsWith("~")) { out.add(t); continue; }
    if (STOP.has(t) || kwTok.has(t)) continue;
    out.add(t);
  }
  return out;
}

// Do giong nhau giua 2 heading (0..1). Tap con -> coi nhu rat giong.
export function similarity(a, b) {
  if (!a.size && !b.size) return 1;         // ca hai deu chi la tu khoa chinh -> cung muc "tong quan"
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  if (!inter) return 0;
  const small = Math.min(a.size, b.size);
  if (inter === small && small >= 1) return 0.9; // tap con hoan toan
  return inter / (a.size + b.size - inter);      // Jaccard
}

const SIM_MIN = 0.5;

/**
 * Do giong nhau giua 1 heading va 1 CUM: lay muc giong nhat voi TUNG thanh vien cua cum.
 * (Neu gop tat ca token cua cum lam mot thi cum cang lon cang "loang" -> heading dung y
 * van bi tinh la khac, vd "Chi phi dieu tri" khong khop cum gia sau khi cum da nap them
 * "bang gia ... moi nhat".)
 */
export function simToCluster(toks, cluster) {
  let best = 0;
  for (const m of cluster.members || [cluster.toks]) {
    const s = similarity(toks, m);
    if (s > best) best = s;
  }
  return best;
}

/**
 * Gom heading cua cac doi thu thanh cac "cum diem chung".
 * @param competitors [{ok, host, url, headings:[{level,text}]}]
 * @param targetHeadings heading hien co cua BAI MINH -> danh dau cum nao da phu
 * @returns { nComp, clusters:[{label, variants, hosts, count, share, avgPos, level, must, covered, matched}] }
 */
export function buildConsensus(competitors, { targetHeadings = [], mainKeyword = "", maxClusters = 15 } = {}) {
  // c.ok chi co o luong Onpage (doi thu doc loi -> ok:false). Luong "Len outline" khong co truong nay.
  const comps = (competitors || []).filter((c) => c && c.ok !== false && (c.headings || []).length);
  const nComp = comps.length;
  if (!nComp) return { nComp: 0, clusters: [] };

  const clusters = []; // { members:[Set], toks, variants:Map(text->count), hosts:Set, posSum, posN, levels:[] }

  comps.forEach((c) => {
    const hs = (c.headings || []).filter((h) => h.level >= 2 && h.level <= 3 && h.text && !JUNK_RE.test(normVi(h.text).trim()));
    const seenThisComp = new Set(); // 1 doi thu chi tinh 1 lan cho moi cum
    hs.forEach((h, i) => {
      const toks = contentTokens(h.text, mainKeyword);
      let best = null, bestSim = 0;
      for (const cl of clusters) {
        const s = simToCluster(toks, cl);
        if (s > bestSim) { bestSim = s; best = cl; }
      }
      let cl;
      if (best && bestSim >= SIM_MIN) {
        cl = best;
        cl.members.push(toks);
        for (const t of toks) cl.toks.add(t);
      } else {
        cl = { members: [toks], toks: new Set(toks), variants: new Map(), hosts: new Set(), posSum: 0, posN: 0, levels: [] };
        clusters.push(cl);
      }
      const label = stripLeadNum(h.text).trim();
      // Heading danh so ("1. Nha khoa ABC") = MOT HANG MUC trong danh sach, khong phai muc intent
      if (/^\s*\d{1,2}\s*[.)\-–:]\s+\S/.test(String(h.text))) cl.numbered = (cl.numbered || 0) + 1;
      cl.variants.set(label, (cl.variants.get(label) || 0) + 1);
      cl.levels.push(h.level);
      cl.posSum += hs.length > 1 ? i / (hs.length - 1) : 0;
      cl.posN++;
      if (!seenThisComp.has(cl)) { cl.hosts.add(c.host || c.url || ""); seenThisComp.add(cl); }
    });
  });

  // Cum BAT BUOC: phai la DA SO RO RANG (>=60% doi thu, toi thieu 2). Truoc day de >=50% thi
  // voi 4 doi thu chi can 2/4 la bi ep vao — tin hieu qua yeu, de lam loang outline.
  const mustMin = Math.max(2, Math.ceil(nComp * 0.6));
  const tgt = (targetHeadings || []).filter((h) => h && h.text).map((h) => ({ h, toks: contentTokens(h.text, mainKeyword) }));

  const out = clusters.map((cl) => {
    const count = cl.hosts.size;
    // Nhan dai dien: cach dien dat pho bien nhat; hoa nhau thi lay ban ro nghia (dai hon mot chut)
    const label = [...cl.variants.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
    const levels = cl.levels.slice().sort((a, b) => cl.levels.filter((x) => x === a).length - cl.levels.filter((x) => x === b).length);
    let matched = null, mSim = 0;
    for (const t of tgt) { const s = simToCluster(t.toks, cl); if (s > mSim) { mSim = s; matched = t.h; } }
    // Cum gom cac HANG MUC danh sach (Top 10 dia chi...) -> KHONG duoc ep vao outline:
    // do la noi dung cu the cua tung bai (thuong la ten thuong hieu doi thu), khong phai intent.
    const isItem = (cl.numbered || 0) >= Math.max(1, Math.ceil(cl.variants.size / 2));
    return {
      label,
      variants: [...cl.variants.keys()].slice(0, 4),
      hosts: [...cl.hosts].filter(Boolean),
      count,
      share: +(count / nComp).toFixed(2),
      avgPos: +(cl.posSum / (cl.posN || 1)).toFixed(3),
      level: levels[levels.length - 1] || 2,
      isItem,
      must: count >= mustMin && !isItem,
      covered: mSim >= SIM_MIN,
      matched: mSim >= SIM_MIN && matched ? matched.text : "",
      toks: cl.toks,        // dung noi bo (kiem tra outline cuoi), khong gui ra UI
      members: cl.members,  // nt
    };
  });

  out.sort((a, b) => b.count - a.count || a.avgPos - b.avgPos);
  return { nComp, mustMin, clusters: out.slice(0, maxClusters) };
}

// Bang "diem chung" de dua vao prompt cho AI
export function consensusView(cons, { mainKeyword = "" } = {}) {
  if (!cons || !cons.nComp || !cons.clusters.length) return "";
  const lines = cons.clusters.map((c, i) => {
    const flag = c.must ? "BAT BUOC" : "tuy chon";
    const state = c.covered ? `bai DA CO ("${c.matched}")` : "bai DANG THIEU";
    const alt = c.variants.filter((v) => v !== c.label).slice(0, 2);
    return `  ${i + 1}. [${flag}] ${c.count}/${cons.nComp} doi thu — "${c.label}"${alt.length ? ` (cach goi khac: ${alt.map((v) => `"${v}"`).join(", ")})` : ""}\n     vi tri TB trong bai doi thu: ${(c.avgPos * 100).toFixed(0)}% — ${state}`;
  });
  return `=== DIEM CHUNG OUTLINE DOI THU (da gom nhom dong nghia bang thuat toan, KHONG phai suy doan) ===
Day la SEARCH INTENT ma Google dang thuong cho tu khoa "${mainKeyword}". Cum duoc >= ${cons.mustMin}/${cons.nComp} doi thu cung co = BAT BUOC.
${lines.join("\n")}`;
}

/**
 * Kiem tra outline cuoi cua AI da phu het cac cum BAT BUOC chua.
 * @returns { missing:[cluster], covered:[{cluster, text}] }
 */
export function checkCoverage(finalOutline, cons, { mainKeyword = "" } = {}) {
  const musts = (cons?.clusters || []).filter((c) => c.must);
  if (!musts.length) return { missing: [], covered: [] };
  const rows = (finalOutline || []).filter((o) => o && o.text).map((o) => ({ o, toks: contentTokens(o.text, mainKeyword) }));
  const missing = [], covered = [];
  for (const c of musts) {
    let best = null, bs = 0;
    for (const r of rows) { const s = simToCluster(r.toks, c); if (s > bs) { bs = s; best = r.o; } }
    if (bs >= SIM_MIN && best) covered.push({ cluster: c, text: best.text });
    else missing.push(c);
  }
  return { missing, covered };
}

/**
 * Don outline gop CO HOC (engine Local): gop cac H2 TRUNG Y (vd "Chi phi dieu tri" +
 * "Bang gia ... moi nhat" + "Gia ..." -> 1 muc) va sap xep lai theo hanh trinh doc cua doi thu.
 * Chi dung cho Local: ban AI da tu chat loc nen khong can (va khong nen) ep gop.
 */
export function refineLocalOutline(outline, cons, { mainKeyword = "", archetype = null } = {}) {
  const rows = outline || [];
  if (!rows.length || !cons?.clusters?.length) return rows;

  // Cat thanh cac khoi: 1 H2 + cac heading con di kem
  const blocks = [];
  for (const r of rows) {
    if (r.level <= 2 || !blocks.length) blocks.push({ head: r, kids: [] });
    else blocks[blocks.length - 1].kids.push(r);
  }

  const clusterOf = (text) => {
    const toks = contentTokens(text, mainKeyword);
    let best = null, bs = 0;
    for (const c of cons.clusters) { const s = simToCluster(toks, c); if (s > bs) { bs = s; best = c; } }
    return bs >= SIM_MIN ? best : null;
  };

  // Bai dang TOPLIST: cac heading hang muc cua doi thu CHINH LA TEN THUONG HIEU cua ho
  // ("1. Nha khoa Shark"...). Gop co hoc se be nguyen danh sach doi thu vao outline cua minh
  // -> thay bang KHUNG danh sach de nguoi viet tu dien.
  const isToplist = archetype?.type === "toplist";
  const seen = new Map(); // cluster -> block giu lai
  const kept = [];
  let droppedItems = 0, droppedPos = 0;
  for (const b of blocks) {
    const cl = clusterOf(b.head.text);
    if (isToplist && cl?.isItem) {
      droppedItems++;
      droppedPos += cl.avgPos;
      continue;
    }
    if (cl && seen.has(cl)) {
      // Trung y voi khoi truoc -> gop con vao khoi do, bo heading trung
      const first = seen.get(cl);
      for (const k of b.kids) if (!first.kids.some((x) => x.text === k.text)) first.kids.push(k);
      continue;
    }
    if (cl) seen.set(cl, b);
    b.cluster = cl;
    kept.push(b);
  }

  // Chen KHUNG danh sach thay cho cac hang muc vua bo (dung dang bai, khong lo ten doi thu)
  if (isToplist && droppedItems) {
    const n = Math.min(Math.max(archetype.avgItems || droppedItems, 3), 10);
    const kw = String(mainKeyword || "").trim();
    kept.push({
      head: { level: 2, text: `Top ${n} ${kw}`.trim(), source: "archetype" },
      kids: Array.from({ length: Math.min(n, 5) }, (_, i) => ({
        level: 3, text: `Lựa chọn ${i + 1} (điền tên và điểm nổi bật)`, source: "archetype",
      })),
      // Dat dung cho ma doi thu dat danh sach (vi tri TB cua cac hang muc)
      cluster: { avgPos: droppedPos / droppedItems },
    });
  }

  // Sap xep theo vi tri trung binh cua doi thu (khoi khong khop cum nao giu nguyen thu tu tuong doi)
  kept.forEach((b, i) => { b.ord = b.cluster ? b.cluster.avgPos : (i / Math.max(1, kept.length - 1)); });
  kept.sort((a, b) => a.ord - b.ord);

  // Bo con trung y trong cung 1 khoi
  const out = [];
  for (const b of kept) {
    out.push(b.head);
    const usedKid = new Map();
    for (const k of b.kids) {
      const cl = clusterOf(k.text);
      if (cl && usedKid.has(cl)) continue;
      if (cl) usedKid.set(cl, true);
      out.push(k);
    }
  }
  return out;
}

/**
 * Danh dau lai covered/matched cua tung cum theo MOT outline cho truoc.
 * Dung cho cong cu "Len outline" (chua co bai) -> hien "outline cuoi da phu cum nao".
 */
export function markCoverage(clusters, outline, { mainKeyword = "" } = {}) {
  const rows = (outline || []).filter((o) => o && o.text).map((o) => ({ o, toks: contentTokens(o.text, mainKeyword) }));
  return (clusters || []).map((c) => {
    let best = null, bs = 0;
    for (const r of rows) { const s = simToCluster(r.toks, c); if (s > bs) { bs = s; best = r.o; } }
    return { ...c, covered: bs >= SIM_MIN, matched: bs >= SIM_MIN && best ? best.text : "" };
  });
}

/**
 * Chen cac cum BAT BUOC con thieu vao outline cuoi, dat dung cho theo vi tri trung binh
 * cua doi thu (khong nhet het xuong cuoi bai).
 */
export function insertMissing(finalOutline, missing, cons, { mainKeyword = "" } = {}) {
  if (!missing || !missing.length) return { outline: finalOutline || [], added: [] };
  const outline = (finalOutline || []).slice();
  const added = [];
  // Uoc luong vi tri tuong doi cua tung dong outline hien co (theo cum khop duoc)
  const posOf = outline.map((o) => {
    const toks = contentTokens(o.text, mainKeyword);
    let bs = 0, pos = null;
    for (const c of cons.clusters) { const s = simToCluster(toks, c); if (s > bs) { bs = s; pos = c.avgPos; } }
    return bs >= SIM_MIN ? pos : null;
  });
  for (const c of missing.slice().sort((a, b) => a.avgPos - b.avgPos)) {
    let at = outline.length;
    for (let i = 0; i < outline.length; i++) {
      if (posOf[i] != null && posOf[i] > c.avgPos) { at = i; break; }
    }
    const row = {
      level: c.level || 2,
      text: c.label,
      status: "add",
      source: "consensus",
      note: `Điểm chung ${c.count}/${cons.nComp} đối thủ — bắt buộc theo search intent`,
    };
    outline.splice(at, 0, row);
    posOf.splice(at, 0, c.avgPos);
    added.push(row);
  }
  return { outline, added };
}

// src/prompt.js
// Noi dung prompt + schema dung chung cho cac engine AI (Claude, Gemini).

export const SYSTEM_PROMPT = `Ban la bien tap vien SEO content nguoi Viet giau kinh nghiem, chuyen chen internal link sao cho doc len HOAN TOAN TU NHIEN nhu nguoi that viet.

MUC TIEU TOI THUONG: cau chua anchor phai muot, dung ngu phap, dung chinh ta & dau cau, va GIU NGUYEN y nghia + ngu canh goc. Nguoi doc khong duoc nhan ra cau da bi chen link.

QUY TAC BAT BUOC:
1. TUYET DOI khong chen link vao block [SAPO-CAM] (mo bai) hoac [KETBAI-CAM] (ket bai).
2. Anchor text la mot CUM DANH TU/CUM TU CO NGHIA tron ven, KHONG cat ngang giua mot cum tu (vd dung "boc rang su tham my" chu khong phai "su tham"). Anchor phai khop ngu nghia voi noi dung trang dich.
3. CHEN MUOT - day la phan quan trong nhat:
   - Uu tien gan link vao cum tu DA CO SAN trong cau neu cum do tu nhien.
   - Neu cum co san khong muot, DUOC PHEP chinh nhe cach dien dat cua DUNG CAU do (them/bot vai tu noi, doi trat tu tu, dung dong nghia) MIEN LA giu nguyen y nghia, su that, so lieu va sac thai. KHONG duoc xoa thong tin, khong doi nghia.
   - Cau sau khi chinh phai doc tron chay, lien mach voi cau truoc va sau.
4. Tranh nhoi nhet: khong chen 2 link sat nhau; moi URL dich chi 1 lan; anchor da dang, khong lap.
5. Neu ca doan khong co cho nao chen duoc tu nhien: VIET THEM 1 cau moi dung ngu canh, lien mach (dat addedContent=true) - cau them phai co gia tri thong tin that, khong sao rong.
6. Giu nguyen dinh dang inline cu (<strong>, <em>...). Chi tra ve <a href="URL">anchor</a> voi DUNG URL dich da cho, khong bia URL.
7. Chat luong hon so luong: tha it link that muot con hon nhieu link guong ep.

ĐUNG lam: chen kieu "Tham khao [tu khoa] de biet them." mot cach co hoc, hoac nhet anchor vao giua cau lam cau gay.
NEN lam: dien dat lai cau tu nhien quanh anchor, vd: "Khi nieng rang, viec ve sinh dung cach giup han che mang bam" -> "Khi <a href=...>nieng rang</a>, ve sinh dung cach giup han che mang bam".

Chi tra ve nhung block ban thuc su chinh sua.`;

export function buildBlocksView(blocks) {
  return blocks
    .map((b) => {
      const flags = [];
      if (b.isSapo) flags.push("SAPO-CAM");
      if (b.isConclusion) flags.push("KETBAI-CAM");
      const flagStr = flags.length ? ` [${flags.join(",")}]` : "";
      return `#${b.i} <${b.tag}>${flagStr}: ${b.text}`;
    })
    .join("\n");
}

export function buildTargetsView(targets) {
  return targets.map((t, idx) => `${idx + 1}. ${t.title} -> ${t.url}`).join("\n");
}

export function buildTaskInstruction({ mode, count, keywords }) {
  if (mode === "auto") {
    return `CHE DO: TU DONG.
Hay tu chon ${count} vi tri tot nhat trong bai de chen ${count} internal link, lay tu DANH SACH URL DICH ben duoi (uu tien URL lien quan nhat voi noi dung).
Neu khong du ${count} vi tri thuc su phu hop, hay chen so luong toi da hop ly va ghi ro trong "notes".`;
  }
  const kwView = keywords
    .map(
      (k, i) =>
        `${i + 1}. Tu khoa: "${k.keyword}"${
          k.url ? ` | URL chi dinh: ${k.url}` : " | (tu chon URL phu hop nhat tu danh sach)"
        }`
    )
    .join("\n");
  return `CHE DO: THEO TU KHOA.
Voi MOI tu khoa duoi day, tim vi tri phu hop nhat trong bai de chen internal link (1 link / tu khoa).
- Neu tu khoa da co URL chi dinh: dung dung URL do.
- Neu chua co URL: chon URL phu hop nhat tu DANH SACH URL DICH.
- Neu trong bai khong co cau nao chua/phu hop voi tu khoa: viet them 1 cau lien mach de trien khai (addedContent=true).

DANH SACH TU KHOA:
${kwView}`;
}

export function buildUserPrompt({ article, mode, count, keywords, targets }) {
  return `BAI VIET: "${article.title}"
URL goc: ${article.url}

CAC BLOCK NOI DUNG (dung blockIndex = so sau dau #):
${buildBlocksView(article.blocks)}

DANH SACH URL DICH (internal link co the dung):
${targets.length ? buildTargetsView(targets) : "(khong co)"}

YEU CAU:
${buildTaskInstruction({ mode, count, keywords })}`;
}

// Mo ta cac truong ket qua (dung cho tool-schema cua tung nha cung cap)
export const EDIT_FIELDS = {
  blockIndex: "Chi so (i) cua block goc bi chinh sua.",
  newHtml:
    'Inner HTML moi cua block, da chua the <a href="...">anchor</a>. Giu nguyen toan bo noi dung & dinh dang cu, chi them lien ket va toi da 1 cau neu can.',
  anchor: "Anchor text (chu duoc gan lien ket).",
  targetUrl: "URL dich cua lien ket.",
  keyword: "Tu khoa nguon (che do tu khoa); de trong neu khong co.",
  addedContent: "true neu phai viet them cau/y de trien khai link; nguoc lai false.",
  reason: "Giai thich ngan vi sao vi tri & anchor nay phu hop ngu canh.",
};

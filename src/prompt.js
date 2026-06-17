// src/prompt.js
// Noi dung prompt + schema dung chung cho cac engine AI (Claude, Gemini).

export const SYSTEM_PROMPT = `Ban la chuyen gia SEO content nguoi Viet, chuyen toi uu internal link.
Nhiem vu: chen internal link vao bai viet sao cho TU NHIEN, DUNG NGU CANH va GIU NGUYEN y nghia.

QUY TAC BAT BUOC:
1. TUYET DOI khong chen link vao block co nhan [SAPO-CAM] (mo bai) hoac [KETBAI-CAM] (ket bai).
2. Anchor text phai nam tron ven trong cau, doc xuoi, dung ngu phap tieng Viet, da dang (khong lap lai 1 cum tu).
3. Moi URL dich chi duoc chen 1 lan duy nhat. Khong chen 2 link sat nhau trong cung 1 cau.
4. Lien ket phai LIEN QUAN ngu canh doan van. Neu trong bai khong co cho phu hop voi tu khoa/URL, duoc phep VIET THEM 1 cau hoac mot ve y phu hop, lien mach voi doan van de trien khai link (dat addedContent=true).
5. Khi sua mot block: giu nguyen toan bo van ban & dinh dang inline cu (the <strong>, <em>...), chi them <a href="URL">anchor</a> (va toi da 1 cau bo sung neu can). Khong duoc xoa/viet lai noi dung goc.
6. The <a> dung dung URL dich da cho. Khong bia URL.
7. Uu tien chat luong hon so luong: tha it link dung con hon nhieu link guong ep.

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

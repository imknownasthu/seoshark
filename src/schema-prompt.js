// src/schema-prompt.js
// Prompt cho Schema Markup: (1) AI doc noi dung bai -> sinh JSON-LD toi uu; (2) so sanh schema gap voi doi thu.

export const SCHEMA_SYSTEM =
  "Bạn là chuyên gia Technical SEO & dữ liệu có cấu trúc (schema.org / JSON-LD), nắm rõ tài liệu Google Search Central mới nhất về structured data & rich results, và xu hướng GEO/AI Overview. " +
  "Bạn tạo JSON-LD CHÍNH XÁC, TỐI ƯU, ĐÚNG CẤU TRÚC schema.org, đủ trường bắt buộc của Google, KHÔNG lan man, KHÔNG bịa dữ liệu.";

export const SCHEMA_GEN_SCHEMA = {
  type: "object",
  properties: {
    jsonld: { type: "string", description: "TOAN BO khoi JSON-LD HOP LE duoi dang CHUOI JSON: {\"@context\":\"https://schema.org\",\"@graph\":[...]}. Phai JSON.parse duoc." },
    detectedTypes: { type: "array", items: { type: "string" }, description: "Cac @type da tao." },
    notes: { type: "string", description: "Ghi chu ngan (neu co): truong nao thieu du lieu that nen da bo qua..." },
  },
  required: ["jsonld"],
};

export const SCHEMA_GAP_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Nhan xet tong quan: schema cua ban so voi doi thu (thieu loai nao, thieu truong nao quan trong)." },
    criteria: {
      type: "array",
      description: "Moi tieu chi = 1 diem cai thien co the TICK de toi uu rieng. Cu the, dua tren khoang cach that voi doi thu.",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Ma ngan gon (vd 'add-faqpage', 'add-aggregaterating')." },
          title: { type: "string", description: "Ten tieu chi ngan gon (vd 'Bổ sung FAQPage schema')." },
          detail: { type: "string", description: "Giai thich: doi thu co gi, ban thieu gi, loi ich." },
          priority: { type: "string", description: '"Cao" | "Trung bình" | "Thấp".' },
        },
        required: ["id", "title"],
      },
    },
  },
  required: ["criteria"],
};

const VN_RULE = "\n\n⚠️ Các giá trị chữ tiếng Việt trong JSON-LD (name, description, headline, câu hỏi/câu trả lời FAQ...) PHẢI CÓ DẤU đầy đủ, đúng chính tả. Không viết tiếng Việt không dấu.";

// data: ket qua extractPageData; types: mang @type nguoi dung chon; autoDetect: AI tu chon loai
export function buildSchemaPrompt({ url, data, types = [], autoDetect = false }) {
  const d = data || {};
  const faqBlock = (d.faqs || []).length
    ? "FAQ ung vien (trich tu bai — chi dung neu tao FAQPage, giu nguyen y):\n" + d.faqs.map((f, i) => `  ${i + 1}. H: ${f.question}\n     Đ: ${f.answer}`).join("\n")
    : "FAQ ung vien: (khong thay cau hoi ro rang trong bai)";
  const headBlock = (d.headings || []).slice(0, 25).map((h) => `  H${h.level}: ${h.text}`).join("\n");
  const bcBlock = (d.breadcrumb || []).map((b, i) => `  ${i + 1}. ${b.name} — ${b.url}`).join("\n");
  const typeLine = autoDetect
    ? "TU DONG NHAN DIEN: hay tu chon cac loai schema PHU HOP NHAT voi bai nay (VD bai huong dan -> HowTo; trang dich vu -> Service + FAQ; bai review -> Review; luon nen co Article/WebPage + BreadcrumbList neu hop). KHONG tao loai khong lien quan."
    : "TAO DUNG cac loai duoc yeu cau: " + (types.join(", ") || "(khong co)") + ". Neu bai co du lieu cho loai do thi tao day du; neu thieu du lieu that thi tao toi thieu hop le, KHONG bia.";

  return `NHIEM VU: Sinh JSON-LD schema markup TOI UU cho URL: ${url}

=== DU LIEU DA TRICH TU BAI (chi dung du lieu THAT nay, KHONG bia) ===
- Tieu de: ${d.title || "(trong)"}
- Mo ta: ${d.description || "(trong)"}
- Tac gia: ${d.author || "(khong ro)"}
- Ngay dang: ${d.datePublished || "(khong ro)"} | Ngay sua: ${d.dateModified || "(khong ro)"}
- Anh dai dien: ${d.image || "(khong co)"}
- Ten site/Publisher: ${d.publisher || "?"} | Logo: ${d.logo || "(khong co)"} | Ngon ngu: ${d.lang || "vi"}
- Breadcrumb (tu URL):
${bcBlock || "  (khong co)"}
- ${faqBlock}
- Bo cuc heading:
${headBlock || "  (khong co)"}
- Trich noi dung: """${(d.contentText || "").slice(0, 5000)}"""
${d.existingTypes && d.existingTypes.length ? `- Schema DA CO san trong trang: ${d.existingTypes.join(", ")}` : "- Trang chua co schema."}

=== YEU CAU ===
${typeLine}

QUY TAC BAT BUOC (theo Google Search Central):
1. Output la 1 khoi DUY NHAT: {"@context":"https://schema.org","@graph":[ ...cac node... ]}. Moi node co @type + "@id" khi hop ly, lien ket cac node bang @id (vd Article.publisher tro toi Organization, isPartOf toi WebPage/WebSite).
2. DU truong BAT BUOC cua Google cho tung loai (vd Article: headline, image, datePublished, author, publisher; BreadcrumbList: itemListElement[position,name,item]; FAQPage: mainEntity[Question>acceptedAnswer.text]; HowTo: name, step[]; Product: name + offers[price,priceCurrency,availability] khi ban hang; Review: itemReviewed+reviewRating+author...).
3. CHINH XAC & KHONG LAN MAN: chi dua truong co DU LIEU THAT. Ngay o dang ISO 8601. URL dang tuyet doi. KHONG chen truong rong/gia.
4. TOI UU cho rich result + GEO: uu tien Article/BlogPosting + BreadcrumbList; them FAQPage neu bai co Q&A that; them Organization/WebSite/WebPage lam nen tang lien ket @id.
5. KHONG bia rating/review/gia/ngay neu bai khong co that.

Tra ve schema: jsonld = chuoi JSON hop le (JSON.parse duoc) cua ca khoi @graph; detectedTypes = cac @type; notes = ghi chu ngan.${VN_RULE}`;
}

// So sanh schema cua nguoi dung voi doi thu -> tieu chi cai thien
export function buildGapPrompt({ url, mine, competitors }) {
  const fmtComp = (competitors || []).map((c, i) => {
    const types = (c.types || []).join(", ") || "(khong co schema)";
    const detail = (c.nodes || []).slice(0, 8).map((n) => `      - ${n.type}: ${(n.props || []).join(", ")}`).join("\n");
    return `  Doi thu #${i + 1} (${c.host || c.url}): ${types}\n${detail}`;
  }).join("\n\n");
  const mineTypes = (mine && mine.types || []).join(", ") || "(chua co / rat it)";
  const mineDetail = (mine && mine.nodes || []).slice(0, 10).map((n) => `    - ${n.type}: ${(n.props || []).join(", ")}`).join("\n");

  return `So sanh SCHEMA MARKUP giua trang cua nguoi dung va doi thu TOP dau, chi ra SCHEMA GAP + tieu chi cai thien.

=== SCHEMA CUA NGUOI DUNG (${url}) ===
Loai: ${mineTypes}
${mineDetail || "    (chua co)"}

=== SCHEMA CUA DOI THU (doc tu SOURCE) ===
${fmtComp || "  (khong co)"}

YEU CAU:
1. summary: doi thu dang dung schema gi manh hon, ban thieu loai nao / truong quan trong nao.
2. criteria: liet ke cac diem CAI THIEN (moi cai la 1 tieu chi TICK duoc de toi uu rieng), CU THE theo khoang cach that voi doi thu. Vd: "Bổ sung FAQPage schema", "Thêm aggregateRating cho Product", "Thêm sameAs cho Organization", "Bổ sung BreadcrumbList", "Thêm author + datePublished cho Article"... Moi tieu chi co id, title, detail (doi thu co gi/ban thieu gi/loi ich), priority.
KHONG bia. Chi de xuat cai thuc su co ich va doi thu dang lam tot.${VN_RULE}`;
}

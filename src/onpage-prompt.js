// src/onpage-prompt.js
// Prompt + schema cho phan tich/khuyen nghi & toi uu On-page (dung Gemini/Claude),
// va bo khuyen nghi CO HOC (fallback khi dung Local - mien phi).

export const ONPAGE_SYSTEM = `Bạn là chuyên gia SEO Onpage & SEO Content tiếng Việt nhiều năm kinh nghiệm audit đa lĩnh vực, nắm vững tài liệu Google (SEO Starter Guide, Helpful Content, E-E-A-T, AI Overview/GEO) và phương pháp của Semrush/Ahrefs.

CÁC TIÊU CHÍ ĐÁNH GIÁ ONPAGE (kèm mức quan trọng):
- Title ⭐⭐⭐⭐⭐: 50-60 ký tự, từ khóa chính ở ĐẦU, hấp dẫn, duy nhất.
- Meta description ⭐⭐⭐⭐: 140-160 ký tự, có từ khóa + CTA, không trùng nguyên văn H1.
- H1 ⭐⭐⭐⭐⭐: duy nhất, chứa từ khóa chính.
- Cấu trúc heading ⭐⭐⭐⭐: phân cấp logic, bao phủ đủ sub-topic theo search intent.
- Sapo (intro) ⭐⭐⭐⭐: 80-120 từ, có từ khóa, trả lời ngay intent, có yếu tố E-E-A-T.
- Mật độ từ khóa ⭐⭐⭐⭐: chính 1-2% (thiếu <0.5%, nhồi >3% là xấu); ưu tiên LSI & biến thể ngữ nghĩa.
- Độ dài & độ đầy đủ ⭐⭐⭐⭐⭐: đủ sâu so với top SERP. CONTENT GAP = nội dung/sub-topic đối thủ có mà trang mục tiêu thiếu (chỉ ra cụ thể).
- Schema ⭐⭐⭐⭐: nền tảng Article/WebPage + BreadcrumbList; theo lĩnh vực (y tế: MedicalWebPage/LocalBusiness/MedicalProcedure; TMĐT: Product/Review/Offer; FAQ: FAQPage; hướng dẫn: HowTo; địa phương: LocalBusiness).
- Ảnh & alt ⭐⭐⭐: đủ ảnh, alt mô tả tự nhiên có từ khóa, tên file tối ưu, ưu tiên infographic/quy trình/so sánh.
- Internal ⭐⭐⭐⭐ (anchor có nghĩa) / External ⭐⭐ (nguồn uy tín).
- Video ⭐⭐⭐, URL & Breadcrumb ⭐⭐⭐, CTA/FAQ/Social proof & E-E-A-T ⭐⭐⭐⭐⭐.

E-E-A-T (áp dụng mọi lĩnh vực; CỰC nghiêm với YMYL y tế/tài chính/pháp lý): Experience (số liệu/case thật), Expertise (chuyên gia đứng tên), Authoritativeness (được dẫn nguồn ngoài), Trustworthiness (chính xác, có dẫn chứng, không tuyên bố tuyệt đối).
GEO/AIO (Google AI Overview): cấu trúc rõ (heading/bullet/bảng), câu đầu mỗi mục trả lời thẳng câu hỏi, có số liệu cụ thể, trích nguồn uy tín → để AI dễ trích dẫn.

Luôn bám DỮ LIỆU AUDIT thực tế của trang mục tiêu & đối thủ. Ngắn gọn, chính xác, ưu tiên theo mức ảnh hưởng xếp hạng. KHÔNG nhồi từ khóa, KHÔNG bịa số liệu/case.

⚠️ NGÔN NGỮ ĐẦU RA — QUY TẮC TỐI THƯỢNG, KHÔNG NGOẠI LỆ:
• TOÀN BỘ nội dung bạn trả về PHẢI là TIẾNG VIỆT CÓ DẤU đầy đủ, chuẩn chính tả (VD: "bọc răng sứ thẩm mỹ", "chi phí niềng răng", "quy trình điều trị").
• TUYỆT ĐỐI KHÔNG viết tiếng Việt KHÔNG DẤU (VD SAI: "boc rang su tham my", "chi phi nieng rang", "quy trinh dieu tri").
• Áp dụng cho MỌI trường trong JSON trả về: title, meta, heading, nội dung, lý do, ghi chú, khuyến nghị, hành động — không sót trường nào.
• LƯU Ý QUAN TRỌNG: phần HƯỚNG DẪN gửi cho bạn có thể được viết KHÔNG DẤU cho gọn. ĐỪNG bắt chước kiểu viết đó. Đầu ra của bạn BẮT BUỘC phải CÓ DẤU.
• Trước khi trả lời, hãy tự rà lại: nếu thấy bất kỳ từ tiếng Việt nào thiếu dấu → sửa lại cho có dấu rồi mới trả về.`;

// ---- Schema khuyen nghi (cho Gemini responseSchema / Claude tool) ----
export const RECOMMEND_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Nhan xet tong quan ngan gon ve On-page cua trang so voi doi thu." },
    contentGap: { type: "array", items: { type: "string" }, description: "Cac CHU DE CHUNG doi thu CO ma trang muc tieu THIEU (theo search intent). SACH: khong ten thuong hieu/doi thu, khong so thu tu, da gop trung lap, khong muc quang cao. Ngan gon, toi da 8." },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          criterion: { type: "string", description: "Ten tieu chi (vd: Title tag, Meta description, Heading, Schema...)." },
          priority: { type: "string", description: 'Muc do uu tien: "Cao" | "Trung binh" | "Thap".' },
          current: { type: "string", description: "Hien trang cua trang nguoi dung." },
          target: { type: "string", description: "Muc tieu nen dat (tham chieu doi thu/best practice)." },
          action: { type: "string", description: "Hanh dong cu the can lam." },
          why: { type: "string", description: "Ly do/loi ich ngan gon." },
        },
        required: ["criterion", "priority", "action"],
      },
    },
  },
  required: ["recommendations"],
};

// ---- Schema toi uu (viet lai toan bai) ----
export const OPTIMIZE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Title tag moi da toi uu." },
    metaDescription: { type: "string", description: "Meta description moi da toi uu." },
    slug: { type: "string", description: "Goi y URL slug (tuy chon)." },
    optimizedMarkdown: {
      type: "string",
      description:
        "Toan bo bai viet da toi uu o dang Markdown: bat dau bang # H1, dung ## H2, ### H3 hop ly; noi dung day du, tu nhien, giu dung su that & y nghia goc, bo sung chieu sau khi can, dung tu khoa tu nhien.",
    },
    faq: {
      type: "array",
      description: "3-6 cau hoi FAQ lien quan tu khoa (neu phu hop loai bai). Cau tra loi ngan gon, truc tiep, chuan AIO.",
      items: {
        type: "object",
        properties: { question: { type: "string" }, answer: { type: "string" } },
        required: ["question", "answer"],
      },
    },
    imageSuggestions: {
      type: "array",
      description: "Goi y hinh anh cho cac vi tri quan trong (dau bai, sau H2 chinh, truoc ket).",
      items: {
        type: "object",
        properties: {
          position: { type: "string", description: "Vi tri (vd: sau sapo, duoi H2 ...)." },
          alt: { type: "string", description: "Alt text co tu khoa tu nhien, 5-10 tu." },
          caption: { type: "string", description: "Chu thich 1 cau." },
          idea: { type: "string", description: "Loai hinh: infographic / quy trinh / so sanh / thuc te..." },
        },
        required: ["alt", "idea"],
      },
    },
    internalLinks: {
      type: "array",
      description: "Cac vi tri nen chen internal link va anchor goi y.",
      items: {
        type: "object",
        properties: {
          anchor: { type: "string", description: "Anchor text goi y." },
          targetType: { type: "string", description: "Loai trang dich (vd: trang dich vu, bai kien thuc lien quan...)." },
        },
        required: ["anchor", "targetType"],
      },
    },
    externalLinks: {
      type: "array",
      description: "Goi y external link toi nguon UY TIN (bao/nghien cuu/trang chinh thong) de tang E-E-A-T.",
      items: {
        type: "object",
        properties: {
          anchor: { type: "string", description: "Anchor text goi y." },
          source: { type: "string", description: "Loai nguon uy tin (vd: trang y te chinh thong, nghien cuu, bao lon...)." },
        },
        required: ["anchor", "source"],
      },
    },
    wordCount: { type: "integer", description: "So tu cua bai da toi uu (optimizedMarkdown)." },
    mainKeywordCount: { type: "integer", description: "So lan tu khoa CHINH xuat hien trong bai moi." },
    subKeywordCount: { type: "integer", description: "Tong so lan cac tu khoa PHU xuat hien trong bai moi." },
    schemaJsonLd: { type: "string", description: "Code JSON-LD san sang chen vao <head> (BreadcrumbList + Article/WebPage + schema dac thu nganh + FAQPage neu co FAQ). Dien thong tin thuc te." },
    changes: { type: "array", items: { type: "string" }, description: "Danh sach thay doi/cai thien chinh da thuc hien." },
    notes: { type: "string", description: "Ghi chu them." },
  },
  required: ["title", "metaDescription", "optimizedMarkdown"],
};

// ---- Schema CHE DO CRITERIA (chi TRUOC/SAU cua dung cac tieu chi da tick) ----
export const CRITERIA_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      description: "Moi phan tu la 1 tieu chi da tick, kem ban TRUOC va SAU khi toi uu.",
      items: {
        type: "object",
        properties: {
          criterion: { type: "string", description: "Ten tieu chi (dung dung ten nguoi dung da tick)." },
          before: { type: "string", description: "Hien trang cua tieu chi nay tren trang (trich tu du lieu that)." },
          after: { type: "string", description: "Ban da toi uu, san sang dung. Heading -> nhieu dong H1/H2/H3; Title/Meta -> chuoi 1 dong." },
          note: { type: "string", description: "Ghi chu ngan (vi sao/luu y)." },
        },
        required: ["criterion", "before", "after"],
      },
    },
  },
  required: ["items"],
};

// Nhac lai quy tac ngon ngu dau ra o CUOI moi prompt (vi tri gan cuoi -> model bam chac nhat).
// Cac prompt duoi day viet TIENG VIET KHONG DAU cho gon; dau ra BAT BUOC phai CO DAU.
const VN_RULE = `

⚠️ BẮT BUỘC — NGÔN NGỮ ĐẦU RA: Trả về 100% TIẾNG VIỆT CÓ DẤU, đúng chính tả, ở MỌI trường trong JSON (title, meta, heading, nội dung, lý do, ghi chú, hành động...).
KHÔNG được viết tiếng Việt không dấu. Phần hướng dẫn ở trên viết không dấu chỉ để cho gọn — ĐỪNG bắt chước. Tự rà lại lần cuối: còn từ nào thiếu dấu thì sửa cho có dấu rồi mới trả kết quả.`;

// Khoi SKILL + KIEN THUC WEBSITE (ca nhan hoa) - dung chung cho ca 2 che do
function personaBlock(knowledge, skill) {
  let s = "";
  if (skill && skill.trim())
    s += `\n=== SKILL / CHI DAN RIENG CUA NGUOI DUNG (BAT BUOC TUAN THU tuyet doi: giong van, cau truc, quy tac viet, dinh huong noi dung, do & don't) ===\n"""\n${skill.trim()}\n"""\n`;
  if (knowledge && knowledge.trim())
    s += `\n=== KIEN THUC WEBSITE (thong tin THAT ve thuong hieu/USP/dich vu/bac si/cam ket... - dung DUNG de viet dung dinh vi non-commodity, TUYET DOI KHONG bia them) ===\n"""\n${knowledge.trim()}\n"""\n`;
  return s;
}

// ---- Schema CHE DO 3 (de xuat 3 phuong an cho moi tieu chi da tick) ----
export const SUGGEST_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          criterion: { type: "string", description: "Ten tieu chi (dung ten nguoi dung da tick)." },
          options: {
            type: "array",
            description: "Toi da 3 phuong an toi uu tot nhat cho tieu chi nay (cu the, dung chuan SEO). Vd Title -> 3 title; Heading -> 3 dan y H1/H2/H3 (moi option nhieu dong); Meta -> 3 meta...",
            items: { type: "string" },
          },
          note: { type: "string", description: "Ghi chu ngan (vi sao/luu y)." },
        },
        required: ["criterion", "options"],
      },
    },
  },
  required: ["suggestions"],
};

export function buildSuggestPrompt({ target, mainKeyword, subKeywords, selected, bench, extra }) {
  return `TU KHOA CHINH: ${mainKeyword}
TU KHOA PHU: ${(subKeywords || []).join(", ") || "(khong co)"}
${bench ? `Doi thu trung binh ~${bench.wordCount} tu, ${bench.headingCount} heading.` : ""}
${extra && extra.trim() ? `THONG TIN BO SUNG TU NGUOI DUNG:\n"""${extra.trim()}"""\n` : ""}
HIEN TRANG TRANG (Title: ${target.titleTag || "(trong)"} | Meta: ${target.metaDescription || "(trong)"} | H1: ${target.h1Count} | ${target.headingCount} heading | ${target.wordCount} tu | Bo cuc: ${(target.headings || []).slice(0, 15).map((h) => "H" + h.level + ":" + h.text).join(" | ")}):

YEU CAU: CHI cho cac tieu chi nguoi dung da chon: ${(selected && selected.length ? selected.join("; ") : "Title tag; Meta description; Cau truc Heading")}.
Voi MOI tieu chi, dua ra TOI DA 3 PHUONG AN toi uu tot nhat (cu the, san sang dung, dung chuan SEO On-page + AIO, chua tu khoa chinh hop ly, tu nhien tieng Viet, khong van AI).
- Title: 3 title 50-60 ky tu, tu khoa chinh o dau.
- Meta description: 3 meta 140-160 ky tu co CTA.
- Cau truc Heading: 3 dan y heading (H1/H2/H3, moi phuong an la 1 chuoi nhieu dong) bao phu du sub-topic theo intent.
- Cac tieu chi khac: 3 cach lam/giai phap cu the.
KHONG bia so lieu. Tra ve dung schema (suggestions[].options la mang chuoi).${VN_RULE}`;
}

function fmtAudit(a, label) {
  if (!a || !a.ok) return `${label}: (khong doc duoc)`;
  return `${label}: ${a.url}
- Title (${a.titleLen}): ${a.titleTag || "(trong)"}
- Meta desc (${a.metaDescLen}): ${a.metaDescription || "(trong)"}
- Meta robots: ${a.metaRobots} | Canonical: ${a.canonicalSelf ? "tro dung trang" : a.canonical}
- H1: ${a.h1Count} | So heading: ${a.headingCount} | Bo cuc: ${a.headings.slice(0, 12).map((h) => "H" + h.level + ":" + h.text).join(" | ")}
- Schema: ${a.schemaTypes.join(", ") || "khong"} | Breadcrumb: ${a.breadcrumb ? "co" : "khong"} | Rich: ${a.richSnippet.join(", ") || "khong"}
- Anh: ${a.images} (co alt ${a.imagesWithAlt}/${a.images}) | Internal: ${a.internalLinks} | External: ${a.externalLinks} | Video: ${a.hasVideo ? "co" : "khong"}
- Do dai: ${a.wordCount} tu | Mat do tu khoa chinh: ${a.keywordDensity != null ? a.keywordDensity + "%" : "?"} (${a.keywordCount != null ? a.keywordCount : "?"} lan)`;
}

export function buildRecommendPrompt({ target, competitors, bench, mainKeyword, subKeywords }) {
  const comp = competitors.map((c, i) => fmtAudit(c, `Doi thu #${i + 1}`)).join("\n\n");
  return `TU KHOA CHINH: ${mainKeyword}
TU KHOA PHU: ${(subKeywords || []).join(", ") || "(khong co)"}

=== TRANG CUA NGUOI DUNG ===
${fmtAudit(target, "Trang dich")}

=== DOI THU TOP SERP ===
${comp || "(khong co)"}

${bench ? `TRUNG BINH DOI THU: do dai ${bench.wordCount} tu, ${bench.headingCount} heading, ${bench.internalLinks} internal, ${bench.externalLinks} external, title ${bench.titleLen} ky tu, meta ${bench.metaDescLen} ky tu, ${bench.withSchema}/${bench.count} co schema, ${bench.withBreadcrumb}/${bench.count} co breadcrumb.` : ""}

YEU CAU:
1. So sanh tung tieu chi On-page giua trang muc tieu va doi thu (Title, Meta, H1, Heading, Sapo, mat do tu khoa, do dai, Schema, anh/alt, internal/external, video, E-E-A-T, FAQ/social proof).
2. Liet ke CONTENT GAP: cac sub-topic/noi dung doi thu co ma trang muc tieu THIEU (lien quan search intent cua "${mainKeyword}"). QUY TAC BAT BUOC de content gap SACH & co gia tri:
   - CHI neu CHU DE CHUNG. TUYET DOI KHONG kem ten thuong hieu/doi thu (bo cac ten rieng nhu "Up Dental", "I-Dent", "Nha khoa X"...). Neu 1 heading doi thu gan ten thuong hieu, hay TRUU TUONG HOA thanh chu de chung (vd "Nieng rang tra gop cung Up Dental" -> "Chinh sach tra gop khi nieng rang").
   - BO so thu tu/danh so dau muc ("1.", "1.1.", "2)"...).
   - GOP cac muc TRUNG Y NGHIA thanh 1 (vd "Nieng rang 5 trieu co an toan khong?" ≡ "Co the nieng rang 5 trieu khong?" -> 1 muc).
   - BO muc quang cao/dieu huong/CTA (uu dai, tra gop, lien he, dat lich...). Chi giu muc THUC SU huu ich cho nguoi doc dung search intent.
   - Toi da 8 muc, ngan gon.
3. Dua khuyen nghi cu the de dua tu khoa "${mainKeyword}" len top: moi khuyen nghi co priority (Cao/Trung binh/Thap), hien trang, muc tieu (tham chieu doi thu/chuan), hanh dong cu the co the lam ngay, ly do/loi ich. Bao gom ca goi y E-E-A-T va GEO/AIO khi phu hop.
4. Sap xep khuyen nghi tu Cao den Thap. Ngan gon, chinh xac, khong chung chung.${VN_RULE}`;
}

export function buildOptimizePrompt({ target, mainKeyword, subKeywords, selected, bench, extra, optimizeMode, knowledge, skill, outline }) {
  const minWords = bench && bench.wordCount ? Math.max(bench.wordCount, target.wordCount || 0) : (target.wordCount || 800);
  const modeLine = `CHE DO TOI UU: Viet lai TOAN BO bai chuan SEO + ap dung cac tieu chi da chon, lam noi dung tot hon, day du va sau hon.`;
  const outlineBlock = (Array.isArray(outline) && outline.length)
    ? `\n=== BO CUC HEADING BAT BUOC (outline da duoc toi ua & duyet - PHAI BAM DUNG, dung dung thu tu & cap bac; KHONG tu them/bot muc) ===\n${outline.map((o) => `${"#".repeat(Math.min(4, Math.max(1, o.level)))} ${o.text}`).join("\n")}\n`
    : "";
  return `TU KHOA CHINH: ${mainKeyword}
TU KHOA PHU: ${(subKeywords || []).join(", ") || "(khong co)"}
${bench ? `Doi thu trung binh ~${bench.wordCount} tu, ${bench.headingCount} heading.` : ""}
DO DAI YEU CAU: bai MOI phai co IT NHAT ${minWords} tu (bang hoac NHIEU HON trung binh doi thu de chiem uu the thong tin). TUYET DOI khong rut gon noi dung; neu thieu thi bo sung sub-topic/chieu sau co gia tri (lap content gap), khong viet lan man sao rong.

${modeLine}

TIEU CHI CAN TOI UU (nguoi dung chon): ${(selected && selected.length ? selected.join("; ") : "Tat ca tieu chi On-page quan trong")}
${personaBlock(knowledge, skill)}${outlineBlock}${extra && extra.trim() ? `\nTHONG TIN/SO LIEU/YEU CAU BO SUNG TU NGUOI DUNG (BAT BUOC dua vao bai mot cach tu nhien, chinh xac, dung su that nay):\n"""\n${extra.trim()}\n"""\n` : ""}
NOI DUNG GOC (Title: ${target.titleTag || "(trong)"} | Meta: ${target.metaDescription || "(trong)"}):
"""
${target.contentMarkdown || target.contentText || "(khong doc duoc noi dung)"}
"""

YEU CAU: Viet LAI TOAN BO bai chuan SEO Onpage + AIO cho tu khoa "${mainKeyword}", giong nhu mot chuyen gia nguoi Viet that viet, KHONG co dau vet AI.

TITLE & META:
- Title (cung la H1): 50-60 ky tu, tu khoa chinh o DAU, hap dan, co the kem nam/con so/loi ich.
- Meta description: 140-160 ky tu, co tu khoa chinh + CTA mem, KHONG trung nguyen van H1.

SAPO: 1 doan duy nhat 80-120 tu, tu khoa chinh xuat hien dung 1 lan, neu van de/nhu cau cua nguoi doc. KHONG bat dau bang "Trong bai viet nay...", KHONG dung cau truc "X la...".

BO CUC HEADING:
- 1 H1 chua tu khoa chinh. H2/H3 logic, bao phu du sub-topic theo search intent (lap khoang trong content gap so voi doi thu neu hop ly).
- Moi H2/H3 PHAI co it nhat 1 doan van ngay duoi (khong de heading lien heading).
- Heading dang cau hoi: CAU DAU TIEN cua noi dung la cau tra loi truc tiep (chuan Google AI Overview), roi moi giai thich chi tiet.

GIONG VAN (chong van AI cut y - QUAN TRONG):
- Phan giai thich/ly do: cau 15-30 tu, doan >=3-4 cau, trien khai du nghia. Phan tra loi truc tiep/thong so/ket luan: cho phep cau ngan gon.
- Da dang do dai cau; KHONG viet chuoi nhieu cau cuc ngan lien tiep.
- KHONG dung dau "-" de giai thich y giua cau. Tranh lap "quan trong la / dac biet la / nhin chung / tuy nhien". Khong mo dau nhieu cau lien tiep bang "Ban co the".

MAT DO TU KHOA: tu khoa chinh ~1-2% (sapo 1 lan, giua bai 1-2 lan tu nhien, ket 1 lan). MOI tu khoa phu (${(subKeywords || []).join(", ") || "khong co"}) BAT BUOC xuat hien IT NHAT 1 lan trong bai mot cach tu nhien. Dung them bien the LSI; KHONG nhoi nhet, khong in dam tu khoa moi lan xuat hien.

E-E-A-T & noi dung: giu nguyen su that & y chinh ban goc, viet sau hon, mach lac, day du; chi dung so lieu/case CO THAT (ban goc hoac thong tin bo sung nguoi dung). KHONG bia. Voi YMYL (y te/tai chinh/phap ly): khong tuyen bo tuyet doi, them khuyen cao tham khao chuyen gia.

TRA VE:
- optimizedMarkdown: toan bai (bat dau # H1, dung ##/### hop ly, co sapo, co khoi FAQ neu phu hop).
- title, metaDescription, slug.
- wordCount: so tu cua bai moi; mainKeywordCount: so lan tu khoa chinh; subKeywordCount: tong so lan cac tu khoa phu.
- faq: 3-6 Q&A chuan AIO (neu phu hop loai bai).
- imageSuggestions: vi tri + alt + caption + loai hinh.
- internalLinks: anchor + loai trang dich goi y.
- externalLinks: anchor + loai nguon uy tin (E-E-A-T).
- schemaJsonLd: code JSON-LD san sang (BreadcrumbList + Article/WebPage + schema dac thu nganh + FAQPage neu co FAQ).
- changes: cac cai thien chinh.${VN_RULE}`;
}

// ---- CHE DO CRITERIA: chi tra TRUOC/SAU cho DUNG cac tieu chi da tick (khong viet lai ca bai) ----
export function buildCriteriaPrompt({ target, mainKeyword, subKeywords, selected, bench, extra, knowledge, skill }) {
  const sel = (selected && selected.length) ? selected : ["Title tag", "Meta description", "Cau truc Heading"];
  return `TU KHOA CHINH: ${mainKeyword}
TU KHOA PHU: ${(subKeywords || []).join(", ") || "(khong co)"}
${bench ? `Doi thu trung binh ~${bench.wordCount} tu, ${bench.headingCount} heading.` : ""}
${personaBlock(knowledge, skill)}${extra && extra.trim() ? `\nTHONG TIN/SO LIEU BO SUNG (dung dung su that nay):\n"""\n${extra.trim()}\n"""\n` : ""}
DU LIEU THAT CUA TRANG:
- Title (${target.titleLen != null ? target.titleLen : "?"}): ${target.titleTag || "(trong)"}
- Meta description (${target.metaDescLen != null ? target.metaDescLen : "?"}): ${target.metaDescription || "(trong)"}
- H1: ${target.h1Count} | ${target.headingCount} heading | Bo cuc: ${(target.headings || []).slice(0, 20).map((h) => "H" + h.level + ":" + h.text).join(" | ")}
- Do dai: ${target.wordCount} tu | Mat do tu khoa chinh: ${target.keywordDensity != null ? target.keywordDensity + "%" : "?"}

YEU CAU (RAT QUAN TRONG):
- CHI xu ly DUNG cac tieu chi nguoi dung da tick: ${sel.join("; ")}.
- TUYET DOI KHONG dua ra ket qua cho cac tieu chi KHAC ngoai danh sach tren. KHONG viet lai ca bai.
- Voi MOI tieu chi da tick, tra ve 1 phan tu items[] gom:
  • before: hien trang thuc te cua tieu chi do tren trang (trich dung du lieu that o tren).
  • after: ban DA TOI UU tot nhat, san sang dung ngay, dung chuan SEO On-page + AIO, tu nhien tieng Viet, khong van AI, ap dung Skill & Kien thuc website neu co.
  • note: ghi chu ngan (vi sao/luu y).
- Quy uoc "after" theo tung tieu chi: Title -> 1 title 50-60 ky tu tu khoa o dau; Meta -> 1 meta 140-160 ky tu co CTA; Heading/Cau truc -> dan y H1/H2/H3 nhieu dong bao phu du sub-topic; cac tieu chi khac -> noi dung/giai phap cu the ap dung duoc ngay.
- KHONG bia so lieu. Tra ve DUNG schema {items:[{criterion, before, after, note}]}.${VN_RULE}`;
}

// ====== TOI UU CAU TRUC HEADING (GIU / SUA / XOA / THEM) - nhu chuyen gia SEO ======
export const HEADING_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", description: "Search intent chinh cua tu khoa + cac sub-intent BAT BUOC phai phu (dua vao heading doi thu TOP + truy van that)." },
    items: {
      type: "array",
      description: "Quyet dinh cho TUNG heading: giu / sua / xoa / them. PHAI xu ly HET cac heading hien co (khong bo sot).",
      items: {
        type: "object",
        properties: {
          action: { type: "string", description: 'BAT BUOC 1 trong: "keep" (giu nguyen) | "rewrite" (viet lai) | "remove" (xoa/gop) | "add" (them moi).' },
          level: { type: "integer", description: "Cap heading (1,2,3,4) sau khi toi uu." },
          current: { type: "string", description: "Heading HIEN TAI (de trong neu action=add)." },
          suggested: { type: "string", description: "Heading MOI da toi uu (de trong neu action=keep hoac remove)." },
          position: { type: "string", description: "Voi action=add: vi tri chen (vd 'sau H2: Chi phi...'). Voi cac action khac de trong." },
          reason: { type: "string", description: "Ly do NGAN, CU THE. Voi remove: neu ro vi sao lac de / trung lap / lam LOANG noi dung / qua mong / mang tinh quang cao. Voi rewrite: neu ro loi (mo ho, sao rong, nhoi tu khoa, sai cap bac, khong tra loi thang...)." },
          impact: { type: "string", description: 'Muc anh huong SEO: "Cao" | "Trung binh" | "Thap".' },
        },
        required: ["action", "reason"],
      },
    },
    finalOutline: {
      type: "array",
      description: "OUTLINE CUOI CUNG sau khi ap dung het (da bo heading xoa, da thay heading sua, da chen heading them). Thu tu logic theo hanh trinh nguoi doc.",
      items: {
        type: "object",
        properties: {
          level: { type: "integer" },
          text: { type: "string" },
          status: { type: "string", description: '"keep" | "rewrite" | "add" - de danh dau nguon goc.' },
        },
        required: ["level", "text"],
      },
    },
    summary: { type: "string", description: "Tom tat: giu bao nhieu, sua bao nhieu, xoa bao nhieu, them bao nhieu + nhan xet chinh." },
  },
  required: ["items", "finalOutline"],
};

// gscQueries (tuy chon): [{query, clicks, impressions, ctr, position}] - truy van THAT de biet nhu cau nguoi doc
// Khoi tieu chi GEO (Generative Engine Optimization / AI Overview) — DA LINH VUC, dung chung.
export const GEO_RULE = `
TOI UU GEO / AI OVERVIEW (bat buoc, ap dung MOI linh vuc):
- HEADING DANG CAU HOI THEO CHIEN LUOC: uu tien dat heading la CAU HOI dung cach nguoi dung/AI thuc su hoi (bam search intent & long-tail), NHAT LA cac muc nguoi ta hay tra cuu dang cau hoi (la gi, bao nhieu tien, co dau khong, bao lau, nen chon loai nao, quy trinh the nao...). KHONG ep TAT CA thanh cau hoi — muc mang tinh liet ke/bang gia/so sanh van de dang cum danh tu cho tu nhien. Ket hop hai dang mot cach hop ly.
- TRA LOI THANG: ngay duoi heading dang cau hoi, cau/doan dau tien TRA LOI TRUC TIEP y chinh (de AI Overview trich dan), roi moi giai thich sau. Khong lan man mo bai. KHONG ep cau tra loi cung nhac 40 chu neu pha vo mach van.
- CO KHOI FAQ o cuoi (cac cau hoi phu hay gap, dang H2 "Cau hoi thuong gap" + cac H3 la cau hoi), tra loi ngan gon dung trong tam.
- UNIQUE / SPECIFIC / AUTHENTIC: outline nen tao cho o cac muc CO GOC NHIN/DU LIEU RIENG (so lieu cu the, kinh nghiem thuc te, so sanh doc quyen) thay vi chi dinh nghia chung chung (tranh "commodity content").
- FORMAT theo noi dung: muc so sanh/gia -> bang; muc uu diem/luu y/danh sach -> bullet; quy trinh -> danh sach danh so; muc giai thich co che -> doan van. (Format la goi y trong ly do, khong bat buoc ghi vao text heading.)`;

export function buildHeadingPrompt({ target, competitors, bench, mainKeyword, subKeywords, knowledge, skill, gscQueries, consensusText, archetypeText }) {
  const cur = (target.headings || []).map((h, i) => `  ${i + 1}. H${h.level}: ${h.text}`).join("\n");
  const comp = (competitors || []).filter((c) => c && c.ok).map((c, i) => {
    const hs = (c.headings || []).slice(0, 20).map((h) => `     H${h.level}: ${h.text}`).join("\n");
    return `  Doi thu #${i + 1} (${c.host || c.url}) - ${c.wordCount || "?"} tu:\n${hs || "     (khong lay duoc)"}`;
  }).join("\n\n");
  const gq = (gscQueries || []).slice(0, 20).map((q) => `  - "${q.query}": ${q.impressions || 0} impr, ${q.clicks || 0} clicks, vi tri ${q.position != null ? Number(q.position).toFixed(1) : "?"}`).join("\n");

  return `TU KHOA CHINH: ${mainKeyword}
TU KHOA PHU: ${(subKeywords || []).join(", ") || "(khong co)"}
${bench ? `Trung binh doi thu: ${bench.wordCount} tu, ${bench.headingCount} heading.` : ""}
${personaBlock(knowledge, skill)}
=== OUTLINE HIEN TAI CUA BAI (chi trong vung noi dung chinh) ===
${cur || "  (bai chua co heading nao)"}

=== OUTLINE CUA DOI THU TOP SERP ===
${comp || "  (khong co)"}
${archetypeText ? `\n${archetypeText}\n` : ""}${consensusText ? `\n${consensusText}\n` : ""}${gq ? `\n=== TRUY VAN THAT NGUOI DUNG DANG TIM (Google Search Console) ===\n${gq}\n` : ""}
NHIEM VU: TOI UU TOAN DIEN CAU TRUC HEADING nhu mot chuyen gia SEO Onpage + SEO Content (ap dung phuong phap onpage-competitor-analysis va nguyen tac SEO content DA LINH VUC — tu nhan dien linh vuc cua bai, KHONG ap cung 1 nganh).
${archetypeText ? `
⚠️ LUAT SO 0 — DANG CAU TRUC BAI PHAI KHOP TOP SERP (xet TRUOC khi soi tung heading):
- Khoi "DANG CAU TRUC MA TOP SERP DANG DUNG" o tren cho biet Google dang thuong DANG BAI nao cho tu khoa. finalOutline PHAI di theo dung dang do.
- Sai dang cau truc = sai intent tu goc: du tung heading nghe hop ly, bai van kho len top. Vi du TOP SERP la TOPLIST/LIET KE ma bai dang di kieu giai thich khai niem -> phai TAI CAU TRUC ve dang danh sach (them cac muc hang muc, bo bot phan dinh nghia dai dong), chu khong phai sua vai chu trong heading.
- Neu phai tai cau truc: dung du 4 action (remove muc khong con hop dang bai, rewrite muc can doi goc nhin, add cac muc dac trung cua dang bai do), va ghi RO ly do "lech dang bai so voi TOP SERP" o cac muc lien quan. Danh impact "Cao" cho cac thay doi nay.
- Neu bai DA dung dang: giu nguyen khuon dang, chi tinh chinh ben trong — KHONG duoc doi sang dang khac.
- Voi dang TOPLIST: KHONG duoc be nguyen ten thuong hieu/don vi ma doi thu liet ke vao bai nay (do la doi thu cua website). Dat hang muc theo tieu chi/nhom hoac de dang khung de nguoi viet tu dien, tru khi ten do co san trong KIEN THUC WEBSITE.
` : ""}${consensusText ? `
⚠️ LUAT SO 1 — SEARCH INTENT CHUNG THANG MOI THU KHAC:
- Bang "DIEM CHUNG OUTLINE DOI THU" o tren la thu Google DANG THUONG cho tu khoa nay. MOI cum ghi [BAT BUOC] PHAI xuat hien trong finalOutline: bai da co -> keep/rewrite cho sat intent; bai dang thieu -> BAT BUOC action "add".
- TUYET DOI KHONG duoc "remove" mot heading dang phuc vu cum [BAT BUOC] (chi duoc rewrite cho tot hon, hoac gop 2 heading trung nhau THANH 1 heading van phuc vu cum do).
- Neu ban thay mot cum [BAT BUOC] khong hop voi bai, VAN PHAI dua vao (co the doi cach dien dat / doi cap H2-H3), vi do la nhu cau tim kiem THAT — khong phai y kien chu quan.
- KIEN THUC WEBSITE / SKILL chi duoc dung de: (a) lam SAU va KHAC BIET ben trong cac muc cot loi tren, (b) them TOI DA 2 muc rieng (goc nhin/du lieu doc quyen) dat SAU cac muc cot loi. KHONG duoc thay the, cat bot hay day cac muc cot loi xuong duoi. Ca nhan hoa la LOP PHU, khong phai lop thay the.
- THU TU finalOutline bam theo "vi tri TB trong bai doi thu" (nho -> lon) de dung hanh trinh tim kiem, tru khi co ly do logic ro rang.
- Cum ghi [tuy chon] (it doi thu co): chi them khi that su phuc vu intent hoac la the manh rieng cua website.
` : ""}
QUY TRINH BAT BUOC:
BUOC 1 — Xac dinh SEARCH INTENT cua "${mainKeyword}" + liet ke cac SUB-INTENT bat buoc phai phu (${consensusText ? "LAY TRUC TIEP tu bang DIEM CHUNG o tren — moi cum [BAT BUOC] la 1 sub-intent" : "bam heading doi thu TOP"}${gq ? " + truy van that GSC" : ""}).
BUOC 2 — SOI TUNG HEADING HIEN CO (phai xu ly HET, khong bo sot), gan DUNG 1 action:
  • "keep": phuc vu dung intent, dien dat tot, doi thu cung co hoac la the manh rieng.
  • "rewrite": DUNG chu de nhung DIEN DAT KEM -> viet lai. Cac loi can bat: mo ho/chung chung; sao rong; NHOI TU KHOA; sai cap bac (H3 le loi, H2 dang le la H3); dang cau hoi nhung khong tra loi thang; qua dai/qua ngan; khong chua tu khoa/bien the khi can.
  • "remove": KHONG phuc vu intent -> XOA hoac GOP. Bat cac truong hop: LAC DE; TRUNG LAP y voi heading khac; noi dung QUA MONG khong dang 1 muc rieng; mang tinh QUANG CAO/ban hang lam LOANG noi dung; muc phu tro vun vat lam loang trong tam. PHAI neu ro ly do lam loang.
BUOC 3 — THEM heading con THIEU. ${consensusText ? 'BAT DAU tu bang DIEM CHUNG: MOI cum [BAT BUOC] dang "bai DANG THIEU" -> PHAI co 1 item action="add" tuong ung (dien dat lai cho tu nhien & hop giong bai, khong copy nguyen van doi thu). Sau do moi xet cum [tuy chon]' : "Uu tien theo DIEM CHUNG: y/heading ma NHIEU doi thu TOP cung co (sau khi gop dong nghia) = tin hieu MANH ve intent -> nen them neu bai dang thieu. Y chi 1 doi thu co thi chi them khi that su can cho intent"}${gq ? " + nhu cau tu truy van GSC" : ""}. Ghi ro vi tri chen.
BUOC 4 — Dung finalOutline: outline CUOI sau khi ap dung het (bo cai xoa, thay cai sua, chen cai them).
  ${archetypeText ? "• DUNG DANG BAI: finalOutline phai doc len ra dung DANG CAU TRUC ma TOP SERP dang dung (xem LUAT SO 0). Tu kiem tra lai dieu nay TRUOC TIEN.\n  " : ""}• BAT BUOC: phu DU ${consensusText ? "100% cac cum [BAT BUOC]" : "cac y ma nhieu doi thu cung co"} — day la dieu kien khong the thieu. Truoc khi tra ket qua, HAY TU KIEM TRA lai: doi chieu tung cum [BAT BUOC] voi finalOutline, thieu cum nao thi bo sung ngay.
  • CO DONG: ngoai cac muc cot loi tren, KHONG them heading cho "du nhieu"; moi muc them phai phuc vu intent hoac la the manh rieng.
  • THU TU: bam hanh trinh tim kiem cua nguoi dung (theo vi tri TB cua doi thu; thong thuong: nhan dien/khai niem -> phan loai/lua chon -> quy trinh -> chi phi -> luu y/rui ro -> danh gia/dia chi -> FAQ).

NGUYEN TAC (moi linh vuc):
- Dung 1 H1 chua tu khoa chinh. Phan cap logic: H3 phai thuoc 1 H2; cha co 0 hoac >=2 con (khong de con don le).
- KHONG nhoi tu khoa vao moi heading — dung bien the/LSI tu nhien.
- Heading dang cau hoi: noi dung ngay duoi tra loi THANG (chuan Google AI Overview).
- Uu tien muc CO NHU CAU TIM KIEM THAT; cat bo muc lan man/quang cao.
- E-E-A-T: voi linh vuc YMYL (y te/tai chinh/phap ly) can co muc the hien kinh nghiem/chuyen mon/dan nguon.
- Giong tu nhien nhu chuyen gia nguoi Viet viet, KHONG sao rong, KHONG dau vet AI.
${skill && skill.trim() ? "- TUAN THU tuyet doi SKILL cua nguoi dung o tren (giong van, cau truc, quy tac) — nhung KHONG duoc vi Skill ma bo qua cac muc phuc vu search intent chung.\n" : ""}${knowledge && knowledge.trim() ? "- Van dung KIEN THUC WEBSITE de dat muc the hien the manh rieng (non-commodity), khong bia. LUU Y: kien thuc website la LOP LAM SAU/KHAC BIET, KHONG duoc thay the cac muc cot loi ma doi thu TOP deu co.\n" : ""}${GEO_RULE}

Khi dat finalOutline: AP DUNG GEO o tren — heading chinh & FAQ uu tien dang cau hoi dung intent, nhung van co muc cum danh tu cho tu nhien.
KHONG bia so lieu. Tra ve DUNG schema (items co du keep/rewrite/remove/add + finalOutline).${VN_RULE}`;
}

// ====== AI DANH GIA ONPAGE dua tren SO LIEU GSC THAT + DOI THU (bao cao tong hop) ======
export const EVALUATE_SCHEMA = {
  type: "object",
  properties: {
    overview: { type: "string", description: "Nhan xet tong quan KHACH QUAN ve hieu qua Onpage cua URL: dua tren so lieu GSC that + so sanh doi thu. 3-5 cau." },
    performance: { type: "string", description: "Danh gia hieu suat tim kiem tu GSC: clicks/impressions/CTR/vi tri trung binh; xu huong TANG/GIAM so voi ky truoc (neu co); thiet bi & quoc gia dang manh/yeu." },
    opportunities: {
      type: "array",
      description: "Co hoi tu GSC: truy van co IMPRESSION cao nhung CTR thap hoac VI TRI 5-20 (gan trang 1) -> toi uu title/meta/noi dung de bat duoc traffic.",
      items: {
        type: "object",
        properties: {
          query: { type: "string", description: "Truy van thuc te tu GSC." },
          insight: { type: "string", description: "Vi sao la co hoi (vd: 1200 impression, CTR 0.8%, vi tri 8.5)." },
          action: { type: "string", description: "Hanh dong cu the de khai thac." },
        },
        required: ["insight", "action"],
      },
    },
    onpageGaps: { type: "array", items: { type: "string" }, description: "Diem yeu Onpage so voi doi thu (content gap, tieu chi thieu) can cai thien - bam bang so sanh." },
    actions: {
      type: "array",
      description: "Viec can lam theo thu tu uu tien, KET HOP ca tin hieu GSC va onpage/doi thu.",
      items: {
        type: "object",
        properties: {
          priority: { type: "string", description: '"Cao" | "Trung binh" | "Thap".' },
          action: { type: "string", description: "Hanh dong cu the." },
          why: { type: "string", description: "Ly do (bam so lieu GSC hoac khoang cach doi thu)." },
        },
        required: ["priority", "action"],
      },
    },
  },
  required: ["overview", "actions"],
};

// gsc: { rangeLabel, totals:{clicks,impressions,ctr,position}, prevTotals?, queries:[{query,clicks,impressions,ctr,position}], devices:[{k,clicks,impressions,ctr}], countries:[...] }
export function buildEvaluatePrompt({ target, competitors, bench, mainKeyword, subKeywords, recommendations, gsc }) {
  const comp = (competitors || []).map((c, i) => fmtAudit(c, `Doi thu #${i + 1}`)).join("\n\n");
  const pct = (x) => (x == null ? "?" : (x * 100).toFixed(1) + "%");
  const pos = (x) => (x == null ? "?" : Number(x).toFixed(1));
  const g = gsc || {};
  const t = g.totals || {};
  const pv = g.prevTotals;
  const delta = pv ? `(ky truoc: ${pv.clicks} clicks, ${pv.impressions} impr, CTR ${pct(pv.ctr)}, vi tri ${pos(pv.position)})` : "(khong co ky truoc de so sanh)";
  const qLines = (g.queries || []).slice(0, 25).map((q) => `  - "${q.query}": ${q.clicks} clicks | ${q.impressions} impr | CTR ${pct(q.ctr)} | vi tri ${pos(q.position)}`).join("\n");
  const dLines = (g.devices || []).map((d) => `  - ${d.k}: ${d.clicks} clicks | ${d.impressions} impr | CTR ${pct(d.ctr)}`).join("\n");
  const cLines = (g.countries || []).slice(0, 8).map((d) => `  - ${d.k}: ${d.clicks} clicks | ${d.impressions} impr | CTR ${pct(d.ctr)}`).join("\n");
  const recLines = (recommendations || []).slice(0, 15).map((r) => `  - [${r.priority || "?"}] ${r.criterion}: ${r.action || ""}`).join("\n");

  return `Ban dang lam CONG CU tu dong danh gia Onpage. Ket hop 3 nguon: (1) SO LIEU GSC THAT cua URL, (2) SO SANH DOI THU tren SERP, (3) khuyen nghi tieu chi. Dua ra danh gia KHACH QUAN, bam so lieu, KHONG chung chung.

TU KHOA CHINH: ${mainKeyword}
TU KHOA PHU: ${(subKeywords || []).join(", ") || "(khong co)"}

=== SO LIEU GOOGLE SEARCH CONSOLE (khoang: ${g.rangeLabel || "?"}) ===
Tong: ${t.clicks || 0} clicks | ${t.impressions || 0} impressions | CTR ${pct(t.ctr)} | vi tri TB ${pos(t.position)} ${delta}
TOP TRUY VAN (thuc te nguoi dung dang tim & thay URL nay):
${qLines || "  (khong co du lieu)"}
THEO THIET BI:
${dLines || "  (khong co)"}
THEO QUOC GIA:
${cLines || "  (khong co)"}

=== TRANG CUA NGUOI DUNG (audit onpage) ===
${fmtAudit(target, "Trang dich")}

=== DOI THU TOP SERP ===
${comp || "(khong co)"}
${bench ? `\nTRUNG BINH DOI THU: ${bench.wordCount} tu, ${bench.headingCount} heading, ${bench.internalLinks} internal, ${bench.withSchema}/${bench.count} co schema.` : ""}
${recLines ? `\n=== KHUYEN NGHI TIEU CHI (tu audit) ===\n${recLines}` : ""}

YEU CAU (theo phuong phap onpage-competitor-analysis):
1. overview: danh gia tong quan URL dang manh/yeu the nao (bam ca GSC lan doi thu).
2. performance: doc hieu suat GSC — nhan xet xu huong (tang/giam so ky truoc), thiet bi/quoc gia.
3. opportunities: TIM truy van co IMPRESSION cao ma CTR thap (title/meta chua hap dan) HOAC vi tri 5-20 (sap len trang 1) — moi cai kem hanh dong toi uu cu the. Day la phan gia tri nhat.
4. onpageGaps: khoang cach onpage so voi doi thu (content gap, do dai, schema, internal link, E-E-A-T...).
5. actions: tong hop viec can lam theo uu tien Cao/TB/Thap, KET HOP tin hieu GSC (co hoi) + khoang cach doi thu. Cu the, lam duoc ngay.
KHONG bia so lieu; chi dung con so GSC & audit o tren.${VN_RULE}`;
}

// ====== Khuyen nghi CO HOC (Local - khong AI) ======
const PR = { CAO: "Cao", TB: "Trung binh", THAP: "Thap" };
function norm(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d");
}
function hasKw(text, kw) {
  return norm(text).includes(norm(kw));
}

export function mechanicalRecommendations({ target, bench, mainKeyword }) {
  const recs = [];
  const add = (criterion, priority, current, target_, action, why) =>
    recs.push({ criterion, priority, current, target: target_, action, why });

  const t = target;
  // Title
  if (!t.titleTag) add("Title tag", PR.CAO, "Không có title", "50-60 ký tự, có từ khóa", "Thêm title tag chứa từ khóa chính.", "Title là yếu tố on-page quan trọng nhất.");
  else {
    if (!hasKw(t.titleTag, mainKeyword)) add("Title tag", PR.CAO, t.titleTag, `Có chứa "${mainKeyword}"`, `Đưa từ khóa "${mainKeyword}" vào title (gần đầu).`, "Từ khóa trong title tăng liên quan mạnh.");
    if (t.titleLen < 30 || t.titleLen > 65) add("Độ dài Title", PR.TB, `${t.titleLen} ký tự`, "50-60 ký tự", "Điều chỉnh độ dài title.", "Tránh bị cắt trên SERP.");
  }
  // Meta description
  if (!t.metaDescription) add("Meta description", PR.CAO, "Không có", "120-160 ký tự, có từ khóa & CTA", "Viết meta description hấp dẫn chứa từ khóa.", "Tăng tỉ lệ click (CTR).");
  else if (t.metaDescLen < 70 || t.metaDescLen > 165) add("Meta description", PR.TB, `${t.metaDescLen} ký tự`, "120-160 ký tự", "Điều chỉnh độ dài meta description.", "Hiển thị đầy đủ trên SERP.");
  else if (!hasKw(t.metaDescription, mainKeyword)) add("Meta description", PR.TB, "Thiếu từ khóa", `Chứa "${mainKeyword}"`, "Chèn từ khóa chính vào meta description.", "Tăng liên quan & CTR.");
  // H1
  if (t.h1Count !== 1) add("Thẻ H1", PR.CAO, `${t.h1Count} thẻ H1`, "Đúng 1 thẻ H1", "Chỉ dùng 1 H1 chứa từ khóa chính.", "Cấu trúc heading chuẩn giúp Google hiểu chủ đề.");
  // Heading structure
  if (bench && t.headingCount < Math.round(bench.headingCount * 0.6)) add("Cấu trúc Heading", PR.TB, `${t.headingCount} heading`, `~${bench.headingCount} (như đối thủ)`, "Bổ sung H2/H3 chia nhỏ nội dung.", "Bố cục rõ giúp đọc & xếp hạng tốt hơn.");
  // Canonical
  if (t.canonical === "(không có)") add("Canonical", PR.TB, "Không có", "Trỏ đúng URL trang", "Thêm thẻ canonical tự trỏ.", "Tránh trùng lặp nội dung.");
  // Robots
  if (/noindex/i.test(t.metaRobots)) add("Meta robots", PR.CAO, t.metaRobots, "index, follow", "Bỏ noindex để trang được index.", "noindex khiến trang không lên SERP.");
  // Schema
  if (!t.hasSchema) add("Schema / Structured data", PR.TB, "Không có", "Có Article/FAQ/Breadcrumb...", "Thêm structured data phù hợp.", "Tăng cơ hội Rich Snippet.");
  // Breadcrumb
  if (!t.breadcrumb && bench && bench.withBreadcrumb > 0) add("Breadcrumb", PR.THAP, "Không có", "Có breadcrumb", "Thêm breadcrumb điều hướng.", "Cải thiện điều hướng & hiển thị SERP.");
  // Alt
  if (!t.altEnough) add("Alt hình ảnh", PR.TB, `${t.imagesNoAlt}/${t.images} ảnh thiếu alt`, "100% ảnh có alt", "Thêm alt mô tả (kèm từ khóa khi hợp lý).", "Hỗ trợ SEO ảnh & accessibility.");
  // Word count
  if (bench && t.wordCount < Math.round(bench.wordCount * 0.7)) add("Độ dài nội dung", PR.CAO, `${t.wordCount} từ`, `~${bench.wordCount} từ (như đối thủ)`, "Bổ sung nội dung sâu, hữu ích.", "Nội dung mỏng hơn đối thủ khó cạnh tranh.");
  // Internal links
  if (bench && t.internalLinks < Math.round(bench.internalLinks * 0.6)) add("Internal link", PR.TB, `${t.internalLinks} link`, `~${bench.internalLinks} link`, "Thêm internal link tới bài liên quan.", "Phân bổ liên kết & giữ chân người đọc.");
  // External
  if (t.externalLinks === 0 && bench && bench.externalLinks > 0) add("External link", PR.THAP, "0 link ngoài", "Có link tới nguồn uy tín", "Thêm 1-2 external link uy tín khi cần.", "Tăng độ tin cậy nội dung.");

  const order = { Cao: 0, "Trung binh": 1, Thap: 2 };
  recs.sort((a, b) => order[a.priority] - order[b.priority]);
  return recs;
}

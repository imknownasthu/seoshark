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

Luôn bám DỮ LIỆU AUDIT thực tế của trang mục tiêu & đối thủ. Ngắn gọn, chính xác, ưu tiên theo mức ảnh hưởng xếp hạng. KHÔNG nhồi từ khóa, KHÔNG bịa số liệu/case.`;

// ---- Schema khuyen nghi (cho Gemini responseSchema / Claude tool) ----
export const RECOMMEND_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Nhan xet tong quan ngan gon ve On-page cua trang so voi doi thu." },
    contentGap: { type: "array", items: { type: "string" }, description: "Cac sub-topic/noi dung doi thu CO ma trang muc tieu THIEU (lien quan search intent). Cu the, ngan gon." },
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
    schemaJsonLd: { type: "string", description: "Code JSON-LD san sang chen vao <head> (BreadcrumbList + Article/WebPage + schema dac thu nganh + FAQPage neu co FAQ). Dien thong tin thuc te." },
    changes: { type: "array", items: { type: "string" }, description: "Danh sach thay doi/cai thien chinh da thuc hien." },
    notes: { type: "string", description: "Ghi chu them." },
  },
  required: ["title", "metaDescription", "optimizedMarkdown"],
};

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
2. Liet ke CONTENT GAP: cac sub-topic/noi dung doi thu co ma trang muc tieu thieu (lien quan search intent cua "${mainKeyword}").
3. Dua khuyen nghi cu the de dua tu khoa "${mainKeyword}" len top: moi khuyen nghi co priority (Cao/Trung binh/Thap), hien trang, muc tieu (tham chieu doi thu/chuan), hanh dong cu the co the lam ngay, ly do/loi ich. Bao gom ca goi y E-E-A-T va GEO/AIO khi phu hop.
4. Sap xep khuyen nghi tu Cao den Thap. Ngan gon, chinh xac, khong chung chung.`;
}

export function buildOptimizePrompt({ target, mainKeyword, subKeywords, selected, bench, extra, optimizeMode }) {
  const minWords = bench && bench.wordCount ? Math.max(bench.wordCount, target.wordCount || 0) : (target.wordCount || 800);
  const modeLine = optimizeMode === "criteria"
    ? `CHE DO TOI UU: CHI sua/toi uu DUNG cac tieu chi nguoi dung da chon ben duoi. GIU NGUYEN cang nhieu cang tot phan con lai cua bai (khong viet lai cac phan khong lien quan).`
    : `CHE DO TOI UU: Viet lai TOAN BO bai chuan SEO + ap dung cac tieu chi da chon, lam noi dung tot hon, day du va sau hon.`;
  return `TU KHOA CHINH: ${mainKeyword}
TU KHOA PHU: ${(subKeywords || []).join(", ") || "(khong co)"}
${bench ? `Doi thu trung binh ~${bench.wordCount} tu, ${bench.headingCount} heading.` : ""}
DO DAI YEU CAU: bai MOI phai co IT NHAT ${minWords} tu (bang hoac NHIEU HON trung binh doi thu de chiem uu the thong tin). TUYET DOI khong rut gon noi dung; neu thieu thi bo sung sub-topic/chieu sau co gia tri (lap content gap), khong viet lan man sao rong.

${modeLine}

TIEU CHI CAN TOI UU (nguoi dung chon): ${(selected && selected.length ? selected.join("; ") : "Tat ca tieu chi On-page quan trong")}
${extra && extra.trim() ? `\nTHONG TIN/SO LIEU/YEU CAU BO SUNG TU NGUOI DUNG (BAT BUOC dua vao bai mot cach tu nhien, chinh xac, dung su that nay):\n"""\n${extra.trim()}\n"""\n` : ""}
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

MAT DO TU KHOA: tu khoa chinh ~1-2% (sapo 1 lan, giua bai 1-2 lan tu nhien, ket 1 lan); rai tu khoa phu & bien the LSI tu nhien; KHONG nhoi nhet, khong in dam tu khoa moi lan xuat hien.

E-E-A-T & noi dung: giu nguyen su that & y chinh ban goc, viet sau hon, mach lac, day du; chi dung so lieu/case CO THAT (ban goc hoac thong tin bo sung nguoi dung). KHONG bia. Voi YMYL (y te/tai chinh/phap ly): khong tuyen bo tuyet doi, them khuyen cao tham khao chuyen gia.

TRA VE:
- optimizedMarkdown: toan bai (bat dau # H1, dung ##/### hop ly, co sapo, co khoi FAQ neu phu hop).
- title, metaDescription, slug.
- faq: 3-6 Q&A chuan AIO (neu phu hop loai bai).
- imageSuggestions: vi tri + alt + caption + loai hinh.
- internalLinks: anchor + loai trang dich goi y.
- schemaJsonLd: code JSON-LD san sang (BreadcrumbList + Article/WebPage + schema dac thu nganh + FAQPage neu co FAQ).
- changes: cac cai thien chinh.`;
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

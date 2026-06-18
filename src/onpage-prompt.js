// src/onpage-prompt.js
// Prompt + schema cho phan tich/khuyen nghi & toi uu On-page (dung Gemini/Claude),
// va bo khuyen nghi CO HOC (fallback khi dung Local - mien phi).

export const ONPAGE_SYSTEM = `Ban la chuyen gia SEO On-page nguoi Viet, nam vung tai lieu Google Search (SEO Starter Guide, Helpful Content, AI/Generative Engine Optimization) va phuong phap On-page cua Semrush/Ahrefs.

Nguyen tac danh gia On-page:
- Title tag: chua tu khoa chinh, ~50-60 ky tu, hap dan, duy nhat.
- Meta description: ~120-160 ky tu, co tu khoa chinh & loi keu goi, mo ta dung noi dung.
- Chi 1 the H1, chua tu khoa chinh; H2/H3 chia bo cuc ro rang, logic, phu tu khoa phu.
- Canonical tro dung trang; meta robots khong vo tinh noindex/nofollow.
- Schema/structured data phu hop (Article, FAQPage, Breadcrumb, Product...) de co Rich Snippet.
- Breadcrumb ro rang. Alt anh day du & mo ta dung (kem tu khoa khi hop ly).
- Noi dung huu ich, sau, dap ung y dinh tim kiem; do dai canh tranh duoc voi doi thu.
- Internal link hop ly tro toi trang lien quan; external link toi nguon uy tin khi can.
- Toi uu cho ca tim kiem truyen thong va AI/GEO: tra loi truc tiep, ro rang, co cau truc, dang tin cay.

Luon dua tren du lieu audit thuc te cua trang nguoi dung va doi thu de khuyen nghi. Ngan gon, chinh xac, uu tien theo muc do anh huong xep hang.`;

// ---- Schema khuyen nghi (cho Gemini responseSchema / Claude tool) ----
export const RECOMMEND_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Nhan xet tong quan ngan gon ve On-page cua trang so voi doi thu." },
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
    changes: { type: "array", items: { type: "string" }, description: "Danh sach thay doi chinh da thuc hien." },
    notes: { type: "string", description: "Ghi chu them (vd goi y schema, alt anh...)." },
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
- Anh: ${a.images} (co alt ${a.imagesWithAlt}/${a.images}) | Internal: ${a.internalLinks} | External: ${a.externalLinks}
- Do dai (tu): ${a.wordCount}`;
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

YEU CAU: So sanh tung tieu chi On-page giua trang nguoi dung va doi thu. Dua ra danh sach khuyen nghi cu the de cai thien On-page va dua tu khoa "${mainKeyword}" len top. Moi khuyen nghi co priority (Cao/Trung binh/Thap), hien trang, muc tieu, hanh dong, ly do. Sap xep tu Cao den Thap.`;
}

export function buildOptimizePrompt({ target, mainKeyword, subKeywords, selected, bench, extra }) {
  return `TU KHOA CHINH: ${mainKeyword}
TU KHOA PHU: ${(subKeywords || []).join(", ") || "(khong co)"}
${bench ? `Doi thu trung binh ~${bench.wordCount} tu, ${bench.headingCount} heading.` : ""}

TIEU CHI CAN TOI UU (nguoi dung chon): ${(selected && selected.length ? selected.join("; ") : "Tat ca tieu chi On-page quan trong")}
${extra && extra.trim() ? `\nTHONG TIN/SO LIEU/YEU CAU BO SUNG TU NGUOI DUNG (BAT BUOC dua vao bai mot cach tu nhien, chinh xac, dung su that nay):\n"""\n${extra.trim()}\n"""\n` : ""}
NOI DUNG GOC (Title: ${target.titleTag || "(trong)"} | Meta: ${target.metaDescription || "(trong)"}):
"""
${target.contentMarkdown || target.contentText || "(khong doc duoc noi dung)"}
"""

YEU CAU: Viet LAI TOAN BO bai viet chuan SEO On-page nham toi uu cho tu khoa "${mainKeyword}".
- Title tag & meta description moi hap dan, dung do dai, chua tu khoa chinh.
- Bo cuc heading ro rang: 1 H1 chua tu khoa chinh, cac H2/H3 logic, phu tu khoa phu tu nhien.
- Noi dung GIU NGUYEN su that & y chinh cua ban goc, viet lai mach lac, day du, sau hon, dap ung y dinh tim kiem; bo sung phan con thieu so voi doi thu neu hop ly. KHONG bia so lieu/su that moi (tru thong tin bo sung nguoi dung cung cap o tren).
- Neu co thong tin bo sung tu nguoi dung, hay LONG GHEP day du va chinh xac vao bai.
- Tu khoa rai tu nhien, khong nhoi nhet. Toi uu cho ca SEO truyen thong va AI/GEO (tra loi truc tiep, ro rang).
- Tra ve title, metaDescription va optimizedMarkdown (bat dau bang # H1, dung ## / ### cho cac muc).`;
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

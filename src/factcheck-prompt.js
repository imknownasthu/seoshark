// src/factcheck-prompt.js
// Tinh nang "Check du lieu - bo sung nguon uy tin".
// Muc tieu: TANG suc thuyet phuc & tinh Specific cua bai bang SO LIEU THAT tu nguon uy tin,
// va KIEM CHUNG cac so lieu dang co. Ap phuong phap skill nha-khoa-shark-seo-content (E-E-A-T/YMYL).
// NGUYEN TAC: khong bia so lieu/URL; BAT BUOC dung web search that; uu tien nguon Viet Nam roi quoc te.

// ===== DANH SACH NGUON UY TIN (uu tien 1 = VN, uu tien 2 = quoc te) =====
export const VN_SOURCES = ["moh.gov.vn", "nhthcm.gov.vn", "radi.org.vn", "benhvienranghammat.vn"];
export const INTL_SOURCES = [
  "who.int", "ada.org", "jada.ada.org", "mouthhealthy.org", "fdiworlddental.org",
  "efp.org", "iti.org", "pubmed.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov", "cochranelibrary.com",
  "sciencedirect.com", "onlinelibrary.wiley.com", "mdpi.com", "wolterskluwer.com", "journals.elsevier.com",
];
// Rank: 2 = VN (uu tien nhat), 1 = quoc te uy tin, 0 = khac
export function sourceRank(host) {
  const h = String(host || "").toLowerCase().replace(/^www\./, "");
  if (VN_SOURCES.some((s) => h === s || h.endsWith("." + s))) return 2;
  if (INTL_SOURCES.some((s) => h === s || h.endsWith("." + s))) return 1;
  return 0;
}
const SOURCE_GUIDE =
  "CHỈ ĐƯỢC DÙNG các NGUỒN UY TÍN sau — KHÔNG dùng bất kỳ website nào khác (blog, báo lá cải, trang phòng khám, wiki...):\n" +
  "• Ưu tiên 1 (Việt Nam): Bộ Y tế (moh.gov.vn), Viện RHM TP.HCM (nhthcm.gov.vn), Hội RHM Việt Nam (radi.org.vn), BV RHM Trung ương (benhvienranghammat.vn).\n" +
  "• Ưu tiên 2 (quốc tế — dùng khi VN không có dữ liệu): WHO (who.int), ADA/JADA (ada.org, jada.ada.org, mouthhealthy.org), FDI (fdiworlddental.org), EFP (efp.org), ITI (iti.org), PubMed/NCBI (pubmed.ncbi.nlm.nih.gov, ncbi.nlm.nih.gov), Cochrane (cochranelibrary.com), tạp chí chuyên ngành (sciencedirect.com, onlinelibrary.wiley.com, mdpi.com, journals.elsevier.com), Wolters Kluwer (wolterskluwer.com).\n" +
  "LƯU Ý: các nguồn này có cả bản TIẾNG ANH lẫn TIẾNG VIỆT — cần đọc số liệu cẩn thận, chính xác ở CẢ hai ngôn ngữ. Số liệu phải lấy ĐÚNG từ bài viết trong các nguồn trên; không suy diễn, không lấy từ nơi khác.";

export const FACTCHECK_SYSTEM =
  "Bạn là chuyên gia kiểm chứng dữ liệu (fact-checker) và biên tập nội dung SEO y tế/nha khoa theo chuẩn E-E-A-T và YMYL của Google. " +
  "Nhiệm vụ: giúp bài viết THUYẾT PHỤC và SPECIFIC hơn bằng SỐ LIỆU THẬT từ tổ chức uy tín, đồng thời kiểm chứng số liệu đang có. " +
  "NGUYÊN TẮC BẤT DI BẤT DỊCH: (1) KHÔNG bao giờ bịa số liệu hay URL; chỉ dùng con số & nguồn CÓ THẬT trong kết quả tìm kiếm được cung cấp. " +
  "(2) KHÔNG ước lượng đại khái rồi gán nguồn giả. (3) Nếu không tìm được nguồn thật xác nhận → nói rõ, KHÔNG chèn số. " +
  "(4) Diễn đạt số liệu NGẮN GỌN, TỰ NHIÊN, hòa vào câu văn (paraphrase, không copy nguyên văn, không dài dòng). " +
  "Luôn trả lời tiếng Việt CÓ DẤU đầy đủ, chuẩn chính tả.";

// ---- GIAI DOAN A: Doc noi dung -> liet ke (a) so lieu can kiem chung + (b) co hoi chen so lieu that ----
export const CLAIMS_SCHEMA = {
  type: "object",
  properties: {
    topic: { type: "string", description: "Chủ đề/lĩnh vực bài viết (ngắn gọn)." },
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["verify", "add"], description: "verify = số liệu đã có trong bài cần kiểm chứng; add = vị trí NÊN chèn thêm 1 số liệu thật để tăng thuyết phục." },
          quote: { type: "string", description: "Câu NGUYÊN VĂN trong bài. Với mode=verify: câu chứa số liệu. Với mode=add: câu tại vị trí nên chèn thêm số liệu." },
          value: { type: "string", description: "Với verify: số liệu hiện có (vd '95%','2 triệu'). Với add: để trống." },
          need: { type: "string", description: "Loại số liệu cần (vd 'tỷ lệ mắc bệnh nha chu ở người trưởng thành VN', 'tuổi thọ trung bình răng sứ', 'tỷ lệ thành công cấy implant')." },
          risk: { type: "string", enum: ["high", "medium", "low"], description: "Mức rủi ro nếu số liệu sai/thiếu (YMYL: cao nếu ảnh hưởng sức khỏe/tiền/quyết định điều trị)." },
          query: { type: "string", description: "Truy vấn Google TIẾNG VIỆT để tìm số liệu trong nguồn uy tín Việt Nam. Ngắn, đúng trọng tâm (KHÔNG kèm site:)." },
          queryEn: { type: "string", description: "Truy vấn Google TIẾNG ANH tương ứng để tìm số liệu trong nguồn quốc tế (WHO, ADA, PubMed...). Dùng thuật ngữ y khoa tiếng Anh chuẩn." },
        },
        required: ["mode", "quote", "need", "query"],
      },
    },
  },
  required: ["claims"],
};

export function buildClaimsPrompt({ content, url, mainKeyword, knowledge }) {
  return [
    "NHIỆM VỤ: Đọc kỹ bài viết và lập danh sách các điểm cần xử lý số liệu, gồm HAI loại:",
    "",
    "(A) mode=\"verify\" — SỐ LIỆU ĐANG CÓ trong bài cần kiểm chứng: tỷ lệ %, giá tiền, thời gian điều trị, tuổi thọ vật liệu, tỷ lệ biến chứng/thành công, thống kê 'theo nghiên cứu…', năm… — nhất là loại KHÔNG có nguồn, có thể LỖI THỜI hoặc NGHI NGỜ SAI.",
    "(B) mode=\"add\" — VỊ TRÍ NÊN CHÈN THÊM số liệu thật để tăng thuyết phục & tính Specific: chỗ đang nói chung chung mà một con số uy tín sẽ mạnh hơn (tỷ lệ mắc bệnh, hiệu quả điều trị, tuổi thọ vật liệu, tỷ lệ biến chứng…). Chỉ đề xuất chèn ở nơi TỰ NHIÊN, liên quan trực tiếp — KHÔNG nhồi số vô tội vạ.",
    "",
    "Với MỖI mục: trích câu nguyên văn, nêu loại số liệu cần (need), mức rủi ro, và 2 truy vấn: `query` (TIẾNG VIỆT — cho nguồn VN) + `queryEn` (TIẾNG ANH, thuật ngữ y khoa chuẩn — cho nguồn quốc tế WHO/ADA/PubMed). KHÔNG kèm 'site:' trong truy vấn (hệ thống tự giới hạn nguồn).",
    "Bỏ qua con số không mang tính dữ kiện (số thứ tự bước, SĐT, năm thành lập hiển nhiên…).",
    "Tối đa 10 mục quan trọng nhất (ưu tiên rủi ro cao & vị trí then chốt).",
    "",
    SOURCE_GUIDE,
    "",
    url ? `URL bài viết: ${url}` : "",
    mainKeyword ? `Từ khóa chính: ${mainKeyword}` : "",
    knowledge ? `\nKiến thức thương hiệu (bối cảnh, KHÔNG coi là nguồn kiểm chứng):\n${knowledge.slice(0, 40000)}` : "",
    "",
    "===== NỘI DUNG BÀI VIẾT =====",
    String(content || "").slice(0, 24000),
    "===== HẾT NỘI DUNG =====",
  ].filter(Boolean).join("\n");
}

// ---- GIAI DOAN B: Doi chieu ket qua tim kiem THAT -> chen/sua so lieu + gan nguon that ----
export const VERIFY_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          quote: { type: "string", description: "Câu nguyên văn trong bài (khớp với đầu vào)." },
          status: { type: "string", enum: ["accurate", "corrected", "outdated", "added", "unsupported", "no_source"], description: "accurate=đúng & có nguồn; corrected=sửa lại số; outdated=cập nhật số mới; added=chèn thêm số liệu mới; unsupported=không có nguồn xác nhận; no_source=không tìm được nguồn." },
          oldSentence: { type: "string", description: "Câu gốc (giữ nguyên)." },
          newSentence: { type: "string", description: "Câu sau khi chèn/sửa số liệu. Diễn đạt NGẮN GỌN, TỰ NHIÊN, hòa vào câu (paraphrase). BẮT BUỘC bọc số liệu trong [[ ]], vd 'Theo Bộ Y tế, khoảng [[90%]] người trưởng thành Việt Nam mắc bệnh răng miệng.'" },
          sourceUrl: { type: "string", description: "URL nguồn CHÍNH XÁC lấy TỪ danh sách kết quả tìm kiếm được cung cấp. Để trống nếu không có nguồn phù hợp. TUYỆT ĐỐI không bịa/không sửa URL." },
          sourceTitle: { type: "string", description: "Tiêu đề nguồn (khớp URL đã chọn)." },
          sourceNote: { type: "string", description: "Trích dẫn NGẮN từ snippet nguồn hỗ trợ số liệu (để người dùng đối chiếu), không tự chế." },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          advice: { type: "string", description: "Gợi ý ngắn cách chèn (1 câu)." },
        },
        required: ["quote", "status", "newSentence"],
      },
    },
  },
  required: ["items"],
};

export function buildVerifyPrompt({ claims, mainKeyword }) {
  const blocks = claims.map((c, i) => {
    const lines = [
      `--- MỤC #${i + 1} (${c.mode === "add" ? "CHÈN THÊM số liệu" : "KIỂM CHỨNG số liệu có sẵn"}) ---`,
      `Câu trong bài: "${c.quote}"`,
      c.value ? `Số liệu hiện tại: ${c.value}` : "Số liệu hiện tại: (chưa có — cần chèn)",
      `Loại số liệu cần: ${c.need || ""}`,
      "KẾT QUẢ TỪ NGUỒN UY TÍN (TẤT CẢ đã được lọc chỉ còn nguồn chính thống; có thể là tiếng Anh hoặc tiếng Việt — đọc số liệu thật cẩn thận, chính xác):",
    ];
    const rs = Array.isArray(c.searchResults) ? c.searchResults : [];
    if (!rs.length) {
      lines.push("  (Không có kết quả — đặt status=no_source, để trống sourceUrl, KHÔNG chèn số.)");
    } else {
      rs.forEach((r, k) => {
        lines.push(`  [${k + 1}]${r.auth ? " [UY TÍN]" : ""} ${r.title}`);
        lines.push(`      URL: ${r.url}`);
        if (r.date) lines.push(`      Ngày: ${r.date}`);
        if (r.snippet) lines.push(`      Trích: ${r.snippet}`);
      });
    }
    return lines.join("\n");
  }).join("\n\n");

  return [
    "NHIỆM VỤ: Với mỗi mục, dùng HOÀN TOÀN kết quả tìm kiếm THẬT được cung cấp để chèn/sửa số liệu và gán nguồn.",
    "",
    "QUY TẮC BẮT BUỘC:",
    "1) TẤT CẢ kết quả cung cấp đều là NGUỒN UY TÍN đã được lọc sẵn (Việt Nam ưu tiên trước, quốc tế sau). CHỈ được trích dẫn từ các kết quả này — KHÔNG dùng bất kỳ nguồn/URL nào khác, KHÔNG dùng số liệu nhớ từ dữ liệu huấn luyện.",
    "2) Nguồn có thể là TIẾNG ANH hoặc TIẾNG VIỆT — đọc con số CHÍNH XÁC (đơn vị, %, khoảng giá trị), rồi diễn đạt lại bằng tiếng Việt tự nhiên. Số phải đúng y như trong snippet nguồn.",
    "3) CHỈ dùng URL có trong danh sách của CHÍNH mục đó. KHÔNG bịa, KHÔNG lấy URL ngoài, KHÔNG sửa URL.",
    "4) Nếu KHÔNG nguồn uy tín nào (trong danh sách) xác nhận con số → status='unsupported' hoặc 'no_source', để trống sourceUrl, KHÔNG bịa số, KHÔNG chèn. Trong advice ghi rõ: chưa tìm thấy trong các nguồn uy tín, nên tự kiểm tra thêm.",
    "5) Diễn đạt số liệu NGẮN GỌN, TỰ NHIÊN, hòa vào câu văn (paraphrase). Attribution ngắn: 'Theo <tổ chức>, …'. Bọc số liệu trong [[ ]].",
    "   • ĐÚNG: \"Theo thống kê của Bộ Y tế, khoảng [[90%]] người trưởng thành Việt Nam mắc ít nhất một bệnh lý răng miệng.\"",
    "   • SAI (quá dài dòng): \"Theo báo cáo chi tiết được công bố bởi Bộ Y tế Việt Nam vào năm 2023 trên trang moh.gov.vn, nghiên cứu chỉ ra rằng tỷ lệ…\"",
    "6) sourceNote là trích dẫn NGẮN lấy từ snippet nguồn (không tự chế); nếu nguồn tiếng Anh có thể để nguyên hoặc dịch ngắn. Tiếng Việt có dấu.",
    "7) Với mode=add: nếu có nguồn uy tín → status='added', chèn số liệu tự nhiên vào câu. Với mode=verify: 'accurate'/'corrected'/'outdated' tùy đối chiếu snippet.",
    mainKeyword ? `\nBối cảnh từ khóa: ${mainKeyword}` : "",
    "",
    "===== DANH SÁCH MỤC & KẾT QUẢ TÌM KIẾM =====",
    blocks,
  ].filter(Boolean).join("\n");
}

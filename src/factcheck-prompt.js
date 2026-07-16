// src/factcheck-prompt.js
// Tinh nang "Check du lieu - bo sung nguon uy tin".
// Ap phuong phap skill nha-khoa-shark-seo-content (E-E-A-T / YMYL y te):
//  - Noi dung y te/nha khoa la YMYL -> moi so lieu PHAI chinh xac, cap nhat, co nguon uy tin.
//  - Nguon uy tin: co quan y te nha nuoc (Bo Y te, WHO, CDC), tap chi/nghien cuu y khoa,
//    hiep hoi nha khoa, bao chi chinh thong, trang chinh thuc cua to chuc. Uu tien nguon Viet Nam
//    cho boi canh VN, uu tien nguon MOI (gan day) cho so lieu thay doi theo thoi gian (gia, ty le...).
//  - TUYET DOI khong bia URL/nguon. Chi trich dan tu ket qua tim kiem THAT duoc cung cap.

export const FACTCHECK_SYSTEM =
  "Bạn là chuyên gia kiểm chứng dữ liệu (fact-checker) và biên tập nội dung SEO y tế/nha khoa theo chuẩn E-E-A-T và YMYL của Google. " +
  "Nội dung y tế ảnh hưởng trực tiếp tới sức khỏe & quyết định của người đọc, nên MỌI số liệu (tỷ lệ %, giá tiền, thời gian, số lượng, năm, thống kê nghiên cứu, xếp hạng...) phải chính xác, cập nhật và có nguồn uy tín kiểm chứng được. " +
  "Nguyên tắc BẤT DI BẤT DỊCH: KHÔNG bao giờ bịa đặt nguồn hoặc URL. Chỉ được trích dẫn từ các kết quả tìm kiếm THẬT được cung cấp. Nếu không có nguồn đáng tin nào xác nhận, phải nói rõ là không tìm được nguồn thay vì bịa. " +
  "Luôn trả lời bằng tiếng Việt CÓ DẤU đầy đủ, chuẩn chính tả.";

// ---- GIAI DOAN A: Doc noi dung -> liet ke cac so lieu can kiem chung + truy van tim nguon ----
export const CLAIMS_SCHEMA = {
  type: "object",
  properties: {
    topic: { type: "string", description: "Chủ đề/lĩnh vực bài viết (ngắn gọn), vd 'niềng răng trong suốt'." },
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          quote: { type: "string", description: "Câu/cụm văn NGUYÊN VĂN trong bài có chứa số liệu cần kiểm chứng (copy chính xác, đủ ngữ cảnh 1 câu)." },
          value: { type: "string", description: "Số liệu cụ thể trong câu, vd '95%', '2 triệu đồng', '12-18 tháng', 'năm 2020'." },
          type: { type: "string", enum: ["percentage", "price", "duration", "count", "year", "ranking", "study", "other"] },
          risk: { type: "string", enum: ["high", "medium", "low"], description: "Mức rủi ro nếu số liệu sai (cao = ảnh hưởng sức khỏe/tiền bạc/quyết định điều trị)." },
          why: { type: "string", description: "Vì sao cần kiểm chứng: không nguồn / có thể lỗi thời / nghi ngờ sai / khác thực tế..." },
          query: { type: "string", description: "Truy vấn tìm kiếm Google (tiếng Việt) để tìm NGUỒN UY TÍN xác minh số liệu này. Ngắn gọn, đúng trọng tâm." },
        },
        required: ["quote", "value", "query"],
      },
    },
  },
  required: ["claims"],
};

export function buildClaimsPrompt({ content, url, mainKeyword, knowledge }) {
  return [
    "NHIỆM VỤ: Đọc kỹ nội dung bài viết dưới đây và LIỆT KÊ các SỐ LIỆU cần kiểm chứng/bổ sung nguồn.",
    "",
    "Ưu tiên đưa vào danh sách các số liệu:",
    "- Tỷ lệ phần trăm (vd 'tỷ lệ thành công 98%', 'giảm 30% ê buốt').",
    "- Giá tiền, chi phí dịch vụ (vd 'từ 2 triệu/răng').",
    "- Thời gian điều trị (vd 'niềng 18-24 tháng', 'lành thương sau 3 ngày').",
    "- Số lượng, thống kê nghiên cứu, năm, xếp hạng, 'theo nghiên cứu...', 'theo WHO...'.",
    "- Bất kỳ khẳng định định lượng nào KHÔNG có nguồn đi kèm, hoặc có thể ĐÃ LỖI THỜI, hoặc NGHI NGỜ SAI.",
    "",
    "Với MỖI số liệu: trích câu nguyên văn, nêu số liệu, phân loại, đánh giá mức rủi ro (YMYL: cao nếu ảnh hưởng sức khỏe/tiền/quyết định điều trị), và tạo 1 TRUY VẤN GOOGLE tiếng Việt để tìm nguồn uy tín xác minh.",
    "Bỏ qua con số không mang tính dữ kiện (số thứ tự bước, số điện thoại, năm thành lập hiển nhiên...).",
    "Tối đa 12 số liệu quan trọng nhất (ưu tiên rủi ro cao).",
    "",
    url ? `URL bài viết: ${url}` : "",
    mainKeyword ? `Từ khóa chính: ${mainKeyword}` : "",
    knowledge ? `\nKiến thức thương hiệu (bối cảnh, dùng để hiểu ngữ cảnh, KHÔNG coi là nguồn kiểm chứng):\n${knowledge.slice(0, 6000)}` : "",
    "",
    "===== NỘI DUNG BÀI VIẾT =====",
    String(content || "").slice(0, 24000),
    "===== HẾT NỘI DUNG =====",
  ].filter(Boolean).join("\n");
}

// ---- GIAI DOAN B: Doi chieu ket qua tim kiem THAT -> sua so lieu + gan nguon that ----
export const VERIFY_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          quote: { type: "string", description: "Câu nguyên văn trong bài (khớp với đầu vào)." },
          status: { type: "string", enum: ["accurate", "corrected", "outdated", "unsupported", "no_source"], description: "accurate=đúng & có nguồn; corrected=đã sửa lại số; outdated=lỗi thời cần cập nhật; unsupported=không có nguồn xác nhận; no_source=không tìm được nguồn nào." },
          oldSentence: { type: "string", description: "Câu gốc (giữ nguyên)." },
          newSentence: { type: "string", description: "Câu sau khi chỉnh/bổ sung số liệu chính xác. BẮT BUỘC bọc MỌI số liệu mới/đã sửa trong dấu [[ ]], vd 'tỷ lệ thành công [[98%]]'. Nếu số liệu đã đúng thì vẫn bọc [[ ]] quanh số để làm nổi bật." },
          sourceUrl: { type: "string", description: "URL nguồn CHÍNH XÁC lấy TỪ danh sách kết quả tìm kiếm được cung cấp. Để trống nếu không có nguồn phù hợp. TUYỆT ĐỐI không bịa URL." },
          sourceTitle: { type: "string", description: "Tiêu đề nguồn (khớp URL đã chọn)." },
          sourceNote: { type: "string", description: "Trích dẫn ngắn từ nguồn hỗ trợ số liệu (câu/đoạn trong snippet), để người dùng đối chiếu." },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          advice: { type: "string", description: "Gợi ý ngắn cách người dùng nên chèn/sửa (1 câu)." },
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
      `--- SỐ LIỆU #${i + 1} ---`,
      `Câu trong bài: "${c.quote}"`,
      `Số liệu hiện tại: ${c.value || "(không rõ)"}`,
      `Truy vấn đã dùng: ${c.query || ""}`,
      "KẾT QUẢ TÌM KIẾM THẬT (chỉ được trích dẫn URL trong danh sách này):",
    ];
    const rs = Array.isArray(c.searchResults) ? c.searchResults : [];
    if (!rs.length) {
      lines.push("  (Không có kết quả tìm kiếm — nếu vậy đặt status=no_source, để trống sourceUrl.)");
    } else {
      rs.forEach((r, k) => {
        lines.push(`  [${k + 1}] ${r.title}`);
        lines.push(`      URL: ${r.url}`);
        if (r.date) lines.push(`      Ngày: ${r.date}`);
        if (r.snippet) lines.push(`      Trích: ${r.snippet}`);
      });
    }
    return lines.join("\n");
  }).join("\n\n");

  return [
    "NHIỆM VỤ: Với mỗi số liệu dưới đây, dựa HOÀN TOÀN vào kết quả tìm kiếm THẬT được cung cấp để:",
    "1) Xác định số liệu trong bài đúng hay sai/lỗi thời.",
    "2) Viết lại câu với số liệu CHÍNH XÁC (đưa số liệu từ nguồn uy tín). Bọc mọi số liệu trong [[ ]] để tô nổi bật.",
    "3) Gán NGUỒN: chọn 1 URL TỪ danh sách kết quả tìm kiếm (ưu tiên nguồn uy tín nhất: cơ quan y tế, nghiên cứu, hiệp hội, báo chính thống, trang chính thức; ưu tiên nguồn mới cho số liệu thay đổi theo thời gian).",
    "",
    "QUY TẮC BẮT BUỘC:",
    "- CHỈ dùng URL có trong danh sách kết quả tìm kiếm của chính số liệu đó. KHÔNG bịa, KHÔNG lấy URL ngoài danh sách, KHÔNG sửa URL.",
    "- Nếu không kết quả nào đủ tin cậy để xác nhận -> status='unsupported' hoặc 'no_source', để trống sourceUrl, và trong advice khuyên người dùng gỡ bỏ hoặc tự tìm nguồn chính thống.",
    "- Nếu snippet nguồn cho con số khác với bài -> status='corrected' (hoặc 'outdated'), sửa theo nguồn.",
    "- sourceNote phải là trích dẫn NGẮN lấy từ snippet nguồn (không tự chế).",
    "- Tiếng Việt có dấu đầy đủ.",
    mainKeyword ? `\nBối cảnh từ khóa: ${mainKeyword}` : "",
    "",
    "===== DANH SÁCH SỐ LIỆU & KẾT QUẢ TÌM KIẾM =====",
    blocks,
  ].filter(Boolean).join("\n");
}

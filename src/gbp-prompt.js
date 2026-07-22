// src/gbp-prompt.js
// Tinh nang "Toi uu GBP (Google Business Profile)" - DA LINH VUC (khong ap cung nganh nao).
// Ap chuan GBP tu skill nha-khoa-shark-gbp-content, tru phan rieng Shark.

export const GBP_SYSTEM =
  "Bạn là chuyên gia Local SEO viết nội dung Google Business Profile (GBP) nhiều năm kinh nghiệm, ĐA LĨNH VỰC (tự nhận diện lĩnh vực doanh nghiệp từ dữ liệu được cung cấp, KHÔNG mặc định ngành nào). " +
  "Bạn nắm chắc chính sách nội dung của Google và cách GBP hiển thị trên Search & Maps.\n" +
  "QUY TẮC BẮT BUỘC (mọi loại nội dung):\n" +
  "- Tuân thủ NGHIÊM NGẶT giới hạn ký tự của từng loại (đếm cả khoảng trắng).\n" +
  "- KHÔNG dùng dấu gạch ngang (-, –, —) để giải thích/bổ nghĩa. Dùng dấu phẩy, hai chấm hoặc tách câu.\n" +
  "- Nội dung UNIQUE: mỗi lần viết phải khác biệt hoàn toàn (khác câu mở đầu, cấu trúc, cách diễn đạt) so với lần trước, kể cả cùng chủ đề.\n" +
  "- Giọng tự nhiên, chuyên nghiệp, không sáo rỗng, không nhồi từ khóa, không dấu vết AI.\n" +
  "- Với lĩnh vực YMYL (y tế/tài chính/pháp lý): KHÔNG tuyên bố tuyệt đối ('chắc chắn khỏi', '100%').\n" +
  "- Tận dụng THƯƠNG HIỆU, CHI NHÁNH, thông tin MAP và TÀI LIỆU KIẾN THỨC được cung cấp để cá nhân hóa; gắn địa danh/khu vực cụ thể để tăng tín hiệu local. KHÔNG bịa thông tin không có.\n" +
  "Luôn trả lời bằng tiếng Việt CÓ DẤU đầy đủ, chuẩn chính tả.";

// ---- Khoi thong tin chung (brand/branch/map/knowledge) ----
function ctxBlock({ brand, branch, mapInfo, knowledge }) {
  const lines = [];
  if (brand) lines.push(`Thương hiệu: ${brand}`);
  if (branch) lines.push(`Chi nhánh: ${branch}`);
  if (mapInfo) {
    const m = mapInfo;
    const parts = [m.name && `tên: ${m.name}`, m.address && `địa chỉ: ${m.address}`, m.area && `khu vực: ${m.area}`, m.category && `danh mục: ${m.category}`].filter(Boolean);
    if (parts.length) lines.push(`Thông tin Google Maps (${parts.join("; ")})`);
  }
  if (knowledge && knowledge.trim()) lines.push(`\nTÀI LIỆU KIẾN THỨC (dùng để cá nhân hóa, KHÔNG bịa thêm):\n${knowledge.slice(0, 40000)}`);
  return lines.length ? "=== BỐI CẢNH DOANH NGHIỆP ===\n" + lines.join("\n") + "\n" : "";
}

// ============ SCHEMAS ============
export const NAME_SCHEMA = {
  type: "object",
  properties: {
    compliant: { type: "boolean", description: "true nếu tên người dùng nhập tuân thủ chính sách GBP (không nhồi từ khóa/địa danh không có trên biển hiệu)." },
    warning: { type: "string", description: "Cảnh báo nếu tên đang vi phạm (nhồi từ khóa/địa danh) — nêu rõ rủi ro bị khóa hồ sơ. Để trống nếu hợp lệ." },
    recommended: { type: "string", description: "Tên chuẩn GBP khuyến nghị (tên thật, có thể gồm chi nhánh nếu đúng biển hiệu thực tế)." },
    suggestions: { type: "array", items: { type: "object", properties: { name: { type: "string" }, why: { type: "string" } }, required: ["name", "why"] }, description: "Vài biến thể tên HỢP LỆ (đúng chính sách), kèm lý do ngắn." },
  },
  required: ["recommended", "suggestions"],
};
export const BUSINESS_SCHEMA = { type: "object", properties: { text: { type: "string", description: "Mô tả doanh nghiệp 600-750 ký tự." } }, required: ["text"] };
export const POST_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Tiêu đề (bắt buộc cho Ưu đãi/Sự kiện; Cập nhật có thể để trống)." },
    content: { type: "string", description: "Nội dung bài đăng, tối đa 1500 ký tự, thông điệp chính trong 80-120 từ đầu. TUYỆT ĐỐI không chứa số điện thoại." },
    cta: { type: "string", description: "Nút CTA đề xuất (Đặt lịch/Tìm hiểu thêm/Gọi ngay/Đăng ký...)." },
    note: { type: "string", description: "Ghi chú (vd nhắc điền ngày bắt đầu/kết thúc cho Ưu đãi/Sự kiện)." },
  },
  required: ["content"],
};
export const SERVICE_SCHEMA = { type: "object", properties: { text: { type: "string", description: "Mô tả dịch vụ, TỐI ĐA 300 ký tự, có nhắc thương hiệu ≥1 lần." } }, required: ["text"] };
export const IMAGE_SCHEMA = { type: "object", properties: { caption: { type: "string", description: "Caption/mô tả ngắn cho ảnh (1 câu, có từ khóa + địa danh nếu hợp lý)." }, altText: { type: "string", description: "Alt text ngắn (<125 ký tự) mô tả nội dung ảnh." }, fileName: { type: "string", description: "Tên file ảnh chuẩn SEO dạng abc-xyz (không dấu, gạch nối)." } }, required: ["caption", "altText"] };
export const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    sentiment: { type: "string", enum: ["positive", "negative", "neutral", "mixed"], description: "Phân loại cảm xúc của đánh giá." },
    reply: { type: "string", description: "Nội dung phản hồi phù hợp cảm xúc, chuyên nghiệp, ngắn gọn, nhắc dịch vụ tự nhiên nếu hợp lý." },
    tips: { type: "string", description: "Gợi ý ngắn cho chủ hồ sơ (vd nên xử lý offline nếu tiêu cực)." },
  },
  required: ["sentiment", "reply"],
};

export const GBP_SCHEMAS = { name: NAME_SCHEMA, business: BUSINESS_SCHEMA, post: POST_SCHEMA, service: SERVICE_SCHEMA, image: IMAGE_SCHEMA, review: REVIEW_SCHEMA };

// ============ PROMPT BUILDER ============
export function buildGbpPrompt(kind, data) {
  const ctx = ctxBlock(data);
  const uniq = data.avoid && data.avoid.trim() ? `\nĐÃ VIẾT TRƯỚC ĐÓ (PHẢI khác hoàn toàn, không lặp câu/cấu trúc):\n"""${data.avoid.slice(0, 2000)}"""\n` : "";

  if (kind === "name") {
    return {
      maxTokens: 2048,
      user: [
        ctx,
        `Tên doanh nghiệp người dùng mong muốn: "${data.desiredName || ""}"`,
        "",
        "NHIỆM VỤ: Đánh giá & gợi ý TÊN doanh nghiệp cho Google Business Profile.",
        "CHÍNH SÁCH GBP BẮT BUỘC: Tên phải là TÊN THẬT của doanh nghiệp (đúng biển hiệu/pháp lý). KHÔNG được nhồi từ khóa dịch vụ hay địa danh vào tên nếu KHÔNG có thật trên biển hiệu — vi phạm khiến hồ sơ bị treo/khóa.",
        "- Nếu tên người dùng nhập nhồi từ khóa/địa danh: đặt compliant=false, nêu warning rõ rủi ro, và recommended = tên rút gọn hợp lệ.",
        "- Có thể gồm tên chi nhánh nếu đó là cách doanh nghiệp thực sự đặt tên (vd 'Thương hiệu - Chi nhánh X').",
        "- suggestions: vài biến thể HỢP LỆ (viết hoa/cách trình bày/kèm chi nhánh), KHÔNG phải biến thể nhồi từ khóa.",
      ].filter(Boolean).join("\n"),
    };
  }
  if (kind === "business") {
    return {
      maxTokens: 2048,
      user: [
        ctx, uniq,
        "NHIỆM VỤ: Viết MÔ TẢ DOANH NGHIỆP cho GBP (Business Description).",
        "CHUẨN GBP: 600-750 ký tự (cả khoảng trắng). ⛔ TUYỆT ĐỐI KHÔNG vượt 750 ký tự — TỰ ĐẾM và rút gọn TRƯỚC khi trả về; thà 700 ký tự đủ ý còn hơn 800 ký tự bị cắt. Cấu trúc: [Tên DN] là [dịch vụ chính] tại [địa điểm cụ thể]. Chuyên về [thế mạnh]. [USP/điểm khác biệt]. [CTA lời mời, KHÔNG kèm số điện thoại/URL].",
        "- Từ khóa địa phương (tên quận/thành phố cụ thể) phải xuất hiện tự nhiên trong 250 ký tự đầu.",
        "- KHÔNG chèn URL, KHÔNG nhồi từ khóa, KHÔNG nhắc giá/khuyến mãi.",
        "- Đây là phần TỰ ĐỀ XUẤT: viết 1 bản mới hoàn chỉnh, khác các bản trước.",
      ].filter(Boolean).join("\n"),
    };
  }
  if (kind === "post") {
    const typeLabel = { update: "Cập nhật (Update)", offer: "Ưu đãi (Offer)", event: "Sự kiện (Event)" }[data.postType] || "Cập nhật (Update)";
    return {
      maxTokens: 3072,
      user: [
        ctx, uniq,
        `NHIỆM VỤ: Viết BÀI ĐĂNG GBP loại: ${typeLabel}.`,
        data.keyword ? `Từ khóa/chủ đề: ${data.keyword}` : "",
        data.url ? `URL đích của bài (nút CTA sẽ trỏ về): ${data.url}` : "",
        data.pageContent ? `\nNỘI DUNG TRANG ĐÍCH (đọc để viết đúng & hấp dẫn, KHÔNG copy nguyên văn):\n"""${String(data.pageContent).slice(0, 6000)}"""\n` : "",
        "CHUẨN GBP BÀI ĐĂNG:",
        "- Tối đa 1500 ký tự. Đặt thông điệp & từ khóa quan trọng nhất trong 80-120 TỪ ĐẦU (phần hiển thị trước 'xem thêm').",
        "- ⛔ TUYỆT ĐỐI KHÔNG chứa số điện thoại trong nội dung (Google tự từ chối). Muốn khách gọi thì đề xuất nút CTA 'Gọi ngay'.",
        "- Kết hợp tên dịch vụ + khu vực tự nhiên (geo-signal). Có thể dùng 1-2 emoji phù hợp, không lạm dụng.",
        data.postType === "offer" ? "- Ưu đãi: nêu ưu đãi cụ thể + tạo cảm giác khẩn cấp; note nhắc điền ngày bắt đầu/kết thúc." : "",
        data.postType === "event" ? "- Sự kiện: nêu lý do tham gia + quyền lợi; note nhắc điền ngày/giờ bắt đầu-kết thúc." : "",
        "- Đề xuất nút CTA phù hợp (Đặt lịch/Tìm hiểu thêm/Đăng ký/Gọi ngay).",
      ].filter(Boolean).join("\n"),
    };
  }
  if (kind === "service") {
    return {
      maxTokens: 1536,
      user: [
        ctx, uniq,
        "NHIỆM VỤ: Viết MÔ TẢ DỊCH VỤ cho GBP (Service Description).",
        data.keyword ? `Dịch vụ/từ khóa: ${data.keyword}` : "",
        data.url ? `URL trang dịch vụ: ${data.url}` : "",
        data.pageContent ? `\nNỘI DUNG TRANG DỊCH VỤ (đọc để viết đúng):\n"""${String(data.pageContent).slice(0, 5000)}"""\n` : "",
        "CHUẨN GBP MÔ TẢ DỊCH VỤ:",
        "- TỐI ĐA 300 ký tự (cả khoảng trắng). Đếm chính xác, chừa chỗ cho tên thương hiệu.",
        data.brand ? `- BẮT BUỘC nhắc thương hiệu "${data.brand}" ít nhất 1 lần, tự nhiên trong câu.` : "- Nhắc tên thương hiệu ít nhất 1 lần nếu có.",
        "- Câu đầu nêu ngay dịch vụ + lợi ích chính; câu sau (nếu còn ký tự) nêu điểm khác biệt/quy trình ngắn. KHÔNG CTA, KHÔNG số điện thoại.",
      ].filter(Boolean).join("\n"),
    };
  }
  if (kind === "image") {
    return {
      maxTokens: 1024,
      user: [
        ctx,
        "NHIỆM VỤ: Viết MÔ TẢ NGẮN cho HÌNH ẢNH đăng lên GBP (caption + alt + tên file SEO).",
        data.hasImage ? "Có ẢNH đính kèm: hãy QUAN SÁT ảnh và mô tả đúng nội dung thực tế trong ảnh." : "",
        data.context ? `Ngữ cảnh/nội dung ảnh do người dùng mô tả: ${data.context}` : "",
        data.keyword ? `Từ khóa cần có: ${data.keyword}` : "",
        "YÊU CẦU: caption 1 câu ngắn hấp dẫn có từ khóa + địa danh (nếu hợp lý); altText mô tả nội dung ảnh dưới 125 ký tự; fileName dạng abc-xyz-khu-vuc (không dấu, gạch nối). Không bịa chi tiết không có trong ảnh/ngữ cảnh.",
      ].filter(Boolean).join("\n"),
    };
  }
  if (kind === "review") {
    return {
      maxTokens: 1536,
      user: [
        ctx,
        "NHIỆM VỤ: Phân tích ĐÁNH GIÁ của khách và viết PHẢN HỒI phù hợp cho chủ hồ sơ GBP.",
        data.reviewer ? `Tên người đánh giá: ${data.reviewer}` : "",
        data.rating ? `Số sao: ${data.rating}/5` : "",
        `\nNỘI DUNG ĐÁNH GIÁ:\n"""${String(data.review || "").slice(0, 3000)}"""\n`,
        "YÊU CẦU:",
        "- Tự phân loại cảm xúc (positive/negative/neutral/mixed).",
        "- Phản hồi CHUYÊN NGHIỆP, NGẮN GỌN, chân thành, cá nhân hóa (xưng hô lịch sự, cảm ơn). Nếu tích cực: cảm ơn + nhắc lại điểm khách khen + mời quay lại. Nếu tiêu cực: đồng cảm, xin lỗi đúng mực (không nhận lỗi pháp lý), nêu hướng khắc phục, mời liên hệ riêng để xử lý; KHÔNG tranh cãi.",
        "- Nhắc tên dịch vụ tự nhiên khi hợp lý (Google đọc phản hồi để hiểu lĩnh vực).",
        "- KHÔNG chèn số điện thoại. Với YMYL không tuyên bố tuyệt đối.",
      ].filter(Boolean).join("\n"),
    };
  }
  return { user: "", maxTokens: 1024 };
}

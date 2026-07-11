// src/pillar-content-prompt.js
// Prompt + schema cho "Xay dung Pillar Content" (tab Internal Link), theo phuong phap keyword-topic-classifier:
//  - buildPcClassifyPrompt: phan loai Chuyen doi/Tin tuc + gom Topic Content (+ dich VI)
//  - buildPcTierPrompt: phan bac 1-5 + vai tro + cay cha-con theo thuoc tinh

export const PC_CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          keyword: { type: "string" },
          phanLoai: { type: "string", description: "Chuyển đổi hoặc Tin tức" },
          topic: { type: "string", description: "Topic Content chuyên sâu, gom nhiều bài, không topic 1 bài" },
          ghiChu: { type: "string", description: "Lý do ngắn" },
          vi: { type: "string", description: "Bản dịch tiếng Việt nếu từ khóa tiếng Anh; để trống nếu tiếng Việt" },
        },
        required: ["keyword", "phanLoai", "topic"],
      },
    },
  },
  required: ["items"],
};

export const PC_TIER_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          keyword: { type: "string" },
          tier: { type: "integer", description: "Bậc 1-5 (1 quan trọng nhất)" },
          vaiTro: { type: "string", description: "Dịch vụ / Chuyển đổi / SEO / Tin tức / Bổ trợ" },
          nhomThuocTinh: { type: "string", description: "Chiều thuộc tính của cây cha-con (VD Độ tuổi, Hàn Quốc, Vật liệu); để trống nếu không thuộc cây" },
          tuKhoaCha: { type: "string", description: "Từ khóa cha trực tiếp (nếu là node con); để trống nếu là gốc" },
        },
        required: ["keyword", "tier", "vaiTro"],
      },
    },
  },
  required: ["items"],
};

// rows: [{keyword, url, category, conv:bool}]; opts: { knownTopics, needTranslate }
export function buildPcClassifyPrompt(rows, { knownTopics = [], needTranslate = false } = {}) {
  const system =
    "Bạn là chuyên gia SEO content strategist, đa lĩnh vực. Với danh sách từ khóa (kèm URL & chuyên mục nếu có), hãy:\n" +
    "1) PHÂN LOẠI mỗi từ khóa vào ĐÚNG 1 trong 2 nhóm: 'Chuyển đổi' hoặc 'Tin tức'.\n" +
    "   • 'Chuyển đổi' = ý định thương mại / gần điểm mua: giá, chi phí, bảng giá, địa chỉ, ở đâu, uy tín, đặt lịch, mua, so sánh/lựa chọn sản phẩm, trang dịch vụ hoặc sản phẩm bán được.\n" +
    "   • 'Tin tức' = thông tin/kiến thức: khái niệm (là gì), quy trình, cách làm, thời gian, chăm sóc, thắc mắc, tình trạng.\n" +
    "   • Nếu từ khóa được đánh dấu [CONV] (nằm trong danh sách chuyển đổi người dùng cung cấp) → BẮT BUỘC là 'Chuyển đổi'.\n" +
    "2) GOM mỗi từ khóa vào 1 TOPIC CONTENT chuyên sâu: nhìn (chủ thể cốt lõi) + (nhóm khía cạnh). Dồn biến thể sản phẩm/thương hiệu/vật liệu/phương pháp vào chung 'So sánh và lựa chọn'. " +
    "MỖI topic phải chứa NHIỀU bài (không có topic 1 bài — nếu lỡ có, gộp vào topic gần nhất cùng chủ thể). KHÔNG gom xuyên chuyên mục người dùng cung cấp. Tên topic ngắn gọn, rõ nghĩa, không dùng dấu gạch ngang.\n" +
    (knownTopics.length ? "3) Có 'TOPIC ĐÃ CÓ' (từ các lô trước): TÁI SỬ DỤNG đúng tên khi phù hợp để nhất quán.\n" : "") +
    (needTranslate ? "4) Với MỖI từ khóa thêm 'vi' = bản dịch tiếng Việt (nếu tiếng Anh); tiếng Việt để rỗng.\n" : "") +
    "Ghi 1 câu ngắn vào 'ghiChu' giải thích. KHÔNG bịa từ khóa mới.\n" +
    "Trả JSON {items:[{keyword, phanLoai, topic, ghiChu" + (needTranslate ? ", vi" : "") + "}]}.";
  const parts = [];
  if (knownTopics.length) parts.push("TOPIC ĐÃ CÓ:\n" + knownTopics.map((t) => "- " + t).join("\n"));
  parts.push("Danh sách từ khóa:\n" + rows.map((r) => {
    const bits = [r.keyword];
    if (r.url) bits.push(`URL: ${r.url}`);
    if (r.category) bits.push(`Chuyên mục: ${r.category}`);
    if (r.conv) bits.push("[CONV]");
    return "- " + bits.join("  |  ");
  }).join("\n"));
  return { system, user: parts.join("\n\n"), schema: PC_CLASSIFY_SCHEMA };
}

// rows: [{keyword, url, category, phanLoai, topic, conv}]; opts: { category, needTranslate }
export function buildPcTierPrompt(rows, { category = "" } = {}) {
  const system =
    "Bạn là chuyên gia SEO cấu trúc internal link, đa lĩnh vực. Với các từ khóa của MỘT chuyên mục" + (category ? ` ('${category}')` : "") + ", hãy gán mỗi từ khóa một BẬC 1–5 và (nếu hợp) dựng CÂY CHA–CON.\n" +
    "PHÂN BẬC (1 quan trọng nhất, giảm dần):\n" +
    "• Bậc 1 (Dịch vụ): trang dịch vụ chính / trang chuyên mục (nhận theo URL kiểu /dich-vu/, /kien-thuc/, hoặc từ khóa dịch vụ tổng quát nhất).\n" +
    "• Bậc 2 (Chuyển đổi): các bài thuộc nhóm 'Chuyển đổi' (đặc biệt các từ khóa giá cốt lõi).\n" +
    "• Bậc 3 (SEO): phương pháp / loại dịch vụ chính, các trang trụ cột.\n" +
    "• Bậc 4 (Tin tức): bài kiến thức, khái niệm, bảng liệt kê loại/thương hiệu — NƠI THƯỜNG ĐẶT CÂY CHA–CON.\n" +
    "• Bậc 5 (Bổ trợ): thắc mắc, sự cố, biến chứng, long-tail rất cụ thể, địa chỉ lẻ.\n" +
    "'vaiTro' = một trong: Dịch vụ, Chuyển đổi, SEO, Tin tức, Bổ trợ.\n" +
    "CÂY CHA–CON (thường ở Bậc 4): CHA bao hàm CON theo MỘT CHIỀU THUỘC TÍNH (độ tuổi, xuất xứ, thương hiệu, vật liệu, khu vực, phương pháp), KHÔNG chỉ theo chứa từ. " +
    "Ví dụ 'độ tuổi niềng răng' (cha) bao hàm '20 tuổi niềng răng bao nhiêu tiền', '35 tuổi có nên niềng răng' (con, chiều 'Độ tuổi'). " +
    "'trụ implant' (gốc) → nhánh theo xuất xứ ('trụ implant Hàn Quốc'), con là thương hiệu (osstem, dentium... thuộc Hàn Quốc). " +
    "Với node CON: ghi 'tuKhoaCha' = từ khóa cha trực tiếp (phải là 1 keyword có trong danh sách), 'nhomThuocTinh' = tên chiều thuộc tính. Node gốc/không thuộc cây để 2 trường này rỗng.\n" +
    "KHÔNG bịa từ khóa mới; gán ĐÚNG từng từ đã cho.\n" +
    "Trả JSON {items:[{keyword, tier, vaiTro, nhomThuocTinh, tuKhoaCha}]}.";
  const user = "Từ khóa trong chuyên mục" + (category ? ` '${category}'` : "") + ":\n" + rows.map((r) => {
    const bits = [r.keyword];
    if (r.url) bits.push(`URL: ${r.url}`);
    bits.push(`[${r.phanLoai || "?"}]`);
    if (r.topic) bits.push(`Topic: ${r.topic}`);
    return "- " + bits.join("  |  ");
  }).join("\n");
  return { system, user, schema: PC_TIER_SCHEMA };
}

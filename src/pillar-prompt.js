// src/pillar-prompt.js
// Prompt + schema cho tinh nang "Nghien cuu Pillar Topic":
//  - buildClassifyPrompt: phan nhom tu khoa theo topic (ngu nghia, khong theo cau chu)
//  - buildSuggestPrompt: goi y >=20 tu khoa MOI/topic, khong trung ngu nghia voi tu khoa da co

export const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          keyword: { type: "string" },
          topic: { type: "string", description: "Tên nhóm chủ đề ngắn gọn, nhất quán" },
        },
        required: ["keyword", "topic"],
      },
    },
  },
  required: ["items"],
};

export const SUGGEST_SCHEMA = {
  type: "object",
  properties: {
    topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          keywords: { type: "array", items: { type: "string" }, description: "Từ khóa MỚI (>=20), không trùng ngữ nghĩa với từ khóa đã có" },
        },
        required: ["topic", "keywords"],
      },
    },
  },
  required: ["topics"],
};

// keywords: [{keyword, topic?}]
export function buildClassifyPrompt(keywords) {
  const system =
    "Bạn là chuyên gia SEO content strategist, đa lĩnh vực. Nhiệm vụ: PHÂN NHÓM (topic / pillar) cho danh sách từ khóa.\n" +
    "NGUYÊN TẮC:\n" +
    "• Nhóm theo Ý ĐỊNH & CHỦ ĐỀ, KHÔNG theo câu chữ. Các từ khóa ĐỒNG NGHĨA / cùng một ý phải nằm CÙNG 1 topic. " +
    "Ví dụ: 'giá niềng răng', 'chi phí niềng răng', 'niềng răng bao nhiêu tiền' → cùng topic 'Chi phí / Giá'.\n" +
    "• Đặt tên topic NGẮN GỌN, rõ nghĩa và NHẤT QUÁN (dùng đúng một tên cho các từ cùng nhóm).\n" +
    "• Nếu từ khóa ĐÃ có topic do người dùng cung cấp: GIỮ NGUYÊN topic đó, và dùng chính tên topic đó cho các từ tương tự (không tạo topic trùng ý khác tên).\n" +
    "• Phân tích CHUYÊN SÂU: số topic vừa đủ để phản ánh đúng cấu trúc chủ đề (không quá vụn, không gộp ẩu).\n" +
    "• Viết tên topic cùng ngôn ngữ với từ khóa. KHÔNG bịa từ khóa mới, phân nhóm ĐÚNG từng từ đã cho.\n" +
    "Trả JSON {items:[{keyword, topic}]}.";
  const lines = keywords.map((k) => (k.topic ? `- ${k.keyword}  [topic: ${k.topic}]` : `- ${k.keyword}`)).join("\n");
  const user = "Danh sách từ khóa (từ khóa nào có [topic:...] là do người dùng cung cấp, hãy tôn trọng):\n" + lines;
  return { system, user, schema: CLASSIFY_SCHEMA };
}

// topics: [{ topic, have:[kw...], candidates:[kw...] }]
export function buildSuggestPrompt(topics, { minPerTopic = 20 } = {}) {
  const system =
    "Bạn là chuyên gia nghiên cứu từ khóa SEO, đa lĩnh vực. Với MỖI topic, đề xuất ÍT NHẤT " + minPerTopic + " từ khóa MỚI " +
    "để BAO PHỦ toàn diện thị trường/chủ đề đó (long-tail, các sub-intent, biến thể có nhu cầu tìm kiếm thật).\n" +
    "QUY TẮC BẮT BUỘC:\n" +
    "1. TUYỆT ĐỐI KHÔNG trùng và KHÔNG đồng nghĩa / cùng ý với các từ khóa NGƯỜI DÙNG ĐÃ CÓ trong topic. " +
    "Ví dụ đã có 'giá niềng răng' thì KHÔNG được gợi ý 'chi phí niềng răng', 'niềng răng bao nhiêu tiền', 'niềng răng giá bao nhiêu' (đều cùng ý về GIÁ).\n" +
    "2. Các từ gợi ý cũng KHÔNG trùng ý lẫn nhau — mỗi từ khai thác một góc/nhu cầu KHÁC nhau (loại, đối tượng, quy trình, địa điểm, so sánh, thời gian, lưu ý, biến chứng, chăm sóc, thương hiệu...).\n" +
    "3. Ưu tiên từ khóa CÓ NHU CẦU TÌM KIẾM THẬT. Danh sách 'gợi ý autocomplete' kèm dưới là các truy vấn có thật của Google — hãy tận dụng, chọn lọc và bổ sung thêm từ hiểu biết của bạn.\n" +
    "4. Viết CÙNG ngôn ngữ với từ khóa. Chỉ trả từ khóa (không mô tả).\n" +
    "Trả JSON {topics:[{topic, keywords:[...]}]} — mỗi topic có ÍT NHẤT " + minPerTopic + " từ, dùng ĐÚNG tên topic đã cho.";
  const blocks = topics.map((t) => {
    const have = (t.have || []).slice(0, 40).map((k) => "  • " + k).join("\n");
    const cand = (t.candidates || []).slice(0, 60).map((k) => "  - " + k).join("\n");
    return `### TOPIC: ${t.topic}\nTỪ KHÓA ĐÃ CÓ (KHÔNG được gợi lại, kể cả đồng nghĩa):\n${have || "  (không có)"}\nGỢI Ý AUTOCOMPLETE (nguồn tham khảo, có thật):\n${cand || "  (không có)"}`;
  }).join("\n\n");
  const user = `Hãy gợi ý từ khóa MỚI cho từng topic dưới đây (mỗi topic ≥ ${minPerTopic} từ):\n\n${blocks}`;
  return { system, user, schema: SUGGEST_SCHEMA };
}
